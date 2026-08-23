"""Unit tests for RbacService."""

import pytest
from unittest.mock import MagicMock

from app.services.rbac_service import RbacService, validate_role, VALID_ROLES


class TestValidateRole:
    def test_valid_roles(self):
        for role in VALID_ROLES:
            validate_role(role)  # Should not raise

    def test_invalid_role(self):
        with pytest.raises(ValueError, match="Invalid role"):
            validate_role("superadmin")


class TestRbacServiceRole:
    def _make_user(self, role="developer"):
        user = MagicMock()
        user.id = "user-1"
        user.username = "testuser"
        user.role = role
        return user

    def test_is_admin(self):
        svc = RbacService(db=MagicMock(), user=self._make_user("admin"))
        assert svc.is_admin is True
        assert svc.is_team_lead is False
        assert svc.is_developer is False

    def test_is_team_lead(self):
        svc = RbacService(db=MagicMock(), user=self._make_user("team_lead"))
        assert svc.is_team_lead is True
        assert svc.is_admin is False

    def test_is_developer(self):
        svc = RbacService(db=MagicMock(), user=self._make_user("developer"))
        assert svc.is_developer is True
        assert svc.is_admin is False


class TestRbacServicePermissions:
    def _make_user(self, role="developer"):
        user = MagicMock()
        user.id = "user-1"
        user.username = "testuser"
        user.role = role
        return user

    def test_admin_permissions(self):
        svc = RbacService(db=MagicMock(), user=self._make_user("admin"))
        perms = svc.permissions
        assert perms["canManageUsers"] is True
        assert perms["canViewAllProjects"] is True
        assert perms["canAssignIssues"] is True
        assert perms["canVerifyIssues"] is True

    def test_team_lead_permissions(self):
        svc = RbacService(db=MagicMock(), user=self._make_user("team_lead"))
        perms = svc.permissions
        assert perms["canManageUsers"] is False
        assert perms["canViewAllProjects"] is False
        assert perms["canAssignIssues"] is True
        assert perms["canVerifyIssues"] is True

    def test_developer_permissions(self):
        svc = RbacService(db=MagicMock(), user=self._make_user("developer"))
        perms = svc.permissions
        assert perms["canManageUsers"] is False
        assert perms["canViewAllProjects"] is False
        assert perms["canAssignIssues"] is False
        assert perms["canVerifyIssues"] is False


class TestRbacServiceProjectAccess:
    def _make_user(self, role="developer"):
        user = MagicMock()
        user.id = "user-1"
        user.username = "testuser"
        user.role = role
        return user

    def test_admin_has_all_project_access(self):
        svc = RbacService(db=MagicMock(), user=self._make_user("admin"))
        assert svc.has_project_access("any-project-id") is True
        assert svc.get_effective_project_ids() == set()

    def test_non_admin_without_assignments(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.filter.return_value.all.return_value = []
        svc = RbacService(db=db, user=self._make_user("developer"))
        assert svc.has_project_access("project-x") is False

    def test_non_admin_with_assignment(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.filter.return_value.all.return_value = [
            ("project", "project-x")
        ]
        svc = RbacService(db=db, user=self._make_user("developer"))
        assert svc.has_project_access("project-x") is True
        assert svc.has_project_access("project-y") is False

    def test_non_admin_with_group_assignment_expands_to_member_projects(self):
        # Regression test for the bug where a project_group-scoped assignment added the
        # raw group_id to the effective set instead of expanding it to member projects,
        # which meant group grants silently gave zero real access.
        db = MagicMock()
        db.query.return_value.filter.return_value.filter.return_value.all.return_value = [
            ("project_group", "group-1")
        ]
        db.query.return_value.filter.return_value.distinct.return_value.all.return_value = [
            ("project-a",), ("project-b",)
        ]
        svc = RbacService(db=db, user=self._make_user("developer"))
        assert svc.has_project_access("project-a") is True
        assert svc.has_project_access("project-b") is True
        assert svc.has_project_access("group-1") is False
        assert svc.has_project_access("project-unrelated") is False


class TestRbacServiceIssueActions:
    def _make_user(self, role="developer"):
        user = MagicMock()
        user.id = "user-1"
        user.username = "testuser"
        user.role = role
        return user

    def test_admin_can_assign_and_verify(self):
        svc = RbacService(db=MagicMock(), user=self._make_user("admin"))
        assert svc.can_assign_issue("any-project") is True
        assert svc.can_verify_issue("any-project") is True

    def test_developer_cannot_assign_or_verify(self):
        svc = RbacService(db=MagicMock(), user=self._make_user("developer"))
        assert svc.can_assign_issue("any-project") is False
        assert svc.can_verify_issue("any-project") is False

    def test_developer_can_update_own_issue(self):
        user = self._make_user("developer")
        user.id = "dev-1"
        svc = RbacService(db=MagicMock(), user=user)
        assert svc.can_update_issue("project-x", "dev-1") is True
        assert svc.can_update_issue("project-x", "other-dev") is False


class TestServiceAccountLeastPrivilege:
    """Regression tests for finding #74: the shared X-API-Key service account is
    seeded with role="admin" so scan/project/report automation works, but that's far
    broader than a shared automation credential needs — user management must stay
    off-limits regardless of the underlying role."""

    def _make_service_account(self):
        user = MagicMock()
        user.id = "service-account"
        user.username = "service-account"
        user.role = "admin"
        return user

    def test_service_account_cannot_manage_users(self):
        svc = RbacService(db=MagicMock(), user=self._make_service_account())
        assert svc.is_service_account is True
        assert svc.can_manage_users() is False

    def test_service_account_still_has_full_project_access(self):
        # Scan-triggering/report automation must still work — only user management
        # is restricted.
        svc = RbacService(db=MagicMock(), user=self._make_service_account())
        assert svc.has_project_access("any-project-id") is True

    def test_real_admin_user_unaffected(self):
        user = MagicMock()
        user.id = "admin-1"
        user.username = "admin"
        user.role = "admin"
        svc = RbacService(db=MagicMock(), user=user)
        assert svc.is_service_account is False
        assert svc.can_manage_users() is True
