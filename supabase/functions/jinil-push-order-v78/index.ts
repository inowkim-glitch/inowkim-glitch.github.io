import {createClient} from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

/** 별도 발주 웹훅 엔드포인트. 기존 shared_test 푸시와 분리. */
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});
Deno.serve(async req=>{
 if(req.method!=="POST")return response({error:"POST only"},405);
 const expected=Deno.env.get("WEBHOOK_SECRET");
 if(!expected||req.headers.get("x-webhook-secret")!==expected)return response({error:"Unauthorized"},401);
 try{
  const payload=await req.json();
  if(payload?.type!=="INSERT"||payload?.table!=="jinil_dispatches"||payload?.schema!=="public")return response({skipped:true});
  const id=String(payload?.record?.id||"");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return response({error:"Invalid dispatch ID"},400);
  const url=Deno.env.get("SUPABASE_URL");
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const pub=Deno.env.get("VAPID_PUBLIC_KEY");
  const priv=Deno.env.get("VAPID_PRIVATE_KEY");
  const contact=Deno.env.get("VAPID_CONTACT_EMAIL");
  if(!url||!service||!pub||!priv||!contact)return response({error:"Push server configuration missing"},503);
  const db=createClient(url,service);
  const {data:notices,error:nErr}=await db.from("jinil_notifications").select("user_id,department,title,body").eq("dispatch_id",id);
  if(nErr)throw nErr;
  if(!notices?.length)return response({skipped:true,reason:"No recipients"});
  const userIds=[...new Set(notices.map(n=>n.user_id))];
  const {data:devices,error:sErr}=await db.from("push_subscriptions").select("id,user_id,subscription").in("user_id",userIds);
  if(sErr)throw sErr;
  webpush.setVapidDetails("mailto:"+contact,pub,priv);
  let sent=0,failed=0;
  for(const device of devices||[]){
   const message=notices.find(n=>n.user_id===device.user_id);
   if(!message)continue;
   try{
    await webpush.sendNotification(device.subscription,JSON.stringify({
      title:message.title||"진일 통합관리",
      body:message.body||"발주가 들어왔습니다",
      department:message.department,
      dispatch_id:id,
      tag:"jinil-order-"+id
    }));
    sent++;
   }catch(err){
    failed++;
    const status=(err as {statusCode?:number}).statusCode;
    if(status===404||status===410)await db.from("push_subscriptions").delete().eq("id",device.id);
    console.error("push delivery error",status);
   }
  }
  return response({ok:true,dispatch_id:id,sent,failed});
 }catch(err){
  console.error("Order push handler failed",err);
  return response({error:"Dispatch notification error"},500);
 }
});