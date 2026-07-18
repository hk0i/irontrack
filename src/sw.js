// Network-first service worker: every request tries the network first so an
// online visit always gets the latest deployed files, and only falls back to
// the cache when the network is unreachable — that's what makes the app
// still usable offline. Every successful network response overwrites the
// cache, so the offline fallback is always the most recently seen version,
// not whatever happened to be cached at install time.
//
// self.__WB_MANIFEST is injected by vite-plugin-pwa (injectManifest
// strategy) at build time with the real, content-hashed filenames Vite
// actually produced — replacing the old hand-maintained ASSET_LIST, which
// could never have worked against hashed build output anyway (the hashes
// change on every build).
const manifestEntries = self.__WB_MANIFEST;
const ASSET_LIST = manifestEntries.map((entry) => entry.url);

// Derived from the manifest itself, so it changes whenever any asset's
// content hash changes (i.e. on every real deploy). Old entries under a
// previous build's hashed filenames get orphaned under the old CACHE_NAME
// and swept up by the activate handler's cleanup below, instead of
// accumulating forever inside one fixed-name cache — the same property the
// old hand-bumped `irontrack-vN` cache name had, just automatic now.
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}
const CACHE_NAME = `irontrack-precache-${hashString(JSON.stringify(manifestEntries))}`;

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
