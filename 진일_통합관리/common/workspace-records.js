// V72 분리 작업 브랜치 개발용. 원본 데이터와 로컬 시험 기록은 자동 이관하지 않습니다.
const cfg=window.JINIL_WORKSPACE_CONFIG,$=id=>document.getElementById(id),main=document.querySelector('main');
const form=$('edit'),panel=form?.closest('section'),query=$('query'),tbody=$('rows'),status=$('status'),clear=$('clear'),csv=$('export');
const inputFields=[...(form?.querySelectorAll('[name^="f"]')||[])];
const labels=inputFields.map(f=>f.closest('label')?.firstChild?.textContent?.trim()||f.name);
const auth=document.createElement('section');auth.className='panel';auth.innerHTML='<h2>Supabase 연결 · 인증</h2><div class="fields"><label>프로젝트 URL<input id="svurl" placeholder="https://xxxx.supabase.co"></label><label>공개용 키<input id="svkey" placeholder="anon/publishable"></label><label>이메일<input id="svmail" type="email"></label><label>비밀번호<input id="svpass" type="password"></label></div><div class="tools"><button id="svlogin">연결·로그인</button><button id="svlogout" class="secondary">로그아웃</button><button id="svrefresh" class="secondary">서버 조회</button></div><p id="svwho" role="status">로그인이 필요합니다.</p>';
main.insertBefore(auth,panel||tbody.closest('section'));
let sb=null,profile=null,items=[],channel=null,busy=false;
const canonical=v=>({'본사 총무':'총무부','생산동':'생산부','가공동':'가공부','테프론동':'테프론부'}[v]||v);
const currentDept=()=>canonical(profile?.department||'');
const writable=()=>profile&&!cfg.readonly&&!cfg.calendar&&(profile.role==='admin'||currentDept()===cfg.department||cfg.department==='기타블록');
const allowed=()=>profile&&(profile.role==='admin'||currentDept()===cfg.department||currentDept()==='총무부'||cfg.department==='기타블록'||['생산부:생산부재고확인','테프론부:재고확인','가공부:소재발주_확인'].includes(cfg.key));
const say=s=>{status.textContent=s};
try{const c=JSON.parse(localStorage.getItem('jinil_config')||'{}');$('svurl').value=c.url||'';$('svkey').value=c.key||''}catch{}
if(panel)panel.hidden=true;
if(clear)clear.hidden=true; // 서버 전체 삭제 방지
function values(r){return cfg.calendar?[r.order_summary?.order_no||r.order_id,r.order_summary?.company||'',r.order_summary?.item||'',r.order_summary?.delivery_date||r.order_summary?.due_date||'',r.status]:(r.payload?.values||[])}
function draw(){
 tbody.replaceChildren();const search=String(query?.value||'').toLowerCase();let shown=0;
 items.forEach(r=>{const vals=values(r).map(x=>String(x??''));if(search&&!vals.some(v=>v.toLowerCase().includes(search)))return;shown++;
 const tr=document.createElement('tr');for(let i=0;i<labels.length;i++){const td=document.createElement('td');td.textContent=vals[i]||'';tr.append(td)}
 const td=document.createElement('td');if(writable()){const b=document.createElement('button');b.className='secondary';b.textContent='삭제';b.onclick=async()=>{if(!confirm('서버 기록을 삭제하시겠습니까?'))return;try{const z=await sb.from('jinil_workspace_records').delete().eq('id',r.id);if(z.error)throw z.error;await refresh()}catch(e){say('삭제 오류: '+e.message)}};td.append(b)}else td.textContent='조회 전용';tr.append(td);tbody.append(tr)});
 say('서버 '+items.length+'건 중 '+shown+'건 표시 · '+new Date().toLocaleTimeString('ko-KR'));
}
async function refresh(){if(!sb||!profile||busy)return;busy=true;try{
 const result=cfg.calendar?await sb.from('jinil_dispatches').select('id,order_id,department,status,sent_at,order_summary').in('department',cfg.department==='총무부'?['생산부','가공부','테프론부']:[cfg.department]).order('sent_at',{ascending:false}).limit(1000)
 :await sb.from('jinil_workspace_records').select('id,module_key,department,payload,created_by,created_at').eq('module_key',cfg.key).order('created_at',{ascending:false}).limit(1000);
 if(result.error)throw result.error;items=result.data||[];draw()
 }catch(e){say('서버 조회 오류: '+e.message)}finally{busy=false}}
$('svlogin').onclick=async()=>{try{
 const url=$('svurl').value.trim(),key=$('svkey').value.trim();if(!url.startsWith('https://')||!url.includes('.supabase.co')||!key)throw Error('URL과 공개용 키를 확인하세요.');
 const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
 if(sb&&channel)await sb.removeChannel(channel);sb=createClient(url,key);
 let {data:{user}}=await sb.auth.getUser();if(!user){const z=await sb.auth.signInWithPassword({email:$('svmail').value.trim(),password:$('svpass').value});if(z.error)throw z.error;user=z.data.user}
 if(!user)throw Error('로그인에 실패했습니다.');
 const p=await sb.from('profiles').select('role,department').eq('id',user.id).single();if(p.error)throw p.error;profile=p.data;if(!allowed()){profile=null;throw Error('해당 부서 조회 권한이 없습니다.')}
 localStorage.setItem('jinil_config',JSON.stringify({url,key}));$('svwho').textContent=profile.department+' / '+profile.role;
 if(panel)panel.hidden=!writable();await refresh();
 channel=sb.channel('jinil-ws-'+crypto.randomUUID()).on('postgres_changes',{event:'*',schema:'public',table:cfg.calendar?'jinil_dispatches':'jinil_workspace_records'},refresh).subscribe();
 }catch(e){say('연결 오류: '+e.message)}};
$('svrefresh').onclick=refresh;
$('svlogout').onclick=async()=>{if(sb&&channel)await sb.removeChannel(channel);if(sb)await sb.auth.signOut();sb=null;profile=null;items=[];tbody.replaceChildren();if(panel)panel.hidden=true;$('svwho').textContent='로그아웃';say('로그아웃되었습니다.')};
if(form)form.onsubmit=async e=>{e.preventDefault();if(!writable())return say('쓰기 권한이 없습니다.');try{
 const values=inputFields.map(f=>String(f.value).trim());if(!values[0])throw Error('첫 번째 값을 입력해 주세요.');
 const r=await sb.from('jinil_workspace_records').insert({module_key:cfg.key,department:cfg.department,payload:{values,labels,prototype:true}});if(r.error)throw r.error;form.reset();await refresh();
 }catch(err){say('서버 저장 오류: '+err.message)}};
if(query)query.oninput=draw;
if(csv)csv.onclick=()=>{const all=[labels,...items.map(values)],body='\uFEFF'+all.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');const u=URL.createObjectURL(new Blob([body],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=u;a.download=cfg.key.replace(':','_')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)};
setInterval(()=>{if(sb&&profile)refresh()},60000);
say('서버 조회용 개발 화면입니다. 로그인 후 조회할 수 있으며 기존 로컬 기록은 자동 이관하지 않습니다.');
