"""Regression test for finding #77: _user_has_access_to_same_scope (used by the
currently-dead can_manage_project_access, kept correct for whenever it's wired up)
compared the caller's *expanded* project IDs against the target user's *raw,
unexpanded* scope_id values — a target with only a group-scoped assignment could
never match, since group_id never equals a real project_id.
"""
import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_rbac_same_scope.db')
os.environ.setdefault('JENKINS_BASE_URL', 'http://localhost:8080')
os.environ.setdefault('JENKINS_TOKEN', 'test-token')
os.environ.setdefault('STORAGE_PATH', '/tmp/storage-test')
os.environ.setdefault('SCAN_TIMEOUT', '7200')
os.environ.setdefault('LOG_LEVEL', 'INFO')
os.environ.setdefault('CALLBACK_TOKEN', 'test-callback-token-1234567890')
os.environ.setdefault('API_KEY', 'test-api-key-1234567890')
os.environ.setdefault('MOCK_EXECUTION', 'True')

import pytest

from app.core.db import engine, Base, SessionLocal
from app.models.db_models import UserDB, ProjectAssignmentDB, ScanAssignmentDB
from app.services.rbac_service import RbacService


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def test_shares_scope_via_group_membership_on_target_side():
    with SessionLocal() as db:
        lead = UserDB(id="lead-1", username="lead1", role="team_lead", hashed_password="h")
        dev = UserDB(id="dev-1", username="dev1", role="developer", hashed_password="h")
        db.add(lead)
        db.add(dev)
        # Lead has a direct project assignment.
        db.add(ProjectAssignmentDB(user_id="lead-1", scope_type="project", scope_id="proj-a", assigned_by="admin"))
        # Dev's access to that same project comes via a group, not a direct assignment.
        db.add(ProjectAssignmentDB(user_id="dev-1", scope_type="project_group", scope_id="grp-1", assigned_by="admin"))
        db.add(ScanAssignmentDB(group_id="grp-1", scan_id="scan-1", project_id="proj-a"))
        db.commit()

        svc = RbacService(db=db, user=lead)
        assert svc._user_has_access_to_same_scope("dev-1") is True


def test_no_shared_scope_returns_false():
    with SessionLocal() as db:
        lead = UserDB(id="lead-1", username="lead1", role="team_lead", hashed_password="h")
        dev = UserDB(id="dev-1", username="dev1", role="developer", hashed_password="h")
        db.add(lead)
        db.add(dev)
        db.add(ProjectAssignmentDB(user_id="lead-1", scope_type="project", scope_id="proj-a", assigned_by="admin"))
        db.add(ProjectAssignmentDB(user_id="dev-1", scope_type="project", scope_id="proj-b", assigned_by="admin"))
        db.commit()

        svc = RbacService(db=db, user=lead)
        assert svc._user_has_access_to_same_scope("dev-1") is False
