import json
from typing import List, Dict, Any
from .base import SecurityFinding, normalize_severity


def _build_zap_recommendation(alert: Dict[str, Any], risk: str) -> str:
    recommendation = alert.get("solution", "")
    if recommendation:
        return recommendation
    if risk == "High":
        return "Review and fix this vulnerability immediately"
    if risk == "Medium":
        return "Review and fix this vulnerability"
    return "Consider fixing this issue"


def _get_zap_alert_id(alert: Dict[str, Any]) -> str:
    plugin_id = alert.get("pluginId") or alert.get("id") or alert.get("alertref", "")
    return str(plugin_id)


def _parse_zap_alert(alert: Dict[str, Any], site_name: str) -> SecurityFinding:
    plugin_id = _get_zap_alert_id(alert)
    name = alert.get("name", "Unknown")
    risk_raw = alert.get("riskdesc") or alert.get("risk", "Info")
    risk = risk_raw.split()[0] if risk_raw else "Info"
    severity = normalize_severity(risk)
    description = alert.get("desc", "")
    uri = alert.get("uri", "")
    evidence = alert.get("evidence", "")
    cwe_id = alert.get("cweid")
    recommendation = _build_zap_recommendation(alert, risk)
    finding_id = f"ZAP-{plugin_id}" if plugin_id else f"ZAP-{name[:20]}"

    tags = []
    if cwe_id:
        tags.append(f"CWE-{cwe_id}")

    return SecurityFinding(
        id=finding_id,
        tool="zap",
        severity=severity,
        title=name,
        description=description,
        host=site_name,
        uri=uri,
        recommendation=recommendation,
        raw_evidence=evidence if evidence else "",
        rule=plugin_id or name,
        finding_type="VULNERABILITY",
        tags=tags,
    )


def parse_zap_report(raw_json: str) -> List[SecurityFinding]:
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
            findings.append(_parse_zap_alert(alert, site_name))

    return findings
