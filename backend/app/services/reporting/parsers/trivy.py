import json
from typing import List, Dict, Any
from .base import SecurityFinding, normalize_severity


def parse_trivy_report(raw_json: str) -> List[SecurityFinding]:
    """Parse Trivy JSON report to unified findings"""
    findings = []
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError:
        return findings

    vulnerabilities = data.get("Results", [])
    vuln_by_id = {}

    for result in vulnerabilities:
        target = result.get("Target", "")
        vulns = result.get("Vulnerabilities", [])

        for vuln in vulns:
            vuln_id = vuln.get("ID", "")
            if vuln_id in vuln_by_id:
                continue
            vuln_by_id[vuln_id] = True

            severity = normalize_severity(vuln.get("Severity", "UNKNOWN"))
            pkg = vuln.get("Package", "")
            pkg_version = vuln.get("InstalledVersion", "")
            fix_version = vuln.get("FixedVersion", "")
            title = vuln.get("Title", "")
            description = vuln.get("Description", "")[:500]

            cve = None
            if vuln_id.startswith("CVE-"):
                cve = vuln_id

            recommendation = ""
            if fix_version:
                recommendation = f"Upgrade {pkg} to version {fix_version}"
            else:
                recommendation = f"Update {pkg} to latest version"

            finding = SecurityFinding(
                id=f"TRIVY-{vuln_id}",
                tool="trivy_fs",
                severity=severity,
                title=title or f"{vuln_id} in {pkg}",
                description=description,
                cve=cve,
                host=target,
                package=pkg,
                recommendation=recommendation,
                raw_evidence=f"Package: {pkg} {pkg_version}",
                rule=vuln_id,
                finding_type="VULNERABILITY",
            )
            findings.append(finding)

    return findings


def parse_trivy_image_report(raw_json: str) -> List[SecurityFinding]:
    """Parse Trivy image scan report (same format as fs)"""
    return parse_trivy_report(raw_json)