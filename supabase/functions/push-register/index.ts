import { createClient } from 'npm:@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'https://inowkim-glitch.github.io','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 try{
  const auth=req.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))return respond({error:'로그인 필요'},401);
  const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const client=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user},error}=await client.auth.getUser();if(error||!user)return respond({error:'인증 실패'},401);
  const admin=createClient(url,service);
  if(req.method==='GET'&&new URL(req.url).searchParams.get('action')==='config')return respond({publicKey:Deno.env.get('VAPID_PUBLIC_KEY')||''});
  if(req.method!=='POST')return respond({error:'허용되지 않은 요청'},405);
  const {action,subscription}=await req.json();
  if(action==='subscribe'){
   if(typeof subscription?.endpoint!=='string'||!subscription.endpoint.startsWith('https://')||!subscription.keys?.p256dh||!subscription.keys?.auth)return respond({error:'잘못된 구독 정보'},400);
   const {error:e}=await admin.from('push_subscriptions').upsert({user_id:user.id,endpoint:subscription.endpoint,subscription,updated_at:new Date().toISOString()},{onConflict:'endpoint'});
   if(e)throw e;return respond({ok:true});
  }
  if(action==='unsubscribe'){
   if(typeof subscription?.endpoint!=='string')return respond({error:'endpoint 필요'},400);
   const {error:e}=await admin.from('push_subscriptions').delete().eq('user_id',user.id).eq('endpoint',subscription.endpoint);if(e)throw e;return respond({ok:true});
  }
  return respond({error:'잘못된 작업'},400);
 }catch(e){console.error(e);return respond({error:'서버 오류. Edge Function 로그 확인'},500)}
});
