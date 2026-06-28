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

export async function setProcessingStatus(
  id: string,
  status: ProcessingStatus,
): Promise<ProcessingJob> {
  const { data } = await api.patch<ProcessingJob>(`/processing/${id}/status`, {
    status,
  });
  return data;
}
