import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchAging,
  fetchDashboard,
  type DashboardFilters,
} from '../../api/reports.api';
import { downloadFile, openPdf } from '../../api/documents.api';
import { PageHeader } from '../../components/ui/PageHeader';
import { DateRangeFilter } from '../../components/ui/DateRangeFilter';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatDate } from '../../lib/format';
import type { CustomerAging, DashboardSummary } from '../../types';

const fmt = (currency: string) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency });

interface Kpi {
  label: string;
  value: string;
  tone: string;
  icon: string;
}
interface KpiGroup {
  title: string;
  icon: string;
  /** Simge zemini (grubun rengi). */
  iconBg: string;
  cards: Kpi[];
}

/*
 * Yerleşim: geniş ekranda tek bir 3 sütunluk ızgara. Üç kartlı gruplar bir
 * satırı doldurur; "Tahsilat" (2) ile "Stok" (1) aynı satırı paylaşır, böylece
 * bütün kartlar aynı genişlikte ve alt alta hizalı kalır. Telefonda kartlar
 * ikişer; üç kartlı grubun ilk (ana) kartı tam genişliktir.
 */
const SPAN: Record<number, string> = {
  1: 'sm:col-span-1',
  2: 'sm:col-span-2',
  3: 'sm:col-span-3',
};
const COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
};

/**
 * Mali Dashboard (yalnızca İşletme Sahibi). KPI kartları + cari yaşlandırma.
 * Dönem metrikleri tarih aralığına göre; aralık verilmezse içinde bulunulan ay.
 * Mobil: tek/iki sütun kartlar; masaüstü: gruplar yan yana.
 */
export function DashboardPage() {
  const [range, setRange] = useState<DashboardFilters>({});
  const hasRange = !!(range.from || range.to);

  const { data: kpi, isLoading, isError } = useQuery({
    queryKey: ['dashboard', range],
    queryFn: () => fetchDashboard(range),
  });
  const { data: aging, isLoading: agingLoading } = useQuery({ queryKey: ['aging'], queryFn: fetchAging });

  // Yaşlandırma tutarları işletmenin ana para birimiyle gösterilir; dönem
  // değişip KPI yeniden yüklenirken tablo yanıp sönmesin diye son bilinen birim tutulur.
  const currencyRef = useRef<string>();
  if (kpi) currencyRef.current = kpi.baseCurrency;

  const periodPrefix = hasRange ? 'Dönem' : 'Ay';
  const rangeText = hasRange
    ? `${range.from ? formatDate(range.from) : '…'} – ${range.to ? formatDate(range.to) : 'bugün'}`
    : 'içinde bulunulan ay';

  const exportButtons = (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Dışa aktar">
      <button
        className="btn-secondary btn-sm"
        onClick={() => {
          const q = new URLSearchParams();
          if (range.from) q.set('from', range.from);
          if (range.to) q.set('to', range.to);
          const s = q.toString();
          openPdf(`/reports/financial/print${s ? `?${s}` : ''}`);
        }}
      >
        🖨 Yazdır / PDF
      </button>
      <button
        className="btn-secondary btn-sm"
        onClick={() => downloadFile('/reports/aging.xlsx', 'yaslandirma.xlsx')}
      >
        ⬇ Yaşlandırma
      </button>
      <button
        className="btn-secondary btn-sm"
        onClick={() => downloadFile('/reports/profit-loss.xlsx', 'kar-zarar.xlsx')}
      >
        ⬇ Kâr-Zarar
      </button>
      <button
        className="btn-secondary btn-sm"
        onClick={() => downloadFile('/reports/stock-value.xlsx', 'stok-degeri.xlsx')}
      >
        ⬇ Stok Değeri
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mali Dashboard"
        icon="📊"
        subtitle="Alacak, borç, tahsilat ve ciro bir bakışta. Dönem metrikleri seçtiğiniz tarih aralığına göre hesaplanır."
        actions={exportButtons}
      />

      {/* Dönem filtresi — tahsilat/ciro/kâr metriklerini tarih aralığına göre. */}
      <div className="card space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">Dönem</h2>
          <span className="text-xs text-slate-500">
            {hasRange ? 'Seçili döneme göre' : 'Dönem: içinde bulunulan ay'}
            {hasRange && <span className="tabular-nums"> · {rangeText}</span>}
          </span>
        </div>
        <DateRangeFilter
          value={range}
          onChange={(r) => setRange({ from: r.from, to: r.to })}
          hint="Boş bırakılırsa içinde bulunulan ay gösterilir."
        />
      </div>

      {isError && !kpi ? (
        <EmptyState
          compact
          icon="⚠️"
          title="Veriler yüklenemedi"
          hint="Bağlantınızı kontrol edip sayfayı yenileyin."
        />
      ) : isLoading || !kpi ? (
        <KpiSkeleton />
      ) : (
        <KpiGroups groups={buildGroups(kpi, periodPrefix)} />
      )}

      <AgingTable
        rows={aging}
        loading={agingLoading || (!currencyRef.current && !isError)}
        currency={currencyRef.current ?? 'TRY'}
      />
    </div>
  );
}

/** KPI'ları anlamlarına göre gruplar; etiketler ve renk kuralları korunur. */
function buildGroups(kpi: DashboardSummary, periodPrefix: string): KpiGroup[] {
  const money = fmt(kpi.baseCurrency);
  return [
    {
      title: 'Alacak ve borç',
      icon: '⚖️',
      iconBg: 'bg-rose-50 dark:bg-rose-900/30',
      cards: [
        { icon: '📥', label: 'Toplam Alacak', value: money.format(kpi.totalReceivable), tone: 'text-red-600' },
        { icon: '📤', label: 'Ödenecek (borç + sürekli gider)', value: money.format(kpi.totalPayable), tone: 'text-amber-600' },
        { icon: '⏰', label: 'Bekleyen Sürekli Gider', value: money.format(kpi.pendingExpenses), tone: kpi.pendingExpenses > 0 ? 'text-amber-600' : 'text-slate-900' },
      ],
    },
    {
      title: 'Tahsilat',
      icon: '💰',
      iconBg: 'bg-emerald-50 dark:bg-emerald-900/30',
      cards: [
        { icon: '📅', label: 'Bugün Tahsilat', value: money.format(kpi.todayCollected), tone: 'text-emerald-600' },
        { icon: '🗓️', label: `${periodPrefix} Tahsilat`, value: money.format(kpi.monthCollected), tone: 'text-emerald-600' },
      ],
    },
    {
      title: 'Stok',
      icon: '📦',
      iconBg: 'bg-amber-50 dark:bg-amber-900/30',
      cards: [
        { icon: '⚠️', label: 'Kritik Stok', value: String(kpi.criticalStockCount), tone: kpi.criticalStockCount > 0 ? 'text-red-600' : 'text-slate-900' },
      ],
    },
    {
      title: 'Ciro ve kâr',
      icon: '📈',
      iconBg: 'bg-blue-50 dark:bg-blue-900/30',
      cards: [
        { icon: '⚙️', label: `${periodPrefix} İşleme Cirosu`, value: money.format(kpi.monthProcessingRevenue), tone: 'text-slate-900' },
        { icon: '🧾', label: `${periodPrefix} Satış Cirosu`, value: money.format(kpi.monthSalesTurnover), tone: 'text-slate-900' },
        { icon: '💹', label: `${periodPrefix} Satış Kârı`, value: money.format(kpi.monthSalesMargin), tone: 'text-slate-900' },
      ],
    },
  ];
}

function KpiGroups({ groups }: { groups: KpiGroup[] }) {
  return (
    <div className="grid gap-x-3 gap-y-5 sm:grid-cols-3">
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title} className={`min-w-0 space-y-2 ${SPAN[g.cards.length] ?? SPAN[3]}`}>
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span aria-hidden>{g.icon}</span>
            {g.title}
          </h2>
          <div className={`grid gap-3 ${COLS[g.cards.length] ?? COLS[3]}`}>
            {g.cards.map((c, i) => (
              <div
                key={c.label}
                className={`card min-w-0 !p-3 sm:!p-4 ${g.cards.length === 3 && i === 0 ? 'col-span-2 sm:col-span-1' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${g.iconBg}`}
                    aria-hidden
                  >
                    {c.icon}
                  </span>
                  <p className="min-w-0 pt-0.5 text-xs font-medium leading-snug text-slate-500">{c.label}</p>
                </div>
                <p className={`mt-2 text-lg font-bold leading-tight tabular-nums [overflow-wrap:anywhere] sm:text-xl ${c.tone}`}>
                  {c.value}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid gap-x-3 gap-y-5 sm:grid-cols-3" role="status" aria-label="Yükleniyor…">
      {[3, 2, 1, 3].map((n, gi) => (
        <div key={gi} className={`space-y-2 ${SPAN[n]}`}>
          <div className="skeleton h-3 w-28" />
          <div className={`grid gap-3 ${COLS[n]}`}>
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className={`card space-y-3 ${n === 3 && i === 0 ? 'col-span-2 sm:col-span-1' : ''}`}>
                <div className="skeleton h-3 w-2/3" />
                <div className="skeleton h-5 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">Yükleniyor…</span>
    </div>
  );
}

/** Cari yaşlandırma tablosu: telefonda kart içinde yatay kayar, altta toplam satırı. */
function AgingTable({
  rows,
  loading,
  currency,
}: {
  rows?: CustomerAging[];
  loading: boolean;
  currency: string;
}) {
  const money = fmt(currency);
  const list = rows ?? [];
  const sum = (k: keyof Omit<CustomerAging, 'customerId' | 'customerName'>) =>
    list.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const totals = {
    current: sum('current'),
    days31to60: sum('days31to60'),
    days61to90: sum('days61to90'),
    over90: sum('over90'),
    total: sum('total'),
  };
  // Sıfır tutarlar soluk: göz yalnız açık bakiyeye takılır.
  const cell = (n: number) => (Number(n) ? '' : 'text-slate-400');

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Cari Yaşlandırma</h2>
        {list.length > 0 && (
          <span className="text-xs text-slate-500">{list.length} müşteri · gün bazında açık bakiye</span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2" role="status" aria-label="Yükleniyor…">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-6 w-full" />
          ))}
        </div>
      ) : !list.length ? (
        <EmptyState compact icon="🎉" title="Açık bakiye yok." hint="Tüm müşterilerin hesabı kapalı görünüyor." />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="sticky left-0 bg-white py-2 pr-3 text-left font-medium">Müşteri</th>
                <th className="whitespace-nowrap px-2 py-2 text-right font-medium">0–30</th>
                <th className="whitespace-nowrap px-2 py-2 text-right font-medium">31–60</th>
                <th className="whitespace-nowrap px-2 py-2 text-right font-medium">61–90</th>
                <th className="whitespace-nowrap px-2 py-2 text-right font-medium">90+</th>
                <th className="whitespace-nowrap py-2 pl-2 text-right font-medium">Toplam</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {list.map((row) => (
                <tr key={row.customerId} className="border-t border-slate-100">
                  <td className="sticky left-0 max-w-[12rem] truncate bg-white py-2 pr-3 font-medium">
                    {row.customerName}
                  </td>
                  <td className={`whitespace-nowrap px-2 py-2 text-right ${cell(row.current)}`}>
                    {money.format(row.current)}
                  </td>
                  <td className={`whitespace-nowrap px-2 py-2 text-right ${cell(row.days31to60)}`}>
                    {money.format(row.days31to60)}
                  </td>
                  <td className={`whitespace-nowrap px-2 py-2 text-right ${cell(row.days61to90)}`}>
                    {money.format(row.days61to90)}
                  </td>
                  <td
                    className={`whitespace-nowrap px-2 py-2 text-right ${
                      Number(row.over90) > 0 ? 'font-semibold text-red-600' : cell(row.over90)
                    }`}
                  >
                    {money.format(row.over90)}
                  </td>
                  <td className="whitespace-nowrap py-2 pl-2 text-right font-semibold">
                    {money.format(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="tabular-nums">
              <tr className="border-t-2 border-slate-200 font-semibold">
                <td className="sticky left-0 bg-white py-2 pr-3">Toplam</td>
                <td className="whitespace-nowrap px-2 py-2 text-right">{money.format(totals.current)}</td>
                <td className="whitespace-nowrap px-2 py-2 text-right">{money.format(totals.days31to60)}</td>
                <td className="whitespace-nowrap px-2 py-2 text-right">{money.format(totals.days61to90)}</td>
                <td className={`whitespace-nowrap px-2 py-2 text-right ${totals.over90 > 0 ? 'text-red-600' : ''}`}>
                  {money.format(totals.over90)}
                </td>
                <td className="whitespace-nowrap py-2 pl-2 text-right">{money.format(totals.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
