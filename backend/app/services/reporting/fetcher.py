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
    calculate_severity_summary,
    calculate_expires_at,
    SecurityFinding,
)

logger = logging.getLogger(__name__)


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
            return None

        findings = self.parse_tool_report(tool_name, raw_json)
        severity_summary = calculate_severity_summary(findings)

        findings_dict = [f.to_dict() for f in findings]

        report = ScanReportDB(
            scan_id=scan_id,
            project_id=project_id,
            tool_name=tool_name,
            severity_summary=severity_summary,
            findings=findings_dict,
            raw_report=raw_json,
            report_url=f"{self.artifacts_base}/{filename}",
            created_at=datetime.now(timezone.utc),
            expires_at=calculate_expires_at(90),
        )

        db = SessionLocal()
        try:
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
        """Create a SonarQube report by fetching actual issues via API"""
        if not sonar_key:
            return None

        # Fetch actual issues from SonarQube API
        sonar_findings, raw_json = await fetch_sonar_issues(sonar_key)
        severity_summary = calculate_severity_summary(sonar_findings)

        report_url = create_sonar_report_link(sonar_key)

        report = ScanReportDB(
            scan_id=scan_id,
            project_id=project_id,
            tool_name="sonar",
            severity_summary=severity_summary,
            findings=[f.to_dict() for f in sonar_findings],
            raw_report=raw_json or None,
            report_url=report_url,
            created_at=datetime.now(timezone.utc),
            expires_at=calculate_expires_at(90),
        )

        db = SessionLocal()
        try:
            db.add(report)
            db.commit()
            db.refresh(report)
            logger.info(f"Stored SonarQube report with {len(sonar_findings)} findings")
            return report
        except Exception as e:
            db.rollback()
            logger.error(f"Error storing SonarQube report: {e}")
            return None
        finally:
            db.close()

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
