import { useQuery } from '@tanstack/react-query';
import { fetchSystemInfo, fetchSyncStatus } from '../api/system.api';

/**
 * Bağlanılan sunucu merkez mi, yerel sunucu mu? Rol çalışırken değişmez;
 * bir kez sorulur (oturum gerektirmez).
 */
export function useSystemInfo() {
  return useQuery({
    queryKey: ['system', 'info'],
    queryFn: fetchSystemInfo,
    staleTime: 10 * 60_000,
    retry: 1,
  });
}

/** Yerel sunucuda eşitleme durumu (yalnız yerel sunucuda istenir). */
export function useSyncStatus(enabled: boolean) {
  return useQuery({
    queryKey: ['system', 'sync'],
    queryFn: fetchSyncStatus,
    enabled,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}
