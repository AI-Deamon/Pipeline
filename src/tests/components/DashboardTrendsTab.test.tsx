import { render, screen, waitFor, act } from '@testing-library/react';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardTrendsTab from '../../components/dashboard/DashboardTrendsTab';
import { api } from '../../services/api';

describe('DashboardTrendsTab', () => {
  const originalProjects = api.projects.list;
  const originalTrends = api.reports.getTrends;

  beforeEach(() => {
    api.projects.list = vi.fn().mockResolvedValue([
      { project_id: 'proj_1', name: 'Project Alpha' },
    ]);
    api.reports.getTrends = vi.fn().mockResolvedValue([
      { date: '2026-01-15', critical: 5, high: 10, medium: 15, low: 20 },
      { date: '2026-02-15', critical: 3, high: 8, medium: 12, low: 18 },
    ]);
  });

  afterEach(() => {
    api.projects.list = originalProjects;
    api.reports.getTrends = originalTrends;
  });

  function renderTab() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <DashboardTrendsTab />
      </QueryClientProvider>
    );
  }

  test('renders trend summary and key insights', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });
    expect(screen.getByText('Key Insights')).toBeInTheDocument();
  });

  test('renders error state on API failure', async () => {
    api.projects.list = vi.fn().mockRejectedValue(new Error('Network error'));
    renderTab();
    expect(
      await screen.findByText("Couldn't load project data.")
    ).toBeInTheDocument();
  });

  // Regression test for #107: "current"/"previous" are just the last two
  // calendar dates in the merged multi-project series, not necessarily the
  // same date across all projects. A relabel isn't a full fix, but the actual
  // dates being compared must be visible so a "Critical down 12" number isn't
  // silently misread as same-day parity across every project.
  test('shows the actual dates being compared in the summary caveat', async () => {
    renderTab();
    expect(await screen.findByText(/Comparing Feb 15 to Jan 15/)).toBeInTheDocument();
  });
});

/**
 * Regression test for #106: the aggregated trends query's key never reflected
 * the project set it closes over — a project created while this tab was
 * mounted wouldn't fold into the aggregate until a full remount, since
 * TanStack Query only considers the query key for staleness/refetching.
 */
describe('DashboardTrendsTab trends query key includes the project set', () => {
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

    const projectsMock = vi.fn().mockResolvedValueOnce([{ project_id: 'proj_1', name: 'Project Alpha' }]);
    api.projects.list = projectsMock;

    render(
      <QueryClientProvider client={queryClient}>
        <DashboardTrendsTab />
      </QueryClientProvider>
    );

    await waitFor(() => expect(api.reports.getTrends).toHaveBeenCalledWith('proj_1', 90));
    expect(api.reports.getTrends).not.toHaveBeenCalledWith('proj_2', 90);

    projectsMock.mockResolvedValueOnce([
      { project_id: 'proj_1', name: 'Project Alpha' },
      { project_id: 'proj_2', name: 'Project Beta' },
    ]);
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
    });

    await waitFor(() => expect(api.reports.getTrends).toHaveBeenCalledWith('proj_2', 90));
  });
});
