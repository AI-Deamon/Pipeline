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


def get_sonar_dashboard_link(sonar_key: str) -> str:
    """
    Generate SonarQube dashboard link from project key.
    Uses SONARQUBE_URL from environment.
    """
    sonar_url = get_sonar_url()
    return f"https://{sonar_url}/dashboard?id={sonar_key}"


def create_sonar_report_link(sonar_key: Optional[str]) -> Optional[str]:
    """Create SonarQube report entry (returns link only, no parsing)"""
    if not sonar_key:
        return None
    return get_sonar_dashboard_link(sonar_key)


def get_sonar_issues_link(sonar_key: str) -> str:
    """Generate SonarQube issues page link"""
    sonar_url = get_sonar_url()
    return f"https://{sonar_url}/project/issues?id={sonar_key}&resolved=false"


# Severity mapping from SonarQube to our standard
SEVERITY_MAP = {
    "BLOCKER": "Critical",
    "CRITICAL": "High",
    "MAJOR": "Medium",
    "MINOR": "Low",
    "INFO": "Info",
}


async def fetch_sonar_issues(sonar_key: str, sonar_url: str = None) -> List[SecurityFinding]:
    """
    Fetch actual issues from SonarQube API.
    Returns list of SecurityFinding objects.
    """
    if not sonar_url:
        sonar_url = get_sonar_url()
    
    url = f"https://{sonar_url}/api/issues/search"
    params = {
        "componentKeys": sonar_key,
        "severities": "BLOCKER,CRITICAL,MAJOR,MINOR",
        "ps": 500,  # Page size
    }
    
    findings = []
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                issues = data.get("issues", [])
                
                for issue in issues:
                    severity = SEVERITY_MAP.get(issue.get("severity", ""), "Unknown")
                    finding = SecurityFinding(
                        id=f"SONAR-{issue.get('key', 'unknown')}",
                        tool="sonar",
                        severity=severity,
                        title=issue.get("message", ""),
                        description=f"Rule: {issue.get('rule', 'unknown')}",
                        host=issue.get("component", "").split(":")[0] if issue.get("component") else "",
                        recommendation=f"Fix according to rule {issue.get('rule', '')}",
                        raw_evidence=str(issue),
                    )
                    findings.append(finding)
        
        return findings
    except Exception as e:
        logger.error(f"Error fetching SonarQube issues: {e}")
        return []