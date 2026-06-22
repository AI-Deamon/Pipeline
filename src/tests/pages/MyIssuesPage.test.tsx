import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyIssuesPage from '../../pages/MyIssuesPage';
import { api } from '../../services/api';

describe('MyIssuesPage', () => {
  const original = api.issues.getMyIssues;

  beforeEach(() => {
    api.issues.getMyIssues = vi.fn().mockResolvedValue({
      total: 3,
      page: 1,
      page_size: 25,
      projects: [{ project_id: 'proj_1', total: 2 }, { project_id: 'proj_2', total: 1 }],
      issues: [
        { id: 1, project_id: 'proj_1', tool_name: 'sonarqube', title: 'Bug A', severity: 'high', status: 'assigned', last_seen_at: '2026-01-15T00:00:00Z' },
        { id: 2, project_id: 'proj_1', tool_name: 'zap', title: 'Bug B', severity: 'medium', status: 'open', last_seen_at: '2026-01-14T00:00:00Z' },
        { id: 3, project_id: 'proj_2', tool_name: 'trivy', title: 'Bug C', severity: 'critical', status: 'in_progress', last_seen_at: '2026-01-13T00:00:00Z' },
      ],
    });
  });

  afterEach(() => {
    api.issues.getMyIssues = original;
  });

  function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MyIssuesPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  test('renders error state', async () => {
    api.issues.getMyIssues = vi.fn().mockRejectedValue(new Error('Failed'));
    renderPage();
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
  });

  test('renders empty state', async () => {
    api.issues.getMyIssues = vi.fn().mockResolvedValue({ total: 0, page: 1, page_size: 25, projects: [], issues: [] });
    renderPage();
    expect(await screen.findByText('No issues assigned')).toBeInTheDocument();
  });

  test('renders issues grouped by project', async () => {
    renderPage();
    expect(await screen.findByText('proj_1')).toBeInTheDocument();
    expect(screen.getByText('proj_2')).toBeInTheDocument();
    expect(screen.getByText('Bug A')).toBeInTheDocument();
    expect(screen.getByText('Bug C')).toBeInTheDocument();
  });

  test('displays total count', async () => {
    renderPage();
    expect(await screen.findByText('3 issues assigned to you')).toBeInTheDocument();
  });
});
