/**
 * İşletme adı (marka) yerel önbelleği. Ayarlardaki işletme adı yüklenince
 * buraya yazılır; giriş ekranı gibi henüz oturum açılmamış (API'den ad
 * okunamayan) yerlerde son bilinen ad gösterilir. Böylece "StockTrack" yerine
 * her yerde işletmenin adı görünür.
 */
const BRAND_KEY = 'st_brand';

/** Son bilinen işletme adı (yoksa nötr bir varsayılan). */
export function getBrand(): string {
  return localStorage.getItem(BRAND_KEY)?.trim() || 'ERP';
}

/** İşletme adını önbelleğe yaz (Ayarlar/başlık yüklenince çağrılır). */
export function setBrand(name?: string | null): void {
  const v = (name ?? '').trim();
  if (v) localStorage.setItem(BRAND_KEY, v);
}
