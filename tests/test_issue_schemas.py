import pytest
from pydantic import ValidationError
from datetime import datetime, timezone
from app.schemas.issue import (
    IssueCreate,
    IssueResponse,
    IssueAssignRequest,
    IssueStatusRequest,
    IssueCommentCreate,
    IssueHistoryResponse,
    OverviewResponse,
    ToolOverview,
    MyIssuesResponse,
    IssueBrief,
    MetricsResponse,
)


class TestIssueCreate:
    def test_valid_issue(self):
        data = {
            "issue_id": "sonar:abc123",
            "project_id": "proj_1",
            "tool_name": "sonar",
            "severity": "critical",
            "title": "Hardcoded password",
        }
        s = IssueCreate(**data)
        assert s.issue_id == "sonar:abc123"
        assert s.severity == "critical"

    def test_missing_required(self):
        with pytest.raises(ValidationError):
            IssueCreate(issue_id="x")

    def test_empty_title_rejected(self):
        with pytest.raises(ValidationError):
            IssueCreate(
                issue_id="x",
                project_id="proj_1",
                tool_name="sonar",
                severity="critical",
                title="",
            )


class TestIssueAssignRequest:
    def test_valid_assignment(self):
        s = IssueAssignRequest(assignee_id="user_2", priority="high", comment="Fix it")
        assert s.assignee_id == "user_2"
        assert s.priority == "high"

    def test_missing_assignee(self):
        with pytest.raises(ValidationError):
            IssueAssignRequest(priority="high")


class TestIssueStatusRequest:
    def test_valid_transition(self):
        s = IssueStatusRequest(status="fixed", comment="Done")
        assert s.status == "fixed"

    def test_empty_status_rejected(self):
        with pytest.raises(ValidationError):
            IssueStatusRequest(status="", comment="test")


class TestIssueCommentCreate:
    def test_valid_comment(self):
        s = IssueCommentCreate(message="This is a comment")
        assert s.message == "This is a comment"

    def test_empty_message_rejected(self):
        with pytest.raises(ValidationError):
            IssueCommentCreate(message="")


class TestIssueResponse:
    def test_from_attributes(self):
        now = datetime.now(timezone.utc)
        s = IssueResponse(
            id=1,
            issue_id="test:001",
            project_id="proj_1",
            tool_name="sonar",
            severity="high",
            title="Test",
            status="open",
            first_seen_at=now,
            last_seen_at=now,
            is_new=True,
            created_at=now,
            updated_at=now,
        )
        assert s.id == 1
        assert s.status == "open"

    def test_derived_fields_are_actually_serialized(self):
        """Regression test for a real bug found live: file_path, line_number, tags,
        code_snippet_language, rule_name, and git_url were all plain @property on a
        Pydantic v2 model instead of @computed_field. A plain @property is never
        included in .model_dump()/the JSON response at all — only @computed_field
        properties are — so despite `location` and `extra_metadata` being fully
        populated in the database, every real issue's API response was missing
        these fields entirely. Confirmed live: the Triage table's Location column
        showed "-" for all 151 real findings on a project that all had a real
        file_path in the database.
        """
        now = datetime.now(timezone.utc)
        s = IssueResponse(
            id=1,
            issue_id="test:001",
            project_id="proj_1",
            tool_name="sonar",
            severity="high",
            title="Test",
            status="open",
            first_seen_at=now,
            last_seen_at=now,
            is_new=True,
            created_at=now,
            updated_at=now,
            location={"file_path": "src/app.ts", "line": 42},
            extra_metadata={"tags": ["a", "b"], "code_snippet_language": "typescript", "rule_name": "S1234"},
        )
        dumped = s.model_dump()
        assert dumped["file_path"] == "src/app.ts"
        assert dumped["line_number"] == 42
        assert dumped["tags"] == ["a", "b"]
        assert dumped["code_snippet_language"] == "typescript"
        assert dumped["rule_name"] == "S1234"
        assert "git_url" in dumped


class TestIssueHistoryResponse:
    def test_valid_history(self):
        now = datetime.now(timezone.utc)
        s = IssueHistoryResponse(
            issue_id=1,
            history=[{
                "change_type": "status_change",
                "field_name": "status",
                "old_value": "open",
                "new_value": "assigned",
                "actor": "user_1",
                "comment": "Assigned",
                "created_at": now,
            }],
        )
        assert len(s.history) == 1
        assert s.history[0]["change_type"] == "status_change"


class TestOverviewResponse:
    def test_valid_overview(self):
        s = OverviewResponse(
            project_id="proj_1",
            tools=[
                ToolOverview(
                    tool="sonar",
                    total=79,
                    severity={"critical": 13, "high": 1, "medium": 64, "low": 1},
                    by_type={"bug": 10, "vulnerability": 13, "code_smell": 50},
                )
            ],
        )
        assert s.project_id == "proj_1"
        assert s.tools[0].tool == "sonar"
        assert s.tools[0].total == 79


class TestMyIssuesResponse:
    def test_valid_my_issues(self):
        now = datetime.now(timezone.utc)
        s = MyIssuesResponse(
            total=2,
            page=1,
            page_size=50,
            projects=[{
                "project_id": "proj_1",
                "project_name": "Meraki API",
                "issues": [
                    IssueBrief(
                        id=1,
                        issue_id="test:001",
                        tool_name="sonar",
                        severity="critical",
                        title="Bug",
                        status="assigned",
                        priority="high",
                        location={"file": "src/main.py", "line": 42},
                        first_seen_at=now,
                        last_seen_at=now,
                    )
                ],
            }],
            issues=[],
        )
        assert s.total == 2
        assert s.projects[0]["project_name"] == "Meraki API"


class TestMetricsResponse:
    def test_valid_metrics(self):
        s = MetricsResponse(
            total=100,
            by_status={"open": 30, "assigned": 20, "in_progress": 10, "fixed": 15, "verified": 20, "rejected": 5},
            avg_assignment_latency_hours=4.5,
            avg_verification_latency_hours=24.0,
        )
        assert s.total == 100
        assert s.by_status["open"] == 30
