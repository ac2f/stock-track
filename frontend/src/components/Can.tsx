import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import type { ShopModule } from '../types';

/**
 * Seçili dükkândaki izne göre UI kapısı. Sunucu aynı kuralı ayrıca uygular;
 * bu yalnız göremeyeceği/yapamayacağı şeyi kullanıcıya göstermemek içindir.
 *
 *   <Can module="reports"><DashboardPage /></Can>
 *   <Can module="quotes" level="write"><button>Yeni teklif</button></Can>
 */
export function Can({
  module,
  level = 'read',
  children,
  fallback = null,
}: {
  module: ShopModule;
  level?: 'read' | 'write';
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = useAuth();
  return <>{can(module, level) ? children : fallback}</>;
}

/** Yetkisiz sayfa yerine gösterilen kart. */
export function NoAccess({ what }: { what?: string }) {
  const { shop } = useAuth();
  return (
    <div className="card">
      <h1 className="text-xl font-bold">Yetkiniz yok</h1>
      <p className="mt-2 text-sm text-slate-500">
        {what ? `"${what}" alanını` : 'Bu ekranı'} {shop ? `${shop.name} dükkânında ` : ''}
        görme izniniz bulunmuyor. Dükkân yöneticinizden izin isteyebilirsiniz.
      </p>
    </div>
  );
}
