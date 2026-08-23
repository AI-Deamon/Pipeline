import { render, screen, waitFor, act } from '@testing-library/react';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TrendAnalysisPage from '../../pages/TrendAnalysisPage';
import { api } from '../../services/api';

/**
 * Regression test for #106: the aggregated trends query's key never reflected
 * the project set it closes over — a project created while this page was
 * mounted wouldn't fold into the aggregate until a full remount, since
 * TanStack Query only considers the query key for staleness/refetching.
 */
describe('TrendAnalysisPage trends query key includes the project set', () => {
  const originalProjects = api.projects.list;
  const originalTrends = api.reports.getTrends;

  beforeEach(() => {
    api.reports.getTrends = vi.fn().mockResolvedValue([
      { date: '2026-01-15', critical: 1, high: 1, medium: 1, low: 1 },
    ]);
  });

  afterEach(() => {
    api.projects.list = originalProjects;
    api.reports.getTrends = originalTrends;
  });

  test('a new project added after mount is folded into the trends query without a remount', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    // A single stable mock whose resolved data changes across calls — matches
    // how `api.projects.list` actually behaves in the real app (same function
    // reference throughout; only the *data it returns* changes between calls).
    const projectsMock = vi.fn().mockResolvedValueOnce([{ project_id: 'proj_1', name: 'Project Alpha' }]);
    api.projects.list = projectsMock;

    render(
      <QueryClientProvider client={queryClient}>
        <TrendAnalysisPage />
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText('Trend Analysis')).toBeInTheDocument());
    await waitFor(() => expect(api.reports.getTrends).toHaveBeenCalledWith('proj_1', 90));
    expect(api.reports.getTrends).not.toHaveBeenCalledWith('proj_2', 90);

    // Simulate a new project appearing (e.g. created in another tab) and the
    // projects query refetching — same mock function, new resolved data, same
    // component instance, no remount.
    projectsMock.mockResolvedValueOnce([
      { project_id: 'proj_1', name: 'Project Alpha' },
      { project_id: 'proj_2', name: 'Project Beta' },
    ]);
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
    });

    // The new project must be picked up and fetched into the trends aggregate —
    // previously the stale `["trends", "all"]` key meant this never happened
    // until a full page remount.
    await waitFor(() => expect(api.reports.getTrends).toHaveBeenCalledWith('proj_2', 90));
  });
});
