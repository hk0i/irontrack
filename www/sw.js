// Network-first service worker: every request tries the network first so an
// online visit always gets the latest deployed files, and only falls back to
// the cache when the network is unreachable — that's what makes the app
// still usable offline. Every successful network response overwrites the
// cache, so the offline fallback is always the most recently seen version,
// not whatever happened to be cached at install time.
// ASSET_LIST (used only for the install-time baseline cache) must be kept in
// sync manually — there's no glob in a hand-written service worker.
const CACHE_NAME = 'irontrack-v6';

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
  './components/workout-history.js',
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
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
