/**
 * Arama motoru: "bayaz akpolimr" ile "Akpolimer[Beyaz 1001] 2.80x1220x2440"
 * eşleşsin. Şunları çözer:
 *
 *  - sözcük SIRASI fark etmez ("kompozit alüminyum" = "alüminyum kompozit"),
 *  - büyük/küçük harf ve Türkçe karakter (ı/i, ş/s, ğ/g, ö/o, ü/u, ç/c; "İ" dahil),
 *  - ondalık yazımı (2,8 = 2.80), ebat ("1220x2440" iki sayı), birimler yok sayılır,
 *  - YAZIM HATASI: eksik/fazla/yanlış harf, yer değiştirmiş harf ("pleksi" ↔
 *    "plekis"), çift harf ("akpolimmer"), ses benzerliği ("plexi" = "pleksi",
 *    "wenge" = "venge"),
 *  - yarım yazılan sözcük ("akpol", "kompoz"): ön ek eşleşir.
 *
 * Sonuçlar PUANLANIR: tam sözcük > ön ek > içinde geçen > yazım hatalı; bu
 * yüzden listeler en iyi eşleşme üstte sıralanabilir (`rankBySearch`).
 */

const TR_MAP: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  i̇: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
};

const UNIT_WORDS = new Set(['mm', 'cm', 'm', 'x', 'm2', 'm²', 'adet', 'mt', 'lik', 'luk']);

/** Küçük harf, Türkçe karaktersiz, ondalıklar sade ("2.80" → "2.8", "1220.00" → "1220"). */
export function fold(text: string | null | undefined): string {
  return (text ?? '')
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâîû]|i̇/g, (ch) => TR_MAP[ch] ?? ch)
    .replace(/(\d+)[.,](\d+)/g, (_m, a: string, b: string) => {
      const n = Number(`${a}.${b}`);
      return Number.isFinite(n) ? String(n) : `${a}.${b}`;
    });
}

/** Metni sözcüklere ayırır: sayı ile harf arası ve "1220x2440" bölünür, birimler atılır. */
function words(text: string): string[] {
  return fold(text)
    .replace(/(\d)\s*[x×*]\s*(?=\d)/g, '$1 ')
    .replace(/(\d)([a-z²]+)/g, '$1 $2')
    .replace(/([a-z²]+)(\d)/g, '$1 $2')
    .split(/[^a-z0-9.²]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t && !UNIT_WORDS.has(t));
}

/** Aramayı sözcüklere ayırır (haystack ile aynı kurallar). */
export function searchTokens(query: string): string[] {
  return words(query);
}

const isNumber = (s: string) => /^\d+(\.\d+)?$/.test(s);

/**
 * Ses benzerliği: x→ks, q→k, w→v; çift harfler teke iner ("akpolimmer",
 * "dekotta"). Yalnız harflere uygulanır (sayılar olduğu gibi kalır).
 */
function sound(word: string): string {
  return word
    .replace(/x/g, 'ks')
    .replace(/q/g, 'k')
    .replace(/w/g, 'v')
    .replace(/([a-z])\1+/g, '$1');
}

/**
 * Sınırlı Damerau-Levenshtein (komşu iki harfin yer değişimi 1 sayılır).
 * `max`'ı aşınca erken çıkar ve max+1 döner.
 */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length;
  const m = b.length;
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[m];
}

/** Sözcük uzunluğuna göre izin verilen yazım hatası sayısı. */
function allowedEdits(len: number): number {
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  return 2;
}

/** Tek sorgu sözcüğünün tek bir metin sözcüğüne puanı (0 = eşleşmez). */
function wordScore(token: string, word: string): number {
  if (isNumber(token)) {
    if (!isNumber(word)) return 0;
    if (word === token) return 3;
    // "122" yazılırken 1220 bulunur; "3" ile 30/3.5 karışmaz.
    return token.length >= 3 && word.startsWith(token) ? 1.5 : 0;
  }
  if (word === token) return 3;
  if (token.length >= 2 && word.startsWith(token)) return 2.5;
  if (token.length >= 3 && word.includes(token)) return 1.8;
  if (token.length < 4 || isNumber(word)) return 0;

  // Yazım hatası: sese göre sadeleştirilmiş hâlleri karşılaştır; yarım
  // yazılmış sözcük için sözcüğün aynı uzunluktaki ön ekiyle de dene.
  const t = sound(token);
  const w = sound(word);
  const max = allowedEdits(t.length);
  let d = editDistance(t, w, max);
  if (d > max && w.length > t.length) d = Math.min(d, editDistance(t, w.slice(0, t.length), max));
  if (d > max && w.length > t.length) d = Math.min(d, editDistance(t, w.slice(0, t.length + 1), max));
  if (d > max) return 0;
  return 1.3 - 0.25 * d;
}

/**
 * Metnin aramaya puanı: 0 = eşleşmez; aksi hâlde sözcük puanlarının
 * ortalaması (tam eşleşme en yüksek). Aramadaki HER sözcük metinde bir
 * sözcükle eşleşmelidir (sıra fark etmez). Arama boşsa 1.
 */
export function scoreSearch(haystack: string, query: string): number {
  const tokens = searchTokens(query);
  if (!tokens.length) return 1;
  const ws = words(haystack);
  let total = 0;
  for (const t of tokens) {
    let best = 0;
    for (const w of ws) {
      const s = wordScore(t, w);
      if (s > best) best = s;
      if (best === 3) break;
    }
    if (best === 0) return 0;
    total += best;
  }
  return total / tokens.length;
}

/** Aramadaki her sözcük metinde (yazım hatası payıyla) geçiyor mu. */
export function matchesSearch(haystack: string, query: string): boolean {
  return scoreSearch(haystack, query) > 0;
}

/**
 * Listeyi aramaya göre SÜZER ve en iyi eşleşme üstte olacak biçimde sıralar.
 * Arama boşsa liste aynen döner. Eşit puanda özgün sıra korunur.
 */
export function rankBySearch<T>(items: readonly T[], query: string, textOf: (item: T) => string): T[] {
  if (!searchTokens(query).length) return [...items];
  return items
    .map((item, i) => ({ item, i, s: scoreSearch(textOf(item), query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.item);
}

/**
 * "Bunu mu demek istediniz?": sonuç çıkmayan aramada, kelime dağarcığındaki
 * en yakın sözcüklerle düzeltilmiş aramayı önerir. Düzeltme gerekmiyorsa ya da
 * hiçbir sözcük yeterince yakın değilse null.
 */
export function suggestQuery(query: string, vocabulary: Iterable<string>): string | null {
  const tokens = searchTokens(query);
  if (!tokens.length) return null;
  const vocab = new Set<string>();
  for (const v of vocabulary) for (const w of words(v)) if (!isNumber(w) && w.length >= 3) vocab.add(w);
  let changed = false;
  const fixed = tokens.map((t) => {
    if (isNumber(t) || t.length < 4) return t;
    let best = '';
    let bestScore = 0;
    for (const w of vocab) {
      if (w === t) return t;
      const s = wordScore(t, w);
      if (s > bestScore) {
        bestScore = s;
        best = w;
      }
    }
    if (best && bestScore > 0 && best !== t) {
      changed = true;
      return best;
    }
    return t;
  });
  return changed ? fixed.join(' ') : null;
}
