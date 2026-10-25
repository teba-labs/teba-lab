/* =====================================================
   TEBA LABS - Service Worker (v57 - True Cost)
   ===================================================== */

const CACHE_VERSION = 'v60'; 
const STATIC_CACHE  = `teba-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `teba-runtime-${CACHE_VERSION}`;
const CDN_CACHE     = `teba-cdn-${CACHE_VERSION}`;
const IMG_CACHE     = `teba-img-${CACHE_VERSION}`;

const PRECACHE_ASSETS = [
  './', './index.html', './admin.html', './styles.css', './admin.css', 
  './data.js', './app.js', './features.js', './admin.js', './logo.png', './manifest.json'
];

const PRECACHE_CDN = [
  'https://fonts.googleapis.com/css2?family=Almarai:wght@300;400;700;800&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
];

const CDN_ORIGINS = [
  'https://cdn.jsdelivr.net', 'https://cdn.sheetjs.com', 
  'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'
];

const IMG_ORIGINS = ['https://images.unsplash.com'];
const MAX_RUNTIME = 60, MAX_CDN = 25, MAX_IMG = 40;

function trimCache(name, max) {
  caches.open(name).then(cache => cache.keys().then(keys => {
    if (keys.length > max) return Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
  }));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const sc = await caches.open(STATIC_CACHE);
    await sc.addAll(PRECACHE_ASSETS).catch(e => console.warn(e));
    const cc = await caches.open(CDN_CACHE);
    await Promise.all(PRECACHE_CDN.map(url => cc.add(url).catch(e => console.warn(e))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const valid = [STATIC_CACHE, RUNTIME_CACHE, CDN_CACHE, IMG_CACHE];
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !valid.includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(navigationStrategy(request));
    return;
  }
  if (CDN_ORIGINS.some(o => url.origin === o)) {
    event.respondWith(cacheFirstWithUpdate(request, CDN_CACHE, MAX_CDN));
    return;
  }
  if (IMG_ORIGINS.some(o => url.origin === o)) {
    event.respondWith(cacheFirstWithUpdate(request, IMG_CACHE, MAX_IMG));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstWithUpdate(request, STATIC_CACHE, MAX_RUNTIME));
    return;
  }
  event.respondWith(runtimeFallback(request));
});

async function navigationStrategy(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const clone = response.clone();
      caches.open(STATIC_CACHE).then(c => c.put(request, clone));
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    return await caches.match('./index.html') || new Response('Offline', { status: 503 });
  }
}

async function cacheFirstWithUpdate(request, cacheName, max) {
  const cached = await caches.match(request);
  if (cached) {
    fetch(request).then(async response => {
      if (response && response.status === 200) {
        const c = await caches.open(cacheName);
        await c.put(request, response);
        trimCache(cacheName, max);
      }
    }).catch(() => {});
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response && (response.status === 200 || response.type === 'opaque')) {
      const c = await caches.open(cacheName);
      c.put(request, response.clone());
      trimCache(cacheName, max);
    }
    return response;
  } catch (err) {
    if (request.destination === 'image') return new Response('', { status: 200, headers: { 'Content-Type': 'image/svg+xml' } });
    return new Response('Offline', { status: 503 });
  }
}

async function runtimeFallback(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const c = await caches.open(RUNTIME_CACHE);
      c.put(request, response.clone());
      trimCache(RUNTIME_CACHE, MAX_RUNTIME);
    }
    return response;
  } catch { return new Response('Offline', { status: 503 }); }
}
