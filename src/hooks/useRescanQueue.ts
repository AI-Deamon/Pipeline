import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { PendingVerificationResponse } from '../types';

export function useRescanQueue(
  status: 'pending' | 'approved' | 'completed' | 'rejected' = 'pending',
  projectId?: string
) {
  return useQuery<PendingVerificationResponse>({
    queryKey: ['pending-verification', status, projectId ?? ''],
    queryFn: () =>
      api.issues.getPendingVerification({
        status,
        project_id: projectId,
      }),
    refetchInterval: 5000,
  });
}
