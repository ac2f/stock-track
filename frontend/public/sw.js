/*
 * StockTrack çevrimdışı kabuğu (service worker).
 *
 * Sunucuya ulaşılamazken uygulamanın kendisi (sayfa, JS, CSS) yine açılsın
 * diye bu dosyaları tarayıcıda saklar. Veri (API) burada saklanmaz: onu
 * uygulama kendisi yönetir (src/offline). Yeni sürüm yayınlanınca eski
 * dosyalar silinir.
 *
 * Ekranlar ayrı parçalar halinde (tembel) yüklenir; bu parçalar index.html'de
 * geçmez. Bu yüzden derlemedeki bütün dosyaların listesi (asset-manifest.json,
 * vite.config.ts üretir) okunur ve hepsi önceden saklanır — hiç açılmamış bir
 * ekran da çevrimdışı açılabilir.
 *
 * Service worker yalnız HTTPS'te (ya da localhost'ta) çalışır.
 */
const SHELL = 'st-shell-v1';
const ASSETS = 'st-assets-v1';
const MANIFEST = '/asset-manifest.json';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.add('/index.html'))
      .catch(() => undefined)
      // İlk kurulumda bütün parçalar saklanır (başarısızsa sonraki açılışta).
      .then(() => syncAssets())
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
  if (url.pathname === MANIFEST) return; // her zaman sunucudan
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
      const cache = await caches.open(SHELL);
      await cache.put('/index.html', res.clone());
      // Yeni sürümün parçalarını arka planda sakla, eskileri sil.
      void syncAssets();
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

let syncing = null;

/**
 * Derleme listesindeki (asset-manifest.json) bütün dosyaları saklar, listede
 * olmayan eski sürüm dosyalarını siler. Liste alınamazsa (çevrimdışı, eski
 * sunucu) hiçbir şey silinmez — saklanan parçalar korunur.
 */
function syncAssets() {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const res = await fetch(MANIFEST, { cache: 'no-store' });
      if (!res.ok) return;
      const { files } = await res.json();
      if (!Array.isArray(files) || !files.length) return;
      const wanted = new Set(files);
      const cache = await caches.open(ASSETS);
      const have = new Set();
      for (const req of await cache.keys()) {
        const path = new URL(req.url).pathname;
        if (!path.startsWith('/assets/')) continue;
        if (wanted.has(path)) have.add(path);
        else await cache.delete(req);
      }
      // Eksikler aynı anda en çok 4 istekle indirilir.
      const missing = files.filter((f) => !have.has(f));
      const worker = async () => {
        for (let f = missing.shift(); f; f = missing.shift()) {
          try {
            const r = await fetch(f);
            if (r.ok) await cache.put(f, r);
          } catch {
            // Ağ koptu: kalanlar bir sonraki açılışta.
          }
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
    } catch {
      // Liste okunamadı: dokunma.
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}
