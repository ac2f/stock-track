import { useAuth } from '../context/AuthContext';

/**
 * Dükkân seçici. Tek dükkânı olan kullanıcıya yalnız adı gösterir (hideSingle
 * ile hiç göstermez); birden çoksa seçim kutusu. Seçim değişince bütün
 * ekranlar o dükkânın verisini yükler.
 */
export function ShopSwitcher({ className = '', hideSingle = false }: { className?: string; hideSingle?: boolean }) {
  const { shops, shop, setShop } = useAuth();
  if (!shops.length) return null;
  if (shops.length === 1) {
    if (hideSingle) return null;
    return (
      <div className={`truncate text-xs text-slate-500 ${className}`} title="Dükkân">
        🏪 {shops[0].name}
      </div>
    );
  }
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Dükkân</span>
      <select
        className="input min-h-[40px] py-1.5 font-medium md:text-sm"
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
