/**
 * Telefon numarasını karşılaştırılabilir tek biçime (yalnız rakam, ülke kodlu)
 * çevirir: "0532 123 45 67", "+90 532 123 45 67", "5321234567", "90532…"
 * hepsi → "905321234567". İşletmeler arası eşleştirme bu değerle yapılır.
 *
 * Yurtdışı numaraları ülke kodlarıyla (başında + ya da 00) yazılmışsa olduğu
 * gibi rakamlara indirilir. Çok kısa (7 rakamdan az) ya da çok uzun (15'ten fazla)
 * girişler eşleştirmeye elverişsiz sayılır → null.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const international = text.startsWith('+') || text.replace(/\s|\(|\)|-|\./g, '').startsWith('00');
  let digits = text.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (international) {
    // +90 ... Türkiye: 12 hane; başka ülkeler olduğu gibi.
    if (digits.length < 8 || digits.length > 15) return null;
    return digits;
  }
  // Yerel yazım. Dahili numara ekleri (ör. "… dahili 12") rakam sayısını şişirir:
  // yalnız ilk 11-12 haneyi alırız.
  if (digits.startsWith('90') && digits.length >= 12) return digits.slice(0, 12);
  if (digits.startsWith('0') && digits.length >= 11) return `90${digits.slice(1, 11)}`;
  if (digits.length === 10) return `90${digits}`;
  // Alan kodsuz sabit hat ("123 45 67") ya da tanınmayan biçim: yerel eşleşme için
  // olduğu gibi kalır (ama çok kısaysa eşleştirilmez).
  if (digits.length < 7 || digits.length > 15) return null;
  return digits;
}

/** Arayüz/uyarı metinleri için son 4 hane dışında maskeler: 90532•••••67. */
export function maskPhone(normalized: string): string {
  if (normalized.length <= 4) return normalized;
  return `${normalized.slice(0, 4)}${'•'.repeat(Math.max(0, normalized.length - 6))}${normalized.slice(-2)}`;
}
