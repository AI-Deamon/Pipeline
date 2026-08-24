import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import DashboardPage from '../../pages/DashboardPage';
import { api } from '../../services/api';
import { ToastProvider } from '../../components/Toast';

vi.mock('../../hooks/useRbac', () => ({
  useRbac: () => ({ isAdmin: true, canViewAllProjects: true }),
}));

describe('DashboardPage', () => {
  const originalProjects = api.projects.list;
  const originalOverview = api.portfolio.getOverview;
  const originalTrends = api.portfolio.getTrends;

  beforeEach(() => {
    api.projects.list = vi.fn().mockResolvedValue([
      { project_id: 'proj_1', name: 'Project Alpha' },
    ]);
    api.portfolio.getOverview = vi.fn().mockResolvedValue({
      total_projects: 1,
      total_findings: 10,
      severity: { critical: 2, high: 3, medium: 4, low: 1, info: 0 },
      projects: [
        {
          project_id: 'proj_1',
          name: 'Project Alpha',
          risk_score: 75,
          total_findings: 10,
          critical: 2, high: 3, medium: 4, low: 1, info: 0,
          tools: ['sonar', 'trivy'],
          last_scan_state: 'COMPLETED',
          last_scan_id: 'scan_1',
          quality_gate_status: 'OK',
        },
      ],
    });
    api.portfolio.getTrends = vi.fn().mockResolvedValue({
      trends: [
        { month: '2026-01', critical: 5, high: 10, medium: 15, low: 20, info: 0, total: 50, coverage_avg: 80 },
        { month: '2026-02', critical: 3, high: 8, medium: 12, low: 18, info: 0, total: 41, coverage_avg: 82 },
      ],
      months: 2,
    });
  });

  afterEach(() => {
    api.projects.list = originalProjects;
    api.portfolio.getOverview = originalOverview;
    api.portfolio.getTrends = originalTrends;
  });

  function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <DashboardPage />
          </ToastProvider>
        </QueryClientProvider>
      </BrowserRouter>
    );
  }

  test('renders projects table with data', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getAllByText('Project Alpha').length).toBeGreaterThanOrEqual(1);
    });
  });

  test('renders empty state when no projects', async () => {
    api.projects.list = vi.fn().mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No projects yet')).toBeInTheDocument();
    });
  });

  // Regression test for finding #60: a failed fetch previously fell straight
  // through to "No projects yet" — identical to a genuinely empty account, giving
  // no indication anything had actually gone wrong.
  test('renders an error state, not the empty state, when the projects fetch fails', async () => {
    api.projects.list = vi.fn().mockRejectedValue(new Error('network down'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Couldn't load projects")).toBeInTheDocument();
    });
    expect(screen.queryByText('No projects yet')).not.toBeInTheDocument();
  });

  // Absorbed from the now-deleted PortfolioDashboardPage: its Quality Gate
  // and Tool Comparison content lives on the Overview tab now, not a
  // separate "Security Overview" page.
  test('shows quality gate status on the Overview tab', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Quality Gate Status')).toBeInTheDocument();
    });
  });

  test('shows tool comparison when portfolio projects have tools', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Tool Comparison')).toBeInTheDocument();
    });
  });
});

describe('DashboardPage tabs', () => {
  const originalProjects = api.projects.list;
  const originalOverview = api.portfolio.getOverview;
  const originalTrends = api.reports.getTrends;
  const originalWorkload = api.portfolio.getTeamWorkload;

  beforeEach(() => {
    api.projects.list = vi.fn().mockResolvedValue([
      { project_id: 'proj_1', name: 'Project Alpha' },
    ]);
    api.portfolio.getOverview = vi.fn().mockResolvedValue({
      total_projects: 1,
      total_findings: 10,
      severity: { critical: 2, high: 3, medium: 4, low: 1, info: 0 },
      projects: [
        {
          project_id: 'proj_1',
          name: 'Project Alpha',
          risk_score: 75,
          total_findings: 10,
          critical: 2, high: 3, medium: 4, low: 1, info: 0,
          tools: ['sonar'],
          last_scan_state: 'COMPLETED',
          last_scan_id: 'scan_1',
          quality_gate_status: 'OK',
        },
      ],
    });
    api.reports.getTrends = vi.fn().mockResolvedValue([
      { date: '2026-01-15', critical: 5, high: 10, medium: 15, low: 20 },
    ]);
    api.portfolio.getTeamWorkload = vi.fn().mockResolvedValue({
      developers: [{ username: 'alice', total_issues: 3, critical: 1, high: 1, medium: 1, low: 0 }],
      unassigned: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
    });
  });

  afterEach(() => {
    api.projects.list = originalProjects;
    api.portfolio.getOverview = originalOverview;
    api.reports.getTrends = originalTrends;
    api.portfolio.getTeamWorkload = originalWorkload;
  });

  function renderPage(route = '/dashboard') {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <MemoryRouter initialEntries={[route]}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <DashboardPage />
          </ToastProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }

  test('defaults to the Overview tab', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Project Alpha').length).toBeGreaterThanOrEqual(1);
    });
  });

  test('?tab=trends deep link opens the Trends tab directly', async () => {
    renderPage('/dashboard?tab=trends');
    await waitFor(() => {
      expect(screen.getByText('Key Insights')).toBeInTheDocument();
    });
  });

  test('?tab=workload deep link opens the Team Workload tab directly', async () => {
    renderPage('/dashboard?tab=workload');
    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
    });
  });

  test('clicking the Trends tab switches without a route change to a separate page', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Project Alpha').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getByRole('button', { name: /^trends$/i }));
    await waitFor(() => {
      expect(screen.getByText('Key Insights')).toBeInTheDocument();
    });
  });
});
