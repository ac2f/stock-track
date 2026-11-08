import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState, type ReactNode } from 'react';
import { fetchTransferTargets, type TransferItemState, type TransferTarget } from '../../api/shop-transfers.api';
import { SearchSelect } from '../../components/SearchSelect';
import { useAuth } from '../../context/AuthContext';
import { useDebounced } from '../../hooks/useDebounced';
import { formatNumber } from '../../lib/format';

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export const m2Of = (w?: number | null, h?: number | null, qty = 1): number =>
  w && h ? ((Number(w) / 1000) * (Number(h) / 1000)) * qty : 0;

/** "1220×500 mm · 0,61 m²", "3 m", "10 adet" */
export function measureText(
  unit: string,
  quantity: number,
  widthMm: number | null | undefined,
  heightMm: number | null | undefined,
): string {
  if (unit === 'area' && widthMm && heightMm) {
    const pieces = quantity > 1 ? ` ×${formatNumber(quantity, 0)}` : '';
    return `${Number(widthMm)}×${Number(heightMm)} mm${pieces} · ${formatNumber(m2Of(widthMm, heightMm, quantity || 1))} m²`;
  }
  if (unit === 'length') return `${formatNumber(quantity)} m`;
  if (unit === 'weight') return `${formatNumber(quantity)} kg`;
  return `${formatNumber(quantity)} adet`;
}

export function priceUnitLabel(unit?: string): string {
  if (unit === 'area') return 'TL/m²';
  if (unit === 'length') return 'TL/m';
  if (unit === 'weight') return 'TL/kg';
  return 'TL/adet';
}

export const STATE_LABEL: Record<TransferItemState, string> = {
  pending: 'Onay bekliyor',
  untracked: 'Alıcının stoğunda',
  in_stock: 'Stokta',
  partial: 'Kısmen satıldı',
  sold: 'Satıldı',
  removed: 'Stoktan çıktı',
  cancelled: 'İptal',
};

export const STATE_CLASS: Record<TransferItemState, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  untracked: 'bg-slate-100 text-slate-600',
  in_stock: 'bg-slate-100 text-slate-700',
  partial: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  sold: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  removed: 'bg-slate-200 text-slate-600',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

/** "Çankaya / Ankara" — il/ilçe bilinmiyorsa boş. */
export function placeLabel(s: { province?: string | null; district?: string | null }): string {
  return [s.district, s.province].filter(Boolean).join(' / ');
}

/** Stok, cari ve belge listelerini yenileyen sorgu anahtarları (bir işlem sonuçlanınca). */
const AFTER_TRANSFER_KEYS = [
  'shop-transfers',
  'plates',
  'plate-stock-levels',
  'plate-pricing',
  'plate-costs',
  'sales',
  'purchases',
  'customers',
  'suppliers',
  'dashboard',
  'marketplace',
];

export function useInvalidateAfterTransfer(): () => void {
  const qc = useQueryClient();
  return useCallback(() => {
    for (const key of AFTER_TRANSFER_KEYS) qc.invalidateQueries({ queryKey: [key] });
  }, [qc]);
}

/**
 * Karşı işletme seçici: ad ya da il/ilçe yazarak arar (arama sunucuda; yalnız liste açıkken istenir).
 * Kendi şubeleriniz, rehberde görünenler ve daha önce ilişkide olduklarınız listelenir.
 */
export function PartnerPicker({
  value,
  selected,
  onPick,
  accept,
  placeholder = 'İşletme ara/seç…',
}: {
  value: string;
  selected?: TransferTarget;
  onPick: (target: TransferTarget) => void;
  /** Listeyi süzer (ör. kendi şubeleriniz hariç). */
  accept?: (t: TransferTarget) => boolean;
  placeholder?: string;
}) {
  const { shop } = useAuth();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const search = useDebounced(term.trim());
  const { data, isFetching } = useQuery({
    queryKey: ['shop-transfers', 'targets', shop?.id, search],
    queryFn: () => fetchTransferTargets(search || undefined),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const items = (data ?? []).filter((t) => !accept || accept(t));
  const list = selected && !items.some((t) => t.id === selected.id) ? [selected, ...items] : items;
  return (
    <SearchSelect
      placeholder={placeholder}
      value={value}
      emptyText={search ? 'Bu aramaya uyan işletme yok. İşletme rehberde görünmüyorsa bulunamaz.' : 'İşletme yok.'}
      options={list.map((t) => ({
        id: t.id,
        label: t.name,
        group: t.own ? 'Kendi şubelerim' : 'İşletmeler',
        sublabel: [placeLabel(t), t.own && !t.canSell ? 'stok girişi yetkiniz yok' : ''].filter(Boolean).join(' · ') || undefined,
      }))}
      filterLocally={false}
      loading={isFetching}
      stale={term.trim() !== search || isFetching}
      onSearchChange={setTerm}
      onOpenChange={setOpen}
      onChange={(id) => {
        const t = list.find((x) => x.id === id);
        if (t) onPick(t);
      }}
    />
  );
}

export const alertBox =
  'rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300';
export const infoBox =
  'rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs text-sky-800 dark:bg-sky-900/30 dark:text-sky-200';
export const warnBox =
  'rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
