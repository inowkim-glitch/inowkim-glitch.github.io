/* 진일 통합관리 PWA - 1단계: 설치 및 푸시 수신 준비. 실제 푸시 발송 서버는 아직 연결되지 않음. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let payload = { title: '진일 통합관리', body: '새로운 알림이 도착했습니다.' };
  try { if (event.data) payload = { ...payload, ...event.data.json() }; } catch (_) {}
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body, icon: './icon-192.png', badge: './icon-192.png',
    tag: payload.tag || 'jinil-quantity', data: { url: './index.html' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL('./index.html', self.registration.scope).href;
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) { if (client.url.startsWith(self.registration.scope)) { await client.focus(); return; } }
    await self.clients.openWindow(url);
  })());
});
