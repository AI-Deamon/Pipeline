import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import FindingDetailModal from '../../components/FindingDetailModal';
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
});
