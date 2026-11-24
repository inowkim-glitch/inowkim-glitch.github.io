/*
 * Jinil V81, 2026-11-24.
 * Internal server transport only: NO DOM, CSS, button names, design or V72 data rewrites.
 * Batch sends keep original business button; Supabase RLS decides permissions.
 * Do not silently mark local orders "sent" before database confirms dispatch.
 */
import {createOrder,sendOrder,loadDepartmentQueue,transitionOrder} from "../../integration/jinil-supabase-orders-adapter-v1.js";
const validDepartments=new Set(["생산부","가공부","테프론부"]);
function departmentOf(raw) {
 const s=String(raw??"").trim();
 return {"MC":"생산부","mc":"생산부","생산동":"생산부","본사 총무":"총무부","teflon":"테프론부","테프론":"테프론부","process":"가공부","가공동":"가공부"}[s]||s;
}
function stableId(k,order) {
 return String(k)+"\u0000"+String(order.id||order.orderNo||order.seq||"");
}
async function serverNumber(key) {
 const bytes=new TextEncoder().encode(key);
 const hash=await crypto.subtle.digest("SHA-256",bytes);
 return "J72-"+Array.from(new Uint8Array(hash)).slice(0,20).map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function sendOne(sb,k,order) {
 const dept=departmentOf(order.department||k);
 if(!validDepartments.has(dept))throw Error("송부 대상 부서를 확인할 수 없습니다: "+String(order.department||k));
 if(order.testOnly||order.id?.toString().startsWith("demo-")||order.id?.toString().startsWith("test-"))throw Error("로컬 예제 발주는 실제 서버로 전송하지 않습니다.");
 if(!order.id)throw Error("발주 원본 고유 ID가 없습니다.");
 const {data:userData,error:userErr}=await sb.auth.getUser();
 if(userErr||!userData?.user?.id)throw Error("Supabase 실회원 로그인이 필요합니다.");
 const identity=stableId(k,order),number=await serverNumber(identity);
 const previous=await sb.from("jinil_orders").select("id,created_by,payload").eq("order_no",number).maybeSingle();
 if(previous.error)throw previous.error;
 let original=previous.data;
 if(original){
  if(original.created_by!==userData.user.id || original.payload?.jinil_source_id!==identity)
   throw Error("기존 서버 발주와 식별정보가 일치하지 않아 중단했습니다.");
 }else{
  // Entire V72 business object is retained; attachment data is not silently stripped.
  const payload={...order,order_no:String(order.orderNo||order.seq||number),jinil_source_id:identity,jinil_original_order_no:String(order.orderNo||""),jinil_source_department:String(k)};
  const saved=await createOrder(sb,{orderNumber:number,payload});
  original={id:saved.id,created_by:userData.user.id,payload};
 }
 const found=await sb.from("jinil_dispatches").select("id,department,status").eq("order_id",original.id).eq("department",dept).maybeSingle();
 if(found.error)throw found.error;
 if(!found.data)await sendOrder(sb,{orderId:original.id,recipients:[dept]});
 return {sourceKey:String(k),sourceId:String(order.id),department:dept,serverOrderId:original.id,serverOrderNo:number};
}
export async function sendPending(sb,pending) {
 if(!sb?.from||!sb?.auth?.getUser)throw Error("Supabase 로그인 연결이 없습니다.");
 if(!Array.isArray(pending)||!pending.length)throw Error("전송할 발주가 없습니다.");
 const done=[],failed=[];
 for(const entry of pending){
  const [key,order]=entry;
  try{done.push(await sendOne(sb,key,order))}
  catch(e){failed.push({sourceKey:String(key),sourceId:String(order?.id||""),message:String(e?.message||e).slice(0,230)})}
 }
 return {done,failed};
}


/* Server queue read overlay for ORIGINAL V72 UI. Never save remote-only rows locally. */
let queueClient=null,queueRole="",queueDept="",queueWatch=null,queuePoll=null,queueGeneration=0,remoteRows=[],queueUpdate=null;
const keysByDept={"생산부":"mc","가공부":"process","테프론부":"teflon"},statusMap={"대기":"working","확인":"checked","완료":"done"};
function scope(role,department){let dept=departmentOf(department);return role==="super_admin"||dept==="총무부"?["생산부","가공부","테프론부"]:validDepartments.has(dept)?[dept]:["생산부","가공부","테프론부"]}
export async function refreshQueue(notify=true){
 if(!queueClient)return [];
 const current=queueGeneration;
 const groups=await Promise.all(scope(queueRole,queueDept).map(d=>loadDepartmentQueue(queueClient,{department:d})));
 if(queueGeneration!==current)return [];
 remoteRows=groups.flat();
 if(notify&&queueUpdate)queueUpdate();
 return remoteRows;
}
export function mergeRead(data){
 if(!data||!queueClient)return data;
 for(const row of remoteRows){
  const key=keysByDept[row.department];if(!key)continue;
  const existing=Object.values(data).flatMap(v=>Array.isArray(v?.orders)?v.orders:[]).find(o=>
    String(o.jinilServerDispatchId||"")===String(row.id)||
    (String(o.jinilServerOrderId||"")===String(row.order_id)&&departmentOf(o.department)===row.department));
  const status=statusMap[row.status]||"working";
  if(existing){existing.status=status;existing.dispatchState="sent";existing.jinilServerDispatchId=row.id;continue}
  if(!data[key])data[key]={orders:[],stock:Array(10).fill("")};
  if(!Array.isArray(data[key].orders))data[key].orders=[];
  const p=row.order_summary&&typeof row.order_summary==="object"?row.order_summary:{};
  data[key].orders.push({...p,id:"server-"+row.id,
    orderNo:String(p.orderNo||p.jinil_original_order_no||p.order_no||row.order_id),
    company:String(p.company||""),createdISO:p.createdISO||row.sent_at,dispatchedISO:row.sent_at,
    status,statusHistory:Array.isArray(p.statusHistory)?p.statusHistory:[],
    attachments:Array.isArray(p.attachments)?p.attachments:[],department:row.department==="생산부"?"MC":row.department,
    dispatchState:"sent",jinilServerDispatchId:row.id,jinilServerOrderId:row.order_id,
    __jinilRemoteOnly:true});
 }
 return data;
}
export function stripRemote(data){
 if(!data||typeof data!=="object")return data;
 const copy=JSON.parse(JSON.stringify(data));
 for(const item of Object.values(copy))if(Array.isArray(item?.orders))item.orders=item.orders.filter(o=>!o.__jinilRemoteOnly);
 return copy;
}
export async function advanceStatus(sb,order,next){
 if(!order?.jinilServerDispatchId)throw Error("서버 발주 정보가 없습니다.");
 if(next!=="done")throw Error("서버의 완료 취소는 현재 DB 상태 규칙에서 허용되지 않습니다. 서버 원본은 변경하지 않았습니다.");
 if(order.status==="working")await transitionOrder(sb,{dispatchId:order.jinilServerDispatchId,expectedStatus:"대기",nextStatus:"확인"});
 else if(order.status!=="checked")throw Error("완료 처리할 수 없는 상태입니다.");
 await transitionOrder(sb,{dispatchId:order.jinilServerDispatchId,expectedStatus:"확인",nextStatus:"완료"});
 await refreshQueue(false);
 return true;
}
export function stopQueue(){
 queueGeneration++;
 if(queuePoll)clearInterval(queuePoll);queuePoll=null;
 if(queueWatch&&queueClient)queueClient.removeChannel(queueWatch).catch(()=>{});queueWatch=null;
 queueClient=null;queueRole="";queueDept="";remoteRows=[];queueUpdate=null;
}
export async function startQueue(sb,{role,department,onUpdate}={}){
 stopQueue();if(!sb?.from)return;
 queueClient=sb;queueRole=role||"";queueDept=department||"";queueUpdate=onUpdate;
 try{await refreshQueue(false)}catch(e){console.warn("진일 발주 최초 조회:",e.message)}
 if(!queueClient)return;
 queueWatch=sb.channel("jinil-v81-queue-"+Math.random().toString(36).slice(2))
  .on("postgres_changes",{schema:"public",table:"jinil_dispatches",event:"*"},()=>void refreshQueue(true).catch(e=>console.warn("발주 동기화:",e.message))).subscribe();
 queuePoll=setInterval(()=>{if(!document.hidden)void refreshQueue(true).catch(e=>console.warn("발주 재조회:",e.message))},30000);
 if(queueUpdate)queueUpdate();
}
