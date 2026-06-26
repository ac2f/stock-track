import { useQuery } from '@tanstack/react-query';
import { fetchAging, fetchDashboard } from '../../api/reports.api';

const fmt = (currency: string) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency });

/**
 * Mali Dashboard (yalnızca İşletme Sahibi). KPI kartları + cari yaşlandırma.
 * Mobil: tek/iki sütun kartlar; masaüstü: dört sütun.
 */
export function DashboardPage() {
  const { data: kpi, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
  });
  const { data: aging } = useQuery({ queryKey: ['aging'], queryFn: fetchAging });

  if (isLoading || !kpi) {
    return <p className="text-slate-400">Yükleniyor…</p>;
  }
  const money = fmt(kpi.baseCurrency);

  const cards = [
    { label: 'Toplam Alacak', value: money.format(kpi.totalReceivable), tone: 'text-red-600' },
    { label: 'Sahiplere Borç', value: money.format(kpi.totalPayable), tone: 'text-amber-600' },
    { label: 'Bugün Tahsilat', value: money.format(kpi.todayCollected), tone: 'text-emerald-600' },
    { label: 'Ay Tahsilat', value: money.format(kpi.monthCollected), tone: 'text-emerald-600' },
    { label: 'Ay İşleme Cirosu', value: money.format(kpi.monthProcessingRevenue), tone: 'text-slate-900' },
    { label: 'Ay Satış Cirosu', value: money.format(kpi.monthSalesTurnover), tone: 'text-slate-900' },
    { label: 'Ay Satış Kârı', value: money.format(kpi.monthSalesMargin), tone: 'text-slate-900' },
    { label: 'Kritik Stok', value: String(kpi.criticalStockCount), tone: kpi.criticalStockCount > 0 ? 'text-red-600' : 'text-slate-900' },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Mali Dashboard</h1>

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
