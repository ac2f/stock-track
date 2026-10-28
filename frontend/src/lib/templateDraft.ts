/**
 * Arama metninden YENİ BİR ÜRÜN TÜRÜ TASLAĞI çıkarır: "pleksi bayaz 3mm xmarka
 * 1000x2000" → kategori Pleksi, renk Beyaz, kalınlık 3, marka XMarka, ebat
 * 1000×2000. Arama kutusunda aranan ürün yoksa "bu ürün türünü kaydet" formu bu
 * taslakla DOLU gelir; kullanıcı yalnız kontrol edip kaydeder.
 *
 * Eşleştirme arama motoruyla aynıdır (yazım hatası, Türkçe karakter, sıra fark
 * etmez): "plexi" → Pleksi kategorisi, "bayaz" → Beyaz rengi.
 */
import { fold, scoreSearch } from './search';

export interface TemplateDraft {
  categoryName: string;
  brandName: string;
  colorName: string;
  /** Renk kodu (ör. 1001, RAL9010 yazılmışsa sayısal kısım). */
  colorCode: string;
  thicknessMm?: number;
  sheetWidthMm?: number;
  sheetHeightMm?: number;
  variant: string;
  /** Hiçbir alana yerleştirilemeyen sözcükler (kullanıcıya gösterilir). */
  leftover: string[];
}

export interface DraftCatalog {
  categories: { name: string }[];
  /** Seçili kategorideki mevcut markalar/renkler: yazımı kataloğa düzeltmek için. */
  brands?: string[];
  colors?: string[];
}

/** Sık geçen renk sözcükleri (katalogda yoksa da renk olarak tanınır). */
const COLOR_WORDS = [
  'Beyaz', 'Siyah', 'Kırmızı', 'Mavi', 'Sarı', 'Yeşil', 'Gri', 'Turuncu', 'Mor', 'Pembe',
  'Kahverengi', 'Şeffaf', 'Opak', 'Füme', 'Antrasit', 'Bej', 'Krem', 'Lacivert', 'Bordo',
  'Gümüş', 'Altın', 'Bronz', 'Şampanya', 'Naturel', 'Ceviz', 'Meşe', 'Wenge', 'Venge',
  'Buzlu', 'Turkuaz', 'Fuşya', 'Haki', 'Vizon', 'Bakır', 'Krom', 'Gold', 'Silver',
];

/** Alt tür sözcükleri. */
const VARIANT_WORDS = ['Dökme', 'Çekme', 'Ekstrüde', 'Kast'];

/** Ayrı bir sayı olarak yazılan renk kodu: en az 3 haneli (1001, 9010). */
const CODE_RE = /^(?:ral)?\d{3,5}$/;

const titleCase = (s: string): string =>
  s.length ? s.charAt(0).toLocaleUpperCase('tr') + s.slice(1).toLocaleLowerCase('tr') : s;

/** Sözcük listeden birine (yazım hatasıyla) benziyorsa o sözcüğü döner. */
function snap(word: string, list: readonly string[]): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const cand of list) {
    // Çok sözcüklü kayıtlarda ("Mat Beyaz") yalnız tam kayıt değil, her sözcük aranır.
    const s = scoreSearch(cand, word);
    if (s > bestScore) {
      bestScore = s;
      best = cand;
    }
  }
  return best;
}

export function parseTemplateQuery(query: string, catalog: DraftCatalog): TemplateDraft {
  const draft: TemplateDraft = {
    categoryName: '',
    brandName: '',
    colorName: '',
    colorCode: '',
    variant: '',
    leftover: [],
  };
  // Ondalık virgül (2,8) sözcük ayracı sanılmasın.
  let rest = query.trim().replace(/(\d),(\d)/g, '$1.$2');
  if (!rest) return draft;

  // 1) Ebat: 1000x2000 / 1220 x 2440 / 1000*2000 / 100×200
  const size = fold(rest).match(/(\d{2,5})\s*[x×*]\s*(\d{2,5})/);
  if (size) {
    draft.sheetWidthMm = Number(size[1]);
    draft.sheetHeightMm = Number(size[2]);
    rest = fold(rest).replace(size[0], ' ');
    // ham yazımı (büyük/küçük harf) yalnız ad sözcükleri için gerekir; sayılar atıldı.
  }

  // Sözcükler: özgün yazımı koru (marka adı "XMarka" kalsın), eşleştirme sadeleştirilmişle.
  const tokens = rest
    .split(/[\s,;|/()[\]+]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !/^(mm|cm|m|x|adet|mt)$/i.test(fold(t)));
  const used = new Set<number>();
  const alpha = (t: string) => /[a-zçğıöşüâîû]/i.test(t);

  // 2) Kalınlık: "3mm", "3 mm", "2,8", ve tek başına küçük sayı (≤ 100).
  tokens.forEach((t, i) => {
    const f = fold(t).replace(/mm$/, '');
    if (/^\d+(\.\d+)?$/.test(f) && !CODE_RE.test(f)) {
      const n = Number(f);
      if (n > 0 && n <= 100 && draft.thicknessMm === undefined) {
        draft.thicknessMm = n;
        used.add(i);
      }
    }
  });
  // 3) Renk kodu: 3-5 haneli sayı ya da RAL9010.
  tokens.forEach((t, i) => {
    if (used.has(i)) return;
    const f = fold(t);
    if (CODE_RE.test(f) && !draft.colorCode) {
      draft.colorCode = f.replace(/^ral/, 'RAL');
      used.add(i);
    }
  });

  // 4) Kategori: adı en çok sözcükle (yazım hatasıyla) eşleşen.
  let bestCat: { name: string; score: number; hit: number[] } | null = null;
  for (const c of catalog.categories) {
    const hit: number[] = [];
    let score = 0;
    tokens.forEach((t, i) => {
      if (used.has(i) || !alpha(t) || fold(t).length < 2) return;
      const s = scoreSearch(c.name, t);
      if (s > 0) {
        hit.push(i);
        score += s;
      }
    });
    if (hit.length && (!bestCat || score > bestCat.score || (score === bestCat.score && c.name.length < bestCat.name.length))) {
      bestCat = { name: c.name, score, hit };
    }
  }
  if (bestCat) {
    draft.categoryName = bestCat.name;
    bestCat.hit.forEach((i) => used.add(i));
  }

  // 5) Alt tür, renk ve marka: kalan harfli sözcükler.
  const brandNames: string[] = [];
  const colorNames: string[] = [];
  tokens.forEach((t, i) => {
    if (used.has(i) || !alpha(t)) return;
    const f = fold(t);
    // Alt tür (dökme/çekme…): en az 3 harf, yazım hatası payıyla.
    const variant = !draft.variant && f.length >= 3 ? snap(f, VARIANT_WORDS) : null;
    if (variant) {
      draft.variant = variant;
      used.add(i);
      return;
    }
    // Kataloğun kendi rengi (yazımı düzelterek), sonra bilinen renk sözcükleri.
    const color = snap(f, catalog.colors ?? []) ?? (f.length >= 3 ? snap(f, COLOR_WORDS) : null);
    if (color) {
      if (!colorNames.includes(color)) colorNames.push(color);
      used.add(i);
      return;
    }
    // Kataloğun markası varsa (yazımı düzelterek) onu al; yoksa yeni marka adaydır.
    const brand = snap(f, catalog.brands ?? []);
    const name = brand ?? (t === t.toLowerCase() ? titleCase(t) : t);
    if (!brandNames.includes(name)) brandNames.push(name);
    used.add(i);
  });
  draft.colorName = colorNames.join(' ');
  draft.brandName = brandNames.join(' ');
  draft.leftover = tokens.filter((_t, i) => !used.has(i));
  return draft;
}
