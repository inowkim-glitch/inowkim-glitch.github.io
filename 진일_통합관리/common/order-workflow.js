// 진일 통합관리 V72 첫 독립형 발주 업무 연결 모듈.
// 기존 V72 원본은 그대로 보존하며, 이 화면은 Supabase의 실제 테이블을 사용합니다.
import {createOrder,sendOrder,loadDepartmentQueue,transitionOrder,watchDepartmentQueue,canonicalDepartment} from '../../integration/jinil-supabase-orders-adapter-v1.js';
const CLIENT_URL='https://esm.sh/@supabase/supabase-js@2';
// 앱 공통 연결 설정. 각 기기에서 직접 연결 후 서버 공유 데이터를 읽습니다.
const $=(id)=>document.getElementById(id);
let sb=null,profile=null,order=null,unsubscribe=null,inFlight=false;
const info=t=>{$('result').textContent=t;};
function block(id,v){const el=$(id);if(el)el.disabled=v;}
async function requireLogin(){
 const r=await sb.auth.getUser();if(r.error||!r.data?.user)throw Error('로그인이 필요합니다.');
 return r.data.user;
}
async function init(){
 const conf=JSON.parse(localStorage.getItem('jinil_config')||'{}');
 $('url').value=conf.url||'';$('key').value=conf.key||'';
 $('orderNo').value='TEST-'+new Date().toISOString().slice(0,10)+'-'+Math.random().toString(36).slice(2,6).toUpperCase();
 block('create',true);block('send',true);block('reload',true);
 $('connect').onclick=connect;
 $('create').onclick=create;
 $('send').onclick=send;
 $('reload').onclick=refresh;
 $('department').onchange=()=>{subscribeToSelectedDepartment();refresh();};
 $('logout').onclick=async()=>{unsubscribe?.();await sb?.auth?.signOut();profile=null;display();info('로그아웃했습니다.')};
 if(conf.url&&conf.key)await prepareClient(conf);
 setInterval(()=>{if(profile)refresh()},60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&profile)refresh()});
}
async function prepareClient({url,key}){
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)||!key)throw Error('Supabase 주소와 공개용 키를 확인하세요.');
 const {createClient}=await import(CLIENT_URL);
 sb=createClient(url,key,{auth:{autoRefreshToken:true,persistSession:true}});
 const {data}=await sb.auth.getUser();
 if(data?.user)await authorize(data.user);
}
async function connect(){
 try{
  const config={url:$('url').value.trim(),key:$('key').value.trim()};
  await prepareClient(config);
  if(!profile){const {data,error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
   if(error)throw error;await authorize(data.user);}
  localStorage.setItem('jinil_config',JSON.stringify(config));
  info('연결 및 로그인 완료');
 }catch(e){info('연결 오류: '+e.message)}
}
async function authorize(user){
 const {data,error}=await sb.from('profiles').select('department,role').eq('id',user.id).single();
 if(error||!data)throw Error('회원 프로필을 찾을 수 없습니다: '+(error?.message||''));
 profile=data;display();await refresh();
 unsubscribe?.();
 subscribeToSelectedDepartment();
}
function subscribeToSelectedDepartment(){
 if(!sb||!profile)return;
 unsubscribe?.();
 const mine=canonicalDepartment(profile.department);
 const viewing=$('department').value;
 if(mine!=='총무부'&&profile.role!=='admin'&&profile.role!=='supervisor'&&mine!==viewing)return;
 unsubscribe=watchDepartmentQueue(sb,{department:viewing,onChange:refresh});
}
function display(){
 const allowed=!!profile;
 $('editor').hidden=!allowed;
 $('who').textContent=allowed?'소속 '+profile.department+' | 권한 '+profile.role:'로그인 전';
 const isAdmin=['admin','supervisor'].includes(profile?.role),isGeneral=canonicalDepartment(profile?.department)==='총무부';
 block('create',!allowed||(!isAdmin&&!isGeneral));
 block('send',!order||(!isAdmin&&!isGeneral));
 block('reload',!allowed);
 const mine=canonicalDepartment(profile?.department);
 if(['생산부','테프론부','가공부'].includes(mine) && !isAdmin){$('department').value=mine; $('department').disabled=true;}
 else $('department').disabled=false;
}
async function create(){
 if(inFlight)return;inFlight=true;block('create',true);
 try{
  const payload={company:$('company').value.trim(),item:$('item').value.trim(),quantity:$('quantity').value.trim(),source:'V72 modular integration'};
  if(!payload.company||!payload.item)throw Error('업체명과 품목을 입력하세요.');
  order=await createOrder(sb,{orderNumber:$('orderNo').value.trim(),payload});
  block('send',false);info('Supabase 발주 저장 완료: '+order.order_no);
 }catch(e){info('저장 오류: '+e.message)}finally{inFlight=false;display()}
}
async function send(){
 if(inFlight||!order)return;
 const recipients=[...document.querySelectorAll('input[name="recipient"]:checked')].map(x=>x.value);
 if(!recipients.length){info('수신 부서를 선택하세요.');return;}
 inFlight=true;block('send',true);
 try{
  const sent=await sendOrder(sb,{orderId:order.id,recipients});
  info(sent.length+'개 부서에 송부되었습니다. 대기 상태로 서버에 저장했습니다.');
  order=null;display();await refresh();
 }catch(e){info('송부 오류: '+e.message+' 중복 송부 전에 발주 상태를 확인하세요.')}
 finally{inFlight=false;display()}
}
async function refresh(){
 if(!profile||inFlight)return;
 try{
  const department=$('department').value;
  const mine=canonicalDepartment(profile.department);
  if(!['admin','supervisor'].includes(profile.role)&&mine!=='총무부'&&mine!==department)throw Error('다른 부서 조회 권한이 없습니다.');
  const list=await loadDepartmentQueue(sb,{department});
  $('records').replaceChildren();
  if(!list.length)$('records').textContent='조회 가능한 발주가 없습니다.';
  for(const item of list){
   const box=document.createElement('article');box.className='record';
   const header=document.createElement('strong');
   header.textContent=[item.order_summary?.order_no||item.order_id,item.order_summary?.company||'',item.status].join(' / ');
   box.append(header);
   const buttonText=item.status==='대기'?'확인':item.status==='확인'?'완료':null;
   if(buttonText && (['admin','supervisor'].includes(profile.role)||mine===department)){
    const btn=document.createElement('button');btn.textContent=buttonText;btn.onclick=async()=>{
     btn.disabled=true;
     try{await transitionOrder(sb,{dispatchId:item.id,expectedStatus:item.status,nextStatus:buttonText});await refresh();info('처리 성공: '+buttonText)}
     catch(e){info('처리 오류: '+e.message);await refresh()}
     finally{btn.disabled=false}
    };box.append(btn);
   }
   $('records').append(box);
  }
  $('lastSync').textContent=new Date().toLocaleTimeString('ko-KR');
 }catch(e){info('동기화 오류: '+e.message)}
}
init().catch(e=>info('초기화 오류: '+e.message));
