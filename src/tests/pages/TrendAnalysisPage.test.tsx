import { render, screen, waitFor } from '@testing-library/react';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TrendAnalysisPage from '../../pages/TrendAnalysisPage';
import { api } from '../../services/api';

describe('TrendAnalysisPage', () => {
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

  function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <TrendAnalysisPage />
      </QueryClientProvider>
    );
  }

  test('renders trend analysis page with data', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Trend Analysis')).toBeInTheDocument();
    });
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('Key Insights')).toBeInTheDocument();
  });

  test('renders error state on API failure', async () => {
    api.projects.list = vi.fn().mockRejectedValue(new Error('Network error'));
    renderPage();
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
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Trend Analysis')).toBeInTheDocument();
    });
    expect(screen.getByText(/Comparing Feb 15 to Jan 15/)).toBeInTheDocument();
  });
});
