/* =====================================================
   TEBA LABS - Service Worker (v111 - Navigation Fix)
   ===================================================== */

const CACHE_VERSION = 'v111'; 
const STATIC_CACHE  = `teba-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `teba-runtime-${CACHE_VERSION}`;
const CDN_CACHE     = `teba-cdn-${CACHE_VERSION}`;
const IMG_CACHE     = `teba-img-${CACHE_VERSION}`;

const PRECACHE_ASSETS = [
  './', './index.html', 
  './system/home.html', './system/reception.html', './system/lab.html', './system/tests_manage.html', 
  './system/lab.css', './system/lab.js',
  './system/config.js', 
  './dashboard/admin.html', './dashboard/admin.css', './dashboard/admin.js',
  './styles.css', './data.js', './app.js', './site_dynamic.js', './patient_portal.js', './config.js',
  './logo.png', './brand-logo.png', './header.png', './manifest.json'
];

const PRECACHE_CDN = [
  'https://fonts.googleapis.com/css2?family=Almarai:wght@300;400;700;800&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://unpkg.com/dexie/dist/dexie.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
];

const CDN_ORIGINS = ['https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://unpkg.com'];
const IMG_ORIGINS = ['https://images.unsplash.com'];

self.addEventListener('install', event => {
  self.skipWaiting(); 
  event.waitUntil((async () => {
    const sc = await caches.open(STATIC_CACHE);
    await Promise.all(PRECACHE_ASSETS.map(url => sc.add(url).catch(e => console.warn('Cache Fail:', url))));
    const cc = await caches.open(CDN_CACHE);
    await Promise.all(PRECACHE_CDN.map(url => cc.add(url).catch(e => console.warn(e))));
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

  // ✅ التعديل الجديد: تجاهل أي علامات في الرابط (ignoreSearch) عشان زرار الرجوع يشتغل أوفلاين
  if (request.mode === 'navigate' || (request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse; 
        }
        return fetch(request).catch(() => {
          return caches.match('./system/home.html') || new Response('Offline', { status: 503 });
        });
      })
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
    return;
  }
  
  if (CDN_ORIGINS.some(o => url.origin === o) || IMG_ORIGINS.some(o => url.origin === o)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    
    if (request.mode === 'navigate') {
      return caches.match('./system/home.html') || new Response('Offline', { status: 503 });
    }
    return new Response('Offline', { status: 503 });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.status === 200 || response.type === 'opaque')) {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}