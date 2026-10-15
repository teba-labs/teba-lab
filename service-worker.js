/* =====================================================
   TEBA LABS - Service Worker
   معامل طيبة - ملف PWA للعمل بدون إنترنت
   ===================================================== */

const CACHE_NAME = 'teba-labs-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/data.js',
  './js/app.js',
  './js/features.js',
  './images/logo.png',
  './manifest.json'
];

/* ============= INSTALL ============= */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.log('Cache install failed:', err))
  );
});

/* ============= ACTIVATE ============= */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

/* ============= FETCH ============= */
self.addEventListener('fetch', event => {
  const { request } = event;

  if(request.method !== 'GET') return;

  const url = new URL(request.url);
  if(url.origin !== self.location.origin){
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if(cached){
        fetch(request).then(response => {
          if(response && response.status === 200){
            caches.open(CACHE_NAME).then(cache => cache.put(request, response));
          }
        }).catch(()=>{});
        return cached;
      }

      return fetch(request).then(response => {
        if(!response || response.status !== 200 || response.type === 'opaque'){
          return response;
        }
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
        return response;
      }).catch(() => {
        if(request.mode === 'navigate'){
          return caches.match('./index.html');
        }
      });
    })
  );
});