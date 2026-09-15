import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import DeveloperReportPage from '../../pages/DeveloperReportPage';
import { api } from '../../services/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

describe('DeveloperReportPage', () => {
  const originalGetProject = api.projects.get;
  const originalGetDevReport = api.reports.getDeveloperReport;
  const originalGetScan = api.scans.get;
  const originalExport = api.reports.exportUnified;

  beforeEach(() => {
    api.projects.get = vi.fn().mockResolvedValue({ project_id: 'p1', name: 'Test Project' });
    api.reports.getDeveloperReport = vi.fn().mockResolvedValue({
      files: [], summary: { total_files: 0, total_issues: 0 }, quality_gate: { status: 'OK', conditions: [] },
    });
    api.scans.get = vi.fn().mockResolvedValue({ scan_id: 's1', created_at: new Date().toISOString() });
    api.reports.exportUnified = vi.fn().mockResolvedValue(new Blob());
  });

  afterEach(() => {
    api.projects.get = originalGetProject;
    api.reports.getDeveloperReport = originalGetDevReport;
    api.scans.get = originalGetScan;
    api.reports.exportUnified = originalExport;
  });

  test('Export PDF button triggers a real export, not a no-op', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/projects/p1/reports/s1/developer"]}>
          <Routes>
            <Route path="/projects/:projectId/reports/:scanId/developer" element={<DeveloperReportPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    const exportBtn = await screen.findByRole('button', { name: /Export PDF/ });
    exportBtn.click();
    await vi.waitFor(() => expect(api.reports.exportUnified).toHaveBeenCalledWith('p1', 'pdf', 's1', 'technical'));
  });
});
