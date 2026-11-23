/**
 * Jinil V72 Supabase workflow adapter - integration branch.
 * Actual deployed tables: public.jinil_orders, public.jinil_dispatches.
 * Requires authenticated supabase-js client and 2026-11-23 dispatch guard migration.
 * All errors are propagated. No credentials stored here.
 */
import { prepareDepartmentDispatch } from './jinil-order-dispatch-v1.js';
const DEPARTMENT_ALIAS = {'본사 총무':'총무부','가공동':'가공부','생산동':'생산부',MC:'생산부',mc:'생산부',teflon:'테프론부',process:'가공부'};
export function canonicalDepartment(value) { return DEPARTMENT_ALIAS[value] || value; }
async function userId(sb) {
  if (!sb?.auth?.getUser || !sb?.from) throw new Error('Supabase 연결을 확인하세요.');
  const {data,error}=await sb.auth.getUser();
  if(error || !data?.user?.id) throw new Error('로그인 후 이용하세요.');
  return data.user.id;
}
function ok(result,label) {
  if(result.error) throw new Error(label+': '+result.error.message);
  return result.data;
}
export async function createOrder(sb,{orderNumber,payload={}}) {
  const uid=await userId(sb);
  if(!String(orderNumber||'').trim()) throw new Error('발주번호가 필요합니다.');
  const data=ok(await sb.from('jinil_orders').insert({
    order_no:String(orderNumber).trim(),payload,created_by:uid
  }).select('id,order_no,payload,created_at').single(),'발주 저장 실패');
  return data;
}
export async function sendOrder(sb,{orderId,recipients}) {
  const uid=await userId(sb);
  const base=prepareDepartmentDispatch({orderId,recipients:recipients.map(canonicalDepartment),sentBy:uid});
  const order=ok(await sb.from('jinil_orders').select('id,order_no,payload')
    .eq('id',orderId).single(),'발주 원본 조회 실패');
  const rows=base.map(v=>({
    order_id:v.order_id,department:v.recipient_department,
    status:'대기',updated_by:uid,
    order_summary:{order_no:order.order_no,...(order.payload||{})}
  }));
  const saved=ok(await sb.from('jinil_dispatches')
    .insert(rows).select('id,order_id,department,status,sent_at,order_summary'),'발주 송부 실패');
  if(!Array.isArray(saved)||saved.length!==rows.length)
    throw new Error('일괄 발송 결과 수량이 다릅니다. 다시 송부하지 말고 서버 기록을 확인하세요.');
  return saved;
}
export async function loadDepartmentQueue(sb,{department,status=null}){
  await userId(sb);
  const canonical=canonicalDepartment(department);
  if(!['테프론부','생산부','가공부'].includes(canonical))
    throw new Error('수신 부서를 선택하세요.');
  let q=sb.from('jinil_dispatches').select(
    'id,order_id,department,status,sent_at,confirmed_at,completed_at,order_summary'
  ).eq('department',canonical).order('sent_at',{ascending:false});
  if(status)q=q.eq('status',status);
  return ok(await q,'목록 동기화 실패');
}
/**
 * Uses optimistic concurrency. The DB trigger prevents skipping steps,
 * changing the department, and changing immutable metadata.
 */
export async function transitionOrder(sb,{dispatchId,expectedStatus,nextStatus}){
  const uid=await userId(sb);
  if(!((expectedStatus==='대기'&&nextStatus==='확인')||
       (expectedStatus==='확인'&&nextStatus==='완료')))
    throw new Error('대기 → 확인 → 완료 순서대로 처리하세요.');
  const now=new Date().toISOString();
  const patch={status:nextStatus,updated_by:uid};
  if(nextStatus==='확인') patch.confirmed_at=now;
  if(nextStatus==='완료') patch.completed_at=now;
  const rows=ok(await sb.from('jinil_dispatches').update(patch)
    .eq('id',dispatchId).eq('status',expectedStatus)
    .select('id,status,department,confirmed_at,completed_at'),'상태 변경 실패');
  if(!Array.isArray(rows)||rows.length!==1)
    throw new Error('다른 기기에서 상태가 변경됐거나 권한이 없습니다. 목록을 새로고침하세요.');
  return rows[0];
}
export function watchDepartmentQueue(sb,{department,onChange}){
  if(typeof onChange!=='function') throw new Error('변경 알림 콜백이 필요합니다.');
  const canonical=canonicalDepartment(department);
  const channel=sb.channel('jinil-'+canonical+'-'+Math.random().toString(36).slice(2))
    .on('postgres_changes',{event:'*',schema:'public',table:'jinil_dispatches',
      filter:'department=eq.'+canonical},()=>onChange()).subscribe();
  return ()=>sb.removeChannel(channel);
}
// Realtime notifications require appropriate replication publication setup.
// Scheduled and user-triggered reads must work even when Realtime is unavailable.
