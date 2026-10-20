/**
 * Çevrimdışıyken hangi işlemler sıraya alınabilir? Gündelik, birbirinden
 * bağımsız kayıtlar: müşteri, tahsilat, teklif, satış, iş, gider, satın alma,
 * stok girişi. Silme, dönüştürme, ayar ve ekip işlemleri sunucu gerektirir —
 * çevrimdışıyken açık bir uyarıyla reddedilir.
 */
export interface QueueRule {
  method: string;
  pattern: RegExp;
  label: string;
  /** Yeni kayıt açar: geçici bir kimlik verilir, eşzamanlamada gerçeğiyle değişir. */
  creates?: boolean;
}

const ID = '[0-9a-f-]{36}';

const RULES: QueueRule[] = [
  { method: 'post', pattern: /^\/customers$/, label: 'Yeni müşteri', creates: true },
  { method: 'patch', pattern: new RegExp(`^/customers/${ID}$`), label: 'Müşteri düzenleme' },
  { method: 'post', pattern: new RegExp(`^/customers/${ID}/payments$`), label: 'Tahsilat / ödeme', creates: true },
  { method: 'post', pattern: new RegExp(`^/customers/${ID}/(discount|settle)$`), label: 'İndirim / borç kapatma' },
  { method: 'post', pattern: /^\/quotes$/, label: 'Yeni teklif', creates: true },
  { method: 'patch', pattern: new RegExp(`^/quotes/${ID}$`), label: 'Teklif düzenleme' },
  { method: 'patch', pattern: new RegExp(`^/quotes/${ID}/status$`), label: 'Teklif durumu' },
  { method: 'post', pattern: /^\/sales$/, label: 'Satış', creates: true },
  { method: 'post', pattern: /^\/processing$/, label: 'Yeni iş', creates: true },
  { method: 'patch', pattern: new RegExp(`^/processing/${ID}(/status)?$`), label: 'İş güncelleme' },
  { method: 'post', pattern: /^\/expenses$/, label: 'Gider', creates: true },
  { method: 'post', pattern: /^\/purchases$/, label: 'Satın alma', creates: true },
  { method: 'post', pattern: /^\/plates$/, label: 'Stok girişi', creates: true },
];

/** `/customers?x=1` → `/customers` (taban adresten bağımsız yol). */
export function pathOf(url: string | undefined): string {
  if (!url) return '';
  const noQuery = url.split('?')[0];
  const m = noQuery.match(/\/api\/v\d+(\/.*)$/);
  return m ? m[1] : noQuery.startsWith('/') ? noQuery : `/${noQuery}`;
}

export function queueRule(method: string | undefined, url: string | undefined): QueueRule | null {
  const m = (method ?? 'get').toLowerCase();
  const path = pathOf(url);
  return RULES.find((r) => r.method === m && r.pattern.test(path)) ?? null;
}

/**
 * Hangi GET yanıtları cihazda saklanır? Çevrimdışı ekranların okuduğu
 * listeler ve kartlar saklanır. Saklanmayanlar: çevrimdışıyken anlamsız ya
 * da çok sık gelen yanıtlar (fiyat/maliyet hesapları, kuyruk sayacı,
 * Corel durumu ...).
 *
 * Arama yanıtları (`search` / `q` dolu) her harfte ayrı kayıt açmasın diye
 * yolun tek bir "arama havuzuna" katılır ('merge'): çevrimdışı aramada
 * (cacheSearch) daha önce bulunan kayıtlar yine bulunur.
 */
const NO_CACHE: RegExp[] = [
  /^\/health$/,
  /\/pricing$/,
  /\/costs$/,
  /\/retail-suggestions$/,
  /\/prices\/compare$/,
  /^\/processing\/queue\/(count|plate-ids)$/,
  /^\/corel-runners/,
  /^\/exchange-rates\/convert$/,
  /^\/material-catalog\/duplicates$/,
  /^\/backups/,
];

export function cachePolicy(
  path: string,
  params?: Record<string, unknown>,
): 'store' | 'merge' | 'skip' {
  if (NO_CACHE.some((r) => r.test(path))) return 'skip';
  const term = params?.search ?? params?.q;
  if (term !== undefined && term !== null && String(term).trim() !== '') return 'merge';
  return 'store';
}
