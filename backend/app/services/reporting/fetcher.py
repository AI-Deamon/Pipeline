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


class ReportFetcher:
    """Fetch and parse security tool reports from Jenkins"""

    def __init__(self, jenkins_base_url: str, jenkins_build_number: str):
        self.jenkins_base_url = jenkins_base_url.rstrip("/")
        self.jenkins_build_number = jenkins_build_number
        self.artifacts_base = f"{self.jenkins_base_url}/job/{settings.JENKINS_TOKEN}/{jenkins_build_number}/artifact/reports"

    async def fetch_artifact(self, filename: str) -> Optional[str]:
        """Fetch a JSON artifact from Jenkins"""
        url = f"{self.artifacts_base}/{filename}"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    return response.text
                else:
                    logger.warning(f"Failed to fetch {filename}: {response.status_code}")
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
        sonar_findings = await fetch_sonar_issues(sonar_key)
        severity_summary = calculate_severity_summary(sonar_findings)

        report_url = create_sonar_report_link(sonar_key)

        report = ScanReportDB(
            scan_id=scan_id,
            project_id=project_id,
            tool_name="sonar",
            severity_summary=severity_summary,
            findings=[f.to_dict() for f in sonar_findings],
            raw_report=None,
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

    async def fetch_all_reports(
        self,
        scan_id: str,
        project_id: str,
        sonar_key: Optional[str] = None,
    ) -> List[ScanReportDB]:
        """Fetch all available reports from Jenkins"""
        reports = []

        tool_files = [
            ("trivy_fs", "trivy-fs.json"),
            ("trivy_image", "trivy-image.json"),
            ("zap", "zap.json"),
            ("dependency_check", "dependency-check.json"),
            ("nmap", "nmap_findings.json"),
        ]

        for tool_name, filename in tool_files:
            report = await self.fetch_and_process_tool(scan_id, project_id, tool_name, filename)
            if report:
                reports.append(report)

        if sonar_key:
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
) -> List[ScanReportDB]:
    """Main entry point to process all scan reports"""
    fetcher = ReportFetcher(jenkins_base_url, jenkins_build_number)
    return await fetcher.fetch_all_reports(scan_id, project_id, sonar_key)
