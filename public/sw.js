/* EchoNet PWA service worker — guarda SOMENTE a pagina offline e icones.
   Nunca armazena respostas privadas, paginas com sessao, APIs ou uploads. */
const SHELL_CACHE = 'echonet-pwa-shell-v1';
const SHELL_FILES = [
  '/offline.html',
  '/img/pwa/icon-192.png',
  '/img/pwa/icon-512.png',
  '/img/pwa/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(keys
        .filter((key) => key.startsWith('echonet-pwa-shell-') && key !== SHELL_CACHE)
        .map((key) => caches.delete(key)));
      await self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;

  // As paginas autenticadas NUNCA entram no Cache Storage.
  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match('/offline.html');
      return cached || new Response('Sem conexao no momento.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    })
  );
});
