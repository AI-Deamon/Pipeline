"""RescanService: optimistic-locking helpers for the RescanRequestDB lifecycle."""

from __future__ import annotations

from typing import Optional
from datetime import datetime, timezone
from sqlalchemy import update
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
    """Apply updates and bump the version as an atomic compare-and-swap.

    Previously this checked `record.version != new_version` in Python and then did a
    plain ORM attribute assignment, which flushes as `UPDATE ... WHERE id=:id` — no
    `WHERE version=:new_version` guard at all (finding #95). Two concurrent requests
    both reading version=3 would both pass that Python check and both flush
    successfully; no `RescanVersionConflict` was ever raised, and whichever committed
    last silently won, defeating the entire point of the version field. The `UPDATE
    ... WHERE id=:id AND version=:new_version` below is the actual compare-and-swap —
    if the row's version has moved since it was read, this matches zero rows and we
    raise instead of quietly overwriting a concurrent change.
    """
    update_values = {k: v for k, v in fields.items() if v is not None and hasattr(record, k)}
    update_values["version"] = RescanRequestDB.version + 1
    update_values["updated_at"] = datetime.now(timezone.utc)

    result = session.execute(
        update(RescanRequestDB)
        .where(RescanRequestDB.id == record.id, RescanRequestDB.version == new_version)
        .values(**update_values)
    )
    if result.rowcount == 0:
        session.refresh(record)  # pull the real current version for the error message
        raise RescanVersionConflict(record.version, new_version)

    session.refresh(record)
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


def reject(
    session: Session,
    record: RescanRequestDB,
    reviewer_id: str,
    reviewer_note: Optional[str] = None,
) -> RescanRequestDB:
    """Mark a pending request as rejected by a reviewer. Distinct from `cancel`
    (the requester's own withdrawal, gated separately in the API layer) — this is a
    reviewer decision, so it records who rejected it and why, mirroring `approve`'s
    fields instead of just flipping status."""
    if record.status != "pending":
        raise ValueError(f"Cannot reject request in status '{record.status}'")
    record.status = "rejected"
    record.reviewer_id = reviewer_id
    record.reviewer_note = reviewer_note
    record.version = record.version + 1
    record.updated_at = datetime.now(timezone.utc)
    session.flush()
    return record


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
