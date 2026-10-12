// KURFA MUZIK — High-Performance PWA Service Worker
const CACHE_NAME = 'kurfa-muzik-v3.0.0';
const SHELL_ASSETS = [
  './',
  './index.html',
  './tailwind.min.css',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './favicon.ico'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Never cache API or external audio streams
  if (
    url.pathname.includes('/api/') ||
    url.hostname.includes('googlevideo.com') ||
    url.hostname.includes('ytimg.com') ||
    url.hostname.includes('invidious') ||
    url.hostname.includes('savenow.to') ||
    url.hostname.includes('workers.dev')
  ) {
    return;
  }

  // Network-First for Navigation
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('./index.html') || caches.match('./'))
    );
    return;
  }

  // Stale-While-Revalidate for local assets
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request).then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return networkRes;
      }).catch(() => {});
      return cached || fetchPromise;
    })
  );
});
