/*
 * Jinil V81, 2026-11-24.
 * Internal server transport only: NO DOM, CSS, button names, design or V72 data rewrites.
 * Batch sends keep original business button; Supabase RLS decides permissions.
 * Do not silently mark local orders "sent" before database confirms dispatch.
 */
import {createOrder,sendOrder} from "../../integration/jinil-supabase-orders-adapter-v1.js";
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
  const payload={...order,jinil_source_id:identity,jinil_original_order_no:String(order.orderNo||""),jinil_source_department:String(k)};
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
