import { lazy, useState, type ComponentType } from 'react';

/**
 * Ekranlar ayrı parçalar (chunk) halinde yüklenir: ilk açılış yalnız kabuğu
 * (menü, oturum) indirir. Açılıştan sonra boşta kalınca bütün ekranlar arka
 * planda iner (preloadPages); böylece sunucu sonradan yeniden başlasa ya da
 * bağlantı gitse de açık sekme her ekranı açabilir — service worker'ın
 * çalışmadığı düz HTTP yerel ağ kurulumunda da.
 */
const LOADERS: Array<() => Promise<unknown>> = [];
const RELOADED = 'st_chunk_reload';

/** Sunucu gerçekten cevap veriyor mu (yalnız "çevrimiçi" görünmek yetmez)? */
async function serverAnswers(): Promise<boolean> {
  try {
    const res = await fetch('/index.html', { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

/** Ekran parçası inemedi ve sunucuya ulaşılamıyor: sekme kapanmaz, kuyruk kaybolmaz. */
function ChunkUnavailable() {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="card space-y-3">
      <h1 className="text-lg font-semibold">Bu ekran şu an açılamıyor</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Ekran bu cihaza henüz inmemiş ve sunucuya ulaşılamıyor. Diğer ekranlar ve
        sıradaki işlemler yerinde; bağlantı gelince yeniden deneyin.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            if (await serverAnswers()) window.location.reload();
            else setMsg('Sunucuya hâlâ ulaşılamıyor.');
            setBusy(false);
          }}
        >
          Yeniden dene
        </button>
        {msg && <span className="text-sm text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}

export function lazyPage<K extends string>(
  load: () => Promise<Record<K, ComponentType>>,
  name: K,
) {
  LOADERS.push(load);
  return lazy(async () => {
    try {
      const mod = await load();
      sessionStorage.removeItem(RELOADED);
      return { default: mod[name] };
    } catch {
      // Yeni sürüm yayınlandıysa eski parça sunucuda yoktur: sunucu cevap
      // veriyorsa bir kez yenilenir (yeni sürüm gelir). Cevap vermiyorsa
      // yenilemek sekmeyi tarayıcının hata sayfasına düşürürdü.
      if (!sessionStorage.getItem(RELOADED) && (await serverAnswers())) {
        sessionStorage.setItem(RELOADED, '1');
        window.location.reload();
        return { default: (() => null) as ComponentType };
      }
      return { default: ChunkUnavailable as ComponentType };
    }
  });
}

let preloaded = false;

/** Boşta kalınca bütün ekran parçalarını sırayla indirir (bir kez). */
export function preloadPages(): void {
  if (preloaded) return;
  preloaded = true;
  const run = () => {
    void LOADERS.reduce<Promise<unknown>>(
      (prev, load) => prev.then(() => load().catch(() => undefined)),
      Promise.resolve(),
    );
  };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  if (idle) idle(run, { timeout: 5000 });
  else setTimeout(run, 2000);
}
