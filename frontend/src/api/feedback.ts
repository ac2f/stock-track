import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { apiErrorMessage, toast } from '../lib/toast';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** true: bu istek için "Kaydedildi / hata" bildirimi gösterilmez. */
    silent?: boolean;
  }
}

/**
 * Her yazma isteğinin sonucunu kısa bir bildirimle söyler: kullanıcı kaydın
 * gerçekten işlendiğini (ya da neden işlenmediğini) sayfaya bakmadan görür.
 * İşleme özgü ileti yolun sonundan çıkarılır; bilinmeyenlerde yönteme göre
 * "Kaydedildi / Güncellendi / Silindi" denir.
 */
const SPECIAL: [RegExp, string][] = [
  [/\/payments$/, 'Tahsilat kaydedildi'],
  [/\/payments\/settle$/, 'Kasa tahsil edildi olarak işaretlendi'],
  [/\/convert$/, 'Dönüştürüldü'],
  [/\/status$/, 'Durum güncellendi'],
  [/\/deplete$/, 'Stoktan çıkarıldı'],
  [/\/transfer-ownership$/, 'Sahiplik aktarıldı'],
  [/\/settle$/, 'Borç kapatıldı'],
  [/\/discount$/, 'İndirim uygulandı'],
  [/\/ledger-entry$/, 'Cari hareket eklendi'],
  [/\/portal-token$/, 'Portal bağlantısı güncellendi'],
  [/\/exchange-rates\/sync$/, 'Kurlar güncellendi'],
  [/\/morning-summary\/send$/, 'Özet gönderildi'],
  [/\/telegram\/reload$/, 'Telegram bağlantısı yenilendi'],
  [/\/backups\/telegram$/, 'Yedek Telegram’a gönderildi'],
  [/\/backups\/restore$/, 'Yedek geri yüklendi'],
  [/\/bank-reconciliation\/import$/, 'Ekstre yüklendi'],
  [/\/match$/, 'Eşleştirildi'],
  [/\/unmatch$/, 'Eşleştirme kaldırıldı'],
  [/\/ignore$/, 'Hariç tutuldu'],
  [/\/corel\/rotate$/, 'Yeni anahtar üretildi'],
  [/\/material-catalog\/dedupe$/, 'Katalog temizlendi'],
  [/\/plates\/batch$/, 'Stok kalemleri eklendi'],
  [/\/price-rules\/[^/]+\/entries$/, 'Fiyat kaydedildi'],
  [/\/price-rules\/[^/]+\/entries\/[^/]+$/, 'Fiyat silindi'],
  [/\/price-rules\/[^/]+\/reference$/, 'Çatı fiyatı seçildi'],
  [/\/plates\/[^/]+\/retail-price$/, 'Kalem fiyatı güncellendi'],
  [/\/material-templates\/[^/]+\/merge$/, 'Ürün türleri birleştirildi'],
];

/** Bildirim gösterilmeyen istekler (oturum işlemleri). */
const QUIET = [/^\/auth\//];

function pathOf(config: InternalAxiosRequestConfig): string {
  const url = config.url ?? '';
  try {
    return new URL(url, 'http://x').pathname.replace(/^\/api\/v1/, '');
  } catch {
    return url.split('?')[0];
  }
}

function isWrite(config: InternalAxiosRequestConfig | undefined): config is InternalAxiosRequestConfig {
  const m = (config?.method ?? 'get').toLowerCase();
  return !!config && !['get', 'head', 'options'].includes(m);
}

function quiet(config: InternalAxiosRequestConfig): boolean {
  // Kuyruktan gönderilenler tek tek değil, eşzamanlama sonunda toplu bildirilir.
  if ((config as { _replay?: boolean })._replay) return true;
  return !!config.silent || QUIET.some((r) => r.test(pathOf(config)));
}

export function announceSuccess(response: AxiosResponse): void {
  const config = response.config;
  if (!isWrite(config) || quiet(config)) return;
  if (response.status === 202 && (response.data as { _offline?: boolean })?._offline) {
    toast.warning('Çevrimdışı: işlem sıraya alındı', 'Bağlantı gelince kendiliğinden gönderilecek.');
    return;
  }
  const path = pathOf(config);
  const special = SPECIAL.find(([r]) => r.test(path))?.[1];
  const method = config.method!.toLowerCase();
  const text =
    method === 'delete' && !special
      ? 'Silindi'
      : special ?? (method === 'post' ? 'Kaydedildi' : 'Güncellendi');
  toast.success(text);
}

export function announceFailure(error: AxiosError | Error, config: InternalAxiosRequestConfig | undefined): void {
  if (!isWrite(config) || quiet(config)) return;
  const status = (error as AxiosError).response?.status;
  if (status === 401) return;
  toast.error(apiErrorMessage(error, 'İşlem tamamlanamadı.'));
}
