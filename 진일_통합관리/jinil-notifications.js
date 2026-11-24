/* JINIL V76: user-scoped dispatch notifications. */
(function(){
"use strict";
let sb=null,uid="",subscription=null,interval=null,known=new Set(),rows=[],loaded=false,centralTimer=0;
const el=id=>document.getElementById(id);
const defaults={center:true,corner:true,sound:false};
function getPrefs(){try{return Object.assign({},defaults,JSON.parse(localStorage.getItem("jinil-notice-prefs-v76")||"{}"))}catch{return Object.assign({},defaults)}}
let prefs=getPrefs();
const status=msg=>{if(el("jinil-alert-status"))el("jinil-alert-status").textContent=String(msg)};
function ui(){
 if(el("jinil-alert-controls"))return;
 const style=document.createElement("style");style.textContent="#jinil-alert-controls{position:fixed;bottom:16px;left:16px;z-index:19980;font:13px sans-serif}#jinil-alert-controls button{cursor:pointer}#jinil-alert-open{background:#214d36;color:white;border:0;border-radius:9px;padding:10px 12px}#jinil-alert-options{background:white;color:#263a2e;border:1px solid #c5d9c9;border-radius:12px;padding:15px;box-shadow:0 8px 40px #1234;min-width:260px;margin-bottom:8px}#jinil-alert-options label{display:block;margin:10px 0}#jinil-alert-options button{padding:9px;border:1px solid #bdcebf;border-radius:7px;background:#e8f3ea}#jinil-alert-status{font-size:11px;color:#67766a;margin-top:10px;max-width:275px}#jinil-alert-central{position:fixed;top:44%;left:50%;transform:translate(-50%,-50%);z-index:20001;pointer-events:none;background:#e7ffed;border:2px solid #43a564;box-shadow:0 15px 65px #1236;border-radius:17px;padding:25px;max-width:90vw;font-weight:800;text-align:center;font-size:19px}#jinil-alert-corner{position:fixed;bottom:16px;right:16px;z-index:20002;display:grid;gap:8px;max-width:min(360px,94vw)}.jinil-alert-item{background:white;border-left:5px solid #2da65a;border-radius:9px;box-shadow:0 7px 25px #1235;padding:13px 40px 13px 13px;font:13px sans-serif;position:relative}.jinil-alert-item button{position:absolute;right:7px;top:7px;border:0;border-radius:5px;padding:4px 8px;cursor:pointer}.jinil-unread-block{background:#d9f7dd!important;border-color:#2b9a4b!important;box-shadow:0 0 0 3px #50c77845!important}";
 document.head.append(style);
 const controls=document.createElement("div");controls.id="jinil-alert-controls";
 controls.innerHTML='<div id="jinil-alert-options" hidden><b>🔔 발주 알림 설정</b><label><input type="checkbox" data-alert-opt="center">중앙 3초 모달</label><label><input type="checkbox" data-alert-opt="corner">우하단 알림 (X 닫기)</label><label><input type="checkbox" data-alert-opt="sound">알림 소리</label><button id="jinil-alert-os" type="button">휴대폰 푸시 알림 켜기</button><div id="jinil-alert-status">허용된 회원의 발주 알림만 표시합니다.</div></div><button type="button" id="jinil-alert-open">🔔 발주 알림 <span id="jinil-alert-count"></span></button>';
 const center=document.createElement("div");center.id="jinil-alert-central";center.hidden=true;center.setAttribute("role","status");
 const corner=document.createElement("div");corner.id="jinil-alert-corner";corner.setAttribute("aria-live","polite");
 document.body.append(controls,center,corner);
 el("jinil-alert-open").onclick=()=>{el("jinil-alert-options").hidden=!el("jinil-alert-options").hidden};
 controls.querySelectorAll("[data-alert-opt]").forEach(node=>{let key=node.dataset.alertOpt;node.checked=!!prefs[key];node.onchange=()=>{prefs[key]=node.checked;localStorage.setItem("jinil-notice-prefs-v76",JSON.stringify(prefs))}});
 el("jinil-alert-os").onclick=registerPush;
}
function showNotice(row){
 const body=String(row.body||"발주가 들어왔습니다").slice(0,250);
 if(prefs.center){const center=el("jinil-alert-central");center.textContent=body;center.hidden=false;clearTimeout(centralTimer);centralTimer=setTimeout(()=>center.hidden=true,3000)}
 if(prefs.corner){const item=document.createElement("div");item.className="jinil-alert-item";const strong=document.createElement("strong");strong.textContent=String(row.title||"진일 통합관리").slice(0,100);const line=document.createElement("div");line.textContent=body+" · "+String(row.department||"");const close=document.createElement("button");close.type="button";close.textContent="×";close.setAttribute("aria-label","알림 닫기");close.onclick=()=>item.remove();item.append(strong,line,close);el("jinil-alert-corner").prepend(item);while(el("jinil-alert-corner").children.length>8)el("jinil-alert-corner").lastElementChild.remove()}
 if(prefs.sound){try{const ctx=new (window.AudioContext||window.webkitAudioContext)();const osc=ctx.createOscillator(),gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=720;gain.gain.value=.045;osc.start();osc.stop(ctx.currentTime+.12);osc.onended=()=>ctx.close()}catch{}}
}
function paint(){
 if(!uid)return;
 const unread=rows.filter(x=>!x.read_at);
 if(el("jinil-alert-count"))el("jinil-alert-count").textContent=unread.length?"("+unread.length+")":"";
 const departments=new Set(unread.map(x=>x.department));
 document.querySelectorAll("#sourceList .source,#canvas .tile").forEach(node=>{const name=node.querySelector(".source-label,.tile-title")?.textContent||"";node.classList.toggle("jinil-unread-block",[...departments].some(dept=>name.includes(dept)||dept==="총무부"&&name.includes("총무")))});
}
async function refresh(pop){
 if(!uid||!sb)return;
 const who=uid;
 try{const result=await sb.from("jinil_notifications").select("id,user_id,dispatch_id,department,block_key,title,body,read_at,created_at").eq("user_id",who).order("created_at",{ascending:false}).limit(100);
 if(result.error)throw result.error;if(uid!==who)return;
 for(const item of result.data||[]){if(!known.has(item.id)){known.add(item.id);if(pop&&loaded&&!item.read_at)showNotice(item)}}
 rows=result.data||[];loaded=true;paint();
 }catch(err){status("알림 조회 실패: "+String(err.message||err).slice(0,120))}
}
async function enterBlock(name){
 if(!uid||!sb)return;const departments=["총무부","생산부","가공부","테프론부"].filter(d=>String(name||"").includes(d)||d==="총무부"&&String(name||"").includes("총무"));
 const ids=rows.filter(x=>!x.read_at&&departments.includes(x.department)).map(x=>x.id);if(!ids.length)return;
 const result=await sb.from("jinil_notifications").update({read_at:new Date().toISOString()}).eq("user_id",uid).in("id",ids);
 if(!result.error){rows.forEach(x=>{if(ids.includes(x.id))x.read_at=new Date().toISOString()});paint()}
}
async function registerPush(){
 if(!sb||!uid)return;
 try{
 if(!isSecureContext||!("serviceWorker" in navigator)||!("PushManager" in window))throw Error("이 브라우저는 HTTPS 푸시를 지원하지 않습니다.");
 const result=await sb.auth.getSession();const token=result.data?.session?.access_token;if(!token)throw Error("로그인이 필요합니다.");
 const res=await fetch(sb.supabaseUrl+"/functions/v1/push-register?action=config",{headers:{"Authorization":"Bearer "+token,"apikey":sb.supabaseKey}});const info=await res.json();if(!res.ok||!info.publicKey)throw Error("푸시 공개키가 없습니다.");
 const reg=await navigator.serviceWorker.register("./jinil-push-sw.js",{scope:"./"});
 const key=Uint8Array.from(atob(info.publicKey.replace(/-/g,"+").replace(/_/g,"/")),ch=>ch.charCodeAt(0));
 let push=await reg.pushManager.getSubscription();if(!push)push=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 const saved=await sb.functions.invoke("push-register",{body:{action:"subscribe",subscription:push.toJSON()}});
 if(saved.error||!saved.data?.ok)throw Error("구독 저장 실패");
 status("푸시 구독 등록됨. 발주 OS 자동발송 연결은 별도 점검이 필요합니다.");
 }catch(err){status("푸시 설정 실패: "+String(err.message||err).slice(0,150))}
}
function stop(){
 if(subscription&&sb)sb.removeChannel(subscription).catch(()=>{});subscription=null;if(interval)clearInterval(interval);interval=null;clearTimeout(centralTimer);sb=null;uid="";known.clear();rows=[];loaded=false;
 ["jinil-alert-controls","jinil-alert-central","jinil-alert-corner"].forEach(id=>el(id)?.remove());
 document.querySelectorAll(".jinil-unread-block").forEach(e=>e.classList.remove("jinil-unread-block"));
}
async function start({client,user}){
 if(!client||!user?.id)return;stop();sb=client;uid=user.id;prefs=getPrefs();ui();await refresh(false);if(!uid)return;
 subscription=sb.channel("jinil-notify-"+uid).on("postgres_changes",{event:"INSERT",schema:"public",table:"jinil_notifications",filter:"user_id=eq."+uid},()=>refresh(true)).on("postgres_changes",{event:"UPDATE",schema:"public",table:"jinil_notifications",filter:"user_id=eq."+uid},()=>refresh(false)).subscribe();
 interval=setInterval(()=>{if(!document.hidden)refresh(true)},30000);
}
window.JinilPushUI={start,stop,enterBlock,refresh};
})();