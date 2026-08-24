import { screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import IssueDetailModal from '../../components/IssueDetailModal';
import { api } from '../../services/api';
import { renderWithProviders } from '../../test/testUtils';
import { ApiError } from '../../utils/apiError';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    token: 'mock-token',
    role: 'team_lead',
    permissions: {
      canManageUsers: false,
      canManageProjectAccess: false,
      canViewAllProjects: false,
      canAssignIssues: true,
      canVerifyIssues: true,
      canUpdateAssignedIssues: true,
    },
    currentUser: { id: 'user-1', username: 'tl', role: 'team_lead' },
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
    refreshUser: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe('IssueDetailModal', () => {
  const originalGet = api.issues.get;
  const originalHistory = api.issues.getHistory;
  const originalAssign = api.issues.assign;
  const originalTransition = api.issues.transition;
  const originalComment = api.issues.addComment;
  const originalGetUsers = api.rbac.getUsers;

  const mockIssue = {
    id: 1,
    issue_id: 'ext-1',
    project_id: 'proj_1',
    tool_name: 'sonarqube',
    scan_id: 'scan-1',
    first_seen_scan_id: 'scan-1',
    first_seen_at: '2026-01-01T00:00:00Z',
    last_seen_at: '2026-01-15T00:00:00Z',
    resolved_at: null,
    severity: 'critical',
    issue_type: 'bug',
    title: 'SQL Injection',
    description: 'Input validation missing on user query',
    location: '/src/app.ts:42',
    severity_v2: 'high',
    effort: 2,
    rule: 'sqli-rule',
    recommendation: 'Use parameterized queries',
    finding_type: 'bug',
    raw_evidence: null,
    is_new: true,
    status: 'open',
    assignee_id: null,
    assigned_by: null,
    priority: 0,
    extra_metadata: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  };

  beforeEach(() => {
    api.issues.get = vi.fn().mockResolvedValue(mockIssue);
    api.issues.getHistory = vi.fn().mockResolvedValue({ issue_id: 1, history: [] });
    api.issues.assign = vi.fn().mockResolvedValue({ ...mockIssue, status: 'assigned', assignee_id: 'user-1' });
    api.issues.transition = vi.fn().mockResolvedValue({ ...mockIssue, status: 'in_progress' });
    api.issues.addComment = vi.fn().mockResolvedValue({ id: 1, issue_id: 1, change_type: 'comment', message: 'test', actor_id: 'user', created_at: new Date().toISOString() });
    api.rbac.getUsers = vi.fn().mockResolvedValue([
      { id: 'u-1', username: 'dev-user' },
      { id: 'u-2', username: 'tl' },
    ]);
  });

  afterEach(() => {
    api.issues.get = originalGet;
    api.issues.getHistory = originalHistory;
    api.issues.assign = originalAssign;
    api.issues.transition = originalTransition;
    api.issues.addComment = originalComment;
    api.rbac.getUsers = originalGetUsers;
  });

  function renderModal(issueId = 1) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return renderWithProviders(
      <IssueDetailModal issueId={issueId} onClose={vi.fn()} />,
      { queryClient },
    );
  }

  test('renders issue title and details', async () => {
    renderModal();
    expect(await screen.findByText('SQL Injection')).toBeInTheDocument();
    expect(screen.getByText('critical')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
  });

  test('renders description and recommendation', async () => {
    renderModal();
    expect(await screen.findByText('Input validation missing on user query')).toBeInTheDocument();
    expect(screen.getByText('Use parameterized queries')).toBeInTheDocument();
  });

  test('renders assign button for open issue', async () => {
    renderModal();
    expect(await screen.findByRole('button', { name: /assign/i })).toBeInTheDocument();
  });

  test('shows assign select on button click', async () => {
    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /^assign$/i }));
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: /select user/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'dev-user' })).toBeInTheDocument();
  });

  test('calls assign mutation', async () => {
    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /^assign$/i }));
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'dev-user' } });
    fireEvent.click(screen.getByRole('button', { name: /^assign$/i }));
    await waitFor(() => {
      expect(api.issues.assign).toHaveBeenCalledWith(1, { assignee_id: 'dev-user' });
    });
  });

  test('shows Start Working for assigned issue', async () => {
    api.issues.get = vi.fn().mockResolvedValue({ ...mockIssue, status: 'assigned', assignee_id: 'user-1' });
    renderModal();
    expect(await screen.findByRole('button', { name: /start working/i })).toBeInTheDocument();
  });

  test('shows Mark Fixed for in_progress issue', async () => {
    api.issues.get = vi.fn().mockResolvedValue({ ...mockIssue, status: 'in_progress', assignee_id: 'user-1' });
    renderModal();
    expect(await screen.findByRole('button', { name: /mark fixed/i })).toBeInTheDocument();
  });

  test('shows Verify and Reject for fixed issue', async () => {
    api.issues.get = vi.fn().mockResolvedValue({ ...mockIssue, status: 'fixed', assignee_id: 'user-1' });
    renderModal();
    expect(await screen.findByRole('button', { name: /^verify$/i })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^reject$/i })).toBeInTheDocument();
  });

  test('calls transition mutation', async () => {
    api.issues.get = vi.fn().mockResolvedValue({ ...mockIssue, status: 'assigned', assignee_id: 'user-1' });
    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /start working/i }));
    await waitFor(() => {
      expect(api.issues.transition).toHaveBeenCalledWith(1, { status: 'in_progress' });
    });
  });

  test('adds comment', async () => {
    renderModal();
    const input = await screen.findByPlaceholderText('Add a comment...');
    fireEvent.change(input, { target: { value: 'Looking into this' } });
    const buttons = screen.getAllByRole('button');
    const sendBtn = buttons[buttons.length - 1];
    fireEvent.click(sendBtn);
    await waitFor(() => {
      expect(api.issues.addComment).toHaveBeenCalledWith(1, 'Looking into this');
    });
  });

  describe('code snippet', () => {
    // Regression coverage for a real bug found live: the backend's
    // GET /projects/{id}/code-snippet endpoint and the api.issues.getCodeSnippet
    // client were both fully built, but the modal never called either — every
    // finding with a file/line silently showed "No code snippet available"
    // even though real source was fetchable the whole time.
    const originalGetCodeSnippet = api.issues.getCodeSnippet;
    const issueWithLocation = { ...mockIssue, file_path: 'src/app.ts', line_number: 42 };

    afterEach(() => {
      api.issues.getCodeSnippet = originalGetCodeSnippet;
    });

    test('fetches and renders real source when the finding has a file/line', async () => {
      api.issues.get = vi.fn().mockResolvedValue(issueWithLocation);
      api.issues.getCodeSnippet = vi.fn().mockResolvedValue({
        file: 'src/app.ts',
        language: 'typescript',
        branch: 'main',
        start_line: 40,
        end_line: 44,
        highlight_line: 42,
        content: 'const query = `SELECT * FROM users WHERE id = ${id}`;',
        git_url: 'https://github.com/org/repo/blob/main/src/app.ts#L42',
        source: 'github',
      });
      renderModal();

      await waitFor(() => {
        expect(api.issues.getCodeSnippet).toHaveBeenCalledWith('proj_1', {
          file: 'src/app.ts',
          line: 42,
        });
      });
      expect(await screen.findByText(/SELECT \* FROM users/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /view on github/i })).toHaveAttribute(
        'href',
        'https://github.com/org/repo/blob/main/src/app.ts#L42',
      );
    });

    test('falls back to the placeholder, not an error, when the file is not found (404)', async () => {
      api.issues.get = vi.fn().mockResolvedValue(issueWithLocation);
      api.issues.getCodeSnippet = vi.fn().mockRejectedValue(new ApiError(404, 'Not found'));
      renderModal();

      expect(await screen.findByText(/no code snippet available/i)).toBeInTheDocument();
      expect(screen.queryByText(/failed to load code/i)).not.toBeInTheDocument();
    });
  });
});
