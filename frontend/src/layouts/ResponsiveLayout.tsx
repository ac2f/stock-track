import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useDensity } from '../context/DensityContext';
import { useBusinessSettings } from '../hooks/useReferenceData';
import { fetchQueueCount } from '../api/processing.api';
import { PageFallback } from '../components/ui/Loading';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { preloadPages } from '../lib/lazyPage';
import { applyTheme, resolveInitialTheme, type Theme } from '../lib/theme';
import { applyFontScale, FONT_SCALES, getFontScale, type FontScale } from '../lib/fontScale';
import { getBrand, setBrand } from '../lib/brand';
import { CurrencyTicker } from '../components/CurrencyTicker';
import { LockProvider, useLock } from '../context/LockContext';
import { ShopSwitcher } from '../components/ShopSwitcher';
import { OfflineBar } from '../components/OfflineBar';
import { CommandPalette, ShortcutsHelp, useGlobalShortcuts } from '../components/CommandPalette';
import { NAV_ITEMS, visibleNav, type NavItem } from './nav';

const COLLAPSE_KEY = 'st_sidebar_collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Kuyrukta bekleyen iş sayısı (menüde rozet). Yalnız sayı istenir (bütün
 * kuyruk değil); anahtar ['queue', ...] altında: kuyruğu değiştiren her işlem
 * (['queue'] geçersiz kılınınca) rozeti de tazeler.
 */
function useQueueCount(enabled: boolean): number {
  const { data } = useQuery({
    queryKey: ['queue', 'count'],
    queryFn: fetchQueueCount,
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return data?.count ?? 0;
}

/**
 * Mobil öncelikli kabuk:
 *  - Mobil: üstte sade başlık, altta dört ana öğe + "Menü" (bütün ekranlar
 *    ve görünüm ayarları açılır pencerede).
 *  - Masaüstü (md+): solda gruplu, daraltılabilir yan menü; altta kullanıcı
 *    kartı ve görünüm ayarları.
 * Her yerde Ctrl+K hızlı arama ve klavye kısayolları çalışır.
 */
export function ResponsiveLayout() {
  const { user, can, managesAnyShop, shop } = useAuth();
  const groups = visibleNav(can, managesAnyShop);
  const flat = groups.flatMap((g) => g.items);
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const queueCount = useQueueCount(can('processing'));
  const badges: Record<string, number> = { '/queue': queueCount };

  useGlobalShortcuts({
    openPalette: () => setPaletteOpen(true),
    openHelp: () => setHelpOpen(true),
    nav: flat,
  });

  // İşletme adı → marka + sekme başlığı (Ayarlar ekranından düzenlenir).
  const { data: business } = useBusinessSettings();
  // Yüklenene kadar son bilinen işletme adını (yerel önbellek) göster.
  const brandName = business?.name || getBrand();
  const page = NAV_ITEMS.find((n) => location.pathname.startsWith(n.to));
  useEffect(() => {
    if (business?.name) setBrand(business.name);
    document.title = page ? `${page.title} · ${brandName}` : brandName;
  }, [business?.name, brandName, page]);

  // Sayfa değişince telefondaki menü kapanır.
  useEffect(() => setMenuOpen(false), [location.pathname]);
  // Boşta kalınca bütün ekranlar insin: sonra sunucuya ulaşılamasa da açılır.
  useEffect(() => preloadPages(), []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* depolama kapalı */
      }
      return !c;
    });
  };

  const primary = flat.slice(0, 4);

  return (
    <LockProvider>
      {/* Uygulama kabuğu: satır viewport yüksekliğinde SABİT; yalnızca içerik
          (main) kendi içinde kayar. Böylece menü sayfa kaydırılsa da yerinde kalır. */}
      <div className="flex h-full flex-col md:flex-row">
        {/* Masaüstü yan menü */}
        <aside
          className={`hidden shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] md:flex ${
            collapsed ? 'w-[76px]' : 'w-64'
          }`}
        >
          <div className={`flex items-center gap-2 px-3 pt-4 ${collapsed ? 'justify-center' : ''}`}>
            <BrandMark name={brandName} />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-bold leading-tight text-slate-900" title={brandName}>
                  {brandName}
                </div>
                {shop && shop.name !== brandName && <div className="truncate text-xs text-slate-500">{shop.name}</div>}
              </div>
            )}
          </div>

          {!collapsed && <ShopSwitcher className="mx-3 mt-3" hideSingle />}

          <div className="px-3 pt-3">
            <button
              onClick={() => setPaletteOpen(true)}
              className={`flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-500 hover:border-slate-300 hover:bg-white ${
                collapsed ? 'justify-center px-0' : ''
              }`}
              title="Ara veya git (Ctrl+K)"
            >
              <span aria-hidden>🔍</span>
              {!collapsed && (
                <>
                  <span className="flex-1">Ara veya git…</span>
                  <span className="kbd">Ctrl K</span>
                </>
              )}
            </button>
          </div>

          <nav className="mt-2 flex-1 overflow-y-auto px-3 pb-3" aria-label="Ana menü">
            {groups.map((g) => (
              <div key={g.label} className="mt-3">
                {collapsed ? (
                  <div className="mx-auto mb-1 h-px w-8 bg-slate-200" />
                ) : (
                  <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {g.label}
                  </div>
                )}
                <div className="space-y-0.5">
                  {g.items.map((item) => (
                    <SideLink key={item.to} item={item} collapsed={collapsed} badge={badges[item.to]} />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-slate-200 p-3">
            {!collapsed && <CurrencyTicker className="mb-2" />}
            <UserMenu
              collapsed={collapsed}
              onToggleCollapse={toggleCollapsed}
              onShowHelp={() => setHelpOpen(true)}
            />
          </div>
        </aside>

        {/* İçerik sütunu — min-h-0: flex çocuğu küçülebilsin ki main kayabilsin. */}
        <div className="flex min-h-0 flex-1 flex-col">
          <OfflineBar />
          <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 md:hidden">
            <BrandMark name={brandName} small />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold leading-tight">{brandName}</div>
              <div className="truncate text-xs text-slate-500">
                {page?.title ?? ''}
                {shop && shop.name !== brandName ? ` · ${shop.name}` : ''}
              </div>
            </div>
            <CurrencyTicker compact />
            <button
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-lg"
              onClick={() => setPaletteOpen(true)}
              aria-label="Ara veya git"
            >
              🔍
            </button>
          </header>

          {/* Kaydırma yalnızca burada olur → menü/başlık sabit kalır. */}
          <main className="flex-1 overflow-y-auto p-3 pb-28 sm:p-4 md:p-6 md:pb-6">
            <div className="mx-auto max-w-7xl">
              {/* Ekran parçası yüklenirken menü/başlık yerinde kalır. */}
              <ErrorBoundary resetKey={location.pathname}>
                <Suspense fallback={<PageFallback />}>
                  <Outlet />
                </Suspense>
              </ErrorBoundary>
            </div>
          </main>
        </div>

        {/* Mobil alt çubuk: dört ana öğe + Menü */}
        <nav
          className="no-print fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 pb-safe-bottom backdrop-blur md:hidden"
          aria-label="Ana menü"
        >
          {primary.map((item) => (
            <BottomLink key={item.to} item={item} badge={badges[item.to]} />
          ))}
          <button
            onClick={() => setMenuOpen(true)}
            className={`relative flex min-w-[64px] flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
              menuOpen || (page && !primary.includes(page)) ? 'text-blue-600' : 'text-slate-500'
            }`}
          >
            <span className="text-lg leading-none">☰</span>
            Menü
          </button>
        </nav>

        {menuOpen && (
          <MobileMenu
            groups={groups}
            badges={badges}
            onClose={() => setMenuOpen(false)}
            onSearch={() => {
              setMenuOpen(false);
              setPaletteOpen(true);
            }}
            userName={user?.fullName ?? ''}
          />
        )}
        {paletteOpen && (
          <CommandPalette
            nav={flat}
            onClose={() => setPaletteOpen(false)}
            onShowHelp={() => {
              setPaletteOpen(false);
              setHelpOpen(true);
            }}
          />
        )}
        {helpOpen && <ShortcutsHelp nav={flat} onClose={() => setHelpOpen(false)} />}
      </div>
    </LockProvider>
  );
}

/** İşletme adının baş harfi: renkli küçük logo. */
function BrandMark({ name, small = false }: { name: string; small?: boolean }) {
  const letter = (name.trim()[0] ?? 'E').toLocaleUpperCase('tr-TR');
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 font-bold text-white shadow-sm ${
        small ? 'h-9 w-9 text-base' : 'h-10 w-10 text-lg'
      }`}
      aria-hidden
    >
      {letter}
    </div>
  );
}

function CountBadge({ n, floating = false }: { n?: number; floating?: boolean }) {
  if (!n) return null;
  return (
    <span
      className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold leading-5 text-white ${
        floating ? 'absolute -top-1 right-1/2 translate-x-5' : 'ml-auto'
      }`}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

function SideLink({ item, collapsed, badge }: { item: NavItem; collapsed: boolean; badge?: number }) {
  return (
    <NavLink
      to={item.to}
      title={collapsed ? item.title : undefined}
      className={({ isActive }) =>
        `relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
          collapsed ? 'justify-center px-0' : ''
        } ${
          isActive
            ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && (
            <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-blue-600" aria-hidden />
          )}
          <span className="text-base leading-none" aria-hidden>
            {item.icon}
          </span>
          {!collapsed && <span className="truncate">{item.label}</span>}
          {collapsed ? <CountBadge n={badge} floating /> : <CountBadge n={badge} />}
        </>
      )}
    </NavLink>
  );
}

function BottomLink({ item, badge }: { item: NavItem; badge?: number }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `relative flex min-w-[64px] flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
          isActive ? 'font-semibold text-blue-600' : 'text-slate-500'
        }`
      }
    >
      <span className="text-lg leading-none" aria-hidden>
        {item.icon}
      </span>
      {item.label}
      <CountBadge n={badge} floating />
    </NavLink>
  );
}

/* ── Görünüm tercihleri ───────────────────────────────────────────── */

function useThemePref() {
  const [theme, setTheme] = useState<Theme>(() => resolveInitialTheme());
  return {
    theme,
    set: (t: Theme) => {
      applyTheme(t);
      setTheme(t);
    },
  };
}

function useFontPref() {
  const [font, setFont] = useState<FontScale>(() => getFontScale());
  return {
    font,
    set: (f: FontScale) => {
      applyFontScale(f);
      setFont(f);
    },
  };
}

/** İki-üç seçenekli düğme grubu. */
function Segmented<T extends string | boolean>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-700">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
            o.value === value
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Tema, yazı boyutu, liste yoğunluğu ve gruplama. */
function Preferences() {
  const theme = useThemePref();
  const font = useFontPref();
  const { mini, setMini, grouped, setGrouped } = useDensity();
  return (
    <div className="space-y-3">
      <PrefRow label="Tema">
        <Segmented
          value={theme.theme}
          onChange={theme.set}
          options={[
            { value: 'light', label: '☀️ Açık' },
            { value: 'dark', label: '🌙 Koyu' },
          ]}
        />
      </PrefRow>
      <PrefRow label="Yazı boyutu">
        <Segmented
          value={font.font}
          onChange={font.set}
          options={FONT_SCALES.map((f) => ({ value: f.value, label: f.label, title: f.title }))}
        />
      </PrefRow>
      <PrefRow label="Listeler">
        <Segmented
          value={mini}
          onChange={setMini}
          options={[
            { value: false, label: '⊞ Detaylı', title: 'Kayıtlar bütün bilgileriyle' },
            { value: true, label: '≡ Mini', title: 'Bir ekranda daha çok kayıt' },
          ]}
        />
      </PrefRow>
      <PrefRow label="Gruplama">
        <Segmented
          value={grouped}
          onChange={setGrouped}
          options={[
            { value: false, label: '▤ Düz liste' },
            { value: true, label: '▦ Gruplu' },
          ]}
        />
      </PrefRow>
    </div>
  );
}

function PrefRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-500">{label}</div>
      {children}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toLocaleUpperCase('tr-TR') || '?';
}

function roleLabel(isOwner: boolean, isShopAdmin: boolean): string {
  if (isOwner) return 'Sistem sahibi';
  if (isShopAdmin) return 'Dükkân yöneticisi';
  return 'Çalışan';
}

/** Masaüstü: kullanıcı kartı; tıklayınca görünüm ayarları ve çıkış. */
function UserMenu({
  collapsed,
  onToggleCollapse,
  onShowHelp,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onShowHelp: () => void;
}) {
  const { user, logout, isOwner, isShopAdmin } = useAuth();
  const { lock, ready } = useLock();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="relative">
      <div className={`flex items-center gap-1 ${collapsed ? 'flex-col' : ''}`}>
        <button
          onClick={() => setOpen((o) => !o)}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl p-1.5 text-left hover:bg-slate-100 ${
            collapsed ? 'justify-center' : ''
          }`}
          aria-expanded={open}
          title="Hesap ve görünüm"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-white dark:bg-slate-600">
            {initials(user?.fullName ?? '')}
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{user?.fullName}</span>
              <span className="block truncate text-xs text-slate-500">{roleLabel(isOwner, isShopAdmin)}</span>
            </span>
          )}
          {!collapsed && <span className="text-slate-400">⚙</span>}
        </button>
        <button
          onClick={onToggleCollapse}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
          title={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
          aria-label={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="animate-pop absolute bottom-full left-0 z-50 mb-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-3 border-b border-slate-100 pb-3">
              <div className="font-semibold">{user?.fullName}</div>
              <div className="truncate text-xs text-slate-500">{user?.email}</div>
            </div>
            <Preferences />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="btn-secondary btn-sm" onClick={() => (setOpen(false), onShowHelp())}>
                ⌨️ Kısayollar
              </button>
              {ready ? (
                <button className="btn-secondary btn-sm" onClick={() => (setOpen(false), lock())}>
                  🔒 Kilitle
                </button>
              ) : (
                <span />
              )}
              <button className="btn-danger-soft btn-sm col-span-2" onClick={logout}>
                Çıkış yap
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Telefon: bütün ekranlar, dükkân, görünüm ve hesap tek pencerede. */
function MobileMenu({
  groups,
  badges,
  onClose,
  onSearch,
  userName,
}: {
  groups: ReturnType<typeof visibleNav>;
  badges: Record<string, number>;
  onClose: () => void;
  onSearch: () => void;
  userName: string;
}) {
  const { logout, isOwner, isShopAdmin } = useAuth();
  const { lock, ready } = useLock();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="animate-fade fixed inset-0 z-50 bg-slate-900/50 md:hidden" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menü"
        className="animate-slide-up absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white p-4 pb-8 shadow-2xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300" aria-hidden />
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-white">
            {initials(userName)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{userName}</div>
            <div className="text-xs text-slate-500">{roleLabel(isOwner, isShopAdmin)}</div>
          </div>
          <button className="btn-secondary btn-sm" onClick={onClose}>
            Kapat
          </button>
        </div>

        <ShopSwitcher className="mt-3" hideSingle />
        <button
          onClick={onSearch}
          className="mt-3 flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-sm text-slate-500"
        >
          🔍 Müşteri, plaka ya da ekran ara…
        </button>

        {groups.map((g) => (
          <div key={g.label} className="mt-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.label}</div>
            <div className="grid grid-cols-3 gap-2">
              {g.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `relative flex flex-col items-center gap-1 rounded-2xl border px-1 py-3 text-center text-xs ${
                      isActive
                        ? 'border-blue-200 bg-blue-50 font-semibold text-blue-700'
                        : 'border-slate-200 text-slate-700'
                    }`
                  }
                >
                  <span className="text-2xl leading-none">{item.icon}</span>
                  {item.label}
                  <CountBadge n={badges[item.to]} floating />
                </NavLink>
              ))}
            </div>
          </div>
        ))}

        <div className="mt-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Görünüm</div>
          <Preferences />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          {ready && (
            <button className="btn-secondary" onClick={lock}>
              🔒 Kilitle
            </button>
          )}
          <button className={`btn-danger-soft ${ready ? '' : 'col-span-2'}`} onClick={logout}>
            Çıkış yap
          </button>
        </div>
      </div>
    </div>
  );
}

export function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <span className="animate-pulse">Yükleniyor…</span>
      </div>
    );
  }
  if (!user) {
    window.location.href = '/login';
    return null;
  }
  return <>{children}</>;
}
