import { api } from './client';
import { apiErrorMessage, toast } from '../lib/toast';

/** Kullanıcıya olduğu gibi gösterilebilecek, okunur hata. */
export class DocumentError extends Error {}

/** Sunucunun JSON hata gövdesi (blob olarak gelmiş olabilir) → okunur ileti. */
async function blobMessage(data: unknown): Promise<string | null> {
  if (!(data instanceof Blob)) return null;
  try {
    const j = JSON.parse(await data.text()) as { message?: unknown };
    if (Array.isArray(j.message)) return j.message.join(' · ');
    if (typeof j.message === 'string' && j.message.trim()) return j.message;
  } catch {
    /* JSON değil */
  }
  return null;
}

/**
 * Belge isteği başarısız olunca nedeni açıkça söyler. Genel "bir hata oluştu"
 * yerine: sunucunun yazdığı neden, HTTP durumu ve bilinen durumlar için ne
 * yapılacağı.
 */
async function describe(e: unknown): Promise<string> {
  if (e instanceof DocumentError) return e.message;
  const res = (e as { response?: { status?: number; data?: unknown } })?.response;
  if (!res) return 'Sunucuya ulaşılamadı. Bağlantıyı ve sunucunun çalıştığını denetleyin.';
  const status = res.status ?? 0;
  const msg = (await blobMessage(res.data)) ?? apiErrorMessage(e, '');
  if (status === 404 && (!msg || /^Cannot GET /.test(msg))) {
    return 'Sunucu bu belge adresini tanımıyor: sunucu (api) arayüzden eski bir sürümde. Sunucuyu yeniden derleyip başlatın.';
  }
  if (status === 401) return 'Oturum süresi dolmuş görünüyor. Yeniden giriş yapın.';
  if (status === 403) return msg || 'Bu belgeyi görmek için yetkiniz yok.';
  if (status >= 500) return `${msg || 'Sunucu belgeyi üretemedi.'} (HTTP ${status})`;
  return msg || `Belge alınamadı (HTTP ${status}).`;
}

/**
 * Auth'lu bir ikili belgeyi (PDF/Excel/HTML) alır. Sunucu hata ya da başka bir
 * uç nokta yüzünden JSON döndürdüyse onu belge diye vermez: nedenini fırlatır.
 */
export async function fetchDocument(
  path: string,
  signal?: AbortSignal,
): Promise<Blob> {
  let blob: Blob;
  try {
    const res = await api.get(path, { responseType: 'blob', signal });
    blob = res.data as Blob;
  } catch (e) {
    if ((e as { code?: string })?.code === 'ERR_CANCELED') throw e;
    throw new DocumentError(await describe(e));
  }
  if (blob.type.includes('json')) {
    throw new DocumentError(
      (await blobMessage(blob)) ?? 'Sunucu belge yerine veri döndürdü.',
    );
  }
  if (!blob.size) throw new DocumentError('Sunucu boş bir belge döndürdü.');
  return blob;
}

/** Elimizdeki belgeyi dosya olarak kaydettirir (yeni istek yapmaz). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Tarayıcının indirmeyi başlatması için URL hemen bırakılmaz.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Auth'lu bir ikili belgeyi (Excel/CSV/PDF) indirir. */
export async function downloadFile(
  path: string,
  filename: string,
): Promise<void> {
  try {
    saveBlob(await fetchDocument(path), filename);
  } catch (e) {
    toast.error('Belge indirilemedi', (e as Error).message);
  }
}

/**
 * Yazdırılabilir HTML belgeyi yeni sekmede açar; oradan yazdırılır ya da PDF
 * olarak kaydedilir.
 */
export async function openPdf(path: string): Promise<void> {
  // Sekme tıklama anında açılır: yanıt beklendikten sonra window.open çoğu
  // tarayıcıda açılır pencere engeline takılır.
  const tab = window.open('', '_blank');
  try {
    const url = URL.createObjectURL(await fetchDocument(path));
    if (tab) tab.location.href = url;
    else window.open(url, '_blank');
    // Sekme yüklensin diye URL kısa süre sonra bırakılır.
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  } catch (e) {
    tab?.close();
    toast.error('Belge açılamadı', (e as Error).message);
  }
}
