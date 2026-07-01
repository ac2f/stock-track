import { NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useDensity } from '../context/DensityContext';
import { fetchBusinessSettings } from '../api/settings.api';
import { applyTheme, resolveInitialTheme, type Theme } from '../lib/theme';
import type { UserRole } from '../types';

/** Genel mini/detaylı mod düğmesi (seçim localStorage'da tutulur, tüm listeler uyar). */
function DensityModeToggle({ className = '' }: { className?: string }) {
  const { mini, toggle } = useDensity();
  return (
    <button
      onClick={toggle}
      title={mini ? 'Detaylı moda geç' : 'Mini moda geç'}
      className={`btn bg-slate-100 ${className}`}
    >
      {mini ? '⊞ Detaylı mod' : '≡ Mini mod'}
    </button>
  );
}

/** Genel gruplama modu düğmesi (kalıcı, tüm listeler uyar). */
function GroupModeToggle({ className = '' }: { className?: string }) {
  const { grouped, toggleGrouped } = useDensity();
  return (
    <button
      onClick={toggleGrouped}
      title={grouped ? 'Gruplamayı kapat' : 'Listeleri grupla'}
      className={`btn bg-slate-100 ${className}`}
    >
      {grouped ? '▦ Gruplu' : '▤ Grupsuz'}
    </button>
  );
}

interface NavItem {
  to: string;
  label: string;
  icon: string;
  roles?: UserRole[]; // tanımsızsa tüm roller görür
}

const NAV: NavItem[] = [
  { to: '/plates', label: 'Stok', icon: '📦' },
  { to: '/quotes', label: 'Teklif', icon: '📝' },
  { to: '/queue', label: 'Kuyruk', icon: '🛠️' },
  { to: '/customers', label: 'Cari', icon: '💳' },
  { to: '/payments', label: 'Ödeme', icon: '💵' },
  { to: '/expenses', label: 'Gider', icon: '🧾', roles: ['owner'] },
  { to: '/employees', label: 'Personel', icon: '👥', roles: ['owner'] },
  { to: '/reports', label: 'Rapor', icon: '📊', roles: ['owner'] },
  { to: '/settings', label: 'Ayarlar', icon: '⚙️', roles: ['owner'] },
];

/** Açık/karanlık tema düğmesi (seçim localStorage'da tutulur). */
function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() => resolveInitialTheme());
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };
  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Açık temaya geç' : 'Karanlık temaya geç'}
      className={`btn bg-slate-100 ${className}`}
    >
      {theme === 'dark' ? '☀️ Açık' : '🌙 Karanlık'}
    </button>
  );
}

/**
 * Mobil öncelikli kabuk:
 *  - Mobil: altta sabit gezinme çubuğu (bottom nav).
 *  - Masaüstü (md+): solda sabit yan menü (sidebar).
 * Tek bileşen iki yerleşimi de yönetir → tutarlı UX.
 */
export function ResponsiveLayout() {
  const { user, hasRole, logout } = useAuth();
  const visible = NAV.filter((n) => !n.roles || hasRole(...n.roles));

  // İşletme adı → marka + sekme başlığı (Ayarlar ekranından düzenlenir).
  const { data: business } = useQuery({
    queryKey: ['settings', 'business'],
    queryFn: fetchBusinessSettings,
    staleTime: 5 * 60_000,
  });
  const brandName = business?.name || 'StockTrack';
  useEffect(() => {
    document.title = `${brandName} ERP`;
  }, [brandName]);

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {/* Masaüstü sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white p-4 md:block">
        <Brand name={brandName} />
        <nav className="mt-6 space-y-1">
          {visible.map((item) => (
            <SideLink key={item.to} item={item} />
          ))}
        </nav>
        <div className="mt-6 space-y-2">
          <ThemeToggle className="w-full" />
          <DensityModeToggle className="w-full" />
          <GroupModeToggle className="w-full" />
          <button
            onClick={logout}
            className="btn w-full text-slate-500 hover:text-slate-900"
          >
            Çıkış
          </button>
        </div>
      </aside>

      {/* İçerik */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <Brand name={brandName} />
          <div className="flex items-center gap-2">
            <ThemeToggle className="px-2 text-xs" />
            <DensityModeToggle className="px-2 text-xs" />
            <GroupModeToggle className="px-2 text-xs" />
            <span className="text-xs text-slate-500">{user?.fullName}</span>
          </div>
        </header>

        <main className="flex-1 p-4 pb-24 md:pb-4">
          <Outlet />
        </main>
      </div>

      {/* Mobil bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex overflow-x-auto border-t border-slate-200 bg-white pb-safe-bottom md:hidden">
        {visible.map((item) => (
          <BottomLink key={item.to} item={item} />
        ))}
      </nav>
    </div>
  );
}

function Brand({ name }: { name: string }) {
  return (
    <div className="text-lg font-bold tracking-tight text-slate-900">
      {name}
    </div>
  );
}

function SideLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${
          isActive
            ? 'bg-slate-900 text-white'
            : 'text-slate-600 hover:bg-slate-100'
        }`
      }
    >
      <span>{item.icon}</span>
      {item.label}
    </NavLink>
  );
}

function BottomLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `flex min-w-[64px] flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
          isActive ? 'text-slate-900' : 'text-slate-400'
        }`
      }
    >
      <span className="text-lg">{item.icon}</span>
      {item.label}
    </NavLink>
  );
}

export function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-slate-400">Yükleniyor…</div>;
  if (!user) {
    window.location.href = '/login';
    return null;
  }
  return <>{children}</>;
}
