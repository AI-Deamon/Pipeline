import { screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import IssueDetailModal from '../../components/IssueDetailModal';
import { api } from '../../services/api';
import { renderWithProviders } from '../../test/testUtils';

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
  });

  afterEach(() => {
    api.issues.get = originalGet;
    api.issues.getHistory = originalHistory;
    api.issues.assign = originalAssign;
    api.issues.transition = originalTransition;
    api.issues.addComment = originalComment;
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

  test('shows assign input on button click', async () => {
    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /^assign$/i }));
    expect(screen.getByPlaceholderText('Username...')).toBeInTheDocument();
  });

  test('calls assign mutation', async () => {
    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /^assign$/i }));
    fireEvent.change(screen.getByPlaceholderText('Username...'), { target: { value: 'dev-user' } });
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
});
