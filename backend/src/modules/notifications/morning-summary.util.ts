/**
 * Sabah özeti metni (saf fonksiyon): bekleyen işler, gereken plakalar ve
 * stok durumu, azalan stok, işe dönüşmemiş onaylı teklifler. Telegram'a düz
 * metin gider; 4096 karakter sınırı için uzun listeler kısaltılır.
 */

export interface SummaryJob {
  machine: string | null;
  customer: string | null;
  plate: string;
  quantity: number;
  /** Süreyle faturalanan işte dakika. */
  minutes?: number | null;
}

export interface SummaryNeed {
  plate: string;
  needed: number;
  inStock: number;
}

export interface SummaryLow {
  plate: string;
  inStock: number;
  reorderLevel: number;
}

export interface SummaryQuote {
  quoteNo: string;
  customer: string;
  total: number;
  currency: string;
}

export interface MorningSummaryData {
  business: string;
  date: Date;
  timeZone: string;
  jobs: SummaryJob[];
  needs: SummaryNeed[];
  low: SummaryLow[];
  quotes: SummaryQuote[];
}

const MAX_CHARS = 3900; // Telegram sınırı 4096; pay bırakılır
const MAX_JOBS = 25;

function qty(n: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(n);
}

function money(n: number, currency: string): string {
  return (
    new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n) +
    ' ' +
    currency
  );
}

export function buildMorningSummary(d: MorningSummaryData): string {
  const day = d.date.toLocaleDateString('tr-TR', {
    timeZone: d.timeZone,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const out: string[] = [`☀️ Günaydın — ${day}`, d.business, ''];

  // ── Bekleyen işler, makineye göre ──
  if (d.jobs.length === 0) {
    out.push('🛠 Bekleyen iş yok.');
  } else {
    const totalMin = d.jobs.reduce((s, j) => s + (Number(j.minutes) || 0), 0);
    out.push(
      `🛠 Bekleyen işler (${d.jobs.length})` +
        (totalMin > 0 ? ` · toplam ${qty(totalMin)} dk` : ''),
    );
    const byMachine = new Map<string, SummaryJob[]>();
    for (const j of d.jobs) {
      const key = j.machine || 'Makinesiz';
      byMachine.set(key, [...(byMachine.get(key) ?? []), j]);
    }
    let shown = 0;
    for (const [machine, jobs] of byMachine) {
      out.push(`${machine} (${jobs.length})`);
      for (const j of jobs) {
        if (shown >= MAX_JOBS) break;
        const who = j.customer ? `${j.customer} — ` : '';
        const time = j.minutes ? ` · ${qty(Number(j.minutes))} dk` : '';
        out.push(`• ${who}${j.plate} ×${qty(j.quantity)}${time}`);
        shown++;
      }
    }
    if (d.jobs.length > shown)
      out.push(`… ve ${d.jobs.length - shown} iş daha`);
  }

  // ── Gereken plakalar ──
  if (d.needs.length > 0) {
    out.push('', '📦 Gereken plakalar');
    for (const n of d.needs) {
      const short = n.needed - n.inStock;
      out.push(
        `• ${n.plate} — ${qty(n.needed)} gerekli, stokta ${qty(n.inStock)}` +
          (short > 0 ? ` ⚠️ ${qty(short)} eksik` : ''),
      );
    }
  }

  // ── Azalan stok ──
  if (d.low.length > 0) {
    out.push('', '📉 Azalan stok');
    for (const l of d.low) {
      out.push(
        `• ${l.plate} — ${qty(l.inStock)} (sipariş seviyesi ${qty(l.reorderLevel)})`,
      );
    }
  }

  // ── Onaylı ama işe dönüşmemiş teklifler ──
  if (d.quotes.length > 0) {
    out.push('', `📄 Onaylı, işe dönüşmemiş teklifler (${d.quotes.length})`);
    for (const q of d.quotes) {
      out.push(
        `• ${q.quoteNo} · ${q.customer} · ${money(q.total, q.currency)}`,
      );
    }
  }

  let text = out.join('\n');
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS).replace(/\n[^\n]*$/, '') + '\n…';
  }
  return text;
}

/** "Pleksi 2.8mm Akpolimer Dökme Beyaz 1220x2440" — plaka için kısa ad. */
export function plateText(
  p:
    | {
        name?: string | null;
        brand?: string | null;
        variant?: string | null;
        color?: string | null;
        thicknessMm?: number | string | null;
        widthMm?: number | string | null;
        heightMm?: number | string | null;
        template?: {
          name?: string | null;
          category?: { name?: string | null } | null;
        } | null;
      }
    | null
    | undefined,
): string {
  if (!p) return 'Malzeme';
  const thick = Number(p.thicknessMm);
  const w = Math.round(Number(p.widthMm) || 0);
  const h = Math.round(Number(p.heightMm) || 0);
  const parts = [
    p.template?.category?.name || p.template?.name || p.name,
    thick > 0 ? `${Math.round(thick * 100) / 100}mm` : '',
    p.brand,
    p.variant,
    p.color,
    w && h ? `${w}x${h}` : '',
  ].filter(Boolean);
  return parts.join(' ') || p.name || 'Malzeme';
}
