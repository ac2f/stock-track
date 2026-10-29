import type { ProcessingJob, ProcessingQueueGroup } from '../types';

/**
 * Üretim kuyruğunu gruplama biçimleri:
 *  - machine       makineye göre (sunucunun gruplaması)
 *  - customer      müşteriye göre
 *  - category      ürün türüne göre (Dekota, Pleksi… — malzeme kategorisi)
 *  - template      malzemeye göre (aynı ürün: "Akrilik 3 mm Şeffaf"…)
 *  - customer-category  önce müşteri, her müşterinin içinde ürün türü
 */
export type QueueGroupBy = 'machine' | 'customer' | 'category' | 'template' | 'customer-category';

export const QUEUE_GROUP_OPTIONS: { value: QueueGroupBy; label: string }[] = [
  { value: 'machine', label: 'Makineye göre' },
  { value: 'customer', label: 'Müşteriye göre' },
  { value: 'category', label: 'Ürün türüne göre (Dekota, Pleksi…)' },
  { value: 'template', label: 'Malzemeye göre (aynı ürün)' },
  { value: 'customer-category', label: 'Müşteri › ürün türü' },
];

export interface QueueSubGroup {
  key: string;
  title: string;
  jobs: ProcessingJob[];
}

export interface QueueGroupNode extends QueueSubGroup {
  /** İki düzeyli gruplamada alt gruplar (jobs hepsinin birleşimidir). */
  children?: QueueSubGroup[];
}

const NO_CUSTOMER = 'Müşterisiz';
const NO_CATEGORY = 'Diğer';
const NO_TEMPLATE = 'Ürün türü belirsiz';

export const customerOf = (j: ProcessingJob): string => j.customer?.name?.trim() || NO_CUSTOMER;
export const categoryOf = (j: ProcessingJob): string =>
  j.plate?.template?.category?.name?.trim() || NO_CATEGORY;
export const templateOf = (j: ProcessingJob): string =>
  j.plate?.template?.name?.trim() || j.plate?.name?.trim() || NO_TEMPLATE;

function bucket(jobs: ProcessingJob[], keyOf: (j: ProcessingJob) => string): QueueSubGroup[] {
  const map = new Map<string, ProcessingJob[]>();
  for (const j of jobs) {
    const k = keyOf(j);
    const arr = map.get(k);
    if (arr) arr.push(j);
    else map.set(k, [j]);
  }
  // Adı olmayan ("Müşterisiz", "Diğer"…) gruplar sona; kalanlar Türkçe sırayla.
  const last = new Set([NO_CUSTOMER, NO_CATEGORY, NO_TEMPLATE]);
  return [...map.entries()]
    .sort(([a], [b]) => Number(last.has(a)) - Number(last.has(b)) || a.localeCompare(b, 'tr'))
    .map(([key, js]) => ({ key, title: key, jobs: js }));
}

export function groupQueue(groups: ProcessingQueueGroup[], by: QueueGroupBy): QueueGroupNode[] {
  if (by === 'machine') {
    return groups
      .filter((g) => g.jobs.length)
      .map((g) => ({
        key: g.machineId ?? 'unassigned',
        title: `🛠️ ${g.machineName}`,
        jobs: g.jobs,
      }));
  }
  const all = groups.flatMap((g) => g.jobs);
  if (by === 'customer') return bucket(all, customerOf);
  if (by === 'category') return bucket(all, categoryOf);
  if (by === 'template') return bucket(all, templateOf);
  return bucket(all, customerOf).map((c) => ({ ...c, children: bucket(c.jobs, categoryOf) }));
}

/** Gruptaki işlerin toplam tutarı (tek para birimi varsayılır; karışıksa null). */
export function groupTotal(jobs: ProcessingJob[]): { total: number; currency: string } | null {
  const currencies = new Set(jobs.map((j) => j.currency));
  if (currencies.size !== 1) return null;
  return {
    total: jobs.reduce((s, j) => s + Number(j.totalCost || 0), 0),
    currency: [...currencies][0],
  };
}
