import logging
from dataclasses import dataclass, field
from typing import Optional, List
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)


SEVERITY_LEVELS = {"critical": 5, "high": 4, "medium": 3, "low": 2, "info": 1}


class ParseError(Exception):
    """Raised when a parser fails to decode or interpret a report."""
    pass


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
    # Developer-friendly fields
    cvss_score: Optional[float] = None
    cvss_severity: Optional[str] = None
    package_version: Optional[str] = None
    fixed_version: Optional[str] = None
    references: List[str] = field(default_factory=list)
    exploit_available: bool = False
    fix_command: Optional[str] = None
    cwe_ids: List[str] = field(default_factory=list)

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
            "cvss_score": self.cvss_score,
            "cvss_severity": self.cvss_severity,
            "package_version": self.package_version,
            "fixed_version": self.fixed_version,
            "references": list(self.references),
            "exploit_available": self.exploit_available,
            "fix_command": self.fix_command,
            "cwe_ids": list(self.cwe_ids),
        }


def normalize_severity(severity: str) -> str:
    """Normalize severity to standard levels.

    Finding #43: an unrecognized input (e.g. Trivy's "UNKNOWN" for a CVSS-less CVE)
    still falls back to "Info" — deliberately kept, since callers/downstream storage
    expect one of the 5 canonical buckets — but now logs a warning so a
    tool-format surprise is visible in logs instead of silently vanishing into the
    lowest-priority bucket with no signal anything unrecognized occurred.
    """
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
    logger.warning("Unrecognized severity value %r — defaulting to Info", severity)
    return "Info"


def calculate_severity_summary(findings: List[SecurityFinding]) -> dict:
    """Calculate severity counts from findings.

    Finding #43: previously any finding whose severity didn't match one of the 5
    known bucket keys exactly (e.g. Sonar's own "Unknown" fallback, distinct from
    this module's normalize_severity) was silently excluded from the summary
    entirely — present in findings[] but invisible in every summary-driven
    dashboard/counter, and making sum(summary.values()) != len(findings). Now folds
    anything unrecognized into "info" (keeping totals accurate) and logs it.
    """
    summary = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    for f in findings:
        sev = f.severity.lower()
        if sev not in summary:
            logger.warning(
                "Finding %s has unrecognized severity %r — counting under 'info'",
                f.id, f.severity,
            )
            sev = "info"
        summary[sev] += 1
    return summary


def calculate_expires_at(days: int = 90) -> datetime:
    """Calculate expiration date"""
    return datetime.now(timezone.utc) + timedelta(days=days)
