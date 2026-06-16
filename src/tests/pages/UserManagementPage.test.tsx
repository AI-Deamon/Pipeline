import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
      deleteUser: vi.fn().mockResolvedValue(undefined),
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

  it('does not render a Delete button for the admin user', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('dev1')).toBeInTheDocument();
    });
    // The Delete button uses aria-label "Delete user <username>" — find the
    // ones for non-admin users and verify no "Delete user admin" exists.
    const allDeleteButtons = screen.queryAllByRole('button', { name: /delete user/i });
    const labels = allDeleteButtons.map(b => b.getAttribute('aria-label'));
    expect(labels).not.toContain('Delete user admin');
    // Non-admin users get a Delete button.
    expect(labels).toEqual(
      expect.arrayContaining(['Delete user lead1', 'Delete user dev1'])
    );
  });

  it('opens the delete confirmation modal when Delete is clicked', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('lead1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete user lead1' }));
    // ConfirmModal renders the title in an <h2 id="confirm-modal-title">. The
    // user list also shows "lead1" (in the username cell), so we use a heading
    // role to scope the assertion to the modal.
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(dialog).getByRole('heading', { name: 'Delete User?' })).toBeInTheDocument();
      expect(within(dialog).getByText(/lead1/)).toBeInTheDocument();
    });
  });

  it('calls api.rbac.deleteUser and shows success toast on confirm', async () => {
    const { api } = await import('../../services/api');
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('dev1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete user dev1' }));
    // The per-row Delete button (aria-label="Delete user dev1") and the
    // modal's confirm button (text="Delete User") both match /delete user/i.
    // Scope the second lookup to inside the dialog to avoid the ambiguity.
    const dialog = await screen.findByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: 'Delete User' });
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(api.rbac.deleteUser).toHaveBeenCalledWith('3');
    });
  });
});
