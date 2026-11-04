import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method!=='POST')return reply({error:'POST 전용'},405);
 const secret=Deno.env.get('WEBHOOK_SECRET');
 if(!secret||req.headers.get('x-webhook-secret')!==secret)return reply({error:'접근 거부'},401);
 try{
  const payload=await req.json();
  if(payload.type!=='UPDATE'||payload.table!=='shared_test'||payload.schema!=='public'||String(payload.record?.id)!=='1')return reply({skipped:true});
  if(payload.old_record?.quantity===payload.record?.quantity)return reply({skipped:true,reason:'숫자 변경 없음'});
  const value=payload.record?.quantity;
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  webpush.setVapidDetails('mailto:'+Deno.env.get('VAPID_CONTACT_EMAIL'),Deno.env.get('VAPID_PUBLIC_KEY')!,Deno.env.get('VAPID_PRIVATE_KEY')!);
  const {data,error}=await admin.from('push_subscriptions').select('id,subscription');if(error)throw error;
  let sent=0,failed=0;
  for(const item of data||[]){try{
   await webpush.sendNotification(item.subscription,JSON.stringify({title:'진일 통합관리',body:`공유 숫자가 ${value}으로 변경되었습니다.`,url:'./index.html',tag:'jinil-quantity'}));sent++;
  }catch(e){failed++;const status=(e as {statusCode?:number}).statusCode;
   if(status===404||status===410)await admin.from('push_subscriptions').delete().eq('id',item.id);
   console.error('푸시 전송 실패',status,e);
  }}
  return reply({sent,failed});
 }catch(e){console.error(e);return reply({error:'전송 오류. Edge Function 로그 확인'},500)}
});
