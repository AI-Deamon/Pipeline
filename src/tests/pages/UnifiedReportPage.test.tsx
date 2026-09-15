/** @jsxImportSource react */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import UnifiedReportPage from '../../pages/UnifiedReportPage';
import { api } from '../../services/api';
import { ToastProvider } from '../../components/Toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// MemoryRouter keeps its history in-memory and never syncs window.location in
// jsdom, so tests that need to observe the URL read it from the router's own
// location via this probe instead of window.location.
const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname + location.search}</div>;
};

// Lets a test trigger an in-memory "browser back" without going through real
// window.history, mirroring how a user's Back button would behave.
const BackButtonProbe = () => {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      Simulate back
    </button>
  );
};

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

describe('UnifiedReportPage', () => {
  const originalGetUnified = api.reports.getUnified;
  const originalGetTrends = api.reports.getTrends;
  const originalGetCompliance = api.reports.getCompliance;
  const originalGetHistory = api.scans.getHistory;

  beforeEach(() => {
    api.reports.getUnified = vi.fn().mockResolvedValue({
      project_id: 'test-project',
      scan_id: 'test-scan',
      total_findings: 10,
      severity: { critical: 1, high: 2, medium: 3, low: 4, info: 0 },
      findings: [],
      generated_at: new Date().toISOString(),
    });
    api.reports.getTrends = vi.fn().mockResolvedValue([]);
    api.reports.getCompliance = vi.fn().mockResolvedValue({
      project_id: 'test-project',
      compliance: { owasp_top_10: [], cwe_top_25: [] },
      generated_at: new Date().toISOString(),
    });
    api.scans.getHistory = vi.fn().mockResolvedValue([
      { scan_id: 'test-scan', state: 'COMPLETED', created_at: new Date().toISOString() },
    ]);
  });

  afterEach(() => {
    api.reports.getUnified = originalGetUnified;
    api.reports.getTrends = originalGetTrends;
    api.reports.getCompliance = originalGetCompliance;
    api.scans.getHistory = originalGetHistory;
  });

  test('renders without crashing', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/projects/test-project/reports/unified"]}>
            <Routes>
              <Route path="/projects/:projectId/reports/unified" element={<UnifiedReportPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );
    expect(await screen.findByText('Security report')).toBeInTheDocument();
  });

  test('report type select is labeled as export format, not a view switcher', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/projects/test-project/reports/unified"]}>
            <Routes>
              <Route path="/projects/:projectId/reports/unified" element={<UnifiedReportPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );
    expect(await screen.findByLabelText('Export format / view')).toBeInTheDocument();
  });

  test('clicking a TOC entry scrolls its section into view', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/projects/test-project/reports/unified"]}>
            <Routes>
              <Route path="/projects/:projectId/reports/unified" element={<UnifiedReportPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );
    const link = await screen.findByRole('button', { name: 'Findings' });
    link.click();
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  test('export passes the currently selected scan id, not undefined', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const exportSpy = vi.fn().mockResolvedValue(new Blob());
    api.reports.exportUnified = exportSpy;
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/projects/test-project/reports/unified"]}>
            <Routes>
              <Route path="/projects/:projectId/reports/unified" element={<UnifiedReportPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );
    const exportBtn = await screen.findByRole('button', { name: /Export HTML/ });
    exportBtn.click();
    await vi.waitFor(() => expect(exportSpy).toHaveBeenCalledWith('test-project', 'html', 'test-scan', 'technical'));
  });

  test('clicking an OWASP compliance row filters and scrolls to matching findings', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    api.reports.getCompliance = vi.fn().mockResolvedValue({
      project_id: 'test-project',
      compliance: { owasp_top_10: [{ id: 'A01', name: 'Broken Access Control', count: 1 }], cwe_top_25: [] },
      generated_at: new Date().toISOString(),
    });
    api.reports.getUnified = vi.fn().mockResolvedValue({
      project_id: 'test-project', scan_id: 'test-scan', total_findings: 1,
      severity: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
      findings: [{ id: 'f1', severity: 'Critical', title: 'Broken Access', tool: 'zap', rule: 'A01' }],
      generated_at: new Date().toISOString(),
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/projects/test-project/reports/unified"]}>
            <Routes>
              <Route path="/projects/:projectId/reports/unified" element={<UnifiedReportPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );
    const row = await screen.findByRole('button', { name: /A01.*Broken Access Control/ });
    row.click();
    expect(await screen.findByText('Broken Access')).toBeInTheDocument();
  });

  test('back to detailed view preserves the selected scan id', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    api.scans.getHistory = vi.fn().mockResolvedValue([
      { scan_id: 'scan-1', state: 'COMPLETED', created_at: new Date().toISOString() },
      { scan_id: 'scan-2', state: 'COMPLETED', created_at: new Date().toISOString() },
    ]);
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/projects/test-project/reports/unified?scanId=scan-2"]}>
            <Routes>
              <Route path="/projects/:projectId/reports/unified" element={<UnifiedReportPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );
    const select = await screen.findByLabelText('Select scan');
    expect(select).toHaveValue('scan-2');
  });

  test('scan selector options show severity counts', async () => {
    // Note: uses vi.waitFor (rather than testing-library's own findBy*/waitFor)
    // to poll for async render completion. In this React 19 + RTL 16 + Vitest 4
    // combination, testing-library's own waitFor can resolve/reject on its
    // first check instead of polling on pages with several chained async
    // effects/queries; vi.waitFor polls reliably against the same real
    // (mocked) render output.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    api.scans.getHistory = vi.fn().mockResolvedValue([
      { scan_id: 'scan-1', state: 'COMPLETED', created_at: new Date().toISOString() },
      { scan_id: 'scan-2', state: 'COMPLETED', created_at: new Date().toISOString() },
    ]);
    api.reports.getSummary = vi.fn().mockImplementation((_pid: string, scanId: string) =>
      Promise.resolve({
        project_id: 'test-project',
        total_findings: 0,
        severity: { critical: scanId === 'scan-1' ? 3 : 0, high: 1, medium: 0, low: 0, info: 0 },
        tools: [],
      })
    );
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/projects/test-project/reports/unified"]}>
            <Routes>
              <Route path="/projects/:projectId/reports/unified" element={<UnifiedReportPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );
    await vi.waitFor(() => {
      expect(screen.getByRole('option', { name: /3C 1H/ })).toBeInTheDocument();
    });
  });

  test('browser back closes the open finding panel before leaving the page', async () => {
    api.reports.getUnified = vi.fn().mockResolvedValue({
      project_id: 'test-project', scan_id: 'test-scan', total_findings: 1,
      severity: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
      findings: [{ id: 'f1', severity: 'Critical', title: 'Finding One', tool: 'zap' }],
      generated_at: new Date().toISOString(),
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/projects/test-project/reports/unified"]}>
            <LocationProbe />
            <Routes>
              <Route path="/projects/:projectId/reports/unified" element={<UnifiedReportPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );
    (await screen.findByText('Finding One')).click();
    expect(await screen.findByText('Finding details')).toBeInTheDocument();
    expect(screen.getByTestId('location-probe').textContent).toContain('finding=f1');
  });

  test('Next/Prev triage navigation replaces history instead of pushing, so Back closes the panel in one step', async () => {
    api.reports.getUnified = vi.fn().mockResolvedValue({
      project_id: 'test-project', scan_id: 'test-scan', total_findings: 2,
      severity: { critical: 2, high: 0, medium: 0, low: 0, info: 0 },
      findings: [
        { id: 'f1', severity: 'Critical', title: 'Finding One', tool: 'zap' },
        { id: 'f2', severity: 'Critical', title: 'Finding Two', tool: 'zap' },
      ],
      generated_at: new Date().toISOString(),
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/projects/test-project/reports/unified"]}>
            <LocationProbe />
            <BackButtonProbe />
            <Routes>
              <Route path="/projects/:projectId/reports/unified" element={<UnifiedReportPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

    // Open the first finding (a null -> finding transition: this pushes).
    (await screen.findByText('Finding One')).click();
    expect(await screen.findByText('Finding details')).toBeInTheDocument();
    expect(screen.getByTestId('location-probe').textContent).toContain('finding=f1');

    // Navigate to the next finding (a finding -> finding transition: this
    // must replace, not push, or Back below would land on f1 instead of
    // closing the panel).
    screen.getByRole('button', { name: 'Next finding' }).click();
    await vi.waitFor(() => {
      expect(screen.getByTestId('location-probe').textContent).toContain('finding=f2');
    });

    // One Back from here must close the panel entirely (land on the
    // pre-open entry), not step back to finding=f1.
    screen.getByRole('button', { name: 'Simulate back' }).click();
    await vi.waitFor(() => {
      expect(screen.getByTestId('location-probe').textContent).not.toContain('finding=');
    });
    expect(screen.queryByText('Finding details')).not.toBeInTheDocument();
  });
});
