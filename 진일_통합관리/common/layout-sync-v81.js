/* Jinil V81 - private per-user layout mirror; no DOM, CSS or button changes.
 * Own Supabase RLS table. Never delete original local data; back up before restoring.
 */
let sb=null,uid="",channel=null,debounce=null,stopped=true,callbacks=null,writing=false,queued=null;
const T="jinil_v72_member_layout";
const localTs=()=>Number(localStorage.getItem("jinil-v81-layout-time:"+uid)||0);
const recordTs=t=>{try{localStorage.setItem("jinil-v81-layout-time:"+uid,String(t))}catch{}};
const validSnapshot=s=>!!s&&Array.isArray(s.layout?.pages)&&Array.isArray(s.state?.blocks)&&s.layout.pages.length>0;
function stop(){
 stopped=true;if(debounce)clearTimeout(debounce);debounce=null;
 if(channel&&sb)sb.removeChannel(channel).catch(()=>{});channel=null;
 sb=null;uid="";callbacks=null;writing=false;queued=null;
}
async function read(){
 if(stopped||!sb||!uid)return null;
 const result=await sb.from(T).select("snapshot,updated_at").eq("user_id",uid).maybeSingle();
 if(result.error)throw result.error;
 return result.data;
}
async function safelyApply(remote){
 if(stopped||!remote||!validSnapshot(remote.snapshot)||!callbacks)return;
 const t=Date.parse(remote.updated_at||"")||0,existing=Number(callbacks.hasLocal?.()||0),local=localTs();
 if(existing&&(!local||t<=local+1000))return; // Legacy local layout wins until its first explicit save.
 if(writing||queued)return;
 const current=callbacks.getSnapshot?.();
 if(current?.layout?.pages)try{
  localStorage.setItem("jinil-v81-layout-backup:"+uid+":"+Date.now(),JSON.stringify(current));
 }catch(e){console.warn("진일 레이아웃 복구 전 백업 실패",e);return}
 callbacks.applySnapshot(remote.snapshot);
 recordTs(t);
}
async function synchronize(){
 try{await safelyApply(await read())}
 catch(e){console.warn("진일 개인 배치 수신 실패",e.message)}
}
async function flush(){
 if(stopped||writing||!queued)return;writing=true;
 const item=queued;queued=null;
 try{
  const result=await sb.from(T).upsert({user_id:uid,snapshot:item.snapshot,updated_at:new Date(item.at).toISOString()},{onConflict:"user_id"}).select("updated_at").single();
  if(result.error)throw result.error;
  recordTs(Date.parse(result.data?.updated_at||"")||item.at);
 }catch(e){
  console.warn("진일 개인 배치 동기화 실패. 로컬 배치는 그대로 유지합니다.",e.message);
  if(!queued)queued=item;
 }finally{writing=false;if(queued&&!stopped){debounce=setTimeout(flush,1500)}}
}
function queue(snapshot){
 if(stopped||!sb||!uid||!validSnapshot(snapshot))return;
 queued={snapshot:JSON.parse(JSON.stringify(snapshot)),at:Date.now()};
 if(debounce)clearTimeout(debounce);debounce=setTimeout(flush,550);
}
async function start(client,userId,handlers){
 stop();if(!client?.from||!userId||!handlers)return;
 sb=client;uid=userId;callbacks=handlers;stopped=false;
 await synchronize();if(stopped)return;
 const row=await read().catch(()=>null);
 if(!row&&callbacks?.hasLocal?.())queue(callbacks.getSnapshot());
 channel=sb.channel("jinil-v81-layout-"+uid).on("postgres_changes",{event:"*",schema:"public",table:T,filter:"user_id=eq."+uid},()=>void synchronize()).subscribe();
}
export {start,stop,queue,synchronize};
