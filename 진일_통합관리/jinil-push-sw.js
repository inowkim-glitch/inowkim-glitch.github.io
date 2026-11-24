/* 진일 발주 알림 SW - V78 개발용 */
self.addEventListener("push",event=>{
 let data={};try{data=event.data?.json()||{}}catch{data={body:event.data?.text()||""}}
 const notification=data.notification||data;
 const url="./11_1_v78_진일_통합_실시간_관리_시스템_재작업.html"+(notification.dispatch_id?"?dispatch="+encodeURIComponent(String(notification.dispatch_id)):"");
 event.waitUntil(self.registration.showNotification(String(notification.title||"진일 통합관리"),{body:String(notification.body||"발주가 들어왔습니다"),tag:String(notification.tag||"jinil-order"),icon:"../icon-192.png",badge:"../icon-192.png",renotify:true,data:{url}}));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 const dest=new URL(event.notification.data?.url||"./11_1_v78_진일_통합_실시간_관리_시스템_재작업.html",self.registration.scope).href;
 event.waitUntil((async()=>{const list=await clients.matchAll({type:"window",includeUncontrolled:true});for(const client of list){if(new URL(client.url).origin===new URL(dest).origin){await client.focus();await client.navigate(dest);return}}await clients.openWindow?.(dest)})());
});