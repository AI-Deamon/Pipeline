/** @jsxImportSource react */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import ProjectReportsPage from '../../pages/ProjectReportsPage';
import { api } from '../../services/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/Toast';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    token: 'mock-token',
    role: 'admin',
    permissions: {
      canManageUsers: true,
      canManageProjectAccess: true,
      canViewAllProjects: true,
      canAssignIssues: true,
      canVerifyIssues: true,
      canUpdateAssignedIssues: true,
    },
    currentUser: { id: 'u-1', username: 'admin', role: 'admin' },
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
    refreshUser: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe('ProjectReportsPage', () => {
  const originalGet = api.projects.get;
  const originalGetHistory = api.scans.getHistory;
  const originalGetSummary = api.reports.getSummary;
  const originalGetAll = api.reports.getAll;
  const originalScansGet = api.scans.get;

  beforeEach(() => {
    api.projects.get = vi.fn().mockResolvedValue({
      project_id: 'test-project',
      name: 'Test Project',
      git_url: 'https://example.com/repo.git',
      branch: 'main',
      credentials_id: 'c1',
      sonar_key: 'sonar1',
      target_url: 'https://target.example.com',
    });
    api.scans.getHistory = vi.fn().mockResolvedValue([
      { scan_id: 'scan-1', state: 'COMPLETED', created_at: new Date('2024-01-02').toISOString(), started_at: new Date('2024-01-02').toISOString(), finished_at: new Date('2024-01-02').toISOString() },
      { scan_id: 'scan-2', state: 'COMPLETED', created_at: new Date('2024-01-01').toISOString(), started_at: new Date('2024-01-01').toISOString(), finished_at: new Date('2024-01-01').toISOString() },
    ]);
    api.reports.getSummary = vi.fn().mockResolvedValue({
      project_id: 'test-project',
      total_findings: 0,
      severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      tools: [],
    });
    api.reports.getAll = vi.fn().mockResolvedValue([]);
    api.scans.get = vi.fn().mockResolvedValue({
      scan_id: 'scan-1',
      state: 'COMPLETED',
      results: [],
    });
  });

  afterEach(() => {
    api.projects.get = originalGet;
    api.scans.getHistory = originalGetHistory;
    api.reports.getSummary = originalGetSummary;
    api.reports.getAll = originalGetAll;
    api.scans.get = originalScansGet;
  });

  const renderPage = (initialEntry = '/projects/test-project/reports') => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
              <Route path="/projects/:projectId/reports" element={<ProjectReportsPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );
  };

  // Note: this suite uses `vi.waitFor` (rather than testing-library's own
  // `findBy*`/`waitFor`) to poll for async render completion. In this
  // React 19 + RTL 16 + Vitest 4 combination, testing-library's own waitFor
  // resolves/rejects on its very first check instead of polling, causing
  // false negatives on pages with several chained useQuery calls. vi.waitFor
  // polls correctly and asserts on the same real (mocked) render output.
  test('renders without crashing', async () => {
    renderPage();
    await vi.waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Scan report' })).toBeInTheDocument();
    });
  });

  test('scan selector options show severity counts', async () => {
    api.reports.getSummary = vi.fn().mockImplementation((_pid: string, scanId: string) =>
      Promise.resolve({
        project_id: 'test-project',
        total_findings: 0,
        severity: { critical: scanId === 'scan-1' ? 3 : 0, high: 1, medium: 0, low: 0, info: 0 },
        tools: [],
      })
    );

    renderPage();

    await vi.waitFor(() => {
      expect(screen.getByRole('option', { name: /3C 1H/ })).toBeInTheDocument();
    });
  });

  test('an All tools entry renders findings across every tool without requiring a tool click', async () => {
    // Distinct `rule` values so FindingsTable's grouped view puts each finding
    // in its own rule group (same fallback rule key would otherwise merge
    // both into one group and only show the first finding's title).
    api.reports.getAll = vi.fn().mockResolvedValue([
      { tool: 'sonar', findings: [{ id: 'f1', severity: 'High', title: 'Finding one', rule: 'rule-one' }] },
      { tool: 'trivy_fs', findings: [{ id: 'f2', severity: 'Critical', title: 'Finding two', rule: 'rule-two' }] },
    ]);

    renderPage();

    // Both tools' findings must actually be present together in the rendered
    // table (not just the header text) to prove selectedTool==='all' passes
    // no tool filter through to FindingsTable, rather than accidentally
    // scoping to a single tool.
    await vi.waitFor(() => {
      expect(screen.getByText('Finding one')).toBeInTheDocument();
      expect(screen.getByText('Finding two')).toBeInTheDocument();
    });

    // The header's count badge (`Findings — <span>{filteredFindings.length}</span>`)
    // must reflect the combined total across both tools, not just one.
    const heading = screen.getByText(/Findings —/);
    expect(heading.querySelector('span.tabular-nums')).toHaveTextContent('2');
  });
});
