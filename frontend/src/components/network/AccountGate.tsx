import type { ReactNode } from 'react';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { ShopAccess } from '../../types';

/** Hesap girişe uygun mu? Sistem sahibi her zaman girer; diğerleri yalnız 'active' hesaba. */
export function isBlocked(isOwner: boolean, shop: ShopAccess | null): boolean {
  return !isOwner && !!shop && shop.status !== 'active';
}

/**
 * Onay bekleyen ya da askıya alınmış hesapta uygulamanın yerine durum ekranı
 * gösterilir (sunucu zaten girişi reddeder; kullanıcı 403 yağmuru yerine
 * ne olduğunu görsün).
 */
export function AccountGate({ children }: { children: ReactNode }) {
  const { isOwner, shop, shops, logout, refreshMe, setShop } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!isBlocked(isOwner, shop)) return <>{children}</>;
  const usable = shops.filter((s) => s.status === 'active' && s.id !== shop?.id);
  const pending = shop!.status === 'pending';

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-900">
      <div className="card w-full max-w-md space-y-4 p-6 text-center shadow-lg" role="status">
        <div className="text-5xl" aria-hidden>
          {pending ? '⏳' : '⛔'}
        </div>
        <h1 className="text-xl font-bold">{pending ? 'Kaydınız onay bekliyor' : 'Hesabınız askıya alınmış'}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <b>{shop!.name}</b>{' '}
          {pending
            ? 'için kaydınız alındı. Yönetici onayladığında sistemi kullanmaya başlayabilirsiniz; onaylanınca bu sayfayı yenilemeniz yeterli.'
            : 'hesabı yönetici tarafından askıya alındı. Ayrıntı için lütfen sistem yöneticisiyle iletişime geçin.'}
        </p>
        <div className="flex flex-col gap-2">
          <button
            className="btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await refreshMe();
              setBusy(false);
            }}
          >
            {busy ? 'Kontrol ediliyor…' : 'Durumu yenile'}
          </button>
          {usable.map((s) => (
            <button key={s.id} className="btn-secondary" onClick={() => setShop(s.id)}>
              {s.name} işletmesine geç
            </button>
          ))}
          <button className="btn-ghost" onClick={logout}>
            Çıkış yap
          </button>
        </div>
      </div>
    </div>
  );
}

/** Kiralama süresi dolmuş hesapta (veriler görülür, yazılamaz) üstte uyarı çubuğu. */
export function ExpiredBar() {
  const { isOwner, shop } = useAuth();
  if (isOwner || !shop?.expired) return null;
  return (
    <div
      role="alert"
      className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-100"
    >
      ⚠ Kiralama süreniz {shop.subscriptionUntil ? `${shop.subscriptionUntil} tarihinde ` : ''}doldu: verilerinizi
      görüntüleyebilirsiniz, değişiklik yapılamaz. Süreyi uzatmak için sistem yöneticisiyle iletişime geçin.
    </div>
  );
}
