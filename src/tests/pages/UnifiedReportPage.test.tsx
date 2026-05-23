/** @jsxImportSource react */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import UnifiedReportPage from '../../pages/UnifiedReportPage';
import { api } from '../../services/api';
import { ToastProvider } from '../../components/Toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
    expect(await screen.findByText('Security Report')).toBeInTheDocument();
  });
});
