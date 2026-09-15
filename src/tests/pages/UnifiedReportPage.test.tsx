/** @jsxImportSource react */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import UnifiedReportPage from '../../pages/UnifiedReportPage';
import { api } from '../../services/api';
import { ToastProvider } from '../../components/Toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
    expect(await screen.findByLabelText('Export format')).toBeInTheDocument();
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
});
