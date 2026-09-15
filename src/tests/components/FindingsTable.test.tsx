import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { test, expect, vi } from 'vitest';
import { FindingsTable } from '../../components/reports/FindingsTable';
import { ToastProvider } from '../../components/Toast';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    role: 'admin',
    permissions: {},
    currentUser: { id: 'u-1', username: 'admin', role: 'admin' },
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
    refreshUser: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const findings = [
  { id: '1', severity: 'Critical', title: 'A', tool: 'sonar' },
  { id: '2', severity: 'High', title: 'B', tool: 'trivy' },
];

test('in-table tool dropdown is disabled while a sidebar tool is active', () => {
  render(<FindingsTable findings={findings} selectedTool="sonar" />);
  const select = screen.getByRole('combobox');
  expect(select).toBeDisabled();
  expect(select).toHaveValue('sonar');
});

test('in-table tool dropdown filters findings when no sidebar tool is active', () => {
  render(<FindingsTable findings={findings} />);
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
  render(<FindingsTable findings={findings} selectedTool="sonar" />);
  // findings fixture: 1 Critical/sonar, 1 High/trivy — with sonar selected, only the
  // Critical count (1) should reflect sonar's findings, not both tools combined
  expect(screen.getByRole('button', { name: 'Critical 1' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'High 1' })).not.toBeInTheDocument();
});

test('search input has an accessible label', () => {
  render(<FindingsTable findings={findings} selectedTool="sonar" />);
  expect(screen.getByLabelText('Search findings')).toBeInTheDocument();
});

test('shows a Filtered chip when severity filter is active', () => {
  render(<FindingsTable findings={findings} />);
  expect(screen.queryByText('Filtered')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^Critical/ }));

  expect(screen.getByText('Filtered')).toBeInTheDocument();
});

test('sidebar tool selection alone does not trigger the Filtered chip, but applying a real filter on top does', () => {
  render(<FindingsTable findings={findings} selectedTool="sonar" />);
  // Matches production usage: FindingsTable is only ever mounted with selectedTool set.
  // toolFilter is seeded from selectedTool, so the chip must stay absent until the user
  // actually applies a filter — otherwise it's noise from the moment of mount.
  expect(screen.queryByText('Filtered')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^Critical/ }));

  expect(screen.getByText('Filtered')).toBeInTheDocument();
});

test('the currently open finding row is visually marked', () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ToastProvider>
          <FindingsTable findings={findings} selectedTool="sonar" />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  // Switch to list view so each finding's title renders as its own row.
  fireEvent.click(screen.getByText('List'));

  const row = screen.getByText('A').closest('tr');
  expect(row).not.toHaveClass('bg-teal-50');

  fireEvent.click(row!);

  expect(row).toHaveClass('bg-teal-50');
});

test('New badge: findings present in the previous scan are not badged', () => {
  const previousKeys = new Set(['sonar:1']); // finding id "1"/sonar was present before
  render(<FindingsTable findings={findings} selectedTool="sonar" previousScanFindingKeys={previousKeys} />);

  // Switch to list view so each finding's title renders as its own row.
  fireEvent.click(screen.getByText('List'));

  const row = screen.getByText('A').closest('tr');
  expect(row).not.toBeNull();
  expect(within(row!).queryByText('New')).not.toBeInTheDocument();
});

test('New badge: findings absent from the previous scan set are badged', () => {
  const previousKeys = new Set<string>(); // nothing was present before — everything is new
  render(<FindingsTable findings={findings} selectedTool="sonar" previousScanFindingKeys={previousKeys} />);

  fireEvent.click(screen.getByText('List'));

  const row = screen.getByText('A').closest('tr');
  expect(row).not.toBeNull();
  expect(within(row!).getByText('New')).toBeInTheDocument();
});

test('New badge: omitted previousScanFindingKeys prop shows no badges', () => {
  render(<FindingsTable findings={findings} selectedTool="sonar" />);

  fireEvent.click(screen.getByText('List'));

  expect(screen.queryByText('New')).not.toBeInTheDocument();
});
