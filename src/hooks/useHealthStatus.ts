import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

interface HealthStatus {
  status: 'operational' | 'degraded' | 'down';
  details?: string;
}

export function useHealthStatus() {
  return useQuery<HealthStatus>({
    queryKey: ['health-status'],
    queryFn: async () => {
      try {
        const response = await api.health.check();
        return response;
      } catch {
        return { status: 'down' as const, details: 'Unable to reach server' };
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
}
