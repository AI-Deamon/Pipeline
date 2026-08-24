import { render, screen } from '@testing-library/react';
import { test, expect, describe, vi } from 'vitest';
import { ProjectReportLayout } from '../../components/reports/ProjectReportLayout';

describe('ProjectReportLayout', () => {
  // Regression coverage for the reports-page redesign: the previous version
  // was a 4-card sidebar (Scan Info / Severity / Tools / Actions) with its
  // own internal scroll region that could outgrow the viewport. This is now
  // one compact header row so findings get the full page.
  test('renders scan info, severity counts, and actions in a single compact header, with no separate Tools panel', () => {
    render(
      <ProjectReportLayout
        scanInfo={{ scanId: 'abc12345-def', date: '1 Jan 2026', duration: '1m 2s', mode: 'automated', target: '' }}
        severity={{ critical: 3, high: 5, medium: 10, low: 2, info: 0 }}
        projectId="proj-1"
        scanId="scan-1"
        onExport={vi.fn()}
        exportLoading={false}
      >
        <div>findings go here</div>
      </ProjectReportLayout>,
    );

    expect(screen.getByText('abc12345...')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // critical count
    expect(screen.getByText('Export PDF')).toBeInTheDocument();
    expect(screen.getByText('Developer View')).toBeInTheDocument();
    expect(screen.getByText('findings go here')).toBeInTheDocument();
    // The old sidebar's dedicated "Tools" card no longer exists here — tools
    // moved into FindingsTable's own filter chips.
    expect(screen.queryByText('Tools')).not.toBeInTheDocument();
  });
});
