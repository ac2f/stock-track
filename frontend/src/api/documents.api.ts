import { api } from './client';

/** Auth'lu bir ikili belgeyi (PDF/Excel) indirir. */
export async function downloadFile(
  path: string,
  filename: string,
): Promise<void> {
  const res = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** PDF'i yeni sekmede açar (görüntüle/yazdır). */
export async function openPdf(path: string): Promise<void> {
  const res = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  window.open(url, '_blank');
  // URL'i hemen iptal etmiyoruz; sekme yüklensin diye kısa süre sonra bırakılır.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
