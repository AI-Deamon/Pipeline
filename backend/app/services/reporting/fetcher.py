import base64
import json
import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict
import httpx

from app.core.config import settings
from app.core.db import SessionLocal
from app.models.db_models import ScanReportDB
from app.services.reporting.parsers import (
    parse_trivy_report,
    parse_trivy_image_report,
    parse_zap_report,
    parse_depcheck_report,
    parse_nmap_findings,
    create_sonar_report_link,
    fetch_sonar_issues,
    fetch_sonar_hotspots,
    calculate_severity_summary,
    calculate_expires_at,
    SecurityFinding,
)
from app.services.reporting.parsers.base import ParseError
from app.services.reporting.parsers.sonar import SonarAuthError, fetch_sonar_quality_gate, fetch_sonar_project_measures
from app.models.db_models import ScanMetricDB

logger = logging.getLogger(__name__)

# Finding #27: raw_report is a plain unbounded String column — a single
# malformed/huge tool report (e.g. a runaway ZAP or Trivy scan) could store
# tens of MB per row with no guard, bloating the table and slow-loading the
# download endpoint. Findings/severity data (the fields actually used by the
# app) are parsed out separately before this cap is applied, so capping only
# affects the raw-download convenience endpoint, not app functionality.
_RAW_REPORT_MAX_BYTES = 5 * 1024 * 1024  # 5 MB
_RAW_REPORT_TRUNCATION_NOTICE = "\n... [truncated: raw report exceeded 5MB storage limit]"


def _cap_raw_report(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    encoded = raw.encode("utf-8", errors="ignore")
    if len(encoded) <= _RAW_REPORT_MAX_BYTES:
        return raw
    notice = _RAW_REPORT_TRUNCATION_NOTICE.encode("utf-8")
    truncated = encoded[: _RAW_REPORT_MAX_BYTES - len(notice)]
    logger.warning(
        "raw_report exceeded %d bytes (%d); truncating before storage",
        _RAW_REPORT_MAX_BYTES,
        len(encoded),
    )
    return truncated.decode("utf-8", errors="ignore") + _RAW_REPORT_TRUNCATION_NOTICE


TOOL_PARSERS = {
    "trivy_fs": parse_trivy_report,
    "trivy_image": parse_trivy_image_report,
    "zap": parse_zap_report,
    "dependency_check": parse_depcheck_report,
    "nmap": parse_nmap_findings,
}

STAGE_TO_TOOL = {
    "nmap_scan": "nmap",
    "zap_scan": "zap",
    "trivy_fs_scan": "trivy_fs",
    "trivy_image_scan": "trivy_image",
    "dependency_check": "dependency_check",
    "sonar_scanner": "sonar",
}


class ReportFetcher:
    """Fetch and parse security tool reports from Jenkins"""

    def __init__(self, jenkins_base_url: str, jenkins_build_number: str):
        self.jenkins_base_url = jenkins_base_url.rstrip("/")
        self.jenkins_build_number = jenkins_build_number
        self.artifacts_base = f"{self.jenkins_base_url}/job/Security-pipeline/{jenkins_build_number}/artifact/reports"

    async def fetch_artifact(self, filename: str) -> Optional[str]:
        """Fetch a JSON artifact from Jenkins"""
        url = f"{self.artifacts_base}/{filename}"
        auth_header = base64.b64encode(
            f"admin:{settings.JENKINS_TOKEN}".encode()
        ).decode()
        headers = {"Authorization": f"Basic {auth_header}"}
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=headers)
                if response.status_code == 200:
                    return response.text
                else:
                    logger.warning(
                        f"Failed to fetch {filename}: {response.status_code}"
                    )
        except Exception as e:
            logger.warning(f"Error fetching {filename}: {e}")
        return None

    def parse_tool_report(self, tool_name: str, raw_json: str) -> List[SecurityFinding]:
        """Parse raw JSON using appropriate parser"""
        parser = TOOL_PARSERS.get(tool_name)
        if parser:
            return parser(raw_json)
        return []

    async def fetch_and_process_tool(
        self, scan_id: str, project_id: str, tool_name: str, filename: str
    ) -> Optional[ScanReportDB]:
        """Fetch a single tool's report and store in DB"""
        raw_json = await self.fetch_artifact(filename)
        if not raw_json:
            logger.info(f"No report found for {tool_name} ({filename})")
            report = ScanReportDB(
                scan_id=scan_id,
                project_id=project_id,
                tool_name=tool_name,
                severity_summary={},
                findings=[],
                raw_report=None,
                report_url=f"{self.artifacts_base}/{filename}",
                created_at=datetime.now(timezone.utc),
                expires_at=calculate_expires_at(90),
                parse_status="fetch_failed",
            )
            db = SessionLocal()
            try:
                db.query(ScanReportDB).filter(
                    ScanReportDB.scan_id == scan_id,
                    ScanReportDB.tool_name == tool_name,
                ).delete(synchronize_session=False)
                db.add(report)
                db.commit()
                db.refresh(report)
                return report
            except Exception as e:
                db.rollback()
                logger.error("Error storing fetch_failed report for %s: %s", tool_name, e)
                return None
            finally:
                db.close()

        parse_status = "ok"
        findings = []
        try:
            findings = self.parse_tool_report(tool_name, raw_json)
        except ParseError as e:
            parse_status = "parse_error"
            logger.error("Parse error for %s: %s", tool_name, e)

        severity_summary = calculate_severity_summary(findings)

        findings_dict = [f.to_dict() for f in findings]

        report = ScanReportDB(
            scan_id=scan_id,
            project_id=project_id,
            tool_name=tool_name,
            severity_summary=severity_summary,
            findings=findings_dict,
            raw_report=_cap_raw_report(raw_json),
            report_url=f"{self.artifacts_base}/{filename}",
            created_at=datetime.now(timezone.utc),
            expires_at=calculate_expires_at(90),
            parse_status=parse_status,
        )

        db = SessionLocal()
        try:
            # Upsert: delete existing row for this (scan_id, tool_name) before inserting
            db.query(ScanReportDB).filter(
                ScanReportDB.scan_id == scan_id,
                ScanReportDB.tool_name == tool_name,
            ).delete(synchronize_session=False)
            db.add(report)
            db.commit()
            db.refresh(report)
            logger.info(f"Stored {tool_name} report with {len(findings)} findings")
            return report
        except Exception as e:
            db.rollback()
            logger.error(f"Error storing {tool_name} report: {e}")
            return None
        finally:
            db.close()

    async def create_sonar_link(
        self, scan_id: str, project_id: str, sonar_key: Optional[str]
    ) -> Optional[ScanReportDB]:
        """Create a SonarQube report by fetching actual issues via API, plus metrics & quality gate."""
        if not sonar_key:
            return None

        parse_status = "ok"
        try:
            sonar_findings, raw_json = await fetch_sonar_issues(sonar_key)
        except SonarAuthError:
            parse_status = "auth_error"
            sonar_findings, raw_json = [], ""

        try:
            hotspot_findings, raw_hotspots_json = await fetch_sonar_hotspots(sonar_key)
        except SonarAuthError:
            parse_status = "auth_error"
            hotspot_findings, raw_hotspots_json = [], ""

        all_findings = sonar_findings + hotspot_findings

        severity_summary = calculate_severity_summary(all_findings)

        # Combine raw JSON payloads
        combined_raw = raw_json or ""
        if raw_hotspots_json:
            combined_raw = combined_raw + "\n--- HOTSPOTS ---\n" + raw_hotspots_json if combined_raw else raw_hotspots_json

        report_url = create_sonar_report_link(sonar_key)

        report = ScanReportDB(
            scan_id=scan_id,
            project_id=project_id,
            tool_name="sonar",
            severity_summary=severity_summary,
            findings=[f.to_dict() for f in all_findings],
            raw_report=_cap_raw_report(combined_raw or None),
            report_url=report_url,
            created_at=datetime.now(timezone.utc),
            expires_at=calculate_expires_at(90),
            parse_status=parse_status,
        )

        db = SessionLocal()
        try:
            # Upsert: delete existing row for this (scan_id, tool_name) before inserting,
            # matching fetch_and_process_tool — otherwise a second Sonar fetch for the
            # same scan (e.g. via /retry-reports) hits the unique (scan_id, tool_name)
            # constraint and raises IntegrityError instead of replacing the old report.
            db.query(ScanReportDB).filter(
                ScanReportDB.scan_id == scan_id,
                ScanReportDB.tool_name == "sonar",
            ).delete(synchronize_session=False)
            db.add(report)
            db.commit()
            db.refresh(report)
            logger.info(f"Stored SonarQube report with {len(all_findings)} findings ({len(sonar_findings)} issues, {len(hotspot_findings)} hotspots)")

            # Persist Sonar metrics (measures + quality gate) as a ScanMetricDB row
            await self._store_sonar_metrics(scan_id, project_id, sonar_key, db)

            return report
        except Exception as e:
            db.rollback()
            logger.error(f"Error storing SonarQube report: {e}")
            return None
        finally:
            db.close()

    async def _store_sonar_metrics(
        self, scan_id: str, project_id: str, sonar_key: str, db
    ) -> None:
        """Fetch and persist SonarQube project-level measures and quality gate."""
        try:
            measures = await fetch_sonar_project_measures(sonar_key)
        except SonarAuthError:
            logger.warning("Sonar auth error fetching project measures for %s", sonar_key)
            measures = {}

        try:
            quality_gate = await fetch_sonar_quality_gate(sonar_key)
        except SonarAuthError:
            logger.warning("Sonar auth error fetching quality gate for %s", sonar_key)
            quality_gate = {"status": "UNKNOWN", "conditions": []}

        metric_row = ScanMetricDB(
            scan_id=scan_id,
            project_id=project_id,
            tool_name="sonar",
            metrics=measures,
            quality_gate=quality_gate,
            created_at=datetime.now(timezone.utc),
        )

        db.query(ScanMetricDB).filter(
            ScanMetricDB.scan_id == scan_id,
            ScanMetricDB.tool_name == "sonar",
        ).delete(synchronize_session=False)
        db.add(metric_row)
        db.commit()
        logger.info(
            "Stored Sonar metrics for scan %s: %s quality gate=%s",
            scan_id, measures, quality_gate.get("status"),
        )

    def _get_active_tools(
        self,
        stage_results: Optional[list] = None,
        selected_stages: Optional[list] = None,
        scan_mode: Optional[str] = None,
    ) -> set:
        """Determine which tools to fetch based on stage results and scan mode.

        Returns set of tool names (e.g. {'nmap', 'zap'}) that should be fetched.
        Only stages with PASS or FAIL status produce reports.
        For manual scans, further restricts to only selected stages.
        Falls back to all tools when no stage context provided.
        """
        if not stage_results:
            # No stage results yet: for manual scans, only fetch selected tools
            if scan_mode == "manual" and selected_stages:
                return {
                    tool
                    for stage, tool in STAGE_TO_TOOL.items()
                    if stage in selected_stages
                }
            return set(STAGE_TO_TOOL.values())

        active_stages = {
            s["stage"] for s in stage_results if s.get("status") in {"PASS", "FAIL"}
        }

        if scan_mode == "manual" and selected_stages:
            active_stages &= set(selected_stages)

        return {
            tool
            for stage, tool in STAGE_TO_TOOL.items()
            if stage in active_stages
        }

    async def fetch_all_reports(
        self,
        scan_id: str,
        project_id: str,
        sonar_key: Optional[str] = None,
        stage_results: Optional[list] = None,
        selected_stages: Optional[list] = None,
        scan_mode: Optional[str] = None,
    ) -> List[ScanReportDB]:
        """Fetch available reports from Jenkins, filtered by stage results"""
        reports = []
        active_tools = self._get_active_tools(stage_results, selected_stages, scan_mode)

        tool_files = [
            ("trivy_fs", "trivy-fs.json"),
            ("trivy_image", "trivy-image.json"),
            ("zap", "zap.json"),
            ("dependency_check", "dependency-check-report.json"),
            ("nmap", "nmap_findings.json"),
        ]

        for tool_name, filename in tool_files:
            if tool_name not in active_tools:
                continue
            report = await self.fetch_and_process_tool(
                scan_id, project_id, tool_name, filename
            )
            if report:
                reports.append(report)

        if sonar_key and "sonar" in active_tools:
            sonar_report = await self.create_sonar_link(scan_id, project_id, sonar_key)
            if sonar_report:
                reports.append(sonar_report)

        return reports


async def process_scan_reports(
    scan_id: str,
    project_id: str,
    jenkins_base_url: str,
    jenkins_build_number: str,
    sonar_key: Optional[str] = None,
    stage_results: Optional[list] = None,
    selected_stages: Optional[list] = None,
    scan_mode: Optional[str] = None,
) -> List[ScanReportDB]:
    """Main entry point to process scan reports, optionally filtered by stage results"""
    fetcher = ReportFetcher(jenkins_base_url, jenkins_build_number)
    return await fetcher.fetch_all_reports(
        scan_id, project_id, sonar_key,
        stage_results=stage_results,
        selected_stages=selected_stages,
        scan_mode=scan_mode,
    )
