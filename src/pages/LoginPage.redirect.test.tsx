import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import LoginPage from './LoginPage';
import { useAuth } from '../hooks/useAuth';

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

describe('LoginPage redirect behavior', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('redirects authenticated users to /dashboard', () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      token: 'fake-token',
      role: 'admin' as const,
      permissions: {
        canManageUsers: true,
        canManageProjectAccess: true,
        canViewAllProjects: true,
        canAssignIssues: true,
        canVerifyIssues: true,
        canUpdateAssignedIssues: true,
      },
      currentUser: { id: '1', username: 'admin', role: 'admin' as const },
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div data-testid="dashboard-page">Dashboard</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
  });
});
