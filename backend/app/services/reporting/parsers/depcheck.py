import json
from typing import List, Dict, Any
from .base import SecurityFinding, normalize_severity


def parse_depcheck_report(raw_json: str) -> List[SecurityFinding]:
    """Parse OWASP Dependency-Check JSON report to unified findings"""
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
            vuln_id = vuln.get("name", "")
            severity = normalize_severity(vuln.get("severity", "MEDIUM"))

            cve = None
            if "CVE-" in vuln_id:
                cve = vuln_id

            description = vuln.get("description", "")[:500]
            recommendation = vuln.get("recommendation", "")

            cwes = vuln.get("cwes", [])
            cwe_str = f"CWE-{cwes[0]}" if cwes else ""

            finding = SecurityFinding(
                id=f"DEPC-{vuln_id}",
                tool="dependency_check",
                severity=severity,
                title=vuln_id,
                description=description,
                cve=cve,
                host=file_name,
                package=file_name.split("/")[-1] if file_name else None,
                recommendation=recommendation or f"Update dependency to fix {vuln_id}",
                raw_evidence=cwe_str,
                rule=vuln_id,
                finding_type="VULNERABILITY",
            )
            findings.append(finding)

    if not findings:
        total_deps = len(dependencies)
        if total_deps > 0:
            findings.append(SecurityFinding(
                id="DEPC-NO-VULN",
                tool="dependency_check",
                severity="Info",
                title="No known vulnerabilities found",
                description=f"ODC analyzed {total_deps} dependency file(s) and found zero known CVEs. This means either all dependencies are up-to-date, or ODC could not identify package versions (e.g., lock files missing or npm install not run).",
                finding_type="VULNERABILITY",
                rule="NO_VULNERABILITIES_FOUND",
            ))
        else:
            findings.append(SecurityFinding(
                id="DEPC-NO-DEPS",
                tool="dependency_check",
                severity="Info",
                title="Dependency analysis incomplete",
                description="No dependencies were analyzed. OWASP Dependency-Check requires package-lock.json or yarn.lock files to detect known vulnerabilities. Run 'npm install --package-lock-only' to generate lock files, or commit them to the repository.",
                finding_type="VULNERABILITY",
                rule="NO_DEPENDENCIES_ANALYZED",
            ))

    return findings
