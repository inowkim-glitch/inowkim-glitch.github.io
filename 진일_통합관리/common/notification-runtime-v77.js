// Jinil V77: real Supabase order alerts. Additive: no legacy workflow mutations.
export function startJinilNotifications(sb,{userId}){
 if(!sb||!userId)throw Error('Supabase 로그인 정보가 필요합니다.');
 const host=document.createElement('div');host.id='jinil-v77-notifications';document.body.append(host);
 const seen=new Set(),unread=new Map();
 let disposed=false,initial=true,fetching=false;
 let channel=null;
 const prefs=()=>{try{return JSON.parse(localStorage.getItem('jinil_notification_pref')||'{}')}catch{return {}}};
 const css=document.createElement('style');
 css.textContent='#jinil-v77-notifications .jinil-v77-center{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2147480000;background:#fff;border:2px solid #2e7d32;border-radius:14px;padding:24px;box-shadow:0 16px 60px #0005;min-width:240px;text-align:center;font:600 17px sans-serif}#jinil-v77-notifications .jinil-v77-toast{position:fixed;bottom:18px;right:18px;z-index:2147480001;background:#fff;border-left:5px solid #2e7d32;padding:13px 15px;border-radius:10px;box-shadow:0 8px 28px #0003;display:flex;gap:14px;align-items:start;font:14px sans-serif;max-width:min(360px,88vw)}#jinil-v77-notifications button{cursor:pointer;border:0;background:transparent;font-size:18px} .jinil-v77-unread{outline:3px solid #2e7d32!important;outline-offset:1px;box-shadow:0 0 0 3px #a5d6a7!important}';
 document.head.append(css);
 const findBlock=department=>[...document.querySelectorAll('.tile,[data-block-key]')].filter(el=>{const t=(el.getAttribute('data-block-key')||'')+' '+(el.textContent||'');return t.includes(department)&&(/발주|주문/.test(t))});
 const paint=()=>{
  document.querySelectorAll('.jinil-v77-unread').forEach(el=>el.classList.remove('jinil-v77-unread'));
  for(const row of unread.values())for(const el of findBlock(row.department))el.classList.add('jinil-v77-unread');
 };
 function popup(item){
  const options=prefs();
  if(options.central!==false){
   const center=document.createElement('div');center.className='jinil-v77-center';
   const title=document.createElement('strong');title.textContent=item.title;
   const body=document.createElement('div');body.textContent=item.body+' · '+item.department;
   center.append(title,body);host.append(center);setTimeout(()=>center.remove(),3000);
  }
  if(options.toast!==false){
   const toast=document.createElement('div');toast.className='jinil-v77-toast';
   const text=document.createElement('span');text.textContent=item.title+' · '+item.department+' · '+item.body;
   const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','알림 닫기');close.onclick=()=>toast.remove();
   toast.append(text,close);host.append(toast);
  }
 }
 async function reload(){
  if(disposed||fetching)return;fetching=true;
  try{
   const {data,error}=await sb.from('jinil_notifications').select('id,department,dispatch_id,title,body,read_at,created_at')
    .eq('user_id',userId).order('created_at',{ascending:false}).limit(200);
   if(error)throw error;
   unread.clear();
   for(const item of data||[]){
    if(!seen.has(item.id)){
     if(!initial&&!item.read_at)popup(item);
     seen.add(item.id);
    }
    if(!item.read_at)unread.set(item.id,item);
   }
   initial=false;paint();
  }catch(error){console.warn('진일 알림 조회 실패:',error.message)}
  finally{fetching=false}
 }
 async function markDepartment(department){
  const ids=[...unread.values()].filter(x=>x.department===department).map(x=>x.id);
  if(!ids.length)return;
  const {error}=await sb.from('jinil_notifications').update({read_at:new Date().toISOString()}).eq('user_id',userId).in('id',ids);
  if(error){console.warn('진일 알림 읽음 실패:',error.message);return}
  for(const id of ids)unread.delete(id);paint();
 }
 const onClick=e=>{
  const target=e.target.closest('.tile,[data-block-key]');if(!target)return;
  for(const item of unread.values()){
   if(findBlock(item.department).includes(target)){void markDepartment(item.department);break}
  }
 };
 document.addEventListener('click',onClick,true);
 channel=sb.channel('jinil-alert-'+userId)
  .on('postgres_changes',{event:'INSERT',schema:'public',table:'jinil_notifications',filter:'user_id=eq.'+userId},()=>void reload())
  .on('postgres_changes',{event:'UPDATE',schema:'public',table:'jinil_notifications',filter:'user_id=eq.'+userId},()=>void reload())
  .subscribe();
 const interval=setInterval(()=>void reload(),30000);
 void reload();
 return ()=>{disposed=true;clearInterval(interval);document.removeEventListener('click',onClick,true);if(channel)void sb.removeChannel(channel);host.remove();css.remove();document.querySelectorAll('.jinil-v77-unread').forEach(el=>el.classList.remove('jinil-v77-unread'))};
}