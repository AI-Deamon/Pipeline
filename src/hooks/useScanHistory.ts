import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export interface ScanInfo {
  scan_id: string;
  state: string;
  created_at: string;
}

export function useScanHistory(projectId: string | undefined) {
  const { data: scans, isLoading } = useQuery({
    queryKey: ['scans', projectId],
    queryFn: () => api.scans.getHistory(projectId!),
    select: (data: ScanInfo[]) =>
      data
        .filter((s) => s.state === 'COMPLETED')
        .sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
    enabled: !!projectId,
  });

  return { scans: scans || [], isLoading };
}
