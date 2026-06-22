import json
from typing import List, Dict, Any
from .base import SecurityFinding, normalize_severity


def _extract_cvss_summary(vuln: Dict[str, Any]) -> str:
    cvss = vuln.get("CVSS", {})
    if not cvss:
        return ""
    scores = []
    for source, data in cvss.items():
        if isinstance(data, dict):
            score = data.get("V3Score") or data.get("V2Score")
            if score is not None:
                scores.append(f"{source}: {score}")
    return ", ".join(scores) if scores else ""


def _build_trivy_recommendation(vuln: Dict[str, Any]) -> str:
    pkg = vuln.get("Package", "")
    fix_version = vuln.get("FixedVersion", "")
    parts = []
    if fix_version:
        parts.append(f"Upgrade {pkg} to version {fix_version}")
    else:
        parts.append(f"Update {pkg} to the latest version (no fixed version available)")
    cvss_summary = _extract_cvss_summary(vuln)
    if cvss_summary:
        parts.append(f"CVSS: {cvss_summary}")
    refs = vuln.get("References", [])
    if refs:
        parts.append(f"References: {', '.join(refs[:2])}")
    return " | ".join(parts)


def parse_trivy_report(raw_json: str) -> List[SecurityFinding]:
    """Parse Trivy JSON report to unified findings"""
    findings = []
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError:
        return findings

    results = data.get("Results", [])
    vuln_by_id = {}

    for result in results:
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
            title = vuln.get("Title", "")
            description = vuln.get("Description", "")

            cve = None
            if vuln_id.startswith("CVE-"):
                cve = vuln_id

            cwe_ids = vuln.get("CweIDs", []) or []
            tags = list(cwe_ids)

            finding = SecurityFinding(
                id=f"TRIVY-{vuln_id}",
                tool="trivy_fs",
                severity=severity,
                title=title or f"{vuln_id} in {pkg}",
                description=description,
                cve=cve,
                host=target,
                package=pkg,
                recommendation=_build_trivy_recommendation(vuln),
                raw_evidence=json.dumps(vuln),
                rule=vuln_id,
                finding_type="VULNERABILITY",
                tags=tags,
            )
            findings.append(finding)

    return findings


def parse_trivy_image_report(raw_json: str) -> List[SecurityFinding]:
    """Parse Trivy image scan report (same format as fs)"""
    return parse_trivy_report(raw_json)
