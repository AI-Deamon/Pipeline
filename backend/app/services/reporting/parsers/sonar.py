import asyncio
import os
import logging
import httpx
from typing import Optional, List
from .base import SecurityFinding

logger = logging.getLogger(__name__)


def get_sonar_url() -> str:
    """Lazy load SONARQUBE_URL to avoid import errors"""
    from app.core.config import settings

    return settings.SONARQUBE_URL


def get_sonar_protocol() -> str:
    from app.core.config import settings

    return getattr(settings, "SONARQUBE_PROTOCOL", "http")


def get_sonar_dashboard_link(sonar_key: str) -> str:
    """
    Generate SonarQube dashboard link from project key.
    Uses SONARQUBE_URL from environment.
    """
    sonar_url = get_sonar_url()
    proto = get_sonar_protocol()
    return f"{proto}://{sonar_url}/dashboard?id={sonar_key}"


def create_sonar_report_link(sonar_key: Optional[str]) -> Optional[str]:
    """Create SonarQube report entry (returns issues link)"""
    if not sonar_key:
        return None
    return get_sonar_issues_link(sonar_key)


def get_sonar_issues_link(sonar_key: str) -> str:
    """Generate SonarQube issues page link"""
    sonar_url = get_sonar_url()
    proto = get_sonar_protocol()
    return f"{proto}://{sonar_url}/project/issues?id={sonar_key}&resolved=false"


# Severity mapping from SonarQube to our standard
SEVERITY_MAP = {
    "BLOCKER": "Critical",
    "CRITICAL": "High",
    "MAJOR": "Medium",
    "MINOR": "Low",
    "INFO": "Info",
}


async def fetch_sonar_issues(
    sonar_key: str,
    sonar_url: str = None,
    issue_types: str = "BUG,VULNERABILITY",
) -> tuple[List[SecurityFinding], str]:
    """
    Fetch actual issues from SonarQube API with pagination.

    Args:
        sonar_key: SonarQube project key (e.g., "my-project")
        sonar_url: SonarQube host (default: from settings)
        issue_types: Comma-separated issue types to fetch.
            Valid: BUG, VULNERABILITY, CODE_SMELL, SECURITY_HOTSPOT.
            Default: BUG,VULNERABILITY (preserves prior behavior).

    Retries up to 3 times if API returns 0 issues (handles ES index lag after DB migration).
    Returns tuple of (findings list, raw JSON response string).
    """
    if not sonar_url:
        sonar_url = get_sonar_url()

    proto = get_sonar_protocol()
    url = f"{proto}://{sonar_url}/api/issues/search"

    # SonarQube auth: token is sent as Basic auth with token as username and empty password
    from app.core.config import settings
    if not settings.SONARQUBE_TOKEN:
        logger.warning(
            "SONARQUBE_TOKEN is not set - SonarQube API will not authenticate. "
            "Set SONARQUBE_TOKEN env var to fetch issues."
        )
    auth = (settings.SONARQUBE_TOKEN, "") if settings.SONARQUBE_TOKEN else None

    max_retries = 3
    retry_delay = 10

    for attempt in range(max_retries):
        all_issues: list[dict] = []
        findings: List[SecurityFinding] = []
        raw_json = ""
        page = 1
        page_size = 500
        total = None

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                while total is None or len(all_issues) < total:
                    params = {
                        "componentKeys": sonar_key,
                        "ps": page_size,
                        "p": page,
                        "types": issue_types,
                    }

                    response = await client.get(url, params=params, auth=auth)

                    if response.status_code != 200:
                        logger.warning(
                            f"SonarQube API returned {response.status_code}: {response.text}"
                        )
                        break

                    data = response.json()
                    if total is None:
                        total = data.get("total", 0)
                        raw_json = response.text

                    issues = data.get("issues", [])
                    if not issues:
                        break

                    all_issues.extend(issues)
                    page += 1

            if total is not None and total > 0:
                for issue in all_issues:
                    component = issue.get("component", "")
                    file_path = component.split(":", 1)[1] if ":" in component else component
                    severity = SEVERITY_MAP.get(issue.get("severity", ""), "Unknown")
                    finding = SecurityFinding(
                        id=f"SONAR-{issue.get('key', 'unknown')}",
                        tool="sonar",
                        severity=severity,
                        title=issue.get("message", ""),
                        description=f"Rule: {issue.get('rule', 'unknown')}",
                        host=component.split(":")[0] if component else "",
                        recommendation=f"Fix according to rule {issue.get('rule', '')}",
                        raw_evidence=str(issue),
                        rule=issue.get("rule", ""),
                        finding_type=issue.get("type", ""),
                        line_number=issue.get("line"),
                        file_path=file_path,
                        effort=issue.get("effort"),
                        tags=issue.get("tags", []) or [],
                        sonar_status=issue.get("status"),
                        sonar_resolution=issue.get("resolution"),
                    )
                    findings.append(finding)
                return findings, raw_json

            if attempt < max_retries - 1:
                logger.info(
                    f"SonarQube returned {total} issues for {sonar_key} "
                    f"(attempt {attempt+1}/{max_retries}), retrying in {retry_delay}s..."
                )
                await asyncio.sleep(retry_delay)

        except Exception as e:
            logger.error(
                f"Error fetching SonarQube issues for {sonar_key} "
                f"(attempt {attempt+1}/{max_retries}): {e}"
            )
            if attempt < max_retries - 1:
                await asyncio.sleep(retry_delay)
            else:
                return [], ""

    return [], ""
