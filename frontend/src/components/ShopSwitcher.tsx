import { useAuth } from '../context/AuthContext';

/**
 * Dükkân seçici. Tek dükkânı olan kullanıcıya yalnız adı gösterir; birden
 * çoksa seçim kutusu. Seçim değişince bütün ekranlar o dükkânın verisini yükler.
 */
export function ShopSwitcher({ className = '' }: { className?: string }) {
  const { shops, shop, setShop } = useAuth();
  if (!shops.length) return null;
  if (shops.length === 1) {
    return (
      <div className={`truncate text-xs text-slate-500 ${className}`} title="Dükkân">
        🏪 {shops[0].name}
      </div>
    );
  }
  return (
    <label className={`block ${className}`}>
      <span className="sr-only">Dükkân</span>
      <select
        className="input py-1.5 text-sm"
        value={shop?.id ?? ''}
        onChange={(e) => setShop(e.target.value)}
        title="Çalıştığınız dükkân"
      >
        {shops.map((s) => (
          <option key={s.id} value={s.id}>
            🏪 {s.name}
            {s.isActive ? '' : ' (kapalı)'}
          </option>
        ))}
      </select>
    </label>
  );
}
