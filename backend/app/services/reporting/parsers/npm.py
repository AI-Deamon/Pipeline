import hashlib
import json
import logging
from typing import List
from .base import SecurityFinding, normalize_severity

logger = logging.getLogger(__name__)


def _build_npm_id(advisory: dict, pkg_name: str) -> str:
    source = advisory.get("source", "")
    url = advisory.get("url", "")
    stable = source or url or f"{pkg_name}:{advisory.get('title', '')}"
    return f"NPM-{hashlib.md5(stable.encode()).hexdigest()[:12]}"


def _extract_cve(advisory: dict, title: str) -> str | None:
    cve_list = advisory.get("cve")
    if cve_list and isinstance(cve_list, list):
        for c in cve_list:
            if str(c).startswith("CVE-"):
                return str(c)
    import re
    match = re.search(r'(CVE-\d{4}-\d{4,})', title)
    if match:
        return match.group(1)
    return None


def _build_advisory_description(advisory: dict, pkg_name: str) -> str:
    parts = []
    title = advisory.get("title", "")
    cwe_list = advisory.get("cwe", [])
    cvss_data = advisory.get("cvss", {})
    if title:
        parts.append(title)
    if cwe_list:
        cwe_str = ", ".join(cwe_list) if isinstance(cwe_list, list) else str(cwe_list)
        parts.append(f"Category: {cwe_str}")
    if cvss_data:
        score = cvss_data.get("score")
        if score is not None:
            parts.append(f"CVSS Score: {score}")
    if not parts:
        parts.append(f"Vulnerability in {pkg_name}")
    return " — ".join(parts)


def _build_advisory_recommendation(advisory: dict, pkg_name: str, fix_available: bool) -> str:
    if fix_available:
        return f"Update {pkg_name} to a non-vulnerable version. See advisory: {advisory.get('url', '')}"
    return f"Review {pkg_name} usage and apply mitigation. Advisory: {advisory.get('url', '')}"


def parse_npm_audit_report(raw_json: str) -> List[SecurityFinding]:
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse npm audit JSON: {e}")
        return []

    vulnerabilities = data.get("vulnerabilities", {})
    findings = []

    for pkg_name, pkg_data in vulnerabilities.items():
        pkg_severity = pkg_data.get("severity", "unknown")
        via = pkg_data.get("via", [])
        fix_available = bool(pkg_data.get("fixAvailable"))

        for advisory in via:
            if isinstance(advisory, dict):
                title = advisory.get("title", "No title")
                url = advisory.get("url", "")
                advisory_severity = advisory.get("severity", pkg_severity)
                cve = _extract_cve(advisory, title)

                finding = SecurityFinding(
                    id=_build_npm_id(advisory, pkg_name),
                    tool="npm_audit",
                    severity=normalize_severity(advisory_severity),
                    title=f"{pkg_name}: {title}",
                    description=_build_advisory_description(advisory, pkg_name),
                    cve=cve,
                    uri=url,
                    package=pkg_name,
                    recommendation=_build_advisory_recommendation(advisory, pkg_name, fix_available),
                    raw_evidence=json.dumps(advisory),
                    rule=url or title,
                    finding_type="VULNERABILITY",
                )
                findings.append(finding)

        if not via:
            finding = SecurityFinding(
                id=f"NPM-{hashlib.md5(pkg_name.encode()).hexdigest()[:12]}",
                tool="npm_audit",
                severity=normalize_severity(pkg_severity),
                title=f"{pkg_name}: vulnerability detected",
                description=f"Vulnerability detected in {pkg_name}",
                package=pkg_name,
                recommendation=f"Review and update {pkg_name} to resolve vulnerability",
                raw_evidence=json.dumps(pkg_data),
                rule=pkg_name,
                finding_type="VULNERABILITY",
            )
            findings.append(finding)

    return findings
