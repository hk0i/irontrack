// Cache-first service worker so the app shell loads fully offline after the
// first visit. Bump CACHE_NAME whenever www/ contents change to invalidate
// the old cache. ASSET_LIST must be kept in sync manually — there's no glob
// in a hand-written service worker.
const CACHE_NAME = 'irontrack-v3';

const ASSET_LIST = [
  './',
  './index.html',
  './app.js',
  './db.js',
  './store.js',
  './common-exercises.js',
  './manifest.json',
  './components/dashboard.js',
  './components/routine-builder.js',
  './components/active-workout.js',
  './components/progress-chart.js',
  './components/settings.js',
  './components/body-metrics.js',
  './vendor/vue.global.prod.js',
  './vendor/dexie.min.js',
  './vendor/tailwind-browser.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSET_LIST)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
