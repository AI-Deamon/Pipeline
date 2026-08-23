import { render, screen } from '@testing-library/react';
import { test, expect, describe } from 'vitest';
import IssueCard from '../../components/IssueCard';
import type { IssueResponse, IssueStatus } from '../../types';

describe('IssueCard', () => {
  const issue: IssueResponse = {
    id: 1,
    issue_id: 'ext-1',
    project_id: 'proj_1',
    tool_name: 'sonarqube',
    scan_id: 'scan-1',
    first_seen_scan_id: 'scan-1',
    first_seen_at: '2026-01-01T00:00:00Z',
    last_seen_at: '2026-01-15T00:00:00Z',
    resolved_at: undefined,
    severity: 'critical',
    issue_type: 'bug',
    title: 'SQL Injection',
    description: 'Description',
    location: { file: '/src/app.ts', line: '42' },
    severity_v2: undefined,
    effort: undefined,
    rule: undefined,
    recommendation: undefined,
    finding_type: undefined,
    raw_evidence: undefined,
    is_new: true,
    status: 'open' as IssueStatus,
    assignee_id: undefined,
    assigned_by: undefined,
    priority: undefined,
    extra_metadata: undefined,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  };

  test('renders title and tool name', () => {
    render(<IssueCard issue={issue} />);
    expect(screen.getByText('SQL Injection')).toBeInTheDocument();
    expect(screen.getByText('sonarqube')).toBeInTheDocument();
  });

  test('renders status with underscores replaced', () => {
    const assigned = { ...issue, status: 'in_progress' as IssueStatus };
    render(<IssueCard issue={assigned} />);
    expect(screen.getByText('in progress')).toBeInTheDocument();
  });

  test('renders assignee when present', () => {
    const assigned = { ...issue, assignee_id: 'user-1' };
    render(<IssueCard issue={assigned} />);
    expect(screen.getByText('user-1')).toBeInTheDocument();
  });

  test('renders last seen date', () => {
    render(<IssueCard issue={issue} />);
    expect(screen.getByText('1/15/2026')).toBeInTheDocument();
  });

  // Regression tests for finding #58: severity was previously conveyed by icon color
  // alone, with medium/low/info sharing one icon and critical/high sharing another —
  // no text label existed anywhere on the card.
  test.each(['critical', 'high', 'medium', 'low', 'info'] as const)(
    'renders the severity level as text for %s',
    (severity) => {
      render(<IssueCard issue={{ ...issue, severity }} />);
      expect(screen.getByText(new RegExp(`^${severity}$`, 'i'))).toBeInTheDocument();
    }
  );

  test('medium and low severities render visually distinct labels, not identical', () => {
    const { unmount } = render(<IssueCard issue={{ ...issue, severity: 'medium' }} />);
    const mediumColor = screen.getByText(/^medium$/i).closest('[style]')?.getAttribute('style');
    unmount();

    render(<IssueCard issue={{ ...issue, severity: 'low' }} />);
    const lowColor = screen.getByText(/^low$/i).closest('[style]')?.getAttribute('style');

    expect(mediumColor).toBeTruthy();
    expect(mediumColor).not.toEqual(lowColor);
  });
});
