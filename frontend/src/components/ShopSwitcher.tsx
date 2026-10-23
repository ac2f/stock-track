import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { toast } from '../lib/toast';
import type { ShopAccess } from '../types';

/**
 * Dükkân geçişi. Tek dükkânı olan kullanıcı yalnız o dükkânın adını görür
 * (seçim yok); birden çok dükkânı olan tek dokunuşla geçer: yan menüde ve
 * telefon menüsünde düğmeler, başlıkta renkli dükkân rozeti, hızlı aramada
 * "dükkân" yazınca liste, klavyede Alt+Shift+1…9.
 *
 * Her dükkânın kendi rengi vardır (kimliğinden): hangi dükkânda
 * çalışıldığı ekranın üstündeki şeritten ve rozetten bir bakışta görülür.
 */

const COLORS = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#0891b2', '#db2777', '#ca8a04', '#4f46e5'];

/** Dükkânın sabit rengi (kimliğinden türetilir, her cihazda aynı). */
export function shopColor(id: string | undefined): string {
  if (!id) return COLORS[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

/** Seçilebilir dükkânlar: açık olanlar önce (sistem sahibi kapalıları da görür). */
export function useShopList(): ShopAccess[] {
  const { shops } = useAuth();
  return useMemo(() => [...shops].sort((a, b) => Number(b.isActive) - Number(a.isActive)), [shops]);
}

/** Dükkâna geç ve kısa bir bildirimle söyle. */
export function useSwitchShop(): (id: string) => void {
  const { shop, shops, setShop } = useAuth();
  return useCallback(
    (id: string) => {
      if (id === shop?.id) return;
      const next = shops.find((s) => s.id === id);
      setShop(id);
      if (next) toast.info(`🏪 ${next.name} dükkânına geçildi`);
    },
    [shop?.id, shops, setShop],
  );
}

/** Alt+Shift+1…9: listedeki sıradaki dükkâna geç. */
export function useShopShortcuts(): void {
  const list = useShopList();
  const switchShop = useSwitchShop();
  useEffect(() => {
    if (list.length < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey || !/^Digit[1-9]$/.test(e.code)) return;
      const target = list[Number(e.code.slice(5)) - 1];
      if (!target) return;
      e.preventDefault();
      switchShop(target.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [list, switchShop]);
}

function Dot({ id, size = 10 }: { id: string; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: shopColor(id) }}
      aria-hidden
    />
  );
}

/**
 * Yan menü ve telefon menüsündeki dükkân seçimi. Tek dükkânda yalnız ad;
 * en çok 6 dükkâna kadar düğmeler, daha fazlasında seçim kutusu.
 */
export function ShopSwitcher({ className = '', layout = 'list' }: { className?: string; layout?: 'list' | 'grid' }) {
  const { shop } = useAuth();
  const list = useShopList();
  const switchShop = useSwitchShop();
  if (!list.length) return null;

  if (list.length === 1) {
    const only = list[0];
    return (
      <div
        className={`flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 dark:bg-slate-700/40 dark:text-slate-200 ${className}`}
        title="Çalıştığınız dükkân"
      >
        <Dot id={only.id} />
        <span className="truncate">{only.name}</span>
      </div>
    );
  }

  if (list.length > 6) {
    return (
      <label className={`block ${className}`}>
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Dükkân</span>
        <select
          className="input min-h-[40px] py-1.5 font-medium md:text-sm"
          value={shop?.id ?? ''}
          onChange={(e) => switchShop(e.target.value)}
          title="Çalıştığınız dükkân"
        >
          {list.map((s) => (
            <option key={s.id} value={s.id}>
              🏪 {s.name}
              {s.isActive ? '' : ' (kapalı)'}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className={className} role="radiogroup" aria-label="Dükkân">
      <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Dükkân</div>
      <div className={layout === 'grid' ? 'grid grid-cols-2 gap-2' : 'space-y-1'}>
        {list.map((s, i) => {
          const current = s.id === shop?.id;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={current}
              onClick={() => switchShop(s.id)}
              title={`${s.name} dükkânına geç${i < 9 ? ` (Alt+Shift+${i + 1})` : ''}`}
              className={`flex w-full items-center gap-2 rounded-xl border px-3 text-left text-sm transition ${
                layout === 'grid' ? 'py-3' : 'py-1.5'
              } ${
                current
                  ? 'border-transparent font-semibold text-white shadow-sm'
                  : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
              style={current ? { background: shopColor(s.id) } : undefined}
            >
              {!current && <Dot id={s.id} />}
              <span className="min-w-0 flex-1 truncate">
                {s.name}
                {s.isActive ? '' : ' (kapalı)'}
              </span>
              {current && <span aria-hidden>✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Başlıktaki dükkân rozeti: o anki dükkân, renkli. Birden çok dükkânda
 * dokununca liste açılır, seçince geçilir; tek dükkânda yalnız ad.
 */
export function ShopChip({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const { shop } = useAuth();
  const list = useShopList();
  const switchShop = useSwitchShop();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!shop) return null;
  const multi = list.length > 1;
  const chip = (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full font-semibold text-white ${
        compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      }`}
      style={{ background: shopColor(shop.id) }}
    >
      <span aria-hidden>🏪</span>
      <span className="truncate">{shop.name}</span>
      {multi && <span aria-hidden>▾</span>}
    </span>
  );
  if (!multi) {
    return (
      <span className={`inline-flex min-w-0 ${className}`} title="Çalıştığınız dükkân">
        {chip}
      </span>
    );
  }
  return (
    <span className={`relative inline-flex min-w-0 ${className}`}>
      <button
        type="button"
        className="min-w-0"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        title="Dükkân değiştir"
      >
        {chip}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            aria-label="Dükkân"
            className="animate-pop absolute left-0 top-full z-50 mt-2 w-60 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800"
          >
            {list.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={s.id === shop.id}
                onClick={() => {
                  setOpen(false);
                  switchShop(s.id);
                }}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 ${
                  s.id === shop.id ? 'font-semibold' : ''
                }`}
              >
                <Dot id={s.id} />
                <span className="min-w-0 flex-1 truncate">
                  {s.name}
                  {s.isActive ? '' : ' (kapalı)'}
                </span>
                {s.id === shop.id ? <span aria-hidden>✓</span> : i < 9 && <span className="kbd hidden md:inline">⌥⇧{i + 1}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

/** İçeriğin üstünde dükkânın renginde ince şerit (birden çok dükkân varken). */
export function ShopColorBar() {
  const { shop } = useAuth();
  const list = useShopList();
  if (!shop || list.length < 2) return null;
  return <div className="h-1 shrink-0" style={{ background: shopColor(shop.id) }} aria-hidden />;
}
