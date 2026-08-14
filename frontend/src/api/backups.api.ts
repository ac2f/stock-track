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

/** Yedek klasörünün disk kullanımı (bakım ekranı). */
export async function fetchBackupUsage(): Promise<{
  files: number;
  totalBytes: number;
}> {
  const { data } = await api.get<{ files: number; totalBytes: number }>(
    '/backups/usage',
  );
  return data;
}

/**
 * Eski yedek dosyalarını siler. `keep` en yeni kaç dosyanın korunacağıdır;
 * 0 verilirse klasör tamamen boşaltılır. Veritabanına dokunmaz.
 */
export async function cleanupBackups(
  keep: number,
): Promise<{ deleted: number; freedBytes: number }> {
  const { data } = await api.delete<{ deleted: number; freedBytes: number }>(
    '/backups',
    { params: { keep } },
  );
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

/**
 * Yüklenen yedeği geri yükler (TEHLİKELİ: veriyi üzerine yazar).
 * Hem düz `.sql` hem Telegram'dan gelen şifreli `.enc` kabul edilir.
 *
 * `privateKeyPem` verilmezse sunucu ÖNCE kendi geçerli şifre çözme anahtarını
 * dener; o çözemezse `needsKey: true` ile hata döner ve arayüz anahtarı sorar.
 */
export async function restoreBackup(
  file: File,
  privateKeyPem?: string,
): Promise<{ restored: true; decrypted: boolean }> {
  const form = new FormData();
  form.append('file', file);
  if (privateKeyPem?.trim()) form.append('privateKeyPem', privateKeyPem.trim());
  const { data } = await api.post<{ restored: true; decrypted: boolean }>(
    '/backups/restore',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

/** Geri yükleme hatasının "anahtar gerekli" olup olmadığını çözer. */
export function restoreNeedsKey(error: unknown): boolean {
  return (
    (error as { response?: { data?: { needsKey?: boolean } } })?.response?.data
      ?.needsKey === true
  );
}

// ── Şifreli yedeğin Telegram'a gönderimi ──────────────────────────────
export interface TelegramBackupResult {
  ok: boolean;
  action: 'created' | 'updated';
  messageId: number;
  dayKey: string;
  fileName: string;
  size: number;
  entryCount: number;
}

export interface TelegramBackupEntry {
  at: string;
  fileName: string;
  size: number;
  kind: 'auto' | 'manual';
}

export interface TelegramBackupState {
  chatId: string;
  dayKey: string;
  messageId: number;
  pinnedMessageId: number | null;
  entries: TelegramBackupEntry[];
  updatedAt: string;
}

/** Şifreli yedeği elle alıp Telegram'a gönderir (aynı gün mesajını ilerletir). */
export async function sendBackupToTelegram(): Promise<TelegramBackupResult> {
  const { data } = await api.post<TelegramBackupResult>('/backups/telegram');
  return data;
}

/** O güne ait Telegram yedek durumu (varsa). */
export async function fetchTelegramBackupState(): Promise<TelegramBackupState | null> {
  const { data } = await api.get<TelegramBackupState | null>(
    '/backups/telegram/state',
  );
  return data;
}

/** Şifre çözme (private) anahtarı — .enc yedekleri çözmek için. */
export async function fetchDecryptionKey(): Promise<{
  privateKeyPem: string;
  publicKeyFingerprint: string;
}> {
  const { data } = await api.get<{
    privateKeyPem: string;
    publicKeyFingerprint: string;
  }>('/backups/decryption-key');
  return data;
}
