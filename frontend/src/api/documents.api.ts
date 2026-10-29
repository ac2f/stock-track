import { api } from './client';
import { apiErrorMessage, toast } from '../lib/toast';

/** Sunucunun JSON hata gövdesi (blob olarak gelmiş olabilir) → okunur ileti. */
async function blobError(e: unknown): Promise<string> {
  const data = (e as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const j = JSON.parse(await data.text()) as { message?: unknown };
      if (Array.isArray(j.message)) return j.message.join(' · ');
      if (typeof j.message === 'string') return j.message;
    } catch {
      /* JSON değil */
    }
  }
  return apiErrorMessage(e, 'Belge alınamadı.');
}

/** Auth'lu bir ikili belgeyi (PDF/Excel) indirir. */
export async function downloadFile(
  path: string,
  filename: string,
): Promise<void> {
  try {
    const res = await api.get(path, { responseType: 'blob' });
    const blob = res.data as Blob;
    // Sunucu hata ya da başka bir uç nokta yüzünden JSON döndüyse onu dosya
    // diye indirme: ham metin yerine nedenini göster.
    if (blob.type.includes('json')) throw new Error(await jsonMessage(blob));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    toast.error('Belge indirilemedi', await blobError(e));
  }
}

/**
 * PDF'i (ya da yazdırılabilir HTML belgeyi) yeni sekmede açar. PDF'i tarayıcı
 * kendi görüntüleyicisinde gösterir; oradan indirilir ya da yazdırılır.
 */
export async function openPdf(path: string): Promise<void> {
  // Sekme tıklama anında açılır: yanıt beklendikten sonra window.open çoğu
  // tarayıcıda açılır pencere engeline takılır.
  const tab = window.open('', '_blank');
  try {
    const res = await api.get(path, { responseType: 'blob' });
    const blob = res.data as Blob;
    if (blob.type.includes('json')) throw new Error(await jsonMessage(blob));
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    else window.open(url, '_blank');
    // Sekme yüklensin diye URL kısa süre sonra bırakılır.
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  } catch (e) {
    tab?.close();
    toast.error('Belge açılamadı', await blobError(e));
  }
}

async function jsonMessage(blob: Blob): Promise<string> {
  try {
    const j = JSON.parse(await blob.text()) as { message?: unknown };
    if (typeof j.message === 'string') return j.message;
  } catch {
    /* JSON değil */
  }
  return 'Sunucu belge yerine veri döndürdü.';
}
