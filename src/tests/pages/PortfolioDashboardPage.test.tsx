import { render, screen, waitFor } from '@testing-library/react';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import PortfolioDashboardPage from '../../pages/PortfolioDashboardPage';
import { api } from '../../services/api';

describe('PortfolioDashboardPage', () => {
  const originalOverview = api.portfolio.getOverview;

  beforeEach(() => {
    api.portfolio.getOverview = vi.fn().mockResolvedValue({
      total_projects: 2,
      total_findings: 25,
      severity: { critical: 3, high: 5, medium: 10, low: 7, info: 0 },
      projects: [
        {
          project_id: 'proj_1',
          name: 'Project Alpha',
          risk_score: 85,
          total_findings: 15,
          critical: 2, high: 3, medium: 6, low: 4, info: 0,
          tools: ['sonar', 'trivy'],
          last_scan_state: 'COMPLETED',
          quality_gate_status: 'OK',
        },
        {
          project_id: 'proj_2',
          name: 'Project Beta',
          risk_score: 45,
          total_findings: 10,
          critical: 1, high: 2, medium: 4, low: 3, info: 0,
          tools: ['zap'],
          last_scan_state: 'FAILED',
          quality_gate_status: 'ERROR',
        },
      ],
    });
  });

  afterEach(() => {
    api.portfolio.getOverview = originalOverview;
  });

  function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <PortfolioDashboardPage />
        </QueryClientProvider>
      </BrowserRouter>
    );
  }

  test('renders portfolio overview with projects', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Security Dashboard')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Project Alpha').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Project Beta').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('25')).toBeInTheDocument();
  });

  test('shows quality gate status', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Quality Gate Status')).toBeInTheDocument();
    });
    expect(screen.getAllByText('OK').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('ERROR').length).toBeGreaterThanOrEqual(1);
  });

  test('shows error state on API failure', async () => {
    api.portfolio.getOverview = vi.fn().mockRejectedValue(new Error('Network error'));
    renderPage();
    expect(
      await screen.findByText("Couldn't load portfolio data.")
    ).toBeInTheDocument();
  });
});
