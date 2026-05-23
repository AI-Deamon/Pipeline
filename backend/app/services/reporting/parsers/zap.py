import json
from typing import List, Dict, Any
from .base import SecurityFinding, normalize_severity


def parse_zap_report(raw_json: str) -> List[SecurityFinding]:
    """Parse ZAP JSON report to unified findings"""
    findings = []
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError:
        return findings

    sites = data.get("site", [])

    for site in sites:
        site_name = site.get("name", "")
        alerts = site.get("alerts", [])

        for alert in alerts:
            alert_ref = alert.get("alertref", "")
            name = alert.get("name", "Unknown")
            risk_raw = alert.get("riskdesc") or alert.get("risk", "Info")
            risk = risk_raw.split()[0] if risk_raw else "Info"
            severity = normalize_severity(risk)

            description = alert.get("desc", "")[:500]
            uri = alert.get("uri", "")
            evidence = alert.get("evidence", "")

            cve = None
            cwe = alert.get("cweid")
            wasc = alert.get("wascid")

            recommendation = alert.get("solution", "")
            if not recommendation:
                if risk == "High":
                    recommendation = "Review and fix this vulnerability immediately"
                elif risk == "Medium":
                    recommendation = "Review and fix this vulnerability"
                else:
                    recommendation = "Consider fixing this issue"

            finding_id = f"ZAP-{alert_ref}" if alert_ref else f"ZAP-{name[:20]}"

            finding = SecurityFinding(
                id=finding_id,
                tool="zap",
                severity=severity,
                title=name,
                description=description,
                cve=cve,
                host=site_name,
                uri=uri,
                recommendation=recommendation,
                raw_evidence=evidence[:200] if evidence else "",
                rule=alert_ref,
                finding_type="VULNERABILITY",
            )
            findings.append(finding)

    return findings
