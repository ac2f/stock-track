/**
 * Türkçe harfe duyarsız arama: "ozturk" → "Öztürk", "isletme" → "İşletme".
 * İki taraf da katlanır (JS'te foldTr, SQL'de sqlFold), sonra LIKE ile eşleşir.
 */
const TR_FOLD: Record<string, string> = {
  Ç: 'C', Ğ: 'G', İ: 'I', I: 'I', Ö: 'O', Ş: 'S', Ü: 'U', Â: 'A', Î: 'I', Û: 'U',
  ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u',
};
const TR_FROM = Object.keys(TR_FOLD).join('');
const TR_TO = Object.values(TR_FOLD).join('');

/** Türkçe harfsiz küçük harf: "Şeffaf" → "seffaf", "İŞLETME" → "isletme". */
export function foldTr(s: string): string {
  return s.replace(/[ÇĞİIÖŞÜÂÎÛçğıöşüâîû]/g, (c) => TR_FOLD[c] ?? c).toLowerCase();
}

/** foldTr'nin SQL karşılığı (bir sütun ifadesi için). */
export function sqlFold(expr: string): string {
  return `lower(translate(coalesce(${expr}, ''), '${TR_FROM}', '${TR_TO}'))`;
}

/** LIKE joker karakterlerini (%, _, \) kaçırır. */
export function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}

/**
 * Serbest aramayı sözcüklere böler (en çok 8); her sözcük katlanmış ve LIKE
 * için kaçırılmış döner. Sütunlarda "herhangi birinde geçmeli" kuralı çağıranın.
 */
export function foldedWords(search: string | undefined | null): string[] {
  if (!search?.trim()) return [];
  return search
    .trim()
    .split(/\s+/)
    .map((w) => escapeLike(foldTr(w)))
    .filter(Boolean)
    .slice(0, 8);
}
