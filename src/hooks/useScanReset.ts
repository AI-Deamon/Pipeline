import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { ScanError } from '../types';

export type { ScanError };

export interface ScanResetResult {
  status: string;
  message: string;
  scan_id: string;
  project_id: string;
}

export function useScanReset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scanId: string): Promise<ScanResetResult> => {
      // Use api.scans.reset which handles auth headers via axios interceptor
      return api.scans.reset(scanId);
    },
    onSuccess: (data) => {
      // Invalidate relevant queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['scan', data.scan_id] });
      queryClient.invalidateQueries({ queryKey: ['scan-history', data.project_id] });
      queryClient.invalidateQueries({ queryKey: ['projects', data.project_id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useScanForceUnlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scanId: string): Promise<{ status: string; message: string; scan_id: string }> => {
      return api.scans.forceUnlock(scanId);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['scan', data.scan_id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useScanCancel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scanId: string): Promise<{ status: string; message: string; scan_id: string }> => {
      // Use api.scans.cancel which handles auth headers via axios interceptor
      return api.scans.cancel(scanId);
    },
    onSuccess: (data) => {
      // Invalidate relevant queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['scan', data.scan_id] });
      queryClient.invalidateQueries({ queryKey: ['scan-history'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
