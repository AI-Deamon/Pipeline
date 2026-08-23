"""Post-processing scheduling: FAIL stages must feed the issue tracker too.

A FAIL stage (e.g. ZAP found vulnerabilities) still produces a report artifact —
the fetcher fetches PASS and FAIL stages alike — so the issue-migration chain
must cover both. Previously only PASS stages were migrated, leaving FAIL-stage
findings visible in reports but absent from issues.
"""
from unittest.mock import MagicMock, patch

from app.api.scans.callback import _schedule_post_processing
from app.state.scan_state import ScanState


def _scan(state=ScanState.COMPLETED):
    scan = MagicMock()
    scan.state = state
    scan.scan_id = "scan-1"
    scan.project_id = "proj-1"
    return scan


def _migrated_stages(mock_migrate):
    return [call.args[2] for call in mock_migrate.si.call_args_list]


@patch("app.api.scans.callback.chain")
@patch("app.api.scans.callback.group")
@patch("app.api.scans.callback.detect_regressions")
@patch("app.api.scans.callback.auto_verify_pending_rescans")
@patch("app.api.scans.callback.auto_verify_fixed_issues")
@patch("app.api.scans.callback.migrate_scan_to_issues")
@patch("app.api.scans.callback.process_scan_reports_task")
def test_fail_stages_are_migrated(
    mock_report, mock_migrate, _fixed, _rescans, _regress, mock_group, mock_chain
):
    stages = [
        {"stage": "sonar_scanner", "status": "PASS"},
        {"stage": "zap_scan", "status": "FAIL"},
        {"stage": "docker_push", "status": "SKIPPED"},
    ]
    _schedule_post_processing(_scan(), stages, build_number=42)

    migrated = _migrated_stages(mock_migrate)
    assert migrated == ["sonar_scanner", "zap_scan"], (
        f"PASS and FAIL stages must both be migrated; got {migrated}"
    )
    mock_chain.assert_called()  # report task chained before per-stage group


@patch("app.api.scans.callback.chain")
@patch("app.api.scans.callback.group")
@patch("app.api.scans.callback.detect_regressions")
@patch("app.api.scans.callback.auto_verify_pending_rescans")
@patch("app.api.scans.callback.auto_verify_fixed_issues")
@patch("app.api.scans.callback.migrate_scan_to_issues")
@patch("app.api.scans.callback.process_scan_reports_task")
def test_skipped_and_warn_stages_not_migrated(
    mock_report, mock_migrate, _fixed, _rescans, _regress, mock_group, mock_chain
):
    stages = [
        {"stage": "docker_push", "status": "SKIPPED"},
        {"stage": "install_dependencies", "status": "WARN"},
    ]
    _schedule_post_processing(_scan(), stages, build_number=42)

    assert _migrated_stages(mock_migrate) == []
    # Report task still runs on its own (no per-stage chains to group)
    mock_report.si.return_value.apply_async.assert_called_once()


@patch("app.api.scans.callback.process_scan_reports_task")
def test_no_post_processing_for_cancelled_scan_or_missing_build(mock_report):
    """CANCELLED/SKIPPED scans and missing build_number must not trigger post-processing."""
    cancelled = MagicMock()
    cancelled.state = ScanState.CANCELLED
    cancelled.scan_id = "scan-cancelled"
    cancelled.project_id = "proj-1"

    skipped = MagicMock()
    skipped.state = ScanState.SKIPPED
    skipped.scan_id = "scan-skipped"
    skipped.project_id = "proj-1"

    _schedule_post_processing(cancelled, [], build_number=42)
    _schedule_post_processing(skipped, [], build_number=42)
    _schedule_post_processing(_scan(), [], build_number=None)
    mock_report.si.assert_not_called()


@patch("app.api.scans.callback.chain")
@patch("app.api.scans.callback.group")
@patch("app.api.scans.callback.detect_regressions")
@patch("app.api.scans.callback.auto_verify_pending_rescans")
@patch("app.api.scans.callback.auto_verify_fixed_issues")
@patch("app.api.scans.callback.migrate_scan_to_issues")
@patch("app.api.scans.callback.process_scan_reports_task")
def test_failed_scan_stages_are_migrated(
    mock_report, mock_migrate, _fixed, _rescans, _regress, mock_group, mock_chain
):
    """FAILED scans must still process PASS and FAIL stages into issues."""
    stages = [
        {"stage": "git_checkout", "status": "PASS"},
        {"stage": "sonar_scanner", "status": "FAIL"},
        {"stage": "trivy_fs_scan", "status": "SKIPPED"},
    ]
    _schedule_post_processing(_scan(ScanState.FAILED), stages, build_number=42)

    migrated = _migrated_stages(mock_migrate)
    assert migrated == ["git_checkout", "sonar_scanner"], (
        f"FAILED scan must migrate PASS and FAIL stages; got {migrated}"
    )
    mock_chain.assert_called()
