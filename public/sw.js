// Offline support: serves the app shell from cache when the network is unavailable.
// Data lives in IndexedDB (see src/local.ts); Google APIs are never cached.
const CACHE = 'money-tracker-v1';
const SHELL = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const put = (req, res) => {
  const copy = res.clone(); // clone now, before the page consumes the body
  caches.open(CACHE).then((c) => c.put(req, copy));
  return res;
};

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (e.request.mode === 'navigate') {
    // Network first so new deploys show up; cached shell when offline.
    e.respondWith(fetch(e.request).then((res) => (res.ok ? put(SHELL, res) : res)).catch(() => caches.match(SHELL)));
  } else {
    // Hashed build assets never change: cache first.
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => (res.ok ? put(e.request, res) : res))));
  }
});
