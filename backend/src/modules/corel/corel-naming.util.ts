/**
 * CorelDRAW eklentisinin (ac2f pack) klasör ve dosya adlarında kullandığı
 * parçalar. Eklenti bunları birleştirip şu yapıyı kurar:
 *
 *   <gün klasörü>/<müşteri klasörü>/exp01--pleksi.dxf
 *   <gün klasörü>/<müşteri klasörü>/001-pleksi-1220x2440--2pcs--2800um-akpolimer-dokme-beyaz/001
 *
 * Hepsi ASCII'dir: CAM yazılımlarının çoğu Türkçe karakterli yollarda
 * sorun çıkarır, VBA'nın MkDir/Dir'i de ANSI'dir. Türkçe harfler en yakın
 * Latin harfine katlanır (ş → s, ı → i, İ → I ...).
 */

const TR_FOLD: Record<string, string> = {
  ç: 'c',
  Ç: 'C',
  ğ: 'g',
  Ğ: 'G',
  ı: 'i',
  İ: 'I',
  ö: 'o',
  Ö: 'O',
  ş: 's',
  Ş: 'S',
  ü: 'u',
  Ü: 'U',
};

/** Türkçe ve aksanlı harfleri ASCII karşılığına katlar; kalan ASCII dışını atar. */
export function asciiFold(input: string | null | undefined): string {
  if (!input) return '';
  const tr = input.replace(/[çÇğĞıİöÖşŞüÜ]/g, (ch) => TR_FOLD[ch] ?? ch);
  return tr
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s/g, ' ') // sekme, satır sonu, bölünmez boşluk
    .replace(/[^\x20-\x7e]/g, '');
}

/** Windows'ta dosya/klasör adı olamayan aygıt adları. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Müşteri klasörü adı: firma adı varsa o, yoksa kişi adı. Klasör ve CAM
 * yollarında sorun çıkmasın diye boşluksuz ve küçük harf: ASCII harf/rakam
 * dışı her dizi tek "-" olur ("Öztürk Reklam Ltd. Şti." → "ozturk-reklam-ltd-sti").
 */
export function customerFolderName(
  name: string | null | undefined,
  companyName?: string | null,
): string {
  const source = companyName?.trim() ? companyName : name;
  let s = nameToken(source);
  if (s.length > 60) s = s.slice(0, 60).replace(/-+$/, '');
  if (!s) return 'musteri';
  return RESERVED.test(s) ? `${s}_` : s;
}

/**
 * Ad içindeki tek bir alan (tür, marka, varyant, renk): küçük harf, ASCII,
 * harf/rakam dışı her dizi tek "-" olur. "--" alan grubu ayracı olarak
 * kaldığı için bir jeton hiçbir zaman "--" içermez.
 */
export function nameToken(input: string | null | undefined): string {
  return asciiFold(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Kalınlık mm → mikron (2.8 → 2800). Tanımsızsa boş. */
export function thicknessMicrons(
  mm: number | string | null | undefined,
): string {
  const v = Number(mm);
  if (mm == null || mm === '' || !Number.isFinite(v) || v <= 0) return '';
  return String(Math.round(v * 1000));
}

/** Ebat (mm) → tam sayı metin; tanımsızsa boş. */
export function mmText(mm: number | string | null | undefined): string {
  const v = Number(mm);
  if (mm == null || mm === '' || !Number.isFinite(v) || v <= 0) return '';
  return String(Math.round(v));
}

/** TSV alanı: sekme ve satır sonları boşluğa döner, metin ASCII'ye katlanır. */
export function tsvField(value: unknown): string {
  if (value == null) return '';
  return asciiFold(String(value))
    .replace(/[\t\r\n]+/g, ' ')
    .trim();
}

/** Tek satır TSV. */
export function tsvLine(fields: unknown[]): string {
  return fields.map(tsvField).join('\t');
}

/** Yanıt gövdesi: sürüm başlığı + satırlar. Eklenti "#" ile başlayanları atlar. */
export const COREL_PROTOCOL_HEADER = '#ac2f-corel 1';

export function tsvBody(lines: string[]): string {
  return [COREL_PROTOCOL_HEADER, ...lines].join('\n') + '\n';
}

/**
 * Serbest arama: her kelime (Türkçe harfe duyarsız) aranan metnin bir
 * yerinde geçmelidir. "dokme beyaz 2.8" → "Dökme", "Beyaz", "2800um".
 */
export function searchTokens(q: string | null | undefined): string[] {
  return asciiFold(q)
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(',', '.'))
    .filter(Boolean);
}

export function matchesTokens(haystack: string, tokens: string[]): boolean {
  if (!tokens.length) return true;
  return tokens.every((t) => haystack.includes(t));
}

export function foldedHaystack(parts: unknown[]): string {
  return parts
    .filter((p) => p != null && p !== '')
    .map((p) => asciiFold(String(p)).toLowerCase())
    .join(' ');
}

// ── Satırlar ───────────────────────────────────────────────────────────

/** Satır üretmek için gereken müşteri alanları. */
export interface CorelCustomerLike {
  id: string;
  name: string;
  companyName?: string | null;
  phone?: string | null;
}

/** Müşteri satırı: id, klasör adı, görünen ad. */
export function customerLine(c: CorelCustomerLike): string {
  const company = c.companyName?.trim() ?? '';
  const person = c.name?.trim() ?? '';
  let label =
    company && company.toLowerCase() !== person.toLowerCase()
      ? `${company} (${person})`
      : company || person;
  if (c.phone?.trim()) label += ` ${c.phone.trim()}`;
  return tsvLine([c.id, customerFolderName(c.name, c.companyName), label]);
}

export function customerHaystack(c: CorelCustomerLike): string {
  return foldedHaystack([
    c.name,
    c.companyName,
    c.phone,
    customerFolderName(c.name, c.companyName),
  ]);
}

/** Satır üretmek için gereken stok kalemi alanları. */
export interface CorelPlateLike {
  id: string;
  name: string;
  sku?: string | null;
  brand?: string | null;
  color?: string | null;
  colorCode?: string | null;
  variant?: string | null;
  widthMm?: number | string | null;
  heightMm?: number | string | null;
  thicknessMm?: number | string | null;
  template?: {
    name?: string | null;
    category?: { name?: string | null } | null;
  } | null;
}

/** Malzeme türü jetonu ("Pleksi" → "pleksi"); kategori yoksa şablon adı. */
export function plateKind(p: CorelPlateLike): string {
  return (
    nameToken(p.template?.category?.name) ||
    nameToken(p.template?.name) ||
    nameToken(p.name) ||
    'malzeme'
  );
}

function qtyText(qty: number): string {
  const v = Math.round(Number(qty) * 100) / 100;
  return Number.isFinite(v) ? String(v) : '0';
}

/**
 * Malzeme satırı:
 *   id, sahip (C müşterinin / B işletmenin), tür, kalınlık µm, marka,
 *   varyant, renk, en, boy, adet, görünen ad
 */
export function materialLine(
  p: CorelPlateLike,
  owner: 'C' | 'B',
  qty: number,
): string {
  const w = mmText(p.widthMm);
  const h = mmText(p.heightMm);
  const thick = Number(p.thicknessMm);
  const label = [
    p.template?.category?.name || p.template?.name || p.name,
    thick > 0 ? `${Math.round(thick * 100) / 100}mm` : '',
    p.brand,
    p.variant,
    p.color,
    w && h ? `${w}x${h}` : '',
    `x${qtyText(qty)}`,
    owner === 'C' ? '[musterinin]' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return tsvLine([
    p.id,
    owner,
    plateKind(p),
    thicknessMicrons(p.thicknessMm),
    nameToken(p.brand),
    nameToken(p.variant),
    nameToken(p.color),
    w,
    h,
    qtyText(qty),
    label,
  ]);
}

/** Aranacak metin: tür, ad, marka, renk, kod, kalınlık ve ebat yazımları. */
export function materialHaystack(p: CorelPlateLike): string {
  const thick = Number(p.thicknessMm);
  const w = mmText(p.widthMm);
  const h = mmText(p.heightMm);
  return foldedHaystack([
    p.template?.category?.name,
    p.template?.name,
    p.name,
    p.brand,
    p.variant,
    p.color,
    p.colorCode,
    p.sku,
    thick > 0 ? `${Math.round(thick * 100) / 100}mm` : '',
    thick > 0 ? `${thicknessMicrons(thick)}um` : '',
    w && h ? `${w}x${h}` : '',
  ]);
}

// ── Teklifler ──────────────────────────────────────────────────────────

/** Satır üretmek için gereken teklif başlığı alanları. */
export interface CorelQuoteLike {
  id: string;
  quoteNo: string;
  status: string;
  createdAt: Date;
}

/** Teklif satırı: id, teklif no, tarih (YYYY-AA-GG), durum, tabaka kalemi sayısı. */
export function quoteLine(q: CorelQuoteLike, sheetLines: number): string {
  return tsvLine([
    q.id,
    q.quoteNo,
    q.createdAt.toISOString().slice(0, 10),
    q.status,
    sheetLines,
  ]);
}

/** Satır üretmek için gereken teklif kalemi alanları. */
export interface CorelQuoteItemLike {
  id: string;
  quantity: number | string;
  widthMm?: number | string | null;
  heightMm?: number | string | null;
  plate?: CorelPlateLike | null;
}

/**
 * Teklifte bir tabakadan kullanılan parça. Malzeme satırıyla AYNI düzen
 * (eklenti ikisini aynı kodla okur); sahip yerine `Q`, en/boy yerine
 * kalemin KULLANILAN ölçüsü:
 *   id, Q, tür, kalınlık µm, marka, varyant, renk, kullanılan en, boy, adet, ad
 * Kalemde ölçü yoksa plakanınki geçer (tamamı kullanılmış sayılır).
 */
export function usageLine(item: CorelQuoteItemLike): string {
  const p = item.plate!;
  const w = mmText(item.widthMm ?? p.widthMm);
  const h = mmText(item.heightMm ?? p.heightMm);
  const thick = Number(p.thicknessMm);
  const label = [
    p.template?.category?.name || p.template?.name || p.name,
    thick > 0 ? `${Math.round(thick * 100) / 100}mm` : '',
    p.brand,
    p.variant,
    p.color,
    w && h ? `${w}x${h}` : '',
    `x${qtyText(Number(item.quantity))}`,
  ]
    .filter(Boolean)
    .join(' ');
  return tsvLine([
    item.id,
    'Q',
    plateKind(p),
    thicknessMicrons(p.thicknessMm),
    nameToken(p.brand),
    nameToken(p.variant),
    nameToken(p.color),
    w,
    h,
    qtyText(Number(item.quantity)),
    label,
  ]);
}

// ── İşe dönüşen teklifler (dükkân runner'ı) ─────────────────────────────

/** Runner'ın klasör açmak için okuduğu tabaka kalemi. */
export interface CorelJobSheet {
  itemId: string;
  label: string;
  kind: string;
  thicknessUm: string;
  brand: string;
  variant: string;
  color: string;
  /** Tabakanın dönüşüm anındaki (kesimden önceki) ölçüsü. */
  sheetWidthMm: number | null;
  sheetHeightMm: number | null;
  /** Kalemde kullanılan ölçü; girilmemişse tabakanınki. */
  usedWidthMm: number | null;
  usedHeightMm: number | null;
  quantity: number;
}

export interface CorelJob {
  id: string;
  quoteNo: string;
  createdAt: string;
  convertedAt: string;
  customerId: string;
  customerFolder: string;
  customerLabel: string;
  sheets: CorelJobSheet[];
}

/** Satır üretmek için gereken, dönüşmüş teklif kalemi alanları. */
export interface CorelJobItemLike extends CorelQuoteItemLike {
  sheetWidthMm?: number | string | null;
  sheetHeightMm?: number | string | null;
}

const mmNum = (v: number | string | null | undefined): number | null => {
  const t = mmText(v);
  return t ? Number(t) : null;
};

/**
 * Bir tabaka kalemi, eklentinin takım yolu klasörü adıyla aynı parçalarla:
 * tür, kalınlık µm, marka, varyant, renk jetonları ve tabakanın tam ölçüsü.
 * Dönüşümden önce kaydedilmiş ölçü yoksa (eski teklif) plakanın şimdiki
 * ölçüsü geçer.
 */
export function jobSheet(item: CorelJobItemLike): CorelJobSheet {
  const p = item.plate!;
  const sw = mmNum(item.sheetWidthMm ?? p.widthMm);
  const sh = mmNum(item.sheetHeightMm ?? p.heightMm);
  const uw = mmNum(item.widthMm) ?? sw;
  const uh = mmNum(item.heightMm) ?? sh;
  const thick = Number(p.thicknessMm);
  const label = [
    p.template?.category?.name || p.template?.name || p.name,
    thick > 0 ? `${Math.round(thick * 100) / 100}mm` : '',
    p.brand,
    p.variant,
    p.color,
    sw && sh ? `${sw}x${sh}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return {
    itemId: item.id,
    label: asciiFold(label),
    kind: plateKind(p),
    thicknessUm: thicknessMicrons(p.thicknessMm),
    brand: nameToken(p.brand),
    variant: nameToken(p.variant),
    color: nameToken(p.color),
    sheetWidthMm: sw,
    sheetHeightMm: sh,
    usedWidthMm: uw,
    usedHeightMm: uh,
    quantity: Math.round(Number(item.quantity) * 100) / 100 || 0,
  };
}

// ── Kesim fiyatlandırması ──────────────────────────────────────────────

/** Satır üretmek için gereken fiyat ayarları. */
export interface CorelPricingLike {
  hourlyRate: number;
  minMinutes: number;
  areaRate: number;
  minArea: number;
  feedMmS: number;
  rapidMmS: number;
  plungeSec: number;
  passDepthMm: number;
  currency: string;
}

/**
 * Fiyat satırı (sayılar nokta ondalıklı):
 *   saatlik ücret, asgari dk, m² ücreti, asgari m², kesim mm/sn,
 *   boşta mm/sn, dalma sn, paso derinliği mm, para birimi
 */
export function pricingLine(p: CorelPricingLike): string {
  return tsvLine([
    p.hourlyRate,
    p.minMinutes,
    p.areaRate,
    p.minArea,
    p.feedMmS,
    p.rapidMmS,
    p.plungeSec,
    p.passDepthMm,
    p.currency,
  ]);
}
