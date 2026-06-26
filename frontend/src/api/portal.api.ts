import type {
  PortalDocuments,
  PortalLedgerEntry,
  PortalSummary,
} from '../types';

// Portal uçları PUBLIC'tir: kimlik doğrulama yok → token'lı sade fetch kullanılır
// (auth interceptor'ı ve /login yönlendirmesi devreye girmez).
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

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
