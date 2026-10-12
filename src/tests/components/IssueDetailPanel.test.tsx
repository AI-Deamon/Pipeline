import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { test, expect, describe, vi } from 'vitest';
import { IssueDetailPanel } from '../../components/reports/IssueDetailPanel';
import { api } from '../../services/api';
import type { DeveloperIssue } from '../../types';

const baseIssue: DeveloperIssue = {
  id: 'i-1',
  message: 'SQL injection risk',
  severity: 'Critical',
  file_path: 'src/db.ts',
  line: 42,
};

function renderPanel(issue: DeveloperIssue) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <IssueDetailPanel issue={issue} projectId="proj-1" />
    </QueryClientProvider>,
  );
}

describe('IssueDetailPanel', () => {
  // Regression coverage for a real gap found via /research: this panel
  // (used by DeveloperReportPage) never fetched a code snippet at all, even
  // though the same backend endpoint and CodeSnippet component were already
  // wired up in IssueDetailModal. A developer looking at an issue here saw
  // no surrounding source code, ever.
  test('fetches and renders the code snippet when the issue has a file and line', async () => {
    const getCodeSnippet = vi.fn().mockResolvedValue({
      file: 'src/db.ts',
      language: 'typescript',
      branch: 'main',
      start_line: 38,
      end_line: 46,
      highlight_line: 42,
      content: 'const q = `SELECT * FROM users WHERE id = ${id}`;',
      git_url: null,
      source: 'github',
    });
    api.issues.getCodeSnippet = getCodeSnippet;

    renderPanel(baseIssue);

    await waitFor(() => {
      expect(getCodeSnippet).toHaveBeenCalledWith('proj-1', { file: 'src/db.ts', line: 42 });
    });
    await waitFor(() => {
      expect(screen.getByText(/SELECT \* FROM users/)).toBeInTheDocument();
    });
  });

  test('does not fetch or render a code snippet section when the issue has no file path', () => {
    const getCodeSnippet = vi.fn();
    api.issues.getCodeSnippet = getCodeSnippet;

    renderPanel({ ...baseIssue, file_path: undefined });

    expect(getCodeSnippet).not.toHaveBeenCalled();
    expect(screen.queryByText('Code')).not.toBeInTheDocument();
  });
});
