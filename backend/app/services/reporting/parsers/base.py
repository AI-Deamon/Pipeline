from dataclasses import dataclass, field
from typing import Optional, List
from datetime import datetime, timedelta, timezone


SEVERITY_LEVELS = {"critical": 5, "high": 4, "medium": 3, "low": 2, "info": 1}


@dataclass
class SecurityFinding:
    id: str
    tool: str
    severity: str
    title: str
    description: str = ""
    cve: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    service: Optional[str] = None
    uri: Optional[str] = None
    package: Optional[str] = None
    recommendation: str = ""
    raw_evidence: str = ""
    rule: str = ""
    finding_type: str = ""
    line_number: Optional[int] = None
    file_path: Optional[str] = None
    effort: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    sonar_status: Optional[str] = None
    sonar_resolution: Optional[str] = None
    code_snippet: Optional[str] = None
    code_snippet_language: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "tool": self.tool,
            "severity": self.severity,
            "title": self.title,
            "description": self.description,
            "cve": self.cve,
            "host": self.host,
            "port": self.port,
            "service": self.service,
            "uri": self.uri,
            "package": self.package,
            "recommendation": self.recommendation,
            "raw_evidence": self.raw_evidence,
            "rule": self.rule,
            "finding_type": self.finding_type,
            "line_number": self.line_number,
            "file_path": self.file_path,
            "effort": self.effort,
            "tags": list(self.tags),
            "sonar_status": self.sonar_status,
            "sonar_resolution": self.sonar_resolution,
            "code_snippet": self.code_snippet,
            "code_snippet_language": self.code_snippet_language,
        }


def normalize_severity(severity: str) -> str:
    """Normalize severity to standard levels"""
    s = severity.lower().strip()
    if s in ["critical", "crit", "critial"]:
        return "Critical"
    if s in ["high", "error"]:
        return "High"
    if s in ["medium", "warn", "warning"]:
        return "Medium"
    if s in ["low", "note"]:
        return "Low"
    if s in ["info", "information", "informational"]:
        return "Info"
    return "Info"


def calculate_severity_summary(findings: List[SecurityFinding]) -> dict:
    """Calculate severity counts from findings"""
    summary = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    for f in findings:
        sev = f.severity.lower()
        if sev in summary:
            summary[sev] += 1
    return summary


def calculate_expires_at(days: int = 90) -> datetime:
    """Calculate expiration date"""
    return datetime.now(timezone.utc) + timedelta(days=days)
