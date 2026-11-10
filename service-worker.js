/* =====================================================
   TEBA LABS - Service Worker (v3.0 - Smart Offline PC)
   ===================================================== */

const CACHE_VERSION = 'v3.0'; 
const STATIC_CACHE  = `teba-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `teba-runtime-${CACHE_VERSION}`;

// الملفات الأساسية اللي لازم تتخزن عشان النظام يفتح أوفلاين
const PRECACHE_ASSETS = [
  './', 
  './index.html', 
  './system/home.html', 
  './system/reception.html', 
  './system/lab.html', 
  './system/tests_manage.html', 
  './system/settings.html',
  './system/lab.css', 
  './system/lab.js', 
  './system/config.js', 
  './dashboard/admin.html', 
  './dashboard/admin.css', 
  './dashboard/admin.js', 
  './dashboard/config.js',
  './styles.css', 
  './data.js', 
  './app.js', 
  './features.js', 
  './site_dynamic.js', 
  './patient_portal.js', 
  './config.js', 
  './super-admin.html',
  './logo.png', 
  './brand-logo.png', 
  './header.png', 
  './manifest.json'
];

// التثبيت
self.addEventListener('install', event => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return Promise.all(
        PRECACHE_ASSETS.map(url => {
          return cache.add(url).catch(err => console.warn('Precache fail:', url, err));
        })
      );
    })
  );
});

// التفعيل: مسح أي كاش قديم
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== STATIC_CACHE && cacheName !== RUNTIME_CACHE) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// استراتيجية الجلب
self.addEventListener('fetch', event => {
  const { request } = event;
  
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. لو الطلب صفحات (HTML) -> Network First مع Fallback سريع للكاش
  if (request.mode === 'navigate' || (request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, responseClone));
          return response;
        })
        .catch(() => {
          // لو النت فصل، هات الصفحة فوراً من الكاش
          return caches.match(request).then(cached => {
            if (cached) return cached;
            // لو الصفحة مش موجودة، رجع للصفحة الرئيسية
            return caches.match('./system/home.html') || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // 2. لو طلب ملفات (CSS, JS, صور) -> Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      const fetchPromise = fetch(request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
         // لو النت فصل، مفيش مشكلة، الكاش شغال
      });

      return cachedResponse || fetchPromise;
    })
  );
});

// الاستماع لحدث قطع الاتصال عشان نطمن
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});