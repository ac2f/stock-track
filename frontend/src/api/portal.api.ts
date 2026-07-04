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

async function pget<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    throw new Error(res.status === 404 ? 'Geçersiz bağlantı' : 'Hata');
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
