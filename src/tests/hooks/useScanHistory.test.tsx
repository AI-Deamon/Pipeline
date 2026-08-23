import { renderHook, waitFor, act } from '@testing-library/react';
import { vi, afterEach, test, expect, describe } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api } from '../../services/api';
import { useScanHistory } from '../../hooks/useScanHistory';

/**
 * Regression test for #121: useScanHistory and ScanHistoryPage both fetch the
 * same `/projects/{id}/scans` endpoint but previously used different query keys
 * ('scans' vs 'scan-history'), holding two independent, unsynchronized cache
 * entries. useScanReset's mutations only invalidated 'scan-history', so this
 * hook's data went stale until its own unrelated refetch fired.
 */
describe('useScanHistory query key', () => {
  const original = api.scans.getHistory;

  afterEach(() => {
    api.scans.getHistory = original;
  });

  test('shares a cache entry with the "scan-history" key used elsewhere', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    api.scans.getHistory = vi.fn().mockResolvedValue([
      { scan_id: 'scan-1', state: 'COMPLETED', created_at: '2026-01-01T00:00:00Z' },
    ]);

    const { result } = renderHook(() => useScanHistory('proj-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(api.scans.getHistory).toHaveBeenCalledTimes(1);

    // Invalidating 'scan-history' (what useScanReset's mutations do) must trigger
    // a refetch of this hook's data — proving they share the same cache key.
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['scan-history'] });
    });

    await waitFor(() => expect(api.scans.getHistory).toHaveBeenCalledTimes(2));
  });
});
