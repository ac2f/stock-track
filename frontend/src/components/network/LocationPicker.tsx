import { useQuery } from '@tanstack/react-query';
import { fetchDistricts, fetchProvinces } from '../../api/geo.api';

/**
 * İl + ilçe seçimi (listeden; serbest yazım yok). İl değişince ilçe sıfırlanır.
 * `allowAll`: süzgeç kullanımı — "Tüm iller / Tüm ilçeler" seçeneği olur.
 * Liste değişmez veridir (81 il, 973 ilçe): bir kez yüklenir, bellekte kalır.
 */
export function LocationPicker({
  province,
  district,
  onChange,
  allowAll = false,
  required = false,
  disabled = false,
  provinceCounts,
  districtCounts,
  idPrefix = 'loc',
}: {
  province: string;
  district: string;
  onChange: (province: string, district: string) => void;
  allowAll?: boolean;
  required?: boolean;
  disabled?: boolean;
  /** Süzgeçte: il adı → rehberdeki işletme sayısı. */
  provinceCounts?: Record<string, number>;
  districtCounts?: Record<string, number>;
  idPrefix?: string;
}) {
  const { data: provinces, isLoading: loadingProv } = useQuery({
    queryKey: ['geo', 'provinces'],
    queryFn: fetchProvinces,
    staleTime: Infinity,
  });
  const { data: districts, isFetching: loadingDist } = useQuery({
    queryKey: ['geo', 'districts', province],
    queryFn: () => fetchDistricts(province),
    enabled: !!province,
    staleTime: Infinity,
  });
  const star = required ? <span className="text-red-600"> *</span> : null;
  const suffix = (n?: number) => (n !== undefined && n > 0 ? ` (${n})` : '');

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block min-w-0" htmlFor={`${idPrefix}-province`}>
        <span className="label">
          İl{star}
        </span>
        <select
          id={`${idPrefix}-province`}
          className="input"
          value={province}
          disabled={disabled || loadingProv}
          onChange={(e) => onChange(e.target.value, '')}
        >
          <option value="">{loadingProv ? 'Yükleniyor…' : allowAll ? 'Tüm iller' : 'İl seçin…'}</option>
          {provinces?.map((p) => (
            <option key={p.plate} value={p.name}>
              {p.plate} · {p.name}
              {suffix(provinceCounts?.[p.name])}
            </option>
          ))}
        </select>
      </label>
      <label className="block min-w-0" htmlFor={`${idPrefix}-district`}>
        <span className="label">
          İlçe{star}
        </span>
        <select
          id={`${idPrefix}-district`}
          className="input"
          value={district}
          disabled={disabled || !province || loadingDist}
          onChange={(e) => onChange(province, e.target.value)}
        >
          <option value="">
            {!province ? 'Önce il seçin' : loadingDist ? 'Yükleniyor…' : allowAll ? 'Tüm ilçeler' : 'İlçe seçin…'}
          </option>
          {districts?.map((d) => (
            <option key={d} value={d}>
              {d}
              {suffix(districtCounts?.[d])}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
