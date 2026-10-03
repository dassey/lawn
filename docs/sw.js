/* Service worker: makes the almanac work offline.
   - Pages: network-first (fresh content), falling back to cache offline.
   - Static assets & data: stale-while-revalidate.
   - Weather/geocoding (other origins) are never cached here; the app keeps
     its own short-lived weather cache.
   Bump VERSION whenever files change so old caches are cleared. */
const VERSION = 'v1-2026-09-29';
const CACHE = `kc-almanac-${VERSION}`;

const CORE = [
  './',
  'index.html', 'calendar.html', 'lawn.html', 'beds.html', 'garden.html',
  'tools.html', 'products.html', 'journal.html', 'library.html', '404.html',
  'css/app.css', 'css/print.css',
  'manifest.webmanifest',
  'assets/icon.svg', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-maskable-512.png',
  'assets/apple-touch-icon.png', 'assets/fonts/fraunces-latin.woff2',
  'js/core/dom.js', 'js/core/icons.js', 'js/core/store.js', 'js/core/dates.js', 'js/core/data.js',
  'js/core/ui.js', 'js/core/windows.js', 'js/core/tasks.js', 'js/core/ics.js', 'js/core/logdlg.js',
  'js/core/weather.js', 'js/core/wxcard.js', 'js/core/charts.js', 'js/core/calc.js',
  'js/pages/today.js', 'js/pages/calendar.js', 'js/pages/lawn.js', 'js/pages/beds.js',
  'js/pages/garden.js', 'js/pages/tools.js', 'js/pages/products.js', 'js/pages/journal.js',
  'js/pages/library.js', 'js/pages/notfound.js',
  'data/tasks.json', 'data/months.json', 'data/crops.json', 'data/garden.json', 'data/products.json',
  'data/sources.json', 'data/climate.json', 'data/plants.json', 'data/pruning.json', 'data/issues.json',
  'data/lawn.json', 'data/beds.json', 'data/library.json', 'data/glossary.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Add individually so one missing file can't break installation.
    await Promise.all(CORE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('kc-almanac-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // weather APIs etc. go straight to network

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('index.html')) || Response.error();
      }
    })());
    return;
  }

  // One cache entry per file: data URLs carry a ?v= cache-buster, so key on
  // the path alone and let each fresh response replace the old copy.
  const key = url.origin + url.pathname;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key);
    const network = fetch(req).then((res) => {
      if (res && res.ok) cache.put(key, res.clone());
      return res;
    }).catch(() => null);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    return (await network) || Response.error();
  })());
});
