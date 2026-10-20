import { api } from './client';

/**
 * Dükkân bilgisayarında çalışan StockTrack Runner'ın son durumu (runner her
 * turda nabız gönderir). Teklif işe dönünce klasörleri o açar.
 */
export interface CorelRunnerStatus {
  id: string;
  /** Bilgisayar adı. */
  host: string;
  version: string | null;
  startedAt: string | null;
  lastSeenAt: string;
  secondsAgo: number;
  /** Beklenen sürede nabız geldi mi. */
  online: boolean;
  pollSeconds: number;
  dayRoot: string | null;
  dayRootSource: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastJobQuoteNo: string | null;
  lastJobAt: string | null;
  lastFolder: string | null;
}

export async function fetchCorelRunners(): Promise<CorelRunnerStatus[]> {
  const { data } = await api.get<CorelRunnerStatus[]>('/corel-runners');
  return data;
}

export async function deleteCorelRunner(id: string): Promise<void> {
  await api.delete(`/corel-runners/${id}`);
}
