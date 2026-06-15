import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/Toast';
import UserManagementPage from '../../pages/UserManagementPage';

// Mock the API
vi.mock('../../services/api', () => ({
  api: {
    rbac: {
      getUsers: vi.fn().mockResolvedValue([
        { id: '1', username: 'admin', role: 'admin', permissions: { canManageUsers: true } },
        { id: '2', username: 'lead1', role: 'team_lead', permissions: { canManageUsers: false } },
        { id: '3', username: 'dev1', role: 'developer', permissions: { canManageUsers: false } },
      ]),
      updateUserRole: vi.fn().mockResolvedValue({ id: '2', username: 'lead1', role: 'admin' }),
      getProjectAccess: vi.fn().mockResolvedValue({
        userId: '2',
        assignments: [
          { id: 1, scopeType: 'project', scopeId: 'proj-1', assignedBy: '1' },
        ],
      }),
      grantProjectAccess: vi.fn().mockResolvedValue({ id: 2, scopeType: 'project', scopeId: 'proj-2' }),
      revokeProjectAccess: vi.fn().mockResolvedValue(undefined),
      getAccessChanges: vi.fn().mockResolvedValue([
        { id: 1, actorId: '1', targetUserId: '2', changeType: 'role_changed', beforeValue: 'developer', afterValue: 'team_lead', changedAt: '2026-06-09T00:00:00Z' },
      ]),
    },
  },
}));

// Mock useAuth to return admin user
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    token: 'test-token',
    role: 'admin',
    permissions: { canManageUsers: true, canManageProjectAccess: true },
    currentUser: { id: '1', username: 'admin', role: 'admin' },
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
    refreshUser: vi.fn(),
  }),
}));

// Mock useRbac
vi.mock('../../hooks/useRbac', () => ({
  useRbac: () => ({
    role: 'admin',
    isAdmin: true,
    canManageUsers: true,
    canManageProjectAccess: true,
    permissions: { canManageUsers: true },
  }),
}));

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <UserManagementPage />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('UserManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders user list with roles', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Users (3)')).toBeInTheDocument();
      expect(screen.getAllByText('admin').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('lead1')).toBeInTheDocument();
      expect(screen.getByText('dev1')).toBeInTheDocument();
    });
  });

  it('shows role badges', async () => {
    renderPage();
    await waitFor(() => {
      const badges = screen.getAllByText(/admin|team_lead|developer/);
      expect(badges.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('opens role change modal on shield click', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('lead1')).toBeInTheDocument();
    });
    const shieldButtons = screen.getAllByTitle('Change Role');
    fireEvent.click(shieldButtons[0]);
    await waitFor(() => {
      expect(screen.getByText(/Change Role:/)).toBeInTheDocument();
    });
  });
});
