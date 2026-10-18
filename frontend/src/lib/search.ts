/**
 * Arama yardımcıları: "beyaz 2,8 akpolimer" ile "Akpolimer[Beyaz] 2.80x1220"
 * eşleşsin. Sözcük sırası, büyük/küçük harf, Türkçe karakter (ı/i, ş/s ...)
 * ve ondalık yazımı (2,8 / 2.80) fark etmez; "mm", "cm" gibi birimler ve
 * ebattaki "x" yok sayılır.
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

const UNIT_WORDS = new Set(['mm', 'cm', 'm', 'x', 'm2', 'm²', 'adet', 'mt']);

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

/** Aramayı sözcüklere ayırır; sayı ile harf arası ve "1220x2440" bölünür. */
export function searchTokens(query: string): string[] {
  return fold(query)
    .replace(/(\d)\s*x\s*(\d)/g, '$1 $2')
    .replace(/(\d)([a-z²]+)/g, '$1 $2')
    .split(/[\s[\]()/·,;|+]+/)
    .map((t) => t.trim())
    .filter((t) => t && !UNIT_WORDS.has(t));
}

/** Aramadaki her sözcük metinde geçiyor mu (sıra fark etmez). */
export function matchesSearch(haystack: string, query: string): boolean {
  const tokens = searchTokens(query);
  if (!tokens.length) return true;
  const text = fold(haystack).replace(/(\d)\s*x\s*(\d)/g, '$1 $2');
  return tokens.every((t) => text.includes(t));
}
