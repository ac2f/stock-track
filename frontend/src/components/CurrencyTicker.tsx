import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCurrencyTicker, syncCurrencyRates } from '../api/currency.api';
import { useAuth } from '../context/AuthContext';

/** Kurun ne kadar eski olduğunu insan diliyle söyler. */
function ageLabel(asOf: string | null): string {
  if (!asOf) return 'kur yok';
  const hours = (Date.now() - new Date(asOf).getTime()) / 3_600_000;
  if (hours < 1) return 'az önce';
  if (hours < 24) return `${Math.round(hours)} saat önce`;
  return `${Math.round(hours / 24)} gün önce`;
}

/**
 * Üst şeritte sürekli görünen döviz kurları (USD, EUR).
 *
 * Kurlar sunucuda günlük olarak açık bir API'den çekilir; burada yalnızca
 * gösterilir ve 10 dakikada bir tazelenir. İşletme Sahibi kur rozetine
 * tıklayarak anında yeniden çekilmesini isteyebilir.
 */
const SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };

export function CurrencyTicker({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const { data } = useQuery({
    queryKey: ['currency-ticker'],
    queryFn: () => fetchCurrencyTicker(),
    // Kur günlük güncellenir; 10 dakikada bir tazelemek fazlasıyla yeterli.
    refetchInterval: 10 * 60_000,
    staleTime: 5 * 60_000,
  });

  const syncMut = useMutation({
    mutationFn: syncCurrencyRates,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['currency-ticker'] }),
  });

  if (!data?.rates.length) return null;

  const isOwner = hasRole('owner');
  const stale = data.rates.some(
    (r) => !r.asOf || Date.now() - new Date(r.asOf).getTime() > 48 * 3_600_000,
  );

  return (
    <div
      className={`flex items-center gap-1.5 ${compact ? 'flex-col items-end gap-0.5' : 'flex-wrap'} ${className}`}
      title={
        isOwner
          ? 'Kurları şimdi güncellemek için tıklayın'
          : 'Güncel döviz kurları'
      }
    >
      {data.rates.map((r) => (
        <button
          key={r.currency}
          type="button"
          disabled={!isOwner || syncMut.isPending}
          onClick={() => isOwner && syncMut.mutate()}
          className={`rounded-lg font-semibold tabular-nums ${compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs'} ${
            stale
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
          } ${isOwner ? 'hover:bg-slate-200 dark:hover:bg-slate-700' : ''}`}
          title={`${r.currency}/${data.baseCurrency} · ${ageLabel(r.asOf)}${
            r.source === 'manual' ? ' · elle girildi' : ''
          }`}
        >
          {compact ? SYMBOL[r.currency] ?? r.currency : r.currency}{' '}
          {r.rate != null ? (
            <span className="font-bold">
              {r.rate.toLocaleString('tr-TR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </button>
      ))}
      {syncMut.isPending && (
        <span className="text-[10px] text-slate-400">güncelleniyor…</span>
      )}
    </div>
  );
}
