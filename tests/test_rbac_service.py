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
            ("project-x",)
        ]
        svc = RbacService(db=db, user=self._make_user("developer"))
        assert svc.has_project_access("project-x") is True
        assert svc.has_project_access("project-y") is False


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
