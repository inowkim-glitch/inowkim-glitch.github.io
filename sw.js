// 진일 통합관리 PWA Service Worker (푸시 알림 전용)
self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
 let data={};try{data=event.data?event.data.json():{}}catch{data={body:event.data?.text()||'새 알림이 있습니다.'}}
 event.waitUntil(self.registration.showNotification(data.title||'진일 통합관리',{
  body:data.body||'공유 숫자가 변경되었습니다.',icon:'./icon-192.png',badge:'./icon-192.png',tag:data.tag||'jinil-quantity',renotify:true,data:{url:data.url||'./index.html'}
 }));
});
self.addEventListener('notificationclick', event=>{
 event.notification.close();
 event.waitUntil((async()=>{const url=new URL(event.notification.data?.url||'./index.html',self.location.origin).href;
 const clientsList=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 for(const client of clientsList){if(new URL(client.url).origin===self.location.origin){await client.focus();if(client.navigate)await client.navigate(url);return}}
 await self.clients.openWindow(url)})());
});
