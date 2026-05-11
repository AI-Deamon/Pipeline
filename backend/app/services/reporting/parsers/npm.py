import json
import logging
import uuid
from typing import List
from .base import SecurityFinding, normalize_severity

logger = logging.getLogger(__name__)


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
        pkg_range = pkg_data.get("range", "")
        via = pkg_data.get("via", [])

        for advisory in via:
            if isinstance(advisory, dict):
                title = advisory.get("title", "No title")
                url = advisory.get("url", "")
                advisory_severity = advisory.get("severity", pkg_severity)
                cwe_list = advisory.get("cwe", [])
                cvss_data = advisory.get("cvss", {})

                finding = SecurityFinding(
                    id=f"NPM-{uuid.uuid4().hex[:12]}",
                    tool="npm_audit",
                    severity=normalize_severity(advisory_severity),
                    title=f"{pkg_name}: {title}",
                    description=f"Package {pkg_name} ({pkg_range})",
                    host=None,
                    port=None,
                    service=None,
                    uri=url,
                    package=pkg_name,
                    recommendation=f"Update package {pkg_name} to resolve vulnerability",
                    raw_evidence=json.dumps(advisory),
                )
                findings.append(finding)

        if not via:
            finding = SecurityFinding(
                id=f"NPM-{uuid.uuid4().hex[:12]}",
                tool="npm_audit",
                severity=normalize_severity(pkg_severity),
                title=f"{pkg_name}: vulnerability detected",
                description=f"Package {pkg_name} ({pkg_range})",
                package=pkg_name,
                recommendation=f"Update package {pkg_name} to resolve vulnerability",
                raw_evidence=json.dumps(pkg_data),
            )
            findings.append(finding)

    return findings
