import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../hooks/useAuth';
import { ToastProvider } from '../components/Toast';

const defaultQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

/**
 * Wraps a component with AuthProvider, QueryClientProvider, MemoryRouter,
 * and ToastProvider so page/component tests can render in isolation.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: {
    route?: string;
    queryClient?: QueryClient;
  } & RenderOptions = {},
) {
  const { route = '/', queryClient = defaultQueryClient, ...renderOptions } = options;
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
  return render(ui, { wrapper: Wrapper, ...renderOptions });
}
