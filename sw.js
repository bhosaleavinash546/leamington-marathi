/* Service worker for leamingtonmarathi.com.
   Pages: network first, so visitors always get the latest, with the cached copy
   (or offline.html) when there is no signal. Everything else: cached copy first,
   refreshed in the background. Videos are never cached (too big).
   Bump VERSION when this file changes so old caches are cleared. */
const VERSION = 'lm-2026-09-26';
const CORE = [
  '/', '/index.html', '/style.css', '/script.js', '/culture-data.js',
  '/maharashtra.html', '/maharashtra.js', '/maharashtra-data.js',
  '/ank.html', '/member.html', '/member.js', '/member-config.js',
  '/404.html', '/offline.html', '/manifest.webmanifest',
  '/images/logo.png', '/images/logo-emblem.png', '/images/icons/icon-192.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION).then(cache =>
      Promise.all(CORE.map(url => cache.add(url).catch(() => null))) // one missing file must not block install
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/videos/')) return;
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(VERSION).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then(hit => hit || caches.match('/offline.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(hit => {
      const refresh = fetch(request)
        .then(response => {
          if (response.ok || response.type === 'opaque') {
            const copy = response.clone();
            caches.open(VERSION).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => hit);
      return hit || refresh;
    })
  );
});
