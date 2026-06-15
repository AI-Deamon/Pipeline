import { renderHook } from '@testing-library/react';
import { vi, test, expect, describe } from 'vitest';
import { useRbac, canAccessProject } from '../../hooks/useRbac';
import { useAuth } from '../../hooks/useAuth';

vi.mock('../../hooks/useAuth');

describe('useRbac', () => {
  test('admin has all permissions', () => {
    vi.mocked(useAuth).mockReturnValue({
      role: 'admin',
      isAuthenticated: true,
      permissions: null,
    } as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useRbac());
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.canManageUsers).toBe(true);
    expect(result.current.canManageProjectAccess).toBe(true);
    expect(result.current.canViewAllProjects).toBe(true);
    expect(result.current.canAssignIssues).toBe(true);
    expect(result.current.canVerifyIssues).toBe(true);
    expect(result.current.canUpdateAssignedIssues).toBe(true);
  });

  test('team_lead can assign and verify issues', () => {
    vi.mocked(useAuth).mockReturnValue({
      role: 'team_lead',
      isAuthenticated: true,
      permissions: null,
    } as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useRbac());
    expect(result.current.isTeamLead).toBe(true);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isDeveloper).toBe(false);
    expect(result.current.canManageUsers).toBe(false);
    expect(result.current.canAssignIssues).toBe(true);
    expect(result.current.canVerifyIssues).toBe(true);
    expect(result.current.canUpdateAssignedIssues).toBe(true);
  });

  test('developer has minimal permissions', () => {
    vi.mocked(useAuth).mockReturnValue({
      role: 'developer',
      isAuthenticated: true,
      permissions: null,
    } as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useRbac());
    expect(result.current.isDeveloper).toBe(true);
    expect(result.current.canManageUsers).toBe(false);
    expect(result.current.canAssignIssues).toBe(false);
    expect(result.current.canVerifyIssues).toBe(false);
    expect(result.current.canUpdateAssignedIssues).toBe(true);
  });

  test('unauthenticated user has no permissions', () => {
    vi.mocked(useAuth).mockReturnValue({
      role: null,
      isAuthenticated: false,
      permissions: null,
    } as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useRbac());
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isTeamLead).toBe(false);
    expect(result.current.isDeveloper).toBe(false);
    expect(result.current.canManageUsers).toBe(false);
    expect(result.current.canAssignIssues).toBe(false);
    expect(result.current.canUpdateAssignedIssues).toBe(false);
  });

  test('permissions from API override role defaults', () => {
    vi.mocked(useAuth).mockReturnValue({
      role: 'developer',
      isAuthenticated: true,
      permissions: {
        canManageUsers: false,
        canManageProjectAccess: true,
        canViewAllProjects: false,
        canAssignIssues: false,
        canVerifyIssues: false,
        canUpdateAssignedIssues: false,
      },
    } as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useRbac());
    expect(result.current.permissions?.canManageProjectAccess).toBe(true);
  });
});

describe('canAccessProject', () => {
  test('admin can access any project', () => {
    expect(canAccessProject('admin', ['proj-a'], 'proj-b')).toBe(true);
  });

  test('non-admin with matching project id can access', () => {
    expect(canAccessProject('developer', ['proj-a', 'proj-b'], 'proj-a')).toBe(true);
  });

  test('non-admin without matching project id cannot access', () => {
    expect(canAccessProject('developer', ['proj-a'], 'proj-c')).toBe(false);
  });

  test('null role returns false', () => {
    expect(canAccessProject(null, [], 'proj-a')).toBe(false);
  });

  test('team_lead without assignment cannot access', () => {
    expect(canAccessProject('team_lead', [], 'proj-a')).toBe(false);
  });
});
