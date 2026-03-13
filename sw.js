// ═══════════════════════════════════════════════════
// Kalite Kontrol — Service Worker
// Koluman Otomotiv Endüstri A.Ş.
// ═══════════════════════════════════════════════════

const CACHE_NAME = 'kalite-kontrol-v1';

// Cache'lenecek dosyalar (app shell)
const SHELL = [
  '/',
  '/index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js'
];

// ── INSTALL: App shell'i cache'e al ──────────────
self.addEventListener('install', e => {
  console.log('[SW] Install');
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Ana sayfa ve Quagga'yı cache'e al
      // Quagga başarısız olursa devam et (CDN erişimi olmayabilir)
      return cache.addAll(['/','index.html']).then(() => {
        return cache.add('https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js')
          .catch(() => console.log('[SW] Quagga CDN cache edilemedi, atlanıyor'));
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: Eski cache'leri temizle ────────────
self.addEventListener('activate', e => {
  console.log('[SW] Activate');
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Eski cache siliniyor:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: Strateji: Network-First, Cache Fallback ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Supabase API isteklerini SW'den geçirme (offline mantığı uygulama tarafında)
  if (url.hostname.includes('supabase.co')) return;

  // GET isteklerini yakala
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Başarılı yanıtı cache'e de yaz
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => {
        // Network başarısız → cache'den sun
        return caches.match(e.request).then(cached => {
          if (cached) return cached;
          // Ana sayfa isteği için index.html'i dön
          if (e.request.mode === 'navigate') {
            return caches.match('/index.html') || caches.match('/');
          }
          return new Response('Offline', {status: 503});
        });
      })
  );
});

// ── SYNC: Background sync (destekleniyorsa) ──────
self.addEventListener('sync', e => {
  if (e.tag === 'sync-queue') {
    console.log('[SW] Background sync tetiklendi');
    // Uygulama tarafındaki syncQueue() fonksiyonu çağrılacak
    e.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({type: 'SYNC_QUEUE'}));
      })
    );
  }
});
