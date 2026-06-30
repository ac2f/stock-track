import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  fetchProcessingHistory,
  fetchQueue,
  setProcessingStatus,
} from '../../api/processing.api';
import { openPdf } from '../../api/documents.api';
import { fetchSales, type Sale } from '../../api/sales.api';
import { plateRemainingLabel } from '../../lib/plateLabel';
import type { ProcessingJob, ProcessingStatus } from '../../types';

/** Bir satış kaleminin ölçüsü: tabaka ise m², değilse adet. */
function saleItemMeasure(it: {
  widthMm?: number | null;
  heightMm?: number | null;
  quantity: number;
}): string {
  const w = Number(it.widthMm);
  const h = Number(it.heightMm);
  if (w && h) {
    const m2 = (w / 1000) * (h / 1000) * Number(it.quantity);
    return `${m2.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} m²`;
  }
  return `${it.quantity} adet`;
}

/**
 * #2 Malzeme satışları — üretim kuyruğu ekranında işleme işlerinin yanında
 * malzeme satışları da görünür. Son 30 gün; her satış için fiş (yazdır) düğmesi.
 */
function RecentSales() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const { data } = useQuery({
    queryKey: ['sales', monthAgo, today],
    queryFn: () => fetchSales({ from: monthAgo, to: today, page: 1, limit: 100 }),
  });
  const sales: Sale[] = data?.items ?? [];
  // #D Malzeme satışlarından toplam kâr (işletme payı = satış − sahip payı;
  // kendi malında tüm satış, konsinyede komisyon).
  const totalProfit = sales.reduce((s, x) => s + Number(x.businessMargin || 0), 0);
  const totalSales = sales.reduce((s, x) => s + Number(x.saleTotal || 0), 0);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-500">
          🧾 Malzeme satışları (son 30 gün)
        </h2>
        {sales.length > 0 && (
          <span className="text-xs text-slate-500">
            Ciro: <span className="font-semibold">{money.format(totalSales)}</span>{' '}
            · Kâr:{' '}
            <span className="font-semibold text-emerald-700">
              {money.format(totalProfit)}
            </span>
          </span>
        )}
      </div>
      {sales.map((s) => (
        <div key={s.id} className="card space-y-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{s.buyerCustomer?.name ?? '—'}</p>
              <p className="text-xs text-slate-500">{s.saleDate?.slice(0, 10)}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <span className="block font-semibold">
                  {money.format(Number(s.saleTotal))}
                </span>
                <span className="block text-xs text-emerald-700">
                  kâr {money.format(Number(s.businessMargin || 0))}
                </span>
              </div>
              <button
                className="btn bg-slate-100 text-xs"
                onClick={() => openPdf(`/sales/${s.id}/print`)}
              >
                Fiş
              </button>
            </div>
          </div>
          <ul className="text-xs text-slate-600">
            {s.items.map((it, idx) => (
              <li key={idx} className="flex justify-between">
                <span>
                  {it.plate?.name ?? '—'} · {saleItemMeasure(it)} ×{' '}
                  {money.format(Number(it.unitPrice))}
                </span>
                <span>{money.format(Number(it.lineTotal))}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {!sales.length && (
        <p className="text-slate-400">Son 30 günde malzeme satışı yok.</p>
      )}
    </div>
  );
}

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
    mutationFn: ({
      id,
      status,
      finalAmount,
    }: {
      id: string;
      status: ProcessingStatus;
      finalAmount?: number;
    }) => setProcessingStatus(id, status, finalAmount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      // İptalde tabaka kalan ebadı, tamamlamada stok değişir → stok listesi tazelensin.
      qc.invalidateQueries({ queryKey: ['plates'] });
      // Tamamlanan/iptal edilen iş geçmiş listesine düşsün (#3).
      qc.invalidateQueries({ queryKey: ['processing-history'] });
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
            <QueueJobCard
              key={job.id}
              job={job}
              pending={mut.isPending}
              onAction={(status, finalAmount) =>
                mut.mutate({ id: job.id, status, finalAmount })
              }
            />
          ))}
        </div>
      ))}

      <RecentSales />

      <ProcessingHistory />
    </div>
  );
}

/**
 * Kuyruktaki tek iş kartı. "Tamamla"da iş bitiminde müşteriyle pazarlık edilen
 * NİHAİ fiyat girilebilir; girilirse faturalama o tutar üzerinden yapılır ve işin
 * güncel ücreti olarak görünür. Boş bırakılırsa hesaplanan ücret kullanılır.
 */
function QueueJobCard({
  job,
  pending,
  onAction,
}: {
  job: ProcessingJob;
  pending: boolean;
  onAction: (status: ProcessingStatus, finalAmount?: number) => void;
}) {
  const [finalPrice, setFinalPrice] = useState('');
  const remaining = job.plate && plateRemainingLabel(job.plate);
  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{job.plate?.name ?? '—'}</p>
          <p className="text-sm text-slate-500">
            {job.customer?.name ?? 'Müşterisiz'} · {job.quantityValue}{' '}
            {unitLabel[job.billingUnit] ?? ''}
          </p>
          {remaining && <p className="text-xs text-slate-400">{remaining}</p>}
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
          <p className="mt-1 font-semibold">{money.format(job.totalCost)}</p>
        </div>
      </div>

      {/* İş bitimi pazarlık fiyatı (opsiyonel) */}
      <div className="flex items-center gap-2">
        <input
          className="input w-40"
          type="number"
          min={0}
          placeholder={`Nihai fiyat (ops.) ${money.format(job.totalCost)}`}
          value={finalPrice}
          onChange={(e) => setFinalPrice(e.target.value)}
        />
        <span className="text-xs text-slate-400">
          Boş = hesaplanan ücret
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {job.status === 'pending' && (
          <button
            className="btn bg-blue-600 text-white"
            disabled={pending}
            onClick={() => onAction('in_progress')}
          >
            Başlat
          </button>
        )}
        <button
          className="btn bg-emerald-600 text-white"
          disabled={pending}
          onClick={() =>
            onAction(
              'completed',
              finalPrice !== '' ? Number(finalPrice) : undefined,
            )
          }
        >
          Tamamla
        </button>
        <button
          className="btn bg-slate-100"
          disabled={pending}
          onClick={() => onAction('cancelled')}
        >
          İptal
        </button>
        <button
          className="btn bg-slate-100"
          onClick={() => openPdf(`/processing/${job.id}/print`)}
        >
          Fiş
        </button>
        {job.quoteId && (
          <button
            className="btn bg-slate-100"
            title="Bu işin kaynak teklifini aç"
            onClick={() => openPdf(`/quotes/${job.quoteId}/print`)}
          >
            Teklif
          </button>
        )}
      </div>
    </div>
  );
}
