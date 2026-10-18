/**
 * Okunur biçimler: tarih "17.10.2026", tutar "₺1.250,00", göreli gün "dün".
 * Sunucudan gelen YYYY-MM-DD (ya da ISO) değerler yerel tarih olarak okunur.
 */
const moneyCache = new Map<string, Intl.NumberFormat>();

export function formatMoney(value: number | string | null | undefined, currency = 'TRY'): string {
  const n = Number(value ?? 0);
  let f = moneyCache.get(currency);
  if (!f) {
    try {
      f = new Intl.NumberFormat('tr-TR', { style: 'currency', currency });
    } catch {
      f = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    moneyCache.set(currency, f);
  }
  return f.format(Number.isFinite(n) ? n : 0);
}

export function formatNumber(value: number | string | null | undefined, digits = 2): string {
  const n = Number(value ?? 0);
  return (Number.isFinite(n) ? n : 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

/** "2026-10-17" ya da ISO zaman damgası → Date (yalnız tarihse yerel gece yarısı). */
export function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 17.10.2026 */
export function formatDate(value: string | Date | null | undefined, fallback = '—'): string {
  const d = parseDate(value);
  return d ? d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : fallback;
}

/** 17.10.2026 14:05 */
export function formatDateTime(value: string | Date | null | undefined, fallback = '—'): string {
  const d = parseDate(value);
  return d
    ? d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : fallback;
}

/** "bugün", "dün", "3 gün önce", "yarın" — yoksa tarih. */
export function relativeDay(value: string | Date | null | undefined): string {
  const d = parseDate(value);
  if (!d) return '—';
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(d)) / 86_400_000);
  if (diff === 0) return 'bugün';
  if (diff === 1) return 'dün';
  if (diff === -1) return 'yarın';
  if (diff > 1 && diff < 7) return `${diff} gün önce`;
  return formatDate(d);
}

/** Yerel tarih → "YYYY-MM-DD" (input[type=date] ve API için). */
export function toIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
