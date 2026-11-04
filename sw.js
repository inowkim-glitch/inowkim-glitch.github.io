/* Jinil integrated management: web push service worker */
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch { payload = { body: event.data ? event.data.text() : '' }; }
  const notification = payload.notification || payload;
  const title = String(notification.title || '진일 통합관리');
  const options = {
    body: String(notification.body || '공유 숫자가 변경되었습니다.'),
    tag: String(notification.tag || 'jinil-number-change'),
    renotify: true,
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { url: './index.html' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || './index.html', self.registration.scope).href;
  event.waitUntil((async () => {
    const clientsList = await clients.matchAll({type:'window', includeUncontrolled:true});
    for (const client of clientsList) {
      if (new URL(client.url).origin === new URL(target).origin) {
        await client.focus();
        if ('navigate' in client) await client.navigate(target);
        return;
      }
    }
    if (clients.openWindow) await clients.openWindow(target);
  })());
});
