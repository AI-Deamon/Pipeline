import { render, screen, waitFor } from '@testing-library/react';
import { vi, afterEach, test, expect, describe } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import IssuesTriagePage from '../../pages/IssuesTriagePage';
import { api } from '../../services/api';

vi.mock('../../hooks/useRbac', () => ({
  useRbac: () => ({ canAssignIssues: true, isAdmin: true }),
}));

const baseIssue = {
  id: 1,
  issue_id: 'i-1',
  project_id: 'proj_1',
  tool_name: 'sonar',
  first_seen_at: '2026-01-01T00:00:00Z',
  last_seen_at: '2026-01-01T00:00:00Z',
  is_new: true,
  status: 'open' as const,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('IssuesTriagePage', () => {
  const originalProjects = api.projects.list;
  const originalOverview = api.issues.getProjectOverview;
  const originalToolIssues = api.issues.getToolIssues;

  afterEach(() => {
    api.projects.list = originalProjects;
    api.issues.getProjectOverview = originalOverview;
    api.issues.getToolIssues = originalToolIssues;
  });

  function renderPage(route = '/issues') {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <MemoryRouter initialEntries={[route]}>
        <QueryClientProvider client={queryClient}>
          <IssuesTriagePage />
        </QueryClientProvider>
      </MemoryRouter>
    );
  }

  // Regression test for a real bug found live: the severity filter compared
  // `severityFilter.includes(i.severity)` case-sensitively, so an issue with
  // severity "Critical" (mixed-case, from data that predates a backend
  // normalization fix) never matched the lowercase "critical" filter button
  // or a deep-linked ?severity=critical — silently returning zero results
  // even though the issue genuinely matched.
  test('severity filtering matches regardless of the stored value\'s case', async () => {
    api.projects.list = vi.fn().mockResolvedValue([{ project_id: 'proj_1', name: 'Project A' }]);
    api.issues.getProjectOverview = vi.fn().mockResolvedValue({
      project_id: 'proj_1',
      tools: [{ tool: 'sonar', total: 1, severity: {} }],
    });
    api.issues.getToolIssues = vi.fn().mockResolvedValue({
      total: 1,
      page: 1,
      page_size: 25,
      total_pages: 1,
      issues: [{ ...baseIssue, severity: 'Critical', title: 'Mixed-case severity issue' }],
    });

    renderPage('/issues?severity=critical');
    expect(await screen.findByText('Mixed-case severity issue')).toBeInTheDocument();
  });

  // Regression test for a real bug found live: a tool with more than 100
  // issues (151 real Sonar findings on a project here) silently lost
  // everything past page 4 — the fetch loop had a hard `page <= 4` cap
  // instead of only stopping when a page came back short.
  test('fetches all issues for a tool, not just the first 100', async () => {
    api.projects.list = vi.fn().mockResolvedValue([{ project_id: 'proj_1', name: 'Project A' }]);
    api.issues.getProjectOverview = vi.fn().mockResolvedValue({
      project_id: 'proj_1',
      tools: [{ tool: 'sonar', total: 130, severity: {} }],
    });
    api.issues.getToolIssues = vi.fn().mockImplementation(async (_pid, _tool, page = 1, pageSize = 25) => {
      const start = (page - 1) * pageSize;
      const remaining = Math.max(0, 130 - start);
      const count = Math.min(pageSize, remaining);
      return {
        total: 130,
        page,
        page_size: pageSize,
        total_pages: Math.ceil(130 / pageSize),
        issues: Array.from({ length: count }, (_, i) => ({
          ...baseIssue,
          id: start + i + 1,
          issue_id: `i-${start + i + 1}`,
          severity: 'low',
          title: `Issue ${start + i + 1}`,
        })),
      };
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/130 issues matching filters/)).toBeInTheDocument();
    });
  });

  test('an ?assignee= deep link pre-filters to that assignee', async () => {
    api.projects.list = vi.fn().mockResolvedValue([{ project_id: 'proj_1', name: 'Project A' }]);
    api.issues.getProjectOverview = vi.fn().mockResolvedValue({
      project_id: 'proj_1',
      tools: [{ tool: 'sonar', total: 2, severity: {} }],
    });
    api.issues.getToolIssues = vi.fn().mockResolvedValue({
      total: 2,
      page: 1,
      page_size: 25,
      total_pages: 1,
      issues: [
        { ...baseIssue, id: 1, severity: 'high', title: 'Alice issue', assignee_id: 'alice' },
        { ...baseIssue, id: 2, severity: 'high', title: 'Bob issue', assignee_id: 'bob' },
      ],
    });

    renderPage('/issues?assignee=alice');
    expect(await screen.findByText('Alice issue')).toBeInTheDocument();
    expect(screen.queryByText('Bob issue')).not.toBeInTheDocument();
  });
});
