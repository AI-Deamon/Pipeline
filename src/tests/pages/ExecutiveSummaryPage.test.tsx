import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ExecutiveSummaryPage from '../../pages/ExecutiveSummaryPage';
import { api } from '../../services/api';

describe('ExecutiveSummaryPage', () => {
  const originalProjects = api.projects.list;
  const originalGetSummary = api.reports.getSummary;

  beforeEach(() => {
    api.projects.list = vi.fn().mockResolvedValue([
      { project_id: 'proj_1', name: 'Project Alpha', status: 'COMPLETED' },
    ]);
    api.reports.getSummary = vi.fn().mockResolvedValue({
      total_findings: 10,
      severity: { critical: 2, high: 3, medium: 4, low: 1 },
      risk_score: { score: 75, level: 'Medium', trend: 'stable' },
    });
  });

  afterEach(() => {
    api.projects.list = originalProjects;
    api.reports.getSummary = originalGetSummary;
  });

  function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<ExecutiveSummaryPage />} />
            <Route path="/projects/:projectId/reports" element={<div>Reports page</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  test('renders ErrorDisplay when projects API fails', async () => {
    api.projects.list = vi.fn().mockRejectedValue(new Error('Network error'));
    renderPage();
    expect(
      await screen.findByText("Couldn't load executive summary data.")
    ).toBeInTheDocument();
  });

  test('renders page with valid data', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Executive summary')).toBeInTheDocument();
    });
    expect(screen.getAllByText('75').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Medium risk')).toBeInTheDocument();
    expect(screen.getAllByText('Project Alpha').length).toBeGreaterThanOrEqual(1);
  });

  test('does not show NaN for empty projects', async () => {
    api.projects.list = vi.fn().mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Executive summary')).toBeInTheDocument();
    });
    expect(screen.queryByText('NaN')).not.toBeInTheDocument();
  });

  test('shows trend indicator from backend risk_score', async () => {
    api.reports.getSummary = vi.fn().mockResolvedValue({
      total_findings: 5,
      severity: { critical: 1, high: 1, medium: 2, low: 1 },
      risk_score: { score: 60, level: 'Medium', trend: 'improving' },
    });
    renderPage();
    expect(await screen.findByText('improving')).toBeInTheDocument();
  });

  test('shows worsening trend', async () => {
    api.reports.getSummary = vi.fn().mockResolvedValue({
      total_findings: 20,
      severity: { critical: 5, high: 5, medium: 5, low: 5 },
      risk_score: { score: 30, level: 'Critical', trend: 'worsening' },
    });
    renderPage();
    expect(await screen.findByText('worsening')).toBeInTheDocument();
  });

  test('project row navigates to its reports page on click', async () => {
    renderPage();
    const row = await screen.findByRole('button', { name: /Project Alpha/ });
    fireEvent.click(row);
    expect(await screen.findByText('Reports page')).toBeInTheDocument();
  });

  test('project row navigates to its reports page on Enter key', async () => {
    renderPage();
    const row = await screen.findByRole('button', { name: /Project Alpha/ });
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(await screen.findByText('Reports page')).toBeInTheDocument();
  });

  test('project row navigates to its reports page on Space key', async () => {
    renderPage();
    const row = await screen.findByRole('button', { name: /Project Alpha/ });
    fireEvent.keyDown(row, { key: ' ' });
    expect(await screen.findByText('Reports page')).toBeInTheDocument();
  });
});
