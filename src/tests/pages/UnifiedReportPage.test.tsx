/** @jsxImportSource react */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';
import UnifiedReportPage from '../../pages/UnifiedReportPage';
import { api } from '../../services/api';

describe('UnifiedReportPage', () => {
  const originalGetUnified = api.reports.getUnified;
  const originalGetTrends = api.reports.getTrends;

  beforeEach(() => {
    api.reports.getUnified = vi.fn().mockResolvedValue({
      project_id: 'test-project',
      scan_id: 'test-scan',
      total_findings: 10,
      severity: { critical: 1, high: 2, medium: 3, low: 4 },
      findings: [],
      generated_at: new Date().toISOString(),
    });
    api.reports.getTrends = vi.fn().mockResolvedValue([]);
  });

  afterEach(() => {
    api.reports.getUnified = originalGetUnified;
    api.reports.getTrends = originalGetTrends;
  });

  test('renders without crashing', async () => {
    render(
      <MemoryRouter initialEntries={["/projects/test-project/reports/unified"]}>
        <Routes>
          <Route path="/projects/:projectId/reports/unified" element={<UnifiedReportPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Security Report')).toBeInTheDocument();
  });
});
