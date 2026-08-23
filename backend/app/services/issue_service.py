from typing import Any, Optional
from datetime import datetime, timezone
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.db_models import IssueDB, IssueHistoryDB
from app.state.issue_state import IssueState, is_valid_transition


class IssueService:

    def _upsert(self, session: Session, data: dict[str, Any]) -> IssueDB:
        issue_id = data["issue_id"]
        project_id = data["project_id"]

        existing = (
            session.query(IssueDB)
            .filter(
                IssueDB.issue_id == issue_id,
                IssueDB.project_id == project_id,
            )
            .first()
        )

        now = datetime.now(timezone.utc)
        if existing:
            existing.last_seen_at = now
            for field in ("severity", "title", "description", "location",
                          "severity_v2", "effort", "rule", "recommendation",
                          "finding_type", "sonar_status", "sonar_resolution",
                          "raw_evidence", "code_snippet",
                          "issue_type", "scan_id"):
                if field in data:
                    setattr(existing, field, data[field])
            if "first_seen_scan_id" in data:
                existing.first_seen_scan_id = data["first_seen_scan_id"]
            if "extra_metadata" in data and data["extra_metadata"]:
                merged = dict(existing.extra_metadata or {})
                merged.update(data["extra_metadata"])
                existing.extra_metadata = merged
            session.flush()
            return existing

        issue = IssueDB(
            issue_id=issue_id,
            project_id=project_id,
            tool_name=data["tool_name"],
            scan_id=data.get("scan_id"),
            first_seen_scan_id=data.get("first_seen_scan_id"),
            severity=data["severity"],
            title=data["title"],
            description=data.get("description"),
            location=data.get("location"),
            severity_v2=data.get("severity_v2"),
            effort=data.get("effort"),
            rule=data.get("rule"),
            recommendation=data.get("recommendation"),
            finding_type=data.get("finding_type"),
            sonar_status=data.get("sonar_status"),
            sonar_resolution=data.get("sonar_resolution"),
            raw_evidence=data.get("raw_evidence"),
            code_snippet=data.get("code_snippet"),
            extra_metadata=data.get("extra_metadata", {}),
            issue_type=data.get("issue_type"),
            is_new=True,
            status="open",
            first_seen_at=now,
            last_seen_at=now,
        )
        session.add(issue)
        session.flush()
        return issue

    def create_issue(self, session: Session, data: dict[str, Any]) -> IssueDB:
        return self._upsert(session, data)

    def get_by_id(self, session: Session, issue_id: int) -> Optional[IssueDB]:
        return session.query(IssueDB).filter(IssueDB.id == issue_id).first()

    def get_project_overview(self, session: Session, project_id: str) -> list[dict[str, Any]]:
        rows = (
            session.query(
                IssueDB.tool_name,
                func.count(IssueDB.id).label("total"),
                IssueDB.severity,
                IssueDB.finding_type,
            )
            .filter(IssueDB.project_id == project_id)
            .group_by(IssueDB.tool_name, IssueDB.severity, IssueDB.finding_type)
            .all()
        )

        tool_map: dict[str, dict] = {}
        for tool_name, total, severity, finding_type in rows:
            if tool_name not in tool_map:
                tool_map[tool_name] = {
                    "tool": tool_name,
                    "total": 0,
                    "severity": {},
                    "by_type": {},
                }
            tool_map[tool_name]["total"] += total
            tool_map[tool_name]["severity"][severity] = (
                tool_map[tool_name]["severity"].get(severity, 0) + total
            )
            if finding_type:
                tool_map[tool_name]["by_type"][finding_type] = (
                    tool_map[tool_name]["by_type"].get(finding_type, 0) + total
                )

        return list(tool_map.values())

    def get_tool_issues(
        self,
        session: Session,
        project_id: str,
        tool_name: str,
        page: int = 1,
        page_size: int = 25,
        finding_type: str | None = None,
    ) -> dict[str, Any]:
        query = (
            session.query(IssueDB)
            .filter(
                IssueDB.project_id == project_id,
                IssueDB.tool_name == tool_name,
            )
        )
        if finding_type:
            query = query.filter(IssueDB.finding_type == finding_type)
        query = query.order_by(IssueDB.last_seen_at.desc())
        total = query.count()
        total_pages = max(1, (total + page_size - 1) // page_size)
        offset = (page - 1) * page_size
        issues = query.offset(offset).limit(page_size).all()
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "issues": issues,
        }

    def get_my_issues(
        self,
        session: Session,
        user_id: str,
        page: int = 1,
        page_size: int = 25,
    ) -> dict[str, Any]:
        query = (
            session.query(IssueDB)
            .filter(IssueDB.assignee_id == user_id)
            .order_by(IssueDB.last_seen_at.desc())
        )
        total = query.count()
        issues = query.offset((page - 1) * page_size).limit(page_size).all()

        project_ids = {i.project_id for i in issues}
        projects = [{"project_id": pid, "total": sum(1 for i in issues if i.project_id == pid)} for pid in project_ids]

        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "projects": projects,
            "issues": [self._to_dict(i) for i in issues],
        }

    def _to_dict(self, issue: IssueDB) -> dict[str, Any]:
        return {
            "id": issue.id,
            "issue_id": issue.issue_id,
            "project_id": issue.project_id,
            "tool_name": issue.tool_name,
            "scan_id": issue.scan_id,
            "first_seen_scan_id": issue.first_seen_scan_id,
            "first_seen_at": issue.first_seen_at.isoformat() if issue.first_seen_at else None,
            "last_seen_at": issue.last_seen_at.isoformat() if issue.last_seen_at else None,
            "resolved_at": issue.resolved_at.isoformat() if issue.resolved_at else None,
            "severity": issue.severity,
            "issue_type": issue.issue_type,
            "title": issue.title,
            "description": issue.description,
            "location": issue.location,
            "severity_v2": issue.severity_v2,
            "effort": issue.effort,
            "rule": issue.rule,
            "recommendation": issue.recommendation,
            "finding_type": issue.finding_type,
            "sonar_status": issue.sonar_status,
            "sonar_resolution": issue.sonar_resolution,
            "raw_evidence": issue.raw_evidence,
            "is_new": issue.is_new,
            "status": issue.status,
            "assignee_id": issue.assignee_id,
            "assigned_by": issue.assigned_by,
            "priority": issue.priority,
            "extra_metadata": issue.extra_metadata,
            "created_at": issue.created_at.isoformat() if issue.created_at else None,
            "updated_at": issue.updated_at.isoformat() if issue.updated_at else None,
        }

    def _record_history(
        self,
        session: Session,
        issue_id: int,
        field_name: str,
        old_value: Optional[str],
        new_value: str,
        actor_id: Optional[str] = None,
        change_type: str = "update",
    ) -> None:
        entry = IssueHistoryDB(
            issue_id=issue_id,
            field_name=field_name,
            change_type=change_type,
            old_value=old_value,
            new_value=new_value,
            actor_id=actor_id,
        )
        session.add(entry)
        session.flush()
        # Invalidate the per-issue cache and the pending-verification list cache so
        # subsequent reads see the new state immediately. Deferred to after the
        # caller's commit (finding #96) — invalidating here, at flush time, races a
        # concurrent read that could repopulate the cache with pre-update data before
        # this transaction is even committed, and nothing would invalidate it again.
        try:
            from app.services.cache import invalidate_after_commit
            invalidate_after_commit(session, key=f"issue:{issue_id}")
            invalidate_after_commit(session, pattern="pending_verification:*")
        except Exception:
            pass

    def assign(
        self,
        session: Session,
        issue_id: int,
        assignee_id: str,
        assigned_by: str,
        priority: Optional[str] = None,
    ) -> Optional[IssueDB]:
        issue = self.get_by_id(session, issue_id)
        if issue is None:
            return None

        from_state = IssueState(issue.status)
        old_assignee = issue.assignee_id
        # Reassigning an issue that's already being actively worked (ASSIGNED or
        # IN_PROGRESS) to a different developer is a normal workflow (handoff, someone
        # goes on leave) and must not force a status change — only OPEN/REJECTED need
        # a real transition *into* ASSIGNED. Regression note: an earlier version of this
        # fix only special-cased ASSIGNED, which meant reassigning an IN_PROGRESS issue
        # hit `is_valid_transition(IN_PROGRESS, ASSIGNED)` (False, since IN_PROGRESS only
        # permits -> FIXED) and hard-errored on a previously-working reassignment.
        needs_transition = from_state not in (IssueState.ASSIGNED, IssueState.IN_PROGRESS)

        if needs_transition:
            # Real state transition (e.g. OPEN -> ASSIGNED, REJECTED -> ASSIGNED) — must
            # go through the same rules as transition_status, or a closed/verified issue
            # could be forced back into the active queue via assign().
            if not is_valid_transition(from_state, IssueState.ASSIGNED):
                raise ValueError(
                    f"Invalid transition: {from_state.value} -> {IssueState.ASSIGNED.value}"
                )

        issue.assignee_id = assignee_id
        issue.assigned_by = assigned_by
        if priority is not None:
            issue.priority = priority

        self._record_history(session, issue_id, "assignee_id", old_assignee, assignee_id, actor_id=assigned_by)

        if needs_transition:
            old_status = issue.status
            issue.status = IssueState.ASSIGNED.value
            issue.resolved_at = None  # matches transition_status's clearing for ASSIGNED
            self._record_history(
                session, issue_id, "status", old_status, IssueState.ASSIGNED.value, actor_id=assigned_by
            )
        # else: reassigning an already-ASSIGNED issue — no status transition needed.

        if priority is not None:
            self._record_history(session, issue_id, "priority", None, priority, actor_id=assigned_by)

        session.flush()
        return issue

    def transition_status(
        self,
        session: Session,
        issue_id: int,
        to_status: str,
        changed_by: Optional[str] = None,
        change_type: str = "update",
    ) -> Optional[IssueDB]:
        issue = self.get_by_id(session, issue_id)
        if issue is None:
            return None

        from_state = IssueState(issue.status)
        to_state = IssueState(to_status)

        if not is_valid_transition(from_state, to_state):
            raise ValueError(
                f"Invalid transition: {from_state.value} -> {to_state.value}"
            )

        old_status = issue.status
        issue.status = to_state.value

        if to_state == IssueState.VERIFIED:
            issue.resolved_at = datetime.now(timezone.utc)
        elif to_state in (IssueState.REJECTED, IssueState.ASSIGNED, IssueState.OPEN):
            # Reopening (regression) or rejecting clears the resolution timestamp.
            issue.resolved_at = None

        self._record_history(
            session, issue_id, "status", old_status, to_state.value,
            actor_id=changed_by, change_type=change_type,
        )
        session.flush()
        return issue

    def add_comment(
        self,
        session: Session,
        issue_id: int,
        user_id: str,
        message: str,
    ) -> IssueHistoryDB:
        entry = IssueHistoryDB(
            issue_id=issue_id,
            change_type="comment",
            comment=message,
            actor_id=user_id,
        )
        session.add(entry)
        session.flush()
        return entry

    def get_history(
        self,
        session: Session,
        issue_id: int,
    ) -> list[dict[str, Any]]:
        entries = (
            session.query(IssueHistoryDB)
            .filter(IssueHistoryDB.issue_id == issue_id)
            .order_by(IssueHistoryDB.created_at.asc())
            .all()
        )
        return [
            {
                "id": e.id,
                "issue_id": e.issue_id,
                "change_type": e.change_type,
                "field_name": e.field_name,
                "old_value": e.old_value,
                "new_value": e.new_value,
                "comment": e.comment,
                "actor_id": e.actor_id,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in entries
        ]

    def get_metrics(self, session: Session, project_id: str) -> dict[str, Any]:
        from sqlalchemy import func

        total = session.query(func.count(IssueDB.id)).filter(
            IssueDB.project_id == project_id,
            IssueDB.status != "verified",
        ).scalar() or 0

        status_rows = (
            session.query(IssueDB.status, func.count(IssueDB.id))
            .filter(IssueDB.project_id == project_id)
            .group_by(IssueDB.status)
            .all()
        )
        by_status = {row[0]: row[1] for row in status_rows}

        assign_entries = (
            session.query(IssueHistoryDB.created_at, IssueDB.first_seen_at)
            .join(IssueDB, IssueDB.id == IssueHistoryDB.issue_id)
            .filter(
                IssueHistoryDB.field_name == "assignee_id",
                IssueDB.project_id == project_id,
            )
            .all()
        )
        if assign_entries:
            diffs = [
                (created_at - first_seen_at).total_seconds() / 3600.0
                for created_at, first_seen_at in assign_entries
            ]
            avg_assignment = round(sum(diffs) / len(diffs), 2)
        else:
            avg_assignment = None

        return {
            "total": total,
            "by_status": by_status,
            "avg_assignment_latency_hours": avg_assignment,
            "avg_verification_latency_hours": None,
        }
