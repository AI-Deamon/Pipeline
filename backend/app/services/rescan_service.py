"""RescanService: optimistic-locking helpers for the RescanRequestDB lifecycle."""

from __future__ import annotations

from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models.db_models import RescanRequestDB


class RescanVersionConflict(Exception):
    """Raised when the supplied version does not match the stored version."""

    def __init__(self, current_version: int, supplied_version: int):
        self.current_version = current_version
        self.supplied_version = supplied_version
        super().__init__(
            f"Version conflict: supplied={supplied_version}, current={current_version}"
        )


def find_by_id(session: Session, request_id: int) -> Optional[RescanRequestDB]:
    return (
        session.query(RescanRequestDB)
        .filter(RescanRequestDB.id == request_id)
        .first()
    )


def find_pending_for_issue(session: Session, issue_id: int) -> Optional[RescanRequestDB]:
    return (
        session.query(RescanRequestDB)
        .filter(
            RescanRequestDB.issue_id == issue_id,
            RescanRequestDB.status == "pending",
        )
        .order_by(RescanRequestDB.created_at.desc())
        .first()
    )


def create_request(
    session: Session,
    issue_id: int,
    requested_by: str,
    fix_note: str,
    fix_note_raw: Optional[str] = None,
    commit_sha: Optional[str] = None,
) -> RescanRequestDB:
    """Create a new rescan request. Raises ValueError if a pending one exists."""
    existing = find_pending_for_issue(session, issue_id)
    if existing is not None:
        raise ValueError(
            f"Issue {issue_id} already has a pending rescan request (id={existing.id})"
        )
    record = RescanRequestDB(
        issue_id=issue_id,
        requested_by=requested_by,
        fix_note=fix_note,
        fix_note_raw=fix_note_raw,
        commit_sha=commit_sha,
        status="pending",
        version=0,
    )
    session.add(record)
    session.flush()
    return record


def update_with_version_check(
    session: Session,
    record: RescanRequestDB,
    new_version: int,
    **fields: object,
) -> RescanRequestDB:
    """Apply updates and bump the version, or raise RescanVersionConflict."""
    if record.version != new_version:
        raise RescanVersionConflict(record.version, new_version)
    for key, value in fields.items():
        if value is not None and hasattr(record, key):
            setattr(record, key, value)
    record.version = record.version + 1
    record.updated_at = datetime.now(timezone.utc)
    session.flush()
    return record


def cancel(
    session: Session,
    record: RescanRequestDB,
    new_version: int,
) -> RescanRequestDB:
    """Cancel a pending request and bump the version."""
    if record.status != "pending":
        raise ValueError(f"Cannot cancel request in status '{record.status}'")
    return update_with_version_check(session, record, new_version, status="rejected")


def complete(
    session: Session,
    record: RescanRequestDB,
    verdict: str,
) -> RescanRequestDB:
    """Mark a request as completed with the given verdict."""
    record.status = "completed"
    record.verdict = verdict
    record.completed_at = datetime.now(timezone.utc)
    record.version = record.version + 1
    record.updated_at = datetime.now(timezone.utc)
    session.flush()
    return record
