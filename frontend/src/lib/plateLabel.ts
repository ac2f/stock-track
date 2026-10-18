import type { PlateBrief } from '../types';

/** Kalan (kesilmiş) m² — yalnızca tabaka (AREA) malzemede anlamlı. */
export function plateRemainingM2(plate: Pick<PlateBrief, 'widthMm' | 'heightMm'>): number | null {
  const w = Number(plate.widthMm);
  const h = Number(plate.heightMm);
  if (!w || !h) return null;
  return (w / 1000) * (h / 1000);
}

/**
 * Tabaka malzemenin kalan ebat bilgisi: "Kalan: 1350x1000 1.35m²".
 * AREA dışı tip veya ebat yoksa null döner.
 */
export function plateRemainingLabel(
  plate: Pick<PlateBrief, 'measurementType' | 'widthMm' | 'heightMm'>,
): string | null {
  if (plate.measurementType && plate.measurementType !== 'area') return null;
  const m2 = plateRemainingM2(plate);
  if (m2 == null) return null;
  return `Kalan: ${Number(plate.widthMm)}x${Number(plate.heightMm)} ${m2.toFixed(2)}m²`;
}

/**
 * Liste/açılır menüde tek satırlık plaka etiketi:
 * "Pleksi[XXXX] 2.8x1350x2000 · Kalan: 1350x1000 1.35m²".
 * Kalan ebat hesaplanamazsa yalnızca ad döner.
 */
export function plateLabel(plate: PlateBrief): string {
  const rem = plateRemainingLabel(plate);
  return rem ? `${plate.name} · ${rem}` : plate.name;
}

/**
 * Tabaka KESİLMİŞ mi? (kalan ebat, türün standart tabaka ebadından küçük)
 * Şerit/rulo (AREA dışı) veya standart ebat tanımsızsa false — vurgulanmaz.
 */
export function isPartialSheet(
  plate: Pick<PlateBrief, 'measurementType' | 'widthMm' | 'heightMm' | 'template'>,
): boolean {
  if (plate.measurementType && plate.measurementType !== 'area') return false;
  const std = plate.template?.defaultSize;
  if (!std) return false;
  const w = Number(plate.widthMm);
  const h = Number(plate.heightMm);
  if (!w || !h) return false;
  return w < Number(std.widthMm) || h < Number(std.heightMm);
}

/** Ölçü değeri → okunur metin ("1350", "2.8"); boş/sıfır ise null. */
function dim(value: unknown): string | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? String(n) : null;
}

/** Ölçü kalıbındaki tek değer: sayı ya da eksik ("—"). */
const DIM_TOKEN = '([\\d.,]+|—)';
const DIMS_RE = new RegExp(`(^|\\s)${DIM_TOKEN}x${DIM_TOKEN}x${DIM_TOKEN}(?=\\s|$)`, 'g');

/**
 * Otomatik üretilmiş addaki "—" yer tutucularını temizler (yalnız GÖSTERİM).
 * Sunucu eksik marka/renk/ebadı "—" ile doldurur: "Pleksi —[—] —x—x—".
 *   "Pleksi —[—] 3x—x—"         → "Pleksi 3 mm"
 *   "Mega[—] —x1350x2000"       → "Mega 1350x2000"
 *   "—[Kırmızı 12] 2.8x1350x2000" → "[Kırmızı 12] 2.8x1350x2000"
 * Yer tutucu yoksa ad olduğu gibi döner.
 */
export function stripNamePlaceholders(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  if (!s.includes('—')) return s;
  return s
    .replace(DIMS_RE, (_m, lead: string, t: string, w: string, h: string) => {
      const ok = (v: string) => v !== '—';
      if (ok(t) && ok(w) && ok(h)) return `${lead}${t}x${w}x${h}`;
      const size = ok(w) && ok(h) ? `${w}x${h}` : '';
      const thick = ok(t) ? `${t} mm` : '';
      return `${lead}${[size, thick].filter(Boolean).join(' ')}`;
    })
    .replace(/\[\s*—\s*\]/g, '') // boş renk: "[—]"
    .replace(/(^|\s)—(?=\[)/g, '$1') // eksik marka: "—[Renk]"
    .replace(/(^|\s)—(?=\s|$)/g, '$1') // kalan tek başına "—"
    .replace(/\s+/g, ' ')
    .replace(/(\s*·\s*)+/g, ' · ') // boşalan "a ·  · b" ayraçları
    .replace(/^\s*·\s*|\s*·\s*$/g, '')
    .trim();
}

/** Liste başlığı için kısa ölçü: "3 mm · 1350×2000 mm" (eksikler atlanır). */
export function plateSizeSummary(
  plate: Pick<PlateBrief, 'measurementType' | 'widthMm' | 'heightMm' | 'thicknessMm'>,
): string {
  const w = dim(plate.widthMm);
  const h = dim(plate.heightMm);
  const t = dim(plate.thicknessMm);
  const size =
    plate.measurementType === 'length'
      ? h
        ? `${h} mm yükseklik`
        : ''
      : w && h
        ? `${w}×${h} mm`
        : '';
  return [t ? `${t} mm` : '', size].filter(Boolean).join(' · ');
}

/**
 * Kartlarda gösterilecek temiz başlık (veri DEĞİŞMEZ). Addaki "—" yer
 * tutucuları atılır; geriye anlamlı bir şey kalmazsa (boş ya da yalnız tür adı)
 * şablon/tür adı + ölçülere düşülür: "Pleksi · 3 mm · 1350×2000 mm".
 */
export function displayPlateName(
  plate: Pick<PlateBrief, 'name' | 'measurementType' | 'widthMm' | 'heightMm' | 'thicknessMm'> & {
    template?: { name?: string | null; category?: { name?: string | null } | null } | null;
  },
): string {
  const cleaned = stripNamePlaceholders(plate.name);
  const category = plate.template?.category?.name?.trim() ?? '';
  const same = (a: string, b: string) => a.toLocaleLowerCase('tr') === b.toLocaleLowerCase('tr');
  if (cleaned && !(category && same(cleaned, category))) return cleaned;
  const base = stripNamePlaceholders(plate.template?.name) || category || cleaned || 'Malzeme';
  const size = plateSizeSummary(plate);
  return size ? `${base} · ${size}` : base;
}
