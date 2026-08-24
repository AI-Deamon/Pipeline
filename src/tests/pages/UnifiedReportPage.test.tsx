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

  // Regression test for a real bug found live: this page's findings table
  // never grouped repeated findings at all — every occurrence got its own
  // full row, unlike ProjectReportsPage's table (fixed in tracker #138).
  // Now reuses the same FindingsTable component, so repeats collapse into
  // one row with an occurrence count.
  test('repeated findings collapse into one row with an occurrence count, not one row each', async () => {
    api.reports.getUnified = vi.fn().mockResolvedValue({
      project_id: 'test-project',
      scan_id: 'test-scan',
      total_findings: 2,
      severity: { critical: 2, high: 0, medium: 0, low: 0, info: 0 },
      findings: [
        { id: 'f-1', severity: 'Critical', title: 'Repeated finding', tool: 'sonar', rule: 'S123' },
        { id: 'f-2', severity: 'Critical', title: 'Repeated finding', tool: 'sonar', rule: 'S123' },
      ],
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

    expect(await screen.findByText('2 occurrences')).toBeInTheDocument();
    expect(screen.getAllByText('Repeated finding')).toHaveLength(1);
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
    expect(await screen.findByText('Security Report')).toBeInTheDocument();
  });
});
