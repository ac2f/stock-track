import type {
  PortalDocuments,
  PortalLedgerEntry,
  PortalSummary,
} from '../types';
import { API_URL } from './client';

// Portal uçları PUBLIC'tir: kimlik doğrulama yok → token'lı sade fetch kullanılır
// (auth interceptor'ı ve /login yönlendirmesi devreye girmez). Taban adres, ana
// istemciyle AYNI mantığı paylaşır: üretimde GÖRELİ '/api/v1' → portal, uygulama
// hangi domain/origin'den açıldıysa API'yi de oradan çağırır (ekstra ayar yok).

/**
 * Portal hatası — nedeni ayırt edilir ki kullanıcı doğru mesajı görsün:
 *  - 'invalid'  → token bulunamadı/iptal (404): bağlantı gerçekten geçersiz.
 *  - 'server'   → API'ye ulaşıldı ama hata/yanıt JSON değil (ör. istek yanlışlıkla
 *                 SPA'ya düştü → API aynı origin'de /api'ye proxy'lenmiyor olabilir).
 *  - 'network'  → sunucuya hiç ulaşılamadı (ağ/DNS/erişim).
 */
export type PortalErrorCode = 'invalid' | 'server' | 'network';
export class PortalError extends Error {
  constructor(
    public code: PortalErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PortalError';
  }
}

async function pget<T>(path: string): Promise<T> {
  const url = `${API_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new PortalError('network', 'Sunucuya ulaşılamadı.');
  }
  if (res.status === 404) {
    throw new PortalError('invalid', 'Bağlantı geçersiz veya iptal edilmiş.');
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.includes('application/json')) {
    // Yanıt JSON değilse istek muhtemelen API yerine arayüze (index.html) düştü:
    // API aynı origin'de '/api' altında sunulmuyor olabilir.
    throw new PortalError(
      'server',
      'Sunucuya ulaşılamadı (API adresi/ağ ayarını kontrol edin).',
    );
  }
  const json = await res.json();
  return (json?.data ?? json) as T;
}

export const fetchPortalSummary = (token: string) =>
  pget<PortalSummary>(`/portal/${token}`);

export const fetchPortalLedger = (token: string) =>
  pget<PortalLedgerEntry[]>(`/portal/${token}/ledger`);

export const fetchPortalDocuments = (token: string) =>
  pget<PortalDocuments>(`/portal/${token}/documents`);
