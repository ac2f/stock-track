import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import type { ShopModule } from '../types';
import { EmptyState } from './ui/EmptyState';

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
  const { shop, shops } = useAuth();
  return (
    <EmptyState
      icon="🔒"
      title={<h1 className="text-xl font-bold">Yetkiniz yok</h1>}
      hint={
        <>
          {what ? `"${what}" alanını` : 'Bu ekranı'} {shop ? `${shop.name} dükkânında ` : ''}
          görme izniniz bulunmuyor. Dükkân yöneticinizden izin isteyebilirsiniz.
          {shops.length > 1 && ' Başka bir dükkânda izniniz varsa menüden dükkân değiştirebilirsiniz.'}
        </>
      }
    />
  );
}
