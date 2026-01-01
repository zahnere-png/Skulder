// Cache-first SW för PWA offline
const CACHE_NAME = 'skuldkoll-cache-v2';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png'
];
self.addEventListener('install', (event) => { event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (event) => {
  const { request } = event; if (request.method !== 'GET') return;
  event.respondWith(caches.match(request).then(cached => {
    const fetchPromise = fetch(request).then(resp => { const url = new URL(request.url); if (resp.ok && url.origin === self.location.origin) { const clone = resp.clone(); caches.open(CACHE_NAME).then(cache => cache.put(request, clone)); } return resp; }).catch(() => cached || caches.match('./'));
    return cached || fetchPromise;
  }));
});
