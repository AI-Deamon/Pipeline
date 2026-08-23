import { render, screen, waitFor } from '@testing-library/react';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TeamWorkloadPage from '../../pages/TeamWorkloadPage';
import { api } from '../../services/api';

describe('TeamWorkloadPage', () => {
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

  function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <TeamWorkloadPage />
      </QueryClientProvider>
    );
  }

  test('renders team workload with developers', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Team Workload')).toBeInTheDocument();
    });
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('issues need assignment'))).toBeInTheDocument();
  });

  test('shows error state on API failure', async () => {
    api.portfolio.getTeamWorkload = vi.fn().mockRejectedValue(new Error('Network error'));
    renderPage();
    expect(
      await screen.findByText("Couldn't load team workload data.")
    ).toBeInTheDocument();
  });
});
