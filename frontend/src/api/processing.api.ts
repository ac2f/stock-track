import { api } from './client';
import type {
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

export async function setProcessingStatus(
  id: string,
  status: ProcessingStatus,
): Promise<ProcessingJob> {
  const { data } = await api.patch<ProcessingJob>(`/processing/${id}/status`, {
    status,
  });
  return data;
}
