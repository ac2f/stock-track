import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { fetchCustomers } from '../api/customers.api';
import { fetchPlates } from '../api/materials.api';
import { fetchQuotes } from '../api/quotes.api';
import { applyTheme, resolveInitialTheme } from '../lib/theme';
import { applyFontScale, getFontScale } from '../lib/fontScale';
import type { NavItem } from '../layouts/nav';
import type { ShopModule } from '../types';

/**
 * Hızlı arama (Ctrl+K): ekrana git, yeni kayıt aç, müşteri ya da plaka bul.
 * Yazılan sözcükler Türkçe harf farkı gözetmeden (ı/i, ş/s …) eşleşir.
 */
interface Command {
  id: string;
  group: string;
  icon: string;
  label: string;
  hint?: string;
  keywords?: string;
  run: () => void;
  /** İkinci eylem (⇧ Enter): ör. müşteride tahsilat. */
  alt?: { label: string; run: () => void; to?: string };
  /** Arama sonucunun adresi: "son açılanlar"da yeniden açmak için saklanır. */
  to?: string;
}

/** Son açılanlar: sabit komutlar kimliğiyle, arama sonuçları adresleriyle saklanır. */
interface RecentEntry {
  id: string;
  icon?: string;
  label?: string;
  to?: string;
  altTo?: string;
  altLabel?: string;
}

interface QuickAction {
  id: string;
  icon: string;
  label: string;
  to: string;
  module: ShopModule;
  level: 'read' | 'write';
  keywords?: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'new-quote', icon: '📝', label: 'Yeni teklif', to: '/quotes?new=1', module: 'quotes', level: 'write', keywords: 'teklif oluştur fiyat' },
  { id: 'payment', icon: '💵', label: 'Tahsilat al', to: '/payments', module: 'payments', level: 'write', keywords: 'ödeme nakit kart para' },
  { id: 'new-customer', icon: '👤', label: 'Yeni müşteri', to: '/customers?new=1', module: 'customers', level: 'write', keywords: 'cari ekle' },
  { id: 'new-plate', icon: '📦', label: 'Yeni stok kalemi', to: '/plates?new=1', module: 'stock', level: 'write', keywords: 'plaka ekle stok girişi' },
  { id: 'new-expense', icon: '🧾', label: 'Gider gir', to: '/expenses?new=1', module: 'expenses', level: 'write', keywords: 'masraf ekle' },
  { id: 'new-purchase', icon: '🛒', label: 'Yeni alım', to: '/purchases?new=1', module: 'purchases', level: 'write', keywords: 'satın alma tedarikçi' },
  { id: 'debtors', icon: '⚠️', label: 'Borçlu müşteriler', to: '/customers?debt=1', module: 'customers', level: 'read', keywords: 'alacak borç liste' },
];

const RECENT_KEY = 'st_palette_recent';

/** Türkçe karakterleri sadeleştirip küçük harfe çevirir: "Şube İ" → "sube i". */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function matches(cmd: Command, tokens: string[]): boolean {
  if (!tokens.length) return true;
  const hay = fold(`${cmd.label} ${cmd.keywords ?? ''} ${cmd.hint ?? ''}`);
  return tokens.every((t) => hay.includes(t));
}

// Müşteri/teklif kimlikleri dükkâna özeldir: liste dükkân başına tutulur.
const recentKey = (shopId: string | undefined) => `${RECENT_KEY}:${shopId ?? '-'}`;

function readRecent(shopId: string | undefined): RecentEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(recentKey(shopId)) ?? '[]') as unknown[];
    return raw.filter((x): x is RecentEntry => !!x && typeof (x as RecentEntry).id === 'string');
  } catch {
    return [];
  }
}

function pushRecent(shopId: string | undefined, entry: RecentEntry) {
  try {
    const next = [entry, ...readRecent(shopId).filter((x) => x.id !== entry.id)].slice(0, 6);
    localStorage.setItem(recentKey(shopId), JSON.stringify(next));
  } catch {
    /* depolama kapalı */
  }
}

/** Yazmayı kısa süre bekleyip arar (her tuşta sunucuya gitmesin). */
function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });

function formatQuoteTotal(total: number, currency: string): string {
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: currency || 'TRY' }).format(Number(total) || 0);
  } catch {
    return money.format(Number(total) || 0);
  }
}

export function CommandPalette({
  nav,
  onClose,
  onShowHelp,
}: {
  nav: NavItem[];
  onClose: () => void;
  onShowHelp: () => void;
}) {
  const navigate = useNavigate();
  const { can, logout, shop } = useAuth();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const term = useDebounced(q.trim());
  const searching = term.length >= 2;

  const { data: customers, isFetching: loadingCustomers } = useQuery({
    queryKey: ['palette', 'customers', term],
    queryFn: () => fetchCustomers({ search: term, limit: 6 }),
    enabled: searching && can('customers'),
    staleTime: 30_000,
  });
  const { data: quotes, isFetching: loadingQuotes } = useQuery({
    queryKey: ['palette', 'quotes', term],
    queryFn: () => fetchQuotes({ search: term, limit: 5 }),
    enabled: searching && can('quotes'),
    staleTime: 30_000,
  });
  const { data: plates, isFetching: loadingPlates } = useQuery({
    queryKey: ['palette', 'plates', term],
    queryFn: () => fetchPlates({ search: term, limit: 6 }),
    enabled: searching && can('stock'),
    staleTime: 30_000,
  });

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [];
    for (const a of QUICK_ACTIONS) {
      if (!can(a.module, a.level)) continue;
      list.push({ id: a.id, group: 'İşlemler', icon: a.icon, label: a.label, keywords: a.keywords, run: () => go(a.to) });
    }
    for (const n of nav) {
      list.push({
        id: `nav:${n.to}`,
        group: 'Ekranlar',
        icon: n.icon,
        label: n.title,
        keywords: `${n.label} ${n.keywords ?? ''}`,
        run: () => go(n.to),
      });
    }
    const dark = resolveInitialTheme() === 'dark';
    list.push({
      id: 'pref:theme',
      group: 'Görünüm',
      icon: dark ? '☀️' : '🌙',
      label: dark ? 'Açık temaya geç' : 'Koyu temaya geç',
      keywords: 'tema karanlık gece gündüz renk',
      run: () => {
        applyTheme(dark ? 'light' : 'dark');
        onClose();
      },
    });
    const font = getFontScale();
    list.push({
      id: 'pref:font',
      group: 'Görünüm',
      icon: '🔠',
      label: font === 'xlarge' ? 'Yazıyı normal boyuta döndür' : 'Yazıyı büyüt',
      keywords: 'yazı boyutu büyük küçük okunak font',
      run: () => {
        applyFontScale(font === 'normal' ? 'large' : font === 'large' ? 'xlarge' : 'normal');
        onClose();
      },
    });
    list.push({ id: 'help', group: 'Görünüm', icon: '⌨️', label: 'Klavye kısayolları', keywords: 'kısayol tuş yardım', run: onShowHelp });
    list.push({ id: 'logout', group: 'Hesap', icon: '🚪', label: 'Çıkış yap', keywords: 'oturum kapat', run: logout });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, can]);

  const tokens = fold(q.trim()).split(/\s+/).filter(Boolean);

  const results = useMemo<Command[]>(() => {
    const out: Command[] = [];
    if (!tokens.length) {
      const recent = readRecent(shop?.id)
        .map((r): Command | undefined => {
          if (r.to) {
            return {
              id: r.id,
              group: 'Son kullanılanlar',
              icon: r.icon ?? '•',
              label: r.label ?? r.id,
              to: r.to,
              run: () => go(r.to!),
              alt: r.altTo ? { label: r.altLabel ?? 'Aç', to: r.altTo, run: () => go(r.altTo!) } : undefined,
            };
          }
          const c = commands.find((x) => x.id === r.id);
          return c && { ...c, group: 'Son kullanılanlar' };
        })
        .filter((c): c is Command => !!c);
      out.push(...recent);
      out.push(...commands.filter((c) => c.group === 'İşlemler' && !recent.some((r) => r.id === c.id)));
      out.push(...commands.filter((c) => c.group === 'Ekranlar'));
      return out;
    }
    out.push(...commands.filter((c) => matches(c, tokens)));
    if (searching) {
      for (const c of customers?.items ?? []) {
        const bal = Number(c.currentBalance) || 0;
        out.push({
          id: `customer:${c.id}`,
          group: 'Müşteriler',
          icon: '👤',
          label: c.companyName ? `${c.name} · ${c.companyName}` : c.name,
          hint: bal > 0 ? `Borç ${money.format(bal)}` : bal < 0 ? `Alacaklı ${money.format(-bal)}` : 'Bakiye yok',
          to: `/customers?q=${encodeURIComponent(c.name)}&open=${c.id}`,
          run: () => go(`/customers?q=${encodeURIComponent(c.name)}&open=${c.id}`),
          alt: can('payments', 'write')
            ? { label: 'Tahsilat', to: `/payments?customer=${c.id}`, run: () => go(`/payments?customer=${c.id}`) }
            : undefined,
        });
      }
      for (const qt of quotes?.items ?? []) {
        out.push({
          id: `quote:${qt.id}`,
          group: 'Teklifler',
          icon: '📝',
          label: `${qt.quoteNo}${qt.buyerCustomer?.name ? ` · ${qt.buyerCustomer.name}` : ''}`,
          hint: formatQuoteTotal(qt.total, qt.currency),
          to: `/quotes?q=${encodeURIComponent(qt.quoteNo)}`,
          run: () => go(`/quotes?q=${encodeURIComponent(qt.quoteNo)}`),
        });
      }
      for (const p of plates?.items ?? []) {
        out.push({
          id: `plate:${p.id}`,
          group: 'Stok',
          icon: '📦',
          label: p.name,
          hint: `${Number(p.quantityInStock)} adet${p.owners?.length ? ` · ${p.owners.join(', ')}` : ''}`,
          to: `/plates?q=${encodeURIComponent(p.sku || p.name)}`,
          run: () => go(`/plates?q=${encodeURIComponent(p.sku || p.name)}`),
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commands, q, searching, customers, plates, quotes]);

  useEffect(() => setActive(0), [q, customers, plates, quotes]);
  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const runAt = (i: number, alt = false) => {
    const cmd = results[i];
    if (!cmd) return;
    pushRecent(
      shop?.id,
      cmd.to
        ? { id: cmd.id, icon: cmd.icon, label: cmd.label, to: cmd.to, altTo: cmd.alt?.to, altLabel: cmd.alt?.label }
        : { id: cmd.id },
    );
    if (alt && cmd.alt) cmd.alt.run();
    else cmd.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runAt(active, e.shiftKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const loading = searching && (loadingCustomers || loadingPlates || loadingQuotes);
  let lastGroup = '';

  return (
    <div className="animate-fade fixed inset-0 z-[80] flex items-start justify-center bg-slate-900/50 p-3 pt-[8vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Hızlı arama"
        className="animate-pop flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-4">
          <span className="text-lg text-slate-400" aria-hidden>
            🔍
          </span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ekran, işlem, müşteri, teklif no ya da plaka ara…"
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
            aria-label="Ara"
            role="combobox"
            aria-expanded="true"
            aria-controls="st-palette-list"
            aria-activedescendant={results[active] ? `st-cmd-${active}` : undefined}
          />
          {loading && <span className="text-xs text-slate-400">aranıyor…</span>}
          <button className="kbd" onClick={onClose} title="Kapat (Esc)">
            Esc
          </button>
        </div>

        <div ref={listRef} id="st-palette-list" role="listbox" className="flex-1 overflow-y-auto p-2">
          {results.length === 0 && (
            <div className="px-3 py-10 text-center text-sm text-slate-500">
              {searching && loading ? 'Aranıyor…' : `"${q}" için sonuç yok.`}
              {!searching && q.trim().length === 1 && <div className="mt-1 text-xs">Müşteri ve plaka aramak için en az 2 harf yazın.</div>}
            </div>
          )}
          {results.map((cmd, i) => {
            const header = cmd.group !== lastGroup ? cmd.group : null;
            lastGroup = cmd.group;
            return (
              <div key={`${cmd.group}-${cmd.id}-${i}`}>
                {header && (
                  <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{header}</div>
                )}
                <div
                  id={`st-cmd-${i}`}
                  data-idx={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => runAt(i)}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
                    i === active ? 'bg-blue-50 text-blue-900 dark:bg-blue-500/20 dark:text-white' : ''
                  }`}
                >
                  <span className="w-6 text-center text-base" aria-hidden>
                    {cmd.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{cmd.label}</span>
                  {cmd.hint && <span className="shrink-0 text-xs text-slate-500">{cmd.hint}</span>}
                  {cmd.alt && (
                    <button
                      className="btn-secondary btn-sm min-h-[30px] shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        runAt(i, true);
                      }}
                      title="⇧ Enter"
                    >
                      💵 {cmd.alt.label}
                    </button>
                  )}
                  {i === active && !cmd.alt && <span className="kbd shrink-0">↵</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden items-center gap-4 border-t border-slate-200 px-4 py-2 text-xs text-slate-500 sm:flex">
          <span>
            <span className="kbd">↑</span> <span className="kbd">↓</span> seç
          </span>
          <span>
            <span className="kbd">↵</span> aç
          </span>
          <span>
            <span className="kbd">⇧ ↵</span> müşteride tahsilat
          </span>
          <span className="ml-auto">
            <span className="kbd">?</span> kısayollar
          </span>
        </div>
      </div>
    </div>
  );
}

/** Yazı yazılan bir alanda mı? (kısayollar orada çalışmaz) */
function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

function visible(el: Element | null): el is HTMLElement {
  return !!el && (el as HTMLElement).offsetParent !== null;
}

/** Sayfadaki arama kutusu (ilk görünen). */
function pageSearchInput(): HTMLInputElement | null {
  const candidates = document.querySelectorAll<HTMLInputElement>(
    'main input[type="search"], main input[placeholder^="Ara"], main input[placeholder*="arayın"], main input[placeholder*="ara ("]',
  );
  return Array.from(candidates).find(visible) ?? null;
}

/**
 * Bütün ekranlarda geçerli kısayollar:
 *   Ctrl+K  hızlı arama        /  sayfadaki arama kutusu
 *   N       yeni kayıt         ?  kısayol listesi
 *   Alt+1…9 menüdeki ekranlar
 */
export function useGlobalShortcuts({
  openPalette,
  openHelp,
  nav,
}: {
  openPalette: () => void;
  openHelp: () => void;
  nav: NavItem[];
}) {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openPalette();
        return;
      }
      if (document.querySelector('[aria-modal="true"]')) return;
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) {
        const item = nav[Number(e.code.slice(5)) - 1];
        if (item) {
          e.preventDefault();
          navigate(item.to);
        }
        return;
      }
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        const input = pageSearchInput();
        if (input) {
          input.focus();
          input.select();
        } else openPalette();
      } else if (e.key === '?') {
        e.preventDefault();
        openHelp();
      } else if (e.key === 'n' || e.key === 'N') {
        const btn = Array.from(document.querySelectorAll('main [data-hotkey="n"]')).find(visible);
        if (btn) {
          e.preventDefault();
          btn.click();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPalette, openHelp, nav, navigate]);
}

function Row({ keys, children }: { keys: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span>{children}</span>
      <span className="flex shrink-0 gap-1">{keys}</span>
    </div>
  );
}

export function ShortcutsHelp({ nav, onClose }: { nav: NavItem[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="animate-fade fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-3" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Klavye kısayolları"
        className="animate-pop max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-800"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">⌨️ Klavye kısayolları</h2>
          <button className="btn-secondary btn-sm" onClick={onClose}>
            Kapat
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          <Row keys={<><span className="kbd">Ctrl</span><span className="kbd">K</span></>}>Hızlı arama: ekran, işlem, müşteri, plaka</Row>
          <Row keys={<span className="kbd">/</span>}>Sayfadaki arama kutusuna git</Row>
          <Row keys={<span className="kbd">N</span>}>Bu sayfada yeni kayıt</Row>
          <Row keys={<span className="kbd">Esc</span>}>Pencereyi kapat</Row>
          <Row keys={<span className="kbd">?</span>}>Bu liste</Row>
        </div>
        <h3 className="mb-1 mt-4 text-sm font-semibold text-slate-500">Ekranlar</h3>
        <div className="divide-y divide-slate-100">
          {nav.slice(0, 9).map((n, i) => (
            <Row key={n.to} keys={<><span className="kbd">Alt</span><span className="kbd">{i + 1}</span></>}>
              {n.icon} {n.title}
            </Row>
          ))}
        </div>
      </div>
    </div>
  );
}
