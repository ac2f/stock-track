import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchMaterialCategories,
  fetchPlates,
  type PlateFilters,
} from '../../api/materials.api';
import { RoleGate } from '../../components/RoleGate';

/**
 * Plaka (stok) listesi + gelişmiş filtreleme.
 * Mobil: tek sütun kartlar; masaüstü: çok sütunlu ızgara.
 */
export function PlatesListPage() {
  const [filters, setFilters] = useState<PlateFilters>({ page: 1, limit: 20 });

  const { data, isLoading } = useQuery({
    queryKey: ['plates', filters],
    queryFn: () => fetchPlates(filters),
  });
  const { data: categories } = useQuery({
    queryKey: ['material-categories'],
    queryFn: fetchMaterialCategories,
  });

  const set = (patch: Partial<PlateFilters>) =>
    setFilters((f) => ({ ...f, ...patch, page: 1 }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Stok / Plakalar</h1>
        <RoleGate roles={['owner']}>
          <Link to="/material-categories" className="text-sm text-slate-500 underline">
            Türleri Yönet
          </Link>
        </RoleGate>
      </div>

      {/* Filtre çubuğu — mobilde yatay kaydırılır */}
      <div className="card space-y-3">
        <input
          className="input"
          placeholder="Ara (ad, stok kodu, renk kodu)…"
          onChange={(e) => set({ search: e.target.value || undefined })}
        />
        <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
          <select
            className="input w-auto"
            onChange={(e) => set({ categoryId: e.target.value || undefined })}
          >
            <option value="">Tüm türler</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="input w-32"
            placeholder="Marka"
            onChange={(e) => set({ brand: e.target.value || undefined })}
          />
          <input
            className="input w-32"
            placeholder="Renk"
            onChange={(e) => set({ color: e.target.value || undefined })}
          />
          <label className="flex min-h-[44px] shrink-0 items-center gap-2 px-2 text-sm">
            <input
              type="checkbox"
              onChange={(e) => set({ inStock: e.target.checked || undefined })}
            />
            Stokta
          </label>
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-400">Yükleniyor…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.items.map((plate) => (
            <div key={plate.id} className="card">
              <div className="flex items-start justify-between">
                <h3 className="font-medium">{plate.name}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    plate.quantityInStock > 0
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {plate.quantityInStock} adet
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {plate.brand ?? '—'} · {plate.color ?? '—'}
                {plate.colorCode ? ` (${plate.colorCode})` : ''}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {plate.widthMm}×{plate.heightMm}×{plate.thicknessMm} mm
              </p>
            </div>
          ))}
          {!data?.items.length && (
            <p className="text-slate-400">Kayıt bulunamadı.</p>
          )}
        </div>
      )}
    </div>
  );
}
