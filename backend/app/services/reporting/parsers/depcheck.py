import json
from typing import List, Dict, Any
from .base import SecurityFinding, normalize_severity


def _build_no_findings_fallback(dependencies: List[Dict[str, Any]]) -> List[SecurityFinding]:
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


def parse_depcheck_report(raw_json: str) -> List[SecurityFinding]:
    findings = []
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError:
        return findings

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
    vuln_id = vuln.get("name", "")
    severity = normalize_severity(vuln.get("severity", "MEDIUM"))
    cve = vuln_id if "CVE-" in vuln_id else None
    description = vuln.get("description", "")
    recommendation = vuln.get("recommendation", "")
    cwes = vuln.get("cwes", [])
    cwe_tags = ["CWE-{}".format(c) for c in cwes] if cwes else []
    return SecurityFinding(
        id="DEPC-{}".format(vuln_id),
        tool="dependency_check",
        severity=severity,
        title=vuln_id,
        description=description,
        cve=cve,
        host=file_name,
        package=file_name.split("/")[-1] if file_name else None,
        recommendation=recommendation or "Update dependency to fix {}".format(vuln_id),
        raw_evidence=json.dumps(vuln),
        rule=vuln_id,
        finding_type="VULNERABILITY",
        tags=cwe_tags,
    )
