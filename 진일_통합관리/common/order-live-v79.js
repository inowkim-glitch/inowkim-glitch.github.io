/* Jinil V79: live order management using existing secured Supabase schema. */
import {createOrder,sendOrder,loadDepartmentQueue,transitionOrder,watchDepartmentQueue,canonicalDepartment} from "../../integration/jinil-supabase-orders-adapter-v1.js";
let context=null,disposers=[],generation=0;
const departments=["생산부","가공부","테프론부"];
const get=(host,id)=>host.querySelector("#"+id);
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
function cleanup(){generation++;for(const fn of disposers.splice(0))try{fn()}catch{}}
function sender(c){return c.role==="super_admin"||c.role==="staff"&&canonicalDepartment(c.department)==="총무부"}
function readAllowed(c,dept){return c.role==="super_admin"||c.role!=="admin"&&(canonicalDepartment(c.department)==="총무부"||canonicalDepartment(c.department)===dept)}
function canUpdate(c,dept){return c.role==="super_admin"||c.role==="staff"&&canonicalDepartment(c.department)===dept}
export function setContext(c){cleanup();context=c?.client&&c?.user?.id?c:null}
export function logout(){cleanup();context=null}
export function render(container,{feature,blockId}){
 cleanup();const generationAtStart=generation,c=context,host=node("div","jinil-v79-live");host.style.cssText="max-width:1000px;margin:auto;font:14px Malgun Gothic,sans-serif;color:#294230";container.append(host);
 const live=()=>generationAtStart===generation&&host.isConnected;
 const html='<style>.jinil-v79-live .v79-panel{background:white;border:1px solid #d7e4d8;border-radius:10px;margin:10px 0;padding:16px}.jinil-v79-live label{display:block;margin:8px 0;font-weight:600}.jinil-v79-live input[type=text],.jinil-v79-live input[type=number]{display:block;padding:10px;border:1px solid #adbfaf;border-radius:7px;max-width:480px;width:100%;box-sizing:border-box}.jinil-v79-live button{margin:4px;padding:9px;border:1px solid #a5c3aa;border-radius:7px;background:#e9f4eb;color:#1e4b31;cursor:pointer}.jinil-v79-live button:disabled{opacity:.45}.jinil-v79-live .v79-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.jinil-v79-live .v79-entry{border:1px solid #d8e4da;padding:12px;border-radius:9px;margin:8px 0}.jinil-v79-live #v79-status{background:#eef5ec;padding:12px;white-space:pre-wrap;border-radius:8px}</style>'+
 '<div id="v79-status" role="status">Supabase 발주 조회 준비 중</div>'+
 '<section id="v79-form" class="v79-panel" hidden><h3>총무과 · 발주서 작성 및 전송</h3>'+
 '<label>발주번호<input id="v79-no" type="text"></label><label>업체명<input id="v79-company" type="text"></label>'+
 '<label>품목<input id="v79-item" type="text"></label><label>수량<input id="v79-qty" type="number" min="1" step="1"></label>'+
 '<button type="button" id="v79-save">발주 서버 저장</button><strong id="v79-saved"></strong>'+
 '<div class="v79-row"><label><input type="checkbox" name="v79-dept" value="생산부">생산부</label>'+
 '<label><input type="checkbox" name="v79-dept" value="가공부">가공부</label>'+
 '<label><input type="checkbox" name="v79-dept" value="테프론부">테프론부</label></div>'+
 '<button type="button" id="v79-send" disabled>선택 부서로 실제 발주 전송</button></section>'+
 '<section class="v79-panel"><div class="v79-row"><h3>부서별 발주 대기·확인·완료</h3><button type="button" id="v79-reload">서버 새로고침</button></div>'+
 '<label>검색<input type="text" id="v79-filter" placeholder="발주번호·업체명·품목"></label><div id="v79-list"></div><small id="v79-time"></small></section>';
 host.innerHTML=html;
 const report=x=>{if(live())get(host,"v79-status").textContent=x};
 const deptMap={general:"총무부",mc:"생산부",process:"가공부",teflon:"테프론부"},dept=deptMap[blockId];
 if(!c?.client||!c?.user?.id){report("Supabase 계정 로그인 후 발주 업무가 표시됩니다.");return}
 if(!dept||!readAllowed(c,dept)){report("해당 부서의 발주 업무 접근 권한이 없습니다.");return}
 if(!["order","orders","general-orders"].includes(feature)){report("발주 메뉴에서만 연결됩니다.");return}
 let saved=null,busy=false,records=[];
 const isWriter=dept==="총무부"&&feature==="order"&&sender(c);
 get(host,"v79-form").hidden=!isWriter;
 get(host,"v79-no").value="JINIL-"+new Date().toISOString().replace(/[^0-9]/g,"").slice(0,14);
 const val=id=>String(get(host,id).value||"").trim();
 function disable(b){busy=b;get(host,"v79-save").disabled=b||!!saved;get(host,"v79-send").disabled=b||!saved;get(host,"v79-reload").disabled=b}
 async function save(){
  if(busy||!isWriter||saved)return;
  const number=val("v79-no"),company=val("v79-company"),item=val("v79-item"),quantity=Number(val("v79-qty"));
  if(!number||!company||!item||!Number.isSafeInteger(quantity)||quantity<=0){report("발주번호·업체·품목·수량을 확인하세요.");return}
  disable(true);
  try{saved=await createOrder(c.client,{orderNumber:number,payload:{company,item,quantity,source:"V79 real Supabase integration"}});
   if(live()){get(host,"v79-saved").textContent=" 서버 저장됨: "+saved.order_no;report("발주 원본 저장 완료. 송부할 부서를 선택하세요.")}}
  catch(e){report("발주 저장 실패: "+e.message)}finally{if(live())disable(false)}
 }
 async function send(){
  if(busy||!isWriter||!saved)return;
  const ds=[...host.querySelectorAll('input[name="v79-dept"]:checked')].map(x=>x.value);
  if(!ds.length){report("송부할 부서를 선택하세요.");return}
  disable(true);
  try{
   const check=await c.client.from("jinil_dispatches").select("id").eq("order_id",saved.id).limit(1);
   if(check.error)throw check.error;
   if(check.data?.length)throw Error("이 발주는 이미 일부 또는 전체 부서에 송부됐습니다. 중복 전송하지 마세요.");
   const rows=await sendOrder(c.client,{orderId:saved.id,recipients:ds});
   if(live()){saved=null;get(host,"v79-saved").textContent="전송 완료";report(rows.length+"개 부서에 송부됐습니다. 알림과 수신 부서의 대기 상태가 생성됩니다.");setBusy(false);await reload();}
  }catch(e){report("송부 중단: "+e.message+" / 서버 기록 확인 전 재시도하지 마세요.")}finally{if(live())disable(false)}
 }
 function show(){
  if(!live())return;const list=get(host,"v79-list");list.replaceChildren();
  const query=val("v79-filter").toLowerCase();
  const matches=records.filter(x=>[x.order_summary?.order_no,x.order_summary?.company,x.order_summary?.item].some(y=>String(y||"").toLowerCase().includes(query)));
  if(!matches.length){list.append(node("p","","조회 가능한 발주가 없습니다."));return}
  for(const x of matches){
   const row=node("div","v79-entry");
   row.append(node("strong","",String(x.order_summary?.order_no||x.order_id)),node("div","",x.department+" | "+(x.order_summary?.company||"")+" | "+(x.order_summary?.item||"")+" | "+(x.order_summary?.quantity||"")),node("strong","",x.status));
   const next=x.status==="대기"?"확인":x.status==="확인"?"완료":null;
   if(next&&canUpdate(c,x.department)){
    const btn=node("button","",x.department+" "+next);btn.type="button";
    btn.onclick=async()=>{btn.disabled=true;try{await transitionOrder(c.client,{dispatchId:x.id,expectedStatus:x.status,nextStatus:next});report("처리 성공: "+x.department+" "+next);await reload()}catch(e){report("상태 변경 실패: "+e.message)}finally{btn.disabled=false}};
    row.append(btn);
   }
   list.append(row);
  }
 }
 async function reload(){
  if(!live()||busy)return;
  try{const ds=dept==="총무부"?departments:[dept],sets=await Promise.all(ds.map(d=>loadDepartmentQueue(c.client,{department:d})));
   if(!live())return;
   records=sets.flat().sort((a,b)=>String(b.sent_at).localeCompare(String(a.sent_at)));
   show();get(host,"v79-time").textContent="서버 조회 "+new Date().toLocaleTimeString("ko-KR")+" · "+records.length+"건";
   report("Supabase 실시간 발주 조회 완료");
  }catch(e){report("서버 조회 오류: "+e.message)}
 }
 get(host,"v79-save").onclick=save;get(host,"v79-send").onclick=send;get(host,"v79-reload").onclick=reload;get(host,"v79-filter").oninput=show;
 const watched=dept==="총무부"?departments:[dept];
 for(const d of watched)disposers.push(watchDepartmentQueue(c.client,{department:d,onChange:()=>{if(live())void reload()}}));
 const timer=setInterval(()=>{if(live()&&!document.hidden)void reload()},30000);disposers.push(()=>clearInterval(timer));
 void reload();
}
