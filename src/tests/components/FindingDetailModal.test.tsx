import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import FindingDetailModal from '../../components/FindingDetailModal';
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
});
