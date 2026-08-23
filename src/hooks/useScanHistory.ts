import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export interface ScanInfo {
  scan_id: string;
  state: string;
  created_at: string;
}

export function useScanHistory(projectId: string | undefined) {
  const { data: scans, isLoading } = useQuery({
    // Finding #121: this and ScanHistoryPage.tsx both fetch the same
    // `/projects/{id}/scans` endpoint but previously used different query keys
    // ('scans' vs 'scan-history'), so they held two independent, unsynchronized
    // cache entries. useScanReset's cancel/reset/force-unlock mutations only
    // invalidate 'scan-history' — this page's data went stale after any of those
    // actions until its own unrelated refetch happened to fire. Matching the key
    // means both consumers share one cache entry and one invalidation.
    queryKey: ['scan-history', projectId],
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
