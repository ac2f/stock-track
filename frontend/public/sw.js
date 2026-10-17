/*
 * StockTrack çevrimdışı kabuğu (service worker).
 *
 * Sunucuya ulaşılamazken uygulamanın kendisi (sayfa, JS, CSS) yine açılsın
 * diye bu dosyaları tarayıcıda saklar. Veri (API) burada saklanmaz: onu
 * uygulama kendisi yönetir (src/offline). Yeni sürüm yayınlanınca eski
 * dosyalar silinir.
 *
 * Service worker yalnız HTTPS'te (ya da localhost'ta) çalışır.
 */
const SHELL = 'st-shell-v1';
const ASSETS = 'st-assets-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.add('/index.html'))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== SHELL && key !== ASSETS) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // veri: uygulamanın işi
  if (req.mode === 'navigate') {
    event.respondWith(shell(req));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(networkFirst(req));
  }
});

/** Sayfa: önce ağ (yeni sürüm gelsin), yoksa saklanan kabuk. */
async function shell(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const copy = res.clone();
      const cache = await caches.open(SHELL);
      await cache.put('/index.html', copy.clone());
      void pruneAssets(await copy.text());
    }
    return res;
  } catch {
    const cached = await caches.match('/index.html');
    return cached || new Response('Çevrimdışı ve uygulama henüz bu cihazda saklanmamış.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/** Adı içeriğinden türetilmiş (değişmez) dosyalar: önce önbellek. */
async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) (await caches.open(ASSETS)).put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(ASSETS)).put(req, res.clone());
    return res;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw new Error('offline');
  }
}

/** Çöp temizliği: yeni index.html'in kullanmadığı eski sürüm dosyaları silinir. */
async function pruneAssets(html) {
  const used = new Set((html.match(/\/assets\/[^"')\s]+/g) || []).map((p) => p));
  const cache = await caches.open(ASSETS);
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith('/assets/') && !used.has(path)) await cache.delete(req);
  }
}
