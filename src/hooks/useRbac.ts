import { useMemo } from 'react';
import { useAuth } from './useAuth';
import type { Role } from '../types';

export function useRbac() {
  const { role, permissions, isAuthenticated } = useAuth();

  return useMemo(() => {
    const isAdmin = role === 'admin';
    const isTeamLead = role === 'team_lead';
    const isDeveloper = role === 'developer';

    return {
      role,
      isAdmin,
      isTeamLead,
      isDeveloper,
      isAuthenticated,
      permissions: permissions ?? {
        canManageUsers: false,
        canManageProjectAccess: false,
        canViewAllProjects: false,
        canAssignIssues: false,
        canVerifyIssues: false,
        canUpdateAssignedIssues: false,
      },
      canManageUsers: isAdmin,
      canManageProjectAccess: isAdmin,
      canViewAllProjects: isAdmin,
      canAssignIssues: isAdmin || isTeamLead,
      canVerifyIssues: isAdmin || isTeamLead,
      canUpdateAssignedIssues: isAuthenticated,
    };
  }, [role, permissions, isAuthenticated]);
}

export function canAccessProject(
  role: Role | null,
  userProjectIds: string[],
  targetProjectId: string,
): boolean {
  if (!role) return false;
  if (role === 'admin') return true;
  return userProjectIds.includes(targetProjectId);
}
