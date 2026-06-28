import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchQueue, setProcessingStatus } from '../../api/processing.api';
import { openPdf } from '../../api/documents.api';
import type { ProcessingStatus } from '../../types';

const money = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
});

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
                  onClick={() => openPdf(`/processing/${job.id}/pdf`)}
                >
                  Fiş
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
