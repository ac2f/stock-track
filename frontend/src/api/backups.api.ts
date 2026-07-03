import { api } from './client';

export interface BackupFileInfo {
  name: string;
  size: number;
  createdAt: string;
}

/** Diskteki (otomatik) yedeklerin listesi. */
export async function fetchBackups(): Promise<BackupFileInfo[]> {
  const { data } = await api.get<BackupFileInfo[]>('/backups');
  return data;
}

/** Anlık yedek üretir ve .sql dosyasını indirir. */
export async function downloadBackup(): Promise<void> {
  const res = await api.get('/backups/download', { responseType: 'blob' });
  const dispo = String(res.headers['content-disposition'] ?? '');
  const match = dispo.match(/filename="?([^"]+)"?/);
  const fileName =
    match?.[1] ?? `yedek-${new Date().toISOString().slice(0, 10)}.sql`;
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Yüklenen .sql yedeğini geri yükler (TEHLİKELİ: veriyi üzerine yazar). */
export async function restoreBackup(file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  await api.post('/backups/restore', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}
