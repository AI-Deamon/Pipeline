"""
Tests for ReportFetcher._get_active_tools logic
"""
from app.services.reporting.fetcher import ReportFetcher


class TestGetActiveTools:
    """Test _get_active_tools behavior for manual and automated scans"""

    def setup_method(self):
        self.fetcher = ReportFetcher("http://localhost:8080", "1")

    def test_empty_stage_results_automated_returns_all_tools(self):
        """When no stage_results and automated mode, return all parsers (incl. sonar)."""
        result = self.fetcher._get_active_tools(
            stage_results=None, selected_stages=None, scan_mode="automated"
        )
        assert result == {"trivy_fs", "trivy_image", "zap", "dependency_check", "nmap", "sonar"}

    def test_empty_stage_results_manual_returns_selected_only(self):
        """BUG FIX: When no stage_results and manual mode, only return selected stages.

        Previously this returned ALL tools, ignoring selected_stages.
        """
        result = self.fetcher._get_active_tools(
            stage_results=[],
            selected_stages=["sonar_scanner", "dependency_check", "zap_scan"],
            scan_mode="manual",
        )
        assert result == {"sonar", "dependency_check", "zap"}

    def test_manual_scan_intersects_pass_fail_with_selected(self):
        """Manual scan: only fetch tools whose stages both ran (PASS/FAIL) AND were selected"""
        stage_results = [
            {"stage": "sonar_scanner", "status": "PASS"},
            {"stage": "dependency_check", "status": "PASS"},
            {"stage": "zap_scan", "status": "FAIL"},
            {"stage": "trivy_fs_scan", "status": "PASS"},  # not selected
        ]
        result = self.fetcher._get_active_tools(
            stage_results=stage_results,
            selected_stages=["sonar_scanner", "dependency_check", "zap_scan"],
            scan_mode="manual",
        )
        assert result == {"sonar", "dependency_check", "zap"}
        assert "trivy_fs" not in result

    def test_automated_scan_ignores_selected_stages(self):
        """Automated scan: fetch all stages with PASS/FAIL regardless of selected_stages"""
        stage_results = [
            {"stage": "zap_scan", "status": "PASS"},
            {"stage": "trivy_fs_scan", "status": "PASS"},
        ]
        result = self.fetcher._get_active_tools(
            stage_results=stage_results,
            selected_stages=["zap_scan"],  # should be ignored
            scan_mode="automated",
        )
        assert result == {"zap", "trivy_fs"}

    def test_skipped_stages_excluded(self):
        """Stages with SKIPPED or WARN status should not produce reports"""
        stage_results = [
            {"stage": "zap_scan", "status": "PASS"},
            {"stage": "nmap_scan", "status": "SKIPPED"},
            {"stage": "trivy_fs_scan", "status": "WARN"},
        ]
        result = self.fetcher._get_active_tools(
            stage_results=stage_results,
            selected_stages=None,
            scan_mode="automated",
        )
        assert result == {"zap"}
        assert "nmap" not in result
        assert "trivy_fs" not in result

    def test_no_selected_stages_manual_falls_back_to_all(self):
        """Manual scan with empty selected_stages falls back to all stage_results"""
        stage_results = [
            {"stage": "zap_scan", "status": "PASS"},
        ]
        result = self.fetcher._get_active_tools(
            stage_results=stage_results,
            selected_stages=[],
            scan_mode="manual",
        )
        assert result == {"zap"}
