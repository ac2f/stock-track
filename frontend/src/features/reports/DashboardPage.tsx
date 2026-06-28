import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchAging,
  fetchDashboard,
  type DashboardFilters,
} from '../../api/reports.api';
import { downloadFile } from '../../api/documents.api';

const fmt = (currency: string) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency });

/**
 * Mali Dashboard (yalnızca İşletme Sahibi). KPI kartları + cari yaşlandırma.
 * Dönem metrikleri tarih aralığına göre; aralık verilmezse içinde bulunulan ay.
 * Mobil: tek/iki sütun kartlar; masaüstü: dört sütun.
 */
export function DashboardPage() {
  const [range, setRange] = useState<DashboardFilters>({});
  const hasRange = !!(range.from || range.to);

  const { data: kpi, isLoading } = useQuery({
    queryKey: ['dashboard', range],
    queryFn: () => fetchDashboard(range),
  });
  const { data: aging } = useQuery({ queryKey: ['aging'], queryFn: fetchAging });

  if (isLoading || !kpi) {
    return <p className="text-slate-400">Yükleniyor…</p>;
  }
  const money = fmt(kpi.baseCurrency);
  const periodPrefix = hasRange ? 'Dönem' : 'Ay';

  const cards = [
    { label: 'Toplam Alacak', value: money.format(kpi.totalReceivable), tone: 'text-red-600' },
    { label: 'Ödenecek (borç + sürekli gider)', value: money.format(kpi.totalPayable), tone: 'text-amber-600' },
    { label: 'Bekleyen Sürekli Gider', value: money.format(kpi.pendingExpenses), tone: kpi.pendingExpenses > 0 ? 'text-amber-600' : 'text-slate-900' },
    { label: 'Bugün Tahsilat', value: money.format(kpi.todayCollected), tone: 'text-emerald-600' },
    { label: `${periodPrefix} Tahsilat`, value: money.format(kpi.monthCollected), tone: 'text-emerald-600' },
    { label: `${periodPrefix} İşleme Cirosu`, value: money.format(kpi.monthProcessingRevenue), tone: 'text-slate-900' },
    { label: `${periodPrefix} Satış Cirosu`, value: money.format(kpi.monthSalesTurnover), tone: 'text-slate-900' },
    { label: `${periodPrefix} Satış Kârı`, value: money.format(kpi.monthSalesMargin), tone: 'text-slate-900' },
    { label: 'Kritik Stok', value: String(kpi.criticalStockCount), tone: kpi.criticalStockCount > 0 ? 'text-red-600' : 'text-slate-900' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Mali Dashboard</h1>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn bg-slate-100 text-sm"
            onClick={() => downloadFile('/reports/aging.xlsx', 'yaslandirma.xlsx')}
          >
            ⬇ Yaşlandırma
          </button>
          <button
            className="btn bg-slate-100 text-sm"
            onClick={() =>
              downloadFile('/reports/profit-loss.xlsx', 'kar-zarar.xlsx')
            }
          >
            ⬇ Kâr-Zarar
          </button>
          <button
            className="btn bg-slate-100 text-sm"
            onClick={() =>
              downloadFile('/reports/stock-value.xlsx', 'stok-degeri.xlsx')
            }
          >
            ⬇ Stok Değeri
          </button>
        </div>
      </div>

      {/* Dönem filtresi — tahsilat/ciro/kâr metriklerini tarih aralığına göre. */}
      <div className="card flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Başlangıç</span>
          <input
            className="input"
            type="date"
            value={range.from ?? ''}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value || undefined }))}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Bitiş</span>
          <input
            className="input"
            type="date"
            value={range.to ?? ''}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value || undefined }))}
          />
        </label>
        <span className="text-xs text-slate-400">
          {hasRange ? 'Seçili döneme göre' : 'Dönem: içinde bulunulan ay'}
        </span>
        {hasRange && (
          <button
            className="text-xs text-slate-500 underline"
            onClick={() => setRange({})}
          >
            Temizle
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className={`mt-1 text-lg font-semibold ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-3 font-semibold">Cari Yaşlandırma</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-1">Müşteri</th>
              <th className="py-1 text-right">0–30</th>
              <th className="py-1 text-right">31–60</th>
              <th className="py-1 text-right">61–90</th>
              <th className="py-1 text-right">90+</th>
              <th className="py-1 text-right">Toplam</th>
            </tr>
          </thead>
          <tbody>
            {aging?.map((row) => (
              <tr key={row.customerId} className="border-t border-slate-100">
                <td className="py-1">{row.customerName}</td>
                <td className="py-1 text-right">{money.format(row.current)}</td>
                <td className="py-1 text-right">{money.format(row.days31to60)}</td>
                <td className="py-1 text-right">{money.format(row.days61to90)}</td>
                <td className="py-1 text-right text-red-600">{money.format(row.over90)}</td>
                <td className="py-1 text-right font-semibold">{money.format(row.total)}</td>
              </tr>
            ))}
            {!aging?.length && (
              <tr>
                <td colSpan={6} className="py-3 text-center text-slate-400">
                  Açık bakiye yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
