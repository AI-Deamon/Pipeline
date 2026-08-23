"""Regression test for finding #75: ProjectAccessCreate.scope_type was a bare str —
a typo'd/wrong-case value (e.g. "Project") was accepted, stored, and audit-logged as
a successful grant, but get_effective_project_ids() filters on an exact string match,
so the row was silently inert and the "granted" user got zero real access despite the
API reporting success.
"""
import pytest
from pydantic import ValidationError
from app.schemas.rbac import ProjectAccessCreate


def test_valid_scope_types_accepted():
    assert ProjectAccessCreate(scope_type="project", scope_id="proj-a").scope_type == "project"
    assert ProjectAccessCreate(scope_type="project_group", scope_id="grp-a").scope_type == "project_group"


def test_wrong_case_scope_type_rejected():
    with pytest.raises(ValidationError):
        ProjectAccessCreate(scope_type="Project", scope_id="proj-a")


def test_typo_scope_type_rejected():
    with pytest.raises(ValidationError):
        ProjectAccessCreate(scope_type="projects", scope_id="proj-a")
