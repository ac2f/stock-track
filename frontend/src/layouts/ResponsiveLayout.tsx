import { NavLink, Outlet } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  roles?: UserRole[]; // tanımsızsa tüm roller görür
}

const NAV: NavItem[] = [
  { to: '/plates', label: 'Stok', icon: '📦' },
  { to: '/purchases', label: 'Alış', icon: '🚚' },
  { to: '/processing', label: 'İşleme', icon: '✂️' },
  { to: '/customers', label: 'Cari', icon: '💳' },
  { to: '/reports', label: 'Rapor', icon: '📊', roles: ['owner'] },
];

/**
 * Mobil öncelikli kabuk:
 *  - Mobil: altta sabit gezinme çubuğu (bottom nav).
 *  - Masaüstü (md+): solda sabit yan menü (sidebar).
 * Tek bileşen iki yerleşimi de yönetir → tutarlı UX.
 */
export function ResponsiveLayout() {
  const { user, hasRole, logout } = useAuth();
  const visible = NAV.filter((n) => !n.roles || hasRole(...n.roles));

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {/* Masaüstü sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white p-4 md:block">
        <Brand />
        <nav className="mt-6 space-y-1">
          {visible.map((item) => (
            <SideLink key={item.to} item={item} />
          ))}
        </nav>
        <button
          onClick={logout}
          className="btn mt-6 w-full text-slate-500 hover:text-slate-900"
        >
          Çıkış
        </button>
      </aside>

      {/* İçerik */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <Brand />
          <span className="text-xs text-slate-500">{user?.fullName}</span>
        </header>

        <main className="flex-1 p-4 pb-24 md:pb-4">
          <Outlet />
        </main>
      </div>

      {/* Mobil bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-200 bg-white pb-safe-bottom md:hidden">
        {visible.map((item) => (
          <BottomLink key={item.to} item={item} />
        ))}
      </nav>
    </div>
  );
}

function Brand() {
  return (
    <div className="text-lg font-bold tracking-tight text-slate-900">
      Stock<span className="text-slate-400">Track</span>
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
        `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
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
