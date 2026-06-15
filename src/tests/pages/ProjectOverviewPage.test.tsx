import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProjectOverviewPage from '../../pages/ProjectOverviewPage';
import { api } from '../../services/api';

describe('ProjectOverviewPage', () => {
  const original = api.issues.getProjectOverview;

  beforeEach(() => {
    api.issues.getProjectOverview = vi.fn().mockResolvedValue({
      project_id: 'proj_1',
      tools: [
        { tool: 'sonarqube', total: 10, severity: { critical: 2, high: 3, medium: 4, low: 1 } },
        { tool: 'zap', total: 5, severity: { high: 2, medium: 3 } },
      ],
    });
  });

  afterEach(() => {
    api.issues.getProjectOverview = original;
  });

  function renderPage(projectId = 'proj_1') {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/projects/${projectId}/issues`]}>
          <Routes>
            <Route path="/projects/:projectId/issues" element={<ProjectOverviewPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  test('renders error state', async () => {
    api.issues.getProjectOverview = vi.fn().mockRejectedValue(new Error('Network error'));
    renderPage();
    expect(await screen.findByText('Failed to load issues')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  test('renders empty state', async () => {
    api.issues.getProjectOverview = vi.fn().mockResolvedValue({ project_id: 'proj_1', tools: [] });
    renderPage();
    expect(await screen.findByText('No issues found')).toBeInTheDocument();
  });

  test('renders tool cards', async () => {
    renderPage();
    expect(await screen.findByText('sonarqube')).toBeInTheDocument();
    expect(screen.getByText('zap')).toBeInTheDocument();
  });
});
