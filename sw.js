/* TerraField service worker — offline-first cache */
const CACHE = 'smartmaidani-v1';
const CORE = [
  './',
  './index.html',
  './css/app.css',
  './js/icons.js',
  './js/db.js',
  './js/geo.js',
  './js/export.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.11.0/proj4.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/shpwrite/0.3.2/shpwrite.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(CORE.map((u) => c.add(u)))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Map tiles: network-first, fall back silently (offline basemap gap is expected)
  if (url.hostname.includes('tile.openstreetmap.org') || url.hostname.includes('arcgisonline.com')) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        fetch(req).then((res) => { c.put(req, res.clone()); return res; }).catch(() => c.match(req))
      )
    );
    return;
  }

  // App shell + libs: cache-first
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok && (url.origin === location.origin || CORE.includes(req.url))) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(req, clone));
      }
      return res;
    }).catch(() => cached))
  );
});
