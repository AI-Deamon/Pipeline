import json
import logging
from typing import List, Dict, Any
from .base import SecurityFinding, normalize_severity, ParseError

logger = logging.getLogger(__name__)


def _build_no_findings_fallback(dependencies: List[Dict[str, Any]]) -> List[SecurityFinding]:
    """Build fallback findings when no vulnerabilities found."""
    total_deps = len(dependencies)
    if total_deps > 0:
        return [SecurityFinding(
            id="DEPC-NO-VULN",
            tool="dependency_check",
            severity="Info",
            title="No known vulnerabilities found",
            description="ODC analyzed {} dependency file(s) and found zero known CVEs. This means either all dependencies are up-to-date, or ODC could not identify package versions (e.g., lock files missing or npm install not run).".format(total_deps),
            finding_type="VULNERABILITY",
            rule="NO_VULNERABILITIES_FOUND",
        )]
    return [SecurityFinding(
        id="DEPC-NO-DEPS",
        tool="dependency_check",
        severity="Info",
        title="Dependency analysis incomplete",
        description="No dependencies were analyzed. OWASP Dependency-Check requires package-lock.json or yarn.lock files to detect known vulnerabilities. Run 'npm install --package-lock-only' to generate lock files, or commit them to the repository.",
        finding_type="VULNERABILITY",
        rule="NO_DEPENDENCIES_ANALYZED",
    )]


def _extract_cvss_score(vuln: Dict[str, Any]) -> tuple[float, str]:
    """Extract CVSS score and severity from vulnerability."""
    # Try CVSS v3 first
    cvss_v3 = vuln.get("cvssv3", {})
    if cvss_v3:
        score = cvss_v3.get("baseScore", 0)
        if score:
            severity = _score_to_severity(score)
            return float(score), severity

    # Try CVSS v2
    cvss_v2 = vuln.get("cvssv2", {})
    if cvss_v2:
        score = cvss_v2.get("baseScore", 0)
        if score:
            severity = _score_to_severity(score)
            return float(score), severity

    # Try.cvssScore (alternative format)
    score = vuln.get("cvssScore", 0)
    if score:
        severity = _score_to_severity(float(score))
        return float(score), severity

    return 0.0, ""


def _score_to_severity(score: float) -> str:
    """Convert CVSS score to severity level."""
    if score >= 9.0:
        return "Critical"
    elif score >= 7.0:
        return "High"
    elif score >= 4.0:
        return "Medium"
    elif score > 0:
        return "Low"
    return "Info"


def _extract_references(vuln: Dict[str, Any]) -> List[str]:
    """Extract reference URLs from vulnerability."""
    refs = []
    # Check for references in different formats
    references = vuln.get("references", [])
    if isinstance(references, list):
        for ref in references:
            if isinstance(ref, str) and ref.startswith("http"):
                refs.append(ref)
            elif isinstance(ref, dict):
                url = ref.get("url", "")
                if url and url.startswith("http"):
                    refs.append(url)

    # Check for URL field
    url = vuln.get("url", "")
    if url and url.startswith("http") and url not in refs:
        refs.append(url)

    return refs


def _extract_cwe_ids(vuln: Dict[str, Any]) -> List[str]:
    """Extract CWE IDs from vulnerability."""
    cwe_ids = []
    cwes = vuln.get("cwes", [])
    if isinstance(cwes, list):
        for cwe in cwes:
            cwe_str = str(cwe)
            if not cwe_str.startswith("CWE-"):
                cwe_str = f"CWE-{cwe_str}"
            cwe_ids.append(cwe_str)
    return cwe_ids


def _build_recommendation(vuln: Dict[str, Any], file_name: str) -> str:
    """Build detailed recommendation for developer."""
    parts = []
    vuln_id = vuln.get("name", "")
    severity = vuln.get("severity", "MEDIUM")

    # Fix guidance
    version = vuln.get("version", "")
    if version:
        parts.append(f"Update {file_name} to a version without {vuln_id}")
    else:
        parts.append(f"Update {file_name} to fix {vuln_id}")

    # CVSS info
    cvss_score, cvss_severity = _extract_cvss_score(vuln)
    if cvss_score > 0:
        parts.append(f"CVSS: {cvss_score} ({cvss_severity})")

    # References
    refs = _extract_references(vuln)
    if refs:
        parts.append(f"More info: {refs[0]}")

    return " | ".join(parts)


def parse_depcheck_report(raw_json: str) -> List[SecurityFinding]:
    """Parse OWASP Dependency-Check JSON report to unified findings."""
    findings = []
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError as e:
        logger.error("Dependency-Check report JSON decode failed: %s", e)
        raise ParseError(f"Dependency-Check report is not valid JSON: {e}") from e

    dependencies = data.get("dependencies", [])
    for dep in dependencies:
        file_name = dep.get("fileName", "")
        vulnerabilities = dep.get("vulnerabilities", [])
        for vuln in vulnerabilities:
            findings.append(_parse_vulnerability(vuln, file_name))

    if not findings:
        return _build_no_findings_fallback(dependencies)

    return findings


def _parse_vulnerability(vuln: Dict[str, Any], file_name: str) -> SecurityFinding:
    """Parse a single vulnerability into a SecurityFinding."""
    vuln_id = vuln.get("name", "")
    severity = normalize_severity(vuln.get("severity", "MEDIUM"))
    cve = vuln_id if "CVE-" in vuln_id else None
    description = vuln.get("description", "")
    version = vuln.get("version", "")

    # Extract CVSS score
    cvss_score, cvss_severity = _extract_cvss_score(vuln)

    # Extract CWE IDs
    cwe_ids = _extract_cwe_ids(vuln)

    # Extract references
    references = _extract_references(vuln)

    # Build recommendation
    recommendation = _build_recommendation(vuln, file_name)

    # Build tags
    tags = list(cwe_ids)
    if cvss_score >= 9.0:
        tags.append("critical-cvss")
    elif cvss_score >= 7.0:
        tags.append("high-cvss")

    return SecurityFinding(
        # Includes the file so two distinct vulnerable locations (finding #41, same
        # fix already applied to trivy.py) don't collapse into one Issue row on
        # upsert — without this, the same CVE flagged in two different dependency
        # files would share an issue_id and overwrite each other's host/location.
        id=f"DEPC-{vuln_id}:{file_name}" if file_name else f"DEPC-{vuln_id}",
        tool="dependency_check",
        severity=severity,
        title=vuln_id,
        description=description,
        cve=cve,
        host=file_name,
        package=file_name.split("/")[-1] if file_name else None,
        recommendation=recommendation,
        raw_evidence=json.dumps(vuln),
        rule=vuln_id,
        finding_type="VULNERABILITY",
        tags=tags,
        # Developer-friendly fields
        cvss_score=cvss_score,
        cvss_severity=cvss_severity,
        package_version=version,
        references=references,
        cwe_ids=cwe_ids,
    )
