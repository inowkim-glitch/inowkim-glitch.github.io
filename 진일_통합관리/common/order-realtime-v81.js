/* Jinil V81: headless order alerts; no permanent new buttons or dashboard layout changes. */
let client=null,uid=null,channel=null,timer=null,observer=null,rows=[],known=new Set(),initialized=false,centralTimer=null;
const mapId={general:"총무부",mc:"생산부",process:"가공부",teflon:"테프론부"};
const byId=x=>document.getElementById(x);
const normalized=x=>x==="생산부"?"생산부":String(x||"");
const prefers=()=>{try{return Object.assign({center:true,corner:true,sound:false},JSON.parse(localStorage.getItem("jinil-notice-prefs-v76")||"{}"))}catch{return {center:true,corner:true,sound:false}}};
function addStyle(){if(byId("jinil-v81-alert-style"))return;const style=document.createElement("style");style.id="jinil-v81-alert-style";style.textContent=".jinil-v81-new-order{background:#d9f8e0!important;border-color:#3ba65c!important;box-shadow:0 0 0 3px #70ce8b55!important}#jinil-v81-center{position:fixed;left:50%;top:43%;transform:translate(-50%,-50%);z-index:20001;background:#ebfff0;border:2px solid #72b987;border-radius:16px;padding:23px;color:#204b33;box-shadow:0 12px 55px #183d2e55;max-width:90vw;font:700 18px Malgun Gothic,sans-serif;pointer-events:none;text-align:center}#jinil-v81-corner{position:fixed;bottom:16px;right:16px;z-index:20002;display:grid;gap:8px;max-width:min(350px,92vw)}.jinil-v81-corner-item{border-left:5px solid #3ba65c;background:#fff;box-shadow:0 6px 28px #122e2444;border-radius:10px;padding:12px 45px 12px 13px;position:relative;font:13px Malgun Gothic,sans-serif}.jinil-v81-corner-item button{position:absolute;right:6px;top:6px;border:0;background:#eff5ef;padding:5px 8px;border-radius:6px;cursor:pointer}";
document.head.append(style)}
function notify(row){
 if(document.hidden)return;addStyle();const prefs=prefers(),title=String(row.title||"진일 통합관리").slice(0,100),body=String(row.body||"발주가 들어왔습니다").slice(0,220);
 if(prefs.center){let center=byId("jinil-v81-center");if(!center){center=document.createElement("div");center.id="jinil-v81-center";center.setAttribute("role","status");document.body.append(center)}center.textContent=body;center.hidden=false;clearTimeout(centralTimer);centralTimer=setTimeout(()=>{center.hidden=true},3000)}
 if(prefs.corner){let stack=byId("jinil-v81-corner");if(!stack){stack=document.createElement("div");stack.id="jinil-v81-corner";stack.setAttribute("aria-live","polite");document.body.append(stack)}const item=document.createElement("div");item.className="jinil-v81-corner-item";const strong=document.createElement("strong");strong.textContent=title;const line=document.createElement("div");line.textContent=body;const close=document.createElement("button");close.type="button";close.textContent="×";close.setAttribute("aria-label","알림 닫기");close.onclick=()=>item.remove();item.append(strong,line,close);stack.prepend(item);while(stack.children.length>8)stack.lastElementChild.remove()}
 if(prefs.sound)try{const c=new (window.AudioContext||window.webkitAudioContext)(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=730;g.gain.value=.035;o.start();o.stop(c.currentTime+.12);o.onended=()=>c.close()}catch{}
}
function paint(){
 if(!uid)return;
 const unread=new Set(rows.filter(x=>!x.read_at).map(x=>normalized(x.department)));
 document.querySelectorAll("#sourceList .source,#canvas .tile").forEach(node=>{
  const text=node.querySelector(".source-label,.tile-title")?.textContent||"";
  const hit=[...unread].some(d=>text.includes(d)||d==="총무부"&&text.includes("총무"));
  node.classList.toggle("jinil-v81-new-order",hit);
 })
}
async function reload(show){
 if(!uid||!client)return;const me=uid;
 const r=await client.from("jinil_notifications").select("id,user_id,department,title,body,read_at,created_at").eq("user_id",me).order("created_at",{ascending:false}).limit(100);
 if(r.error){console.warn("진일 발주 알림 수신:",r.error.message);return}if(uid!==me)return;
 for(const n of r.data||[]){if(!known.has(n.id)){known.add(n.id);if(show&&initialized&&!n.read_at)notify(n)}}
 rows=r.data||[];initialized=true;paint();
}
async function enterDepartment(blockId){
 if(!uid||!client)return;const department=mapId[blockId];if(!department)return;
 const ids=rows.filter(x=>!x.read_at&&x.department===department).map(x=>x.id);
 if(!ids.length)return;const me=uid;
 const r=await client.from("jinil_notifications").update({read_at:new Date().toISOString()}).eq("user_id",me).in("id",ids);
 if(r.error){console.warn("진일 발주 읽음 처리:",r.error.message);return}
 await reload(false);
}
function stop(){
 if(channel&&client)client.removeChannel(channel).catch(()=>{});channel=null;if(timer)clearInterval(timer);timer=null;if(observer)observer.disconnect();observer=null;clearTimeout(centralTimer);
 client=null;uid=null;rows=[];known.clear();initialized=false;
 document.querySelectorAll(".jinil-v81-new-order").forEach(x=>x.classList.remove("jinil-v81-new-order"));
 ["jinil-v81-center","jinil-v81-corner"].forEach(x=>byId(x)?.remove());
}
async function start({client:sb,user}){
 if(!sb?.from||!user?.id)return;stop();client=sb;uid=user.id;addStyle();
 await reload(false);if(!uid)return;
 channel=client.channel("jinil-v81-alert-"+uid).on("postgres_changes",{schema:"public",table:"jinil_notifications",event:"INSERT",filter:"user_id=eq."+uid},()=>void reload(true)).on("postgres_changes",{schema:"public",table:"jinil_notifications",event:"UPDATE",filter:"user_id=eq."+uid},()=>void reload(false)).subscribe();
 timer=setInterval(()=>{if(!document.hidden)void reload(true)},30000);
 observer=new MutationObserver(paint);
 for(const element of [byId("canvas"),byId("sourceList")])if(element)observer.observe(element,{childList:true,subtree:true});
}
export {start,stop,enterDepartment};
