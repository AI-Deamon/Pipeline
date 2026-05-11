import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { api } from '../services/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

vi.mock('../services/api', () => ({
  api: {
    projects: {
      list: vi.fn(),
    }
  }
}));

describe('DashboardPage Search', () => {
  const mockProjects = [
    { project_id: '1', name: 'Alpha Project', last_scan_state: 'COMPLETED' },
    { project_id: '2', name: 'Beta Project', last_scan_state: 'FAILED' },
    { project_id: '3', name: 'Gamma Project', last_scan_state: 'RUNNING' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (api.projects.list as any).mockResolvedValue(mockProjects);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('filters projects based on search term after debounce', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Initial load - need to wait for the promise to resolve AND the timers to run
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText('Alpha Project')).toBeInTheDocument();
    expect(screen.getByText('Beta Project')).toBeInTheDocument();
    expect(screen.getByText('Gamma Project')).toBeInTheDocument();

    const searchInput = screen.getByLabelText('Search projects');

    // Search for "Alpha"
    fireEvent.change(searchInput, { target: { value: 'Alpha' } });

    // Should still show all projects before debounce
    expect(screen.getByText('Beta Project')).toBeInTheDocument();

    // Advance timers
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText('Alpha Project')).toBeInTheDocument();
    expect(screen.queryByText('Beta Project')).not.toBeInTheDocument();
    expect(screen.queryByText('Gamma Project')).not.toBeInTheDocument();
  });

  it('shows "No projects matching" message after debounce', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const searchInput = screen.getByLabelText('Search projects');

    // Search for something that doesn't exist
    fireEvent.change(searchInput, { target: { value: 'Zeta' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByText('Alpha Project')).not.toBeInTheDocument();
    expect(screen.getByText(/No projects matching "Zeta"/)).toBeInTheDocument();
  });

  it('clears search when "Clear search" button is clicked', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const searchInput = screen.getByLabelText('Search projects');

    // Search for "Alpha"
    fireEvent.change(searchInput, { target: { value: 'Alpha' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByText('Beta Project')).not.toBeInTheDocument();

    // Click clear button
    const clearButton = screen.getByLabelText('Clear search');
    fireEvent.click(clearButton);

    // Search term clears immediately
    expect(searchInput).toHaveValue('');

    // List also reverts after its own debounce if we're using debouncedSearchTerm
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText('Alpha Project')).toBeInTheDocument();
    expect(screen.getByText('Beta Project')).toBeInTheDocument();
    expect(screen.getByText('Gamma Project')).toBeInTheDocument();
  });
});
