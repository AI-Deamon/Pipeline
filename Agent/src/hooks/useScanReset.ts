import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

export interface ScanError {
  message: string;
  error_type?: string;
  jenkins_console_url?: string;
}

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
      const token = localStorage.getItem('token');
      const apiKey = localStorage.getItem('API_KEY') || import.meta.env.VITE_API_KEY;

      const headers: Record<string, string> = {};
      if (apiKey) headers['X-API-Key'] = apiKey;
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`/api/v1/scans/${scanId}/reset`, {
        method: 'POST',
        headers,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to reset scan');
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate relevant queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['scans', data.scan_id] });
      queryClient.invalidateQueries({ queryKey: ['projects', data.project_id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useScanCancel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scanId: string): Promise<{ status: string; message: string; scan_id: string }> => {
      const token = localStorage.getItem('token');
      const apiKey = localStorage.getItem('API_KEY') || import.meta.env.VITE_API_KEY;

      const headers: Record<string, string> = {};
      if (apiKey) headers['X-API-Key'] = apiKey;
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`/api/v1/scans/${scanId}/cancel`, {
        method: 'POST',
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to cancel scan';
        
        try {
          const error = JSON.parse(errorText);
          errorMessage = error.detail || error.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        
        throw new Error(errorMessage);
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate relevant queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['scans', data.scan_id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useScanHistory(projectId: string) {
  return api.scans.getHistory(projectId);
}
