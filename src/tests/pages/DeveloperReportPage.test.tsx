import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import DeveloperReportPage from '../../pages/DeveloperReportPage';
import { api } from '../../services/api';
import type { DeveloperReport } from '../../types';

const mockReport: DeveloperReport = {
  project_id: 'proj-1',
  scan_id: 'scan-1',
  quality_gate: { status: 'OK', conditions: [] },
  summary: { total_files: 2, files_with_issues: 2, total_issues: 3 },
  files: [
    {
      file_path: 'src/low.ts',
      component_key: 'proj:src/low.ts',
      measures: { coverage: '80', complexity: '5', cognitive_complexity: '5', duplicated_lines_density: '0', ncloc: '50' },
      issues: [
        { id: 'i-1', message: 'Minor issue', severity: 'Low', line: 3 },
      ],
    },
    {
      file_path: 'src/critical.ts',
      component_key: 'proj:src/critical.ts',
      measures: { coverage: '10', complexity: '30', cognitive_complexity: '30', duplicated_lines_density: '20', ncloc: '200' },
      issues: [
        { id: 'i-2', message: 'Minor thing here too', severity: 'Low', line: 8 },
        { id: 'i-3', message: 'Critical vulnerability here', severity: 'Critical', line: 42, recommendation: 'Fix it now' },
      ],
    },
  ],
};

describe('DeveloperReportPage', () => {
  const originalGetReport = api.reports.getDeveloperReport;
  const originalGetProject = api.projects.get;
  const originalGetScan = api.scans.get;

  beforeEach(() => {
    api.projects.get = vi.fn().mockResolvedValue({ project_id: 'proj-1', name: 'Test Project', sonar_key: 'test-key' });
    api.reports.getDeveloperReport = vi.fn().mockResolvedValue(mockReport);
    api.scans.get = vi.fn().mockResolvedValue({ scan_id: 'scan-1', state: 'COMPLETED' });
  });

  afterEach(() => {
    api.projects.get = originalGetProject;
    api.reports.getDeveloperReport = originalGetReport;
    api.scans.get = originalGetScan;
  });

  function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/projects/proj-1/reports/scan-1/developer']}>
          <Routes>
            <Route path="/projects/:projectId/reports/:scanId/developer" element={<DeveloperReportPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  // Regression coverage for a real UX gap found via /research: this page
  // previously required two clicks (pick a file, then pick an issue in it)
  // before any real issue content showed — same "content should show
  // immediately" principle already fixed on ProjectReportsPage (#138) and
  // UnifiedReportPage (#139), just not yet applied here. It now
  // auto-selects the file with the worst findings, and within it the worst
  // issue, so real detail is visible with zero clicks.
  test('auto-selects the worst file and its worst issue on load, no click required', async () => {
    renderPage();

    // The file with a Critical issue should be auto-selected, not the first
    // file in the list (which only has a Low finding).
    await waitFor(() => {
      expect(screen.getByText(/Issues in critical\.ts/)).toBeInTheDocument();
    });

    // Its worst (Critical) issue's detail should already be visible, not
    // requiring a second click — this lands one render tick after the file
    // auto-selects (a second effect reacts to the new selectedFileData), so
    // wait for it rather than asserting synchronously.
    await waitFor(() => {
      expect(screen.getByText('Fix it now')).toBeInTheDocument();
    });
    // Appears twice once fully settled — once in the issue list row, once
    // as the detail panel's own heading.
    expect(screen.getAllByText('Critical vulnerability here').length).toBeGreaterThanOrEqual(2);
  });

  test('clicking a different file re-selects its own worst issue', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Issues in critical\.ts/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('low.ts'));

    await waitFor(() => {
      expect(screen.getByText(/Issues in low\.ts/)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getAllByText('Minor issue').length).toBeGreaterThanOrEqual(2);
    });
  });
});
