import { render, screen, waitFor } from '@testing-library/react';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import DashboardWorkloadTab from '../../components/dashboard/DashboardWorkloadTab';
import { api } from '../../services/api';

describe('DashboardWorkloadTab', () => {
  const originalWorkload = api.portfolio.getTeamWorkload;

  beforeEach(() => {
    api.portfolio.getTeamWorkload = vi.fn().mockResolvedValue({
      developers: [
        { username: 'alice', total_issues: 10, critical: 2, high: 3, medium: 4, low: 1 },
        { username: 'bob', total_issues: 5, critical: 1, high: 1, medium: 2, low: 1 },
      ],
      unassigned: { critical: 3, high: 2, medium: 5, low: 4, info: 1, total: 15 },
    });
  });

  afterEach(() => {
    api.portfolio.getTeamWorkload = originalWorkload;
  });

  function renderTab() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <DashboardWorkloadTab />
        </QueryClientProvider>
      </MemoryRouter>
    );
  }

  test('renders team workload with developers', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
    });
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('issues need assignment'))).toBeInTheDocument();
  });

  test('shows error state on API failure', async () => {
    api.portfolio.getTeamWorkload = vi.fn().mockRejectedValue(new Error('Network error'));
    renderTab();
    expect(
      await screen.findByText("Couldn't load team workload data.")
    ).toBeInTheDocument();
  });

  // Regression coverage for the Team Workload "dead end" fix: a manager
  // clicking a developer's card, or an unassigned-severity tile, used to have
  // no way to see the underlying issues. Both are now real links into the
  // cross-project Issues triage view, pre-filtered.
  test('developer card links to their filtered issue list', async () => {
    renderTab();
    const card = await screen.findByText('alice');
    const link = card.closest('a');
    expect(link).toHaveAttribute('href', '/issues?assignee=alice&status=open,in_progress');
  });

  test('unassigned severity tile links to the filtered unassigned queue', async () => {
    renderTab();
    const criticalTile = await screen.findByText('3');
    const link = criticalTile.closest('a');
    expect(link).toHaveAttribute(
      'href',
      '/issues?assignee=unassigned&status=open,in_progress&severity=critical',
    );
  });
});
