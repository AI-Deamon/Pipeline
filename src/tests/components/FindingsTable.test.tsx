import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { test, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
import { FindingsTable } from '../../components/reports/FindingsTable';
import { ToastProvider } from '../../components/Toast';
import { useAuth as useAuthMock } from '../../hooks/useAuth';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    isAuthenticated: true,
    role: 'admin',
    permissions: {},
    currentUser: { id: 'u-1', username: 'admin', role: 'admin' },
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
    refreshUser: vi.fn(),
  })),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const { mockMutateAsync } = vi.hoisted(() => ({ mockMutateAsync: vi.fn() }));
vi.mock('../../hooks/useIssues', () => ({
  useCreateIssue: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

const findings = [
  { id: '1', severity: 'Critical', title: 'A', tool: 'sonar' },
  { id: '2', severity: 'High', title: 'B', tool: 'trivy' },
];

// FindingsTable now always calls useRbac/useCreateIssue/useToast, so every render
// needs QueryClientProvider + ToastProvider (and MemoryRouter, since selecting a
// row can mount FindingDetailModal, which uses react-router hooks).
const renderTable = (ui: ReactElement) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

test('in-table tool dropdown is disabled while a sidebar tool is active', () => {
  renderTable(<FindingsTable findings={findings} selectedTool="sonar" />);
  const select = screen.getByRole('combobox');
  expect(select).toBeDisabled();
  expect(select).toHaveValue('sonar');
});

test('in-table tool dropdown filters findings when no sidebar tool is active', () => {
  renderTable(<FindingsTable findings={findings} />);
  const select = screen.getByRole('combobox');
  expect(select).not.toBeDisabled();

  // Switch to list view so each finding's title renders as its own row.
  fireEvent.click(screen.getByText('List'));
  expect(screen.getByText('A')).toBeInTheDocument();
  expect(screen.getByText('B')).toBeInTheDocument();

  fireEvent.change(select, { target: { value: 'sonar' } });

  expect(screen.getByText('A')).toBeInTheDocument();
  expect(screen.queryByText('B')).not.toBeInTheDocument();
});

test('severity badge counts are scoped to the active tool filter', () => {
  renderTable(<FindingsTable findings={findings} selectedTool="sonar" />);
  // findings fixture: 1 Critical/sonar, 1 High/trivy — with sonar selected, only the
  // Critical count (1) should reflect sonar's findings, not both tools combined
  expect(screen.getByRole('button', { name: 'Critical 1' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'High 1' })).not.toBeInTheDocument();
});

test('search input has an accessible label', () => {
  renderTable(<FindingsTable findings={findings} selectedTool="sonar" />);
  expect(screen.getByLabelText('Search findings')).toBeInTheDocument();
});

test('shows a Filtered chip when severity filter is active', () => {
  renderTable(<FindingsTable findings={findings} />);
  expect(screen.queryByText('Filtered')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^Critical/ }));

  expect(screen.getByText('Filtered')).toBeInTheDocument();
});

test('sidebar tool selection alone does not trigger the Filtered chip, but applying a real filter on top does', () => {
  renderTable(<FindingsTable findings={findings} selectedTool="sonar" />);
  // Matches production usage: FindingsTable is only ever mounted with selectedTool set.
  // toolFilter is seeded from selectedTool, so the chip must stay absent until the user
  // actually applies a filter — otherwise it's noise from the moment of mount.
  expect(screen.queryByText('Filtered')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^Critical/ }));

  expect(screen.getByText('Filtered')).toBeInTheDocument();
});

test('the currently open finding row is visually marked', () => {
  renderTable(<FindingsTable findings={findings} selectedTool="sonar" />);

  // Switch to list view so each finding's title renders as its own row.
  fireEvent.click(screen.getByText('List'));

  const row = screen.getByText('A').closest('tr');
  expect(row).not.toHaveClass('bg-teal-50');

  fireEvent.click(row!);

  expect(row).toHaveClass('bg-teal-50');
});

test('New badge: findings present in the previous scan are not badged', () => {
  const previousKeys = new Set(['sonar:1']); // finding id "1"/sonar was present before
  renderTable(<FindingsTable findings={findings} selectedTool="sonar" previousScanFindingKeys={previousKeys} />);

  // Switch to list view so each finding's title renders as its own row.
  fireEvent.click(screen.getByText('List'));

  const row = screen.getByText('A').closest('tr');
  expect(row).not.toBeNull();
  expect(within(row!).queryByText('New')).not.toBeInTheDocument();
});

test('New badge: findings absent from the previous scan set are badged', () => {
  const previousKeys = new Set<string>(); // nothing was present before — everything is new
  renderTable(<FindingsTable findings={findings} selectedTool="sonar" previousScanFindingKeys={previousKeys} />);

  fireEvent.click(screen.getByText('List'));

  const row = screen.getByText('A').closest('tr');
  expect(row).not.toBeNull();
  expect(within(row!).getByText('New')).toBeInTheDocument();
});

test('New badge: omitted previousScanFindingKeys prop shows no badges', () => {
  renderTable(<FindingsTable findings={findings} selectedTool="sonar" />);

  fireEvent.click(screen.getByText('List'));

  expect(screen.queryByText('New')).not.toBeInTheDocument();
});

test('New badge: grouped view (the default) badges findings absent from the previous scan set', () => {
  const previousKeys = new Set<string>(); // nothing was present before — everything is new
  // No click on "List" — this exercises the grouped view, which is the component's default.
  renderTable(<FindingsTable findings={findings} selectedTool="sonar" previousScanFindingKeys={previousKeys} />);

  const row = screen.getByText('Unknown').closest('div');
  expect(row).not.toBeNull();
  expect(within(row!).getByText('New')).toBeInTheDocument();
});

test('New badge: grouped view (the default) does not badge findings present in the previous scan', () => {
  const previousKeys = new Set(['sonar:1']); // finding id "1"/sonar was present before
  renderTable(<FindingsTable findings={findings} selectedTool="sonar" previousScanFindingKeys={previousKeys} />);

  const row = screen.getByText('Unknown').closest('div');
  expect(row).not.toBeNull();
  expect(within(row!).queryByText('New')).not.toBeInTheDocument();
});

test('New badge: no previous-scan data (undefined previousScanFindingKeys, e.g. first scan or still loading) shows no badges anywhere', () => {
  // Mirrors ProjectReportsPage's corrected behavior: previousScanFindingKeys stays
  // undefined (not an empty Set) when there's no previous scan or its reports are
  // still loading, so FindingsTable's `previousScanFindingKeys &&` guard suppresses
  // badges entirely instead of treating "no data yet" as "everything is new".
  renderTable(<FindingsTable findings={findings} selectedTool="sonar" previousScanFindingKeys={undefined} />);

  // Grouped (default) view.
  expect(screen.queryByText('New')).not.toBeInTheDocument();

  // List view.
  fireEvent.click(screen.getByText('List'));
  expect(screen.queryByText('New')).not.toBeInTheDocument();
});

// --- Bulk triage -----------------------------------------------------------

beforeEach(() => {
  mockMutateAsync.mockReset();
  vi.mocked(useAuthMock).mockReturnValue({
    isAuthenticated: true,
    role: 'admin',
    permissions: {},
    currentUser: { id: 'u-1', username: 'admin', role: 'admin' },
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
    refreshUser: vi.fn(),
  } as ReturnType<typeof useAuthMock>);
});

test('selecting Critical findings and bulk-creating issues calls create per selected finding', async () => {
  mockMutateAsync.mockResolvedValue({ id: 1 });
  renderTable(<FindingsTable findings={findings} projectId="p1" scanId="s1" selectedTool="sonar" />);

  fireEvent.click(screen.getByRole('button', { name: 'Select all Critical' }));
  fireEvent.click(screen.getByRole('button', { name: /Create issues for selected/ }));

  await screen.findByText(/1 issue created/);

  // findings fixture has exactly one Critical (id "1"/sonar) — confirm the mutation
  // fired for that finding with the payload shape FindingDetailModal's singular
  // create path uses.
  expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  expect(mockMutateAsync).toHaveBeenCalledWith({
    issue_id: '1:s1',
    project_id: 'p1',
    tool_name: 'sonar',
    severity: 'Critical',
    title: 'A',
    scan_id: 's1',
  });
});

test('bulk-creating issues for multiple selected findings calls create once per finding, not once total', async () => {
  const manyFindings = [
    { id: '1', severity: 'Critical', title: 'A', tool: 'sonar' },
    { id: '2', severity: 'Critical', title: 'B', tool: 'sonar' },
    { id: '3', severity: 'High', title: 'C', tool: 'sonar' },
  ];
  mockMutateAsync.mockResolvedValue({ id: 1 });
  renderTable(<FindingsTable findings={manyFindings} projectId="p1" scanId="s1" selectedTool="sonar" />);

  fireEvent.click(screen.getByRole('button', { name: 'Select all Critical' }));
  fireEvent.click(screen.getByRole('button', { name: /Create issues for selected/ }));

  await screen.findByText(/2 issues created/);

  expect(mockMutateAsync).toHaveBeenCalledTimes(2);
  expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ issue_id: '1:s1' }));
  expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ issue_id: '2:s1' }));
});

test('a failed create for one selected finding does not stop the rest of the batch', async () => {
  const manyFindings = [
    { id: '1', severity: 'Critical', title: 'A', tool: 'sonar' },
    { id: '2', severity: 'Critical', title: 'B', tool: 'sonar' },
  ];
  mockMutateAsync.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ id: 2 });
  renderTable(<FindingsTable findings={manyFindings} projectId="p1" scanId="s1" selectedTool="sonar" />);

  fireEvent.click(screen.getByRole('button', { name: 'Select all Critical' }));
  fireEvent.click(screen.getByRole('button', { name: /Create issues for selected/ }));

  // Both selections were attempted even though the first rejected; only the
  // successful one counts toward "created".
  await screen.findByText(/1 issue created/);
  expect(mockMutateAsync).toHaveBeenCalledTimes(2);
});

test('changing a filter that hides a selected finding prunes it from the selection', () => {
  const mixedFindings = [
    { id: '1', severity: 'Critical', title: 'A', tool: 'sonar' },
    { id: '2', severity: 'High', title: 'B', tool: 'sonar' },
  ];
  renderTable(<FindingsTable findings={mixedFindings} projectId="p1" scanId="s1" selectedTool="sonar" />);

  fireEvent.click(screen.getByRole('button', { name: 'Select all Critical' }));
  expect(screen.getByRole('button', { name: 'Create issues for selected (1)' })).toBeInTheDocument();

  // Narrow the severity filter to High — the previously-selected Critical finding
  // (id "1") drops out of filteredFindings, so its selection must be pruned too:
  // the bulk-action button's count (and handleBulkCreate's target list) must stay
  // in sync with what's actually visible, not silently undercount.
  fireEvent.click(screen.getByRole('button', { name: /^High/ }));

  expect(screen.queryByRole('button', { name: /Create issues for selected/ })).not.toBeInTheDocument();
});

test('bulk-action bar and row checkboxes are hidden without canAssignIssues', () => {
  vi.mocked(useAuthMock).mockReturnValue({
    isAuthenticated: true,
    role: 'developer',
    permissions: {},
    currentUser: { id: 'u-2', username: 'dev', role: 'developer' },
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
    refreshUser: vi.fn(),
  } as ReturnType<typeof useAuthMock>);

  renderTable(<FindingsTable findings={findings} projectId="p1" scanId="s1" selectedTool="sonar" />);
  fireEvent.click(screen.getByText('List'));

  expect(screen.queryByRole('button', { name: 'Select all Critical' })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

test('checking a row checkbox does not also open the finding detail panel', () => {
  renderTable(<FindingsTable findings={findings} projectId="p1" scanId="s1" selectedTool="sonar" />);
  fireEvent.click(screen.getByText('List'));

  const checkbox = screen.getByRole('checkbox', { name: 'Select A' });
  fireEvent.click(checkbox);

  expect(checkbox).toBeChecked();
  expect(screen.queryByText('Finding details')).not.toBeInTheDocument();
});
