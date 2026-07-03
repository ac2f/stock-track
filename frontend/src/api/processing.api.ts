import { api } from './client';
import type {
  Paginated,
  ProcessingJob,
  ProcessingQueueGroup,
  ProcessingStatus,
} from '../types';

export async function fetchQueue(
  machineId?: string,
): Promise<ProcessingQueueGroup[]> {
  const { data } = await api.get<ProcessingQueueGroup[]>('/processing/queue', {
    params: machineId ? { machineId } : undefined,
  });
  return data;
}

export interface ProcessingHistoryFilters {
  status?: ProcessingStatus;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

/** Geçmiş üretim işleri (tarih aralığı + durum ile). */
export async function fetchProcessingHistory(
  filters: ProcessingHistoryFilters,
): Promise<Paginated<ProcessingJob>> {
  const { data } = await api.get<Paginated<ProcessingJob>>('/processing', {
    params: filters,
  });
  return data;
}

export interface CompleteOptions {
  finalAmount?: number;
  /** Fire/kalan parça: kesimden artan parçanın ebadı (mm). İkisi de verilirse
   * kesik plaka olarak stoğa eklenir (sahiplik korunur). */
  offcutWidthMm?: number;
  offcutHeightMm?: number;
}

export async function setProcessingStatus(
  id: string,
  status: ProcessingStatus,
  opts: CompleteOptions = {},
): Promise<ProcessingJob> {
  const { data } = await api.patch<ProcessingJob>(`/processing/${id}/status`, {
    status,
    ...(opts.finalAmount != null ? { finalAmount: opts.finalAmount } : {}),
    ...(opts.offcutWidthMm != null ? { offcutWidthMm: opts.offcutWidthMm } : {}),
    ...(opts.offcutHeightMm != null
      ? { offcutHeightMm: opts.offcutHeightMm }
      : {}),
  });
  return data;
}

export interface UpdateProcessingJobInput {
  processedAt?: string;
  completedAt?: string;
  note?: string;
}

/** Tamamlanmış/var olan işin tarihlerini ve notunu düzenler. */
export async function updateProcessingJob(
  id: string,
  input: UpdateProcessingJobInput,
): Promise<ProcessingJob> {
  const { data } = await api.patch<ProcessingJob>(`/processing/${id}`, input);
  return data;
}

/** Geçmiş işi sil: stoğu iade eder + cari hareketini ekstreden düşer. */
export async function deleteProcessingJob(id: string): Promise<void> {
  await api.delete(`/processing/${id}`);
}
