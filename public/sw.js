/* EchoNet PWA 2.0: offline publico + push (sem cache de paginas privadas). */
'use strict';
const SHELL_CACHE = 'echonet-pwa-shell-v2';
const SHELL_FILES = [
  '/offline.html',
  '/img/pwa/icon-192.png',
  '/img/pwa/icon-512.png',
  '/img/pwa/apple-touch-icon.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE)
    .then(cache => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(async keys => {
    await Promise.all(keys.filter(k => k.startsWith('echonet-pwa-shell-') && k !== SHELL_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  }));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  event.respondWith(fetch(request).catch(async () => (await caches.match('/offline.html')) ||
    new Response('Sem conexao no momento.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
});
function internalPath(input) {
  if (typeof input !== 'string') return '/';
  try {
    const url = new URL(input, self.location.origin);
    if (url.origin !== self.location.origin || !url.pathname.startsWith('/')) return '/';
    return url.pathname + url.search;
  } catch (_) { return '/'; }
}
self.addEventListener('push', event => {
  let message = {};
  try { message = event.data ? event.data.json() : {}; } catch (_) {}
  const url = internalPath(message.url);
  const body = typeof message.body === 'string' ? message.body.slice(0, 180) : 'Voce tem uma nova notificacao.';
  const tag = typeof message.tag === 'string' ? message.tag.slice(0, 80) : 'echonet-alerta';
  event.waitUntil(self.registration.showNotification('EchoNet', {
    body, icon: '/img/pwa/icon-192.png', badge: '/img/pwa/icon-192.png',
    tag, data: { url }, renotify: false
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const relative = internalPath(event.notification?.data?.url);
  const target = new URL(relative, self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    for (const client of clients) {
      if (new URL(client.url).origin === self.location.origin) {
        try { await client.focus(); if ('navigate' in client) await client.navigate(target); return; } catch (_) {}
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  }));
});
