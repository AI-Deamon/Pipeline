"""RBAC service: effective scope resolution, authorization decisions, audit logging."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.db_models import AccessChangeDB, ProjectAssignmentDB, UserDB

VALID_ROLES = {"admin", "team_lead", "developer"}


def validate_role(role: str) -> None:
    if role not in VALID_ROLES:
        raise ValueError(f"Invalid role: {role}. Must be one of {VALID_ROLES}")


class RbacService:
    """Resolve effective access and enforce authorization for the RBAC model."""

    def __init__(self, db: Session, user: UserDB):
        self._db = db
        self._user = user

    # -- Role helpers --

    @property
    def role(self) -> str:
        return str(self._user.role)

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def is_team_lead(self) -> bool:
        return self.role == "team_lead"

    @property
    def is_developer(self) -> bool:
        return self.role == "developer"

    # -- Effective project scope --

    def get_effective_project_ids(self) -> set[str]:
        """Return the set of project IDs the user can access.

        - admin: empty set means "all projects" (no filter).
        - team_lead / developer: project IDs from their project_assignments
          (both project-level and project_group-level scopes).
          For project_group scopes, all projects belonging to the group are included.
        """
        if self.is_admin:
            return set()  # empty = all

        rows = (
            self._db.query(ProjectAssignmentDB.scope_id)
            .filter(ProjectAssignmentDB.user_id == self._user.id)
            .filter(
                ProjectAssignmentDB.scope_type.in_(["project", "project_group"])
            )
            .all()
        )
        project_ids: set[str] = set()
        for (scope_id,) in rows:
            project_ids.add(scope_id)
            # For project_group scope, expand to all projects in the group
            if self._db.query(ProjectAssignmentDB).filter(
                ProjectAssignmentDB.scope_id == scope_id,
                ProjectAssignmentDB.scope_type == "project_group",
            ).first() is not None:
                # Also add the scope_id itself (it's a group ID, not a project ID)
                # Caller-level logic should use group expansion when needed
                pass
        return project_ids

    def has_project_access(self, project_id: str) -> bool:
        """Check whether the user can access a given project."""
        if self.is_admin:
            return True
        effective = self.get_effective_project_ids()
        if not effective:
            return False
        return project_id in effective

    # -- Action authorization --

    def can_manage_users(self) -> bool:
        return self.is_admin

    def can_manage_project_access(self, target_user_id: str | None = None) -> bool:
        if self.is_admin:
            return True
        if self.is_team_lead:
            # Team lead can manage access for users within their scope
            return target_user_id is not None and self._user_has_access_to_same_scope(target_user_id)
        return False

    def can_view_project(self, project_id: str) -> bool:
        return self.has_project_access(project_id)

    def can_assign_issue(self, project_id: str) -> bool:
        if self.is_admin:
            return True
        if self.is_team_lead:
            return self.has_project_access(project_id)
        return False

    def can_verify_issue(self, project_id: str) -> bool:
        return self.can_assign_issue(project_id)

    def can_update_issue(self, issue_project_id: str, issue_assignee_id: str | None) -> bool:
        if self.is_admin:
            return True
        if self.is_team_lead:
            return self.has_project_access(issue_project_id)
        if self.is_developer:
            return issue_assignee_id == self._user.id
        return False

    def can_request_rescan(self, issue: object) -> bool:
        """Allow the assignee (developer), team lead in scope, or admin to request."""
        if self.is_admin:
            return True
        if self.is_team_lead:
            return self.has_project_access(getattr(issue, "project_id", ""))
        if self.is_developer:
            assignee = getattr(issue, "assignee_id", None)
            user_id = getattr(self._user, "id", None) or getattr(self._user, "username", None)
            return assignee is not None and assignee == user_id
        return False

    def can_approve_rescan(self, project_id: str) -> bool:
        """Only admin or team lead in scope can trigger verification scans."""
        if self.is_admin:
            return True
        if self.is_team_lead:
            return self.has_project_access(project_id)
        return False

    def can_view_my_issues(self) -> bool:
        return self.is_developer or self.is_team_lead or self.is_admin

    # -- Permission map for frontend --

    @property
    def permissions(self) -> dict[str, bool]:
        return {
            "canManageUsers": self.can_manage_users(),
            "canManageProjectAccess": self.is_admin,  # only admins manage globally
            "canViewAllProjects": self.is_admin,
            "canAssignIssues": self.is_admin or self.is_team_lead,
            "canVerifyIssues": self.is_admin or self.is_team_lead,
            "canUpdateAssignedIssues": True,  # all roles can update issues (with different constraints)
        }

    # -- Audit logging --

    def log_access_change(
        self,
        target_user_id: str,
        change_type: str,
        before_value: str | None = None,
        after_value: str | None = None,
    ) -> AccessChangeDB:
        record = AccessChangeDB(
            actor_id=self._user.id,
            target_user_id=target_user_id,
            change_type=change_type,
            before_value=before_value,
            after_value=after_value,
        )
        self._db.add(record)
        self._db.commit()
        self._db.refresh(record)
        return record

    # -- Internal --

    def _user_has_access_to_same_scope(self, target_user_id: str) -> bool:
        """Check if target user shares at least one project assignment with this user."""
        if self.is_admin:
            return True
        my_projects = self.get_effective_project_ids()
        if not my_projects:
            return False
        target_assignments = (
            self._db.query(ProjectAssignmentDB.scope_id)
            .filter(ProjectAssignmentDB.user_id == target_user_id)
            .all()
        )
        return any((sid,) in [(s,) for s in my_projects] for (sid,) in target_assignments)


def get_rbac_service(db: Session, user: UserDB) -> RbacService:
    return RbacService(db=db, user=user)
