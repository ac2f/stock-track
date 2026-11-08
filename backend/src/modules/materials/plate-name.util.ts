/**
 * Plaka (stok kalemi) görünen adı.
 *
 * Ad kalemin KENDİ alanlarından türetilebilir (tür + marka[renk kod] + kalınlık x ebat); eskiden bu metin
 * her satıra ayrıca yazılırdı (ve ön yüz de aynısını üretip gönderirdi). Artık yalnız elle yazılmış ad
 * saklanır (`customName`); diğerlerinde `name` okunurken burada üretilir — depolamadan ve eskiyen
 * kopyadan kurtulur (marka/renk değişince ad da kendiliğinden güncel kalır).
 *
 * Biçim ön yüzdeki eski öneriyle BİREBİR aynıdır: "Pleksi Akpolimer[Şeffaf K-1] 3.00x1220.00x2440.00".
 */
type Num = number | string | null | undefined;

export interface PlateNameSource {
  brand?: string | null;
  color?: string | null;
  colorCode?: string | null;
  thicknessMm?: Num;
  sizeId?: string | null;
  template?: {
    defaultSizeId?: string | null;
    defaultSize?: { widthMm: Num; heightMm: Num } | null;
    category?: { name?: string | null } | null;
  } | null;
}

/** Veritabanı biçimi korunur ("3.00"); düz sayı gelirse iki ondalığa tamamlanır. */
const fmt = (v: Num): string | null => (v == null || v === '' ? null : typeof v === 'number' ? v.toFixed(2) : String(v));

/**
 * Türetilmiş ad. Ebat, yalnız kalemin ebadı şablonun varsayılanıyla aynıysa (ya da `size` açıkça
 * verilmişse) yazılır; kalemde hiç ebat yoksa "—x—". Şablon yüklü değilse ebat atlanır (yanlış değer
 * yazmaktansa eksik bırakılır).
 */
export function derivePlateName(p: PlateNameSource, size?: { widthMm: Num; heightMm: Num } | null): string {
  const type = p.template?.category?.name?.trim();
  const brand = p.brand ?? '—';
  const color = p.color ? (p.colorCode ? `${p.color} ${p.colorCode}` : p.color) : '—';
  const thickness = fmt(p.thicknessMm) ?? '—';
  const dims = size ?? (p.sizeId && p.sizeId === p.template?.defaultSizeId ? p.template?.defaultSize : null);
  const sizePart = dims ? `x${fmt(dims.widthMm)}x${fmt(dims.heightMm)}` : !p.sizeId ? 'x—x—' : '';
  return `${type ? `${type} ` : ''}${brand}[${color}] ${thickness}${sizePart}`;
}

/** Kategori önekini atar: sunucunun eski ("Marka[Renk] …") ve ön yüzün ("Tür Marka[Renk] …") biçimi aynı sayılır. */
const withoutType = (name: string, type?: string | null): string =>
  type && name.startsWith(`${type.trim()} `) ? name.slice(type.trim().length + 1) : name;

/**
 * Gelen ad elle yazılmış mı? Boşsa ya da türetilmiş adın aynısıysa (eski ön yüz/çevrimdışı kuyruktan gelen
 * öneri) saklanmaz: `null` döner ve ad okurken üretilir. Aksi hâlde elle yazılan ad aynen saklanır.
 */
export function customPlateName(
  input: string | null | undefined,
  derived: string,
  type?: string | null,
): string | null {
  const v = input?.trim();
  if (!v) return null;
  if (v === derived || withoutType(v, type) === withoutType(derived, type)) return null;
  return v;
}
