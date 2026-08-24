import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, test, expect, describe } from 'vitest';
import { FindingsTable } from '../../components/reports/FindingsTable';
import { ToastProvider } from '../../components/Toast';
import type { Finding } from '../../types';

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

const mkFinding = (overrides: Partial<Finding & { tool: string }>): Finding & { tool: string } => ({
  id: 'f-1',
  severity: 'Critical',
  title: 'Test finding',
  tool: 'sonar',
  ...overrides,
});

function renderTable(props: Parameters<typeof FindingsTable>[0]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ToastProvider>
          <FindingsTable {...props} />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('FindingsTable', () => {
  // Regression coverage for the reports-page redesign: findings previously
  // only showed after clicking a tool in a sidebar ("Select a Tool" empty
  // state) — this component now renders everything by default with no
  // required selection first.
  test('shows findings from every tool immediately, no tool selection required', () => {
    renderTable({
      findings: [
        mkFinding({ id: 'f-1', title: 'Sonar issue', tool: 'sonar' }),
        mkFinding({ id: 'f-2', title: 'Trivy issue', tool: 'trivy_fs' }),
      ],
    });
    expect(screen.getByText('Sonar issue')).toBeInTheDocument();
    expect(screen.getByText('Trivy issue')).toBeInTheDocument();
  });

  test('tool chips filter the list, and "All tools" is selected by default', () => {
    renderTable({
      findings: [
        mkFinding({ id: 'f-1', title: 'Sonar issue', tool: 'sonar' }),
        mkFinding({ id: 'f-2', title: 'Trivy issue', tool: 'trivy_fs' }),
      ],
      tools: [
        { key: 'sonar', name: 'SonarQube', status: 'pass', findings: 1 },
        { key: 'trivy_fs', name: 'Trivy FS', status: 'pass', findings: 1 },
      ],
    });
    expect(screen.getByText('Sonar issue')).toBeInTheDocument();
    expect(screen.getByText('Trivy issue')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /sonarqube/i }));
    expect(screen.getByText('Sonar issue')).toBeInTheDocument();
    expect(screen.queryByText('Trivy issue')).not.toBeInTheDocument();
  });

  // Regression test for a real bug found live: multiple occurrences of the
  // same finding all showed the identical placeholder text ("Meraki", the
  // project name, repeated on every row) with no way to distinguish them.
  test('a finding with multiple occurrences collapses to one row with a count, and expands to real locations', () => {
    renderTable({
      findings: [
        mkFinding({
          id: 'f-1', rule: 'S123', title: 'Repeated issue',
          file_path: 'src/a.ts', line_number: 10,
        }),
        mkFinding({
          id: 'f-2', rule: 'S123', title: 'Repeated issue',
          file_path: 'src/b.ts', line_number: 20,
        }),
      ],
    });

    expect(screen.getByText('2 occurrences')).toBeInTheDocument();
    // Collapsed by default — individual locations not shown yet.
    expect(screen.queryByText('src/a.ts:10')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Repeated issue'));
    expect(screen.getByText('src/a.ts:10')).toBeInTheDocument();
    expect(screen.getByText('src/b.ts:20')).toBeInTheDocument();
  });

  test('a finding with no location data shows "Location unavailable" instead of a misleading fallback', () => {
    renderTable({
      findings: [
        mkFinding({ id: 'f-1', rule: 'S1', title: 'No location A' }),
        mkFinding({ id: 'f-2', rule: 'S1', title: 'No location A' }),
      ],
    });
    fireEvent.click(screen.getByText('No location A'));
    expect(screen.getAllByText('Location unavailable')).toHaveLength(2);
  });

  test('a single-occurrence finding opens the detail modal directly, no expand step', () => {
    renderTable({
      findings: [mkFinding({ id: 'f-1', title: 'Solo issue' })],
    });
    fireEvent.click(screen.getByText('Solo issue'));
    expect(screen.getByText('Finding Details')).toBeInTheDocument();
  });
});
