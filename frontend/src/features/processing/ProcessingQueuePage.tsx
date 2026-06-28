import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  fetchProcessingHistory,
  fetchQueue,
  setProcessingStatus,
} from '../../api/processing.api';
import { openPdf } from '../../api/documents.api';
import { plateRemainingLabel } from '../../lib/plateLabel';
import type { ProcessingStatus } from '../../types';

const money = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
});

const STATUS_LABELS: Record<string, string> = {
  pending: 'Bekliyor',
  in_progress: 'İşleniyor',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
};

/** #8a Geçmiş üretim işleri — tarih aralığı + durum ile sorgulanır. */
function ProcessingHistory() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState<'' | ProcessingStatus>('completed');

  const { data } = useQuery({
    queryKey: ['processing-history', from, to, status],
    queryFn: () =>
      fetchProcessingHistory({
        from,
        to,
        status: status || undefined,
        page: 1,
        limit: 100,
      }),
  });

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-500">Geçmiş işler</h2>
      <div className="card grid grid-cols-3 gap-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Başlangıç</span>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Bitiş</span>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Durum</span>
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value as '' | ProcessingStatus)}
          >
            <option value="">Tümü</option>
            <option value="completed">Tamamlandı</option>
            <option value="cancelled">İptal</option>
            <option value="pending">Bekliyor</option>
            <option value="in_progress">İşleniyor</option>
          </select>
        </label>
      </div>
      {data?.items.map((job) => (
        <div key={job.id} className="card flex items-center justify-between">
          <div>
            <p className="font-medium">{job.plate?.name ?? '—'}</p>
            <p className="text-sm text-slate-500">
              {job.processedAt?.slice(0, 10)} · {job.customer?.name ?? 'Müşterisiz'} ·{' '}
              {STATUS_LABELS[job.status] ?? job.status}
            </p>
            {job.plate && plateRemainingLabel(job.plate) && (
              <p className="text-xs text-slate-400">{plateRemainingLabel(job.plate)}</p>
            )}
          </div>
          <span className="font-semibold">{money.format(Number(job.totalCost))}</span>
        </div>
      ))}
      {!data?.items.length && <p className="text-slate-400">Bu aralıkta iş yok.</p>}
    </div>
  );
}

const unitLabel: Record<string, string> = {
  area: 'm²',
  length: 'm',
  piece: 'adet',
  weight: 'kg',
};

/**
 * Üretim Kuyruğu — bekleyen/işlenen işler makineye göre gruplu. Çalışan işi
 * "Başlat" / "Tamamla" / "İptal" ile ilerletir; tamamlamada stok düşer ve
 * (ertelenmişse) cariye borç yazılır.
 */
export function ProcessingQueuePage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['queue'],
    queryFn: () => fetchQueue(),
  });

  const mut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProcessingStatus }) =>
      setProcessingStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  if (isLoading) return <p className="text-slate-400">Yükleniyor…</p>;

  const groups = data ?? [];
  const empty = groups.every((g) => g.jobs.length === 0);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Üretim Kuyruğu</h1>

      {mut.isError && (
        <p className="card text-sm text-red-600">
          {(mut.error as { response?: { data?: { message?: string } } })?.response
            ?.data?.message ?? 'İşlem güncellenemedi.'}
        </p>
      )}

      {empty && <p className="text-slate-400">Kuyrukta bekleyen iş yok.</p>}

      {groups.map((group) => (
        <div key={group.machineId ?? 'unassigned'} className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-500">
            🛠️ {group.machineName}
          </h2>
          {group.jobs.map((job) => (
            <div key={job.id} className="card space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{job.plate?.name ?? '—'}</p>
                  <p className="text-sm text-slate-500">
                    {job.customer?.name ?? 'Müşterisiz'} ·{' '}
                    {job.quantityValue} {unitLabel[job.billingUnit] ?? ''}
                  </p>
                  {job.plate && plateRemainingLabel(job.plate) && (
                    <p className="text-xs text-slate-400">
                      {plateRemainingLabel(job.plate)}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                      job.status === 'in_progress'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {job.status === 'in_progress' ? 'İşleniyor' : 'Bekliyor'}
                  </span>
                  <p className="mt-1 font-semibold">
                    {money.format(job.totalCost)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {job.status === 'pending' && (
                  <button
                    className="btn bg-blue-600 text-white"
                    disabled={mut.isPending}
                    onClick={() =>
                      mut.mutate({ id: job.id, status: 'in_progress' })
                    }
                  >
                    Başlat
                  </button>
                )}
                <button
                  className="btn bg-emerald-600 text-white"
                  disabled={mut.isPending}
                  onClick={() => mut.mutate({ id: job.id, status: 'completed' })}
                >
                  Tamamla
                </button>
                <button
                  className="btn bg-slate-100"
                  disabled={mut.isPending}
                  onClick={() => mut.mutate({ id: job.id, status: 'cancelled' })}
                >
                  İptal
                </button>
                <button
                  className="btn bg-slate-100"
                  onClick={() => openPdf(`/processing/${job.id}/print`)}
                >
                  Fiş
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}

      <ProcessingHistory />
    </div>
  );
}
