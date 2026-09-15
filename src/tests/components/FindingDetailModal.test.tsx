import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import FindingDetailModal from '../../components/FindingDetailModal';
import { ToastProvider } from '../../components/Toast';
import { api } from '../../services/api';
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

describe('FindingDetailModal', () => {
  test('renders nothing when finding is null', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ToastProvider>
            <FindingDetailModal
              finding={null}
              onClose={() => {}}
            />
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.queryByText('Finding Details')).not.toBeInTheDocument();
  });

  test('finding #39: a javascript: reference is rendered as plain text, not a clickable href', () => {
    const finding: Finding = {
      id: 'f-1',
      severity: 'high',
      title: 'XSS reflected finding',
      references: ['javascript:alert(document.cookie)', 'https://cwe.mitre.org/data/definitions/79.html'],
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ToastProvider>
            <FindingDetailModal finding={finding} onClose={() => {}} />
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const maliciousLink = screen.queryByRole('link', { name: /javascript:alert/i });
    expect(maliciousLink).not.toBeInTheDocument();
    expect(screen.getByText('javascript:alert(document.cookie)')).toBeInTheDocument();

    const safeLink = screen.getByRole('link', { name: /cwe.mitre.org/i });
    expect(safeLink).toHaveAttribute('href', 'https://cwe.mitre.org/data/definitions/79.html');
  });

  test('hasSearched resets when navigating to a different finding via Next', async () => {
    api.issues.findByFindingKey = vi.fn().mockResolvedValue(null);

    const findingA: Finding = { id: 'a', severity: 'Critical', title: 'Finding A', tool: 'sonar' };
    const findingB: Finding = { id: 'b', severity: 'High', title: 'Finding B', tool: 'sonar' };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ToastProvider>
            <FindingDetailModal
              finding={findingA}
              projectId="p1"
              scanId="s1"
              onClose={() => {}}
              hasNext
              onNext={() => {}}
            />
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /Open in Issue Tracker/ }));
    await screen.findByRole('button', { name: /Create issue/ });

    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ToastProvider>
            <FindingDetailModal
              finding={findingB}
              projectId="p1"
              scanId="s1"
              onClose={() => {}}
              hasNext
              onNext={() => {}}
            />
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.queryByRole('button', { name: /Create issue/ })).not.toBeInTheDocument();
  });
});
