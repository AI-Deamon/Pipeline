import json
import logging
from typing import List, Dict, Any
from .base import SecurityFinding, normalize_severity, ParseError

logger = logging.getLogger(__name__)


def _build_zap_recommendation(alert: Dict[str, Any], risk: str) -> str:
    """Build detailed recommendation for developer."""
    solution = alert.get("solution", "")
    parts = []

    if solution:
        parts.append(solution)
    else:
        if risk == "High":
            parts.append("Review and fix this vulnerability immediately")
        elif risk == "Medium":
            parts.append("Review and fix this vulnerability")
        else:
            parts.append("Consider fixing this issue")

    # Add CWE info
    cwe_id = alert.get("cweid")
    if cwe_id:
        parts.append(f"CWE-{cwe_id}: https://cwe.mitre.org/data/definitions/{cwe_id}.html")

    # Add reference
    ref = alert.get("reference", "")
    if ref:
        parts.append(f"Reference: {ref}")

    return " | ".join(parts)


def _get_zap_alert_id(alert: Dict[str, Any]) -> str:
    plugin_id = alert.get("pluginId") or alert.get("id") or alert.get("alertref", "")
    return str(plugin_id)


def _extract_cwe_ids(alert: Dict[str, Any]) -> List[str]:
    """Extract CWE IDs from alert."""
    cwe_ids = []
    cwe_id = alert.get("cweid")
    if cwe_id:
        cwe_ids.append(f"CWE-{cwe_id}")
    return cwe_ids


def _extract_owasp(alert: Dict[str, Any]) -> List[str]:
    """Extract OWASP Top 10 references from alert."""
    owasp = []
    # ZAP doesn't always provide OWASP mapping directly
    # But we can infer from the alert name/description
    name = alert.get("name", "").lower()
    desc = alert.get("desc", "").lower()

    owasp_mapping = {
        "injection": "A03:2021",
        "sql injection": "A03:2021",
        "cross-site scripting": "A03:2021",
        "xss": "A03:2021",
        "broken authentication": "A07:2021",
        "sensitive data exposure": "A02:2021",
        "xml external entity": "A05:2021",
        "broken access control": "A01:2021",
        "security misconfiguration": "A05:2021",
        "insecure deserialization": "A08:2021",
        "using components with known vulnerabilities": "A06:2021",
        "insufficient logging": "A09:2021",
    }

    for keyword, owasp_id in owasp_mapping.items():
        if keyword in name or keyword in desc:
            owasp.append(owasp_id)
            break

    return owasp


def _extract_references(alert: Dict[str, Any]) -> List[str]:
    """Extract reference URLs from alert."""
    refs = []
    reference = alert.get("reference", "")
    if reference:
        # Reference can be a string with multiple URLs
        for line in reference.split("\n"):
            line = line.strip()
            if line.startswith("http"):
                refs.append(line)
    return refs


def _parse_zap_alert(alert: Dict[str, Any], site_name: str) -> List[SecurityFinding]:
    """Parse a single ZAP alert into one SecurityFinding per affected instance.

    ZAP's real jsonreport format groups every affected endpoint for an alert under a
    nested `instances: [{uri, evidence, method, param}, ...]` array — there is no
    top-level `uri`/`evidence` key on the alert itself. Reading those directly (as
    this used to) meant `uri` was always empty and a vulnerability found on N
    endpoints silently collapsed into a single finding with no indication N URLs were
    affected. `instances` (falling back to the top-level fields for any report
    variant that doesn't nest them) is the source of truth.
    """
    plugin_id = _get_zap_alert_id(alert)
    name = alert.get("name", "Unknown")
    risk_raw = alert.get("riskdesc") or alert.get("risk", "Info")
    risk = risk_raw.split()[0] if risk_raw else "Info"
    severity = normalize_severity(risk)
    description = alert.get("desc", "")
    solution = alert.get("solution", "")
    cwe_id = alert.get("cweid")
    confidence = alert.get("confidence", "Medium")

    # Extract CWE IDs
    cwe_ids = _extract_cwe_ids(alert)

    # Extract OWASP mapping
    owasp = _extract_owasp(alert)

    # Extract references
    references = _extract_references(alert)

    # Build recommendation
    recommendation = _build_zap_recommendation(alert, risk)

    # Build tags
    tags = list(cwe_ids)
    if owasp:
        tags.extend([f"OWASP:{o}" for o in owasp])
    if confidence:
        tags.append(f"confidence:{confidence}")

    instances = alert.get("instances") or [
        {"uri": alert.get("uri", ""), "evidence": alert.get("evidence", "")}
    ]

    findings = []
    multi = len(instances) > 1
    for idx, instance in enumerate(instances):
        uri = instance.get("uri", "")
        evidence = instance.get("evidence", "")
        base_id = f"ZAP-{plugin_id}" if plugin_id else f"ZAP-{name[:20]}"
        # Include the URI (or an index if none) so distinct affected endpoints don't
        # collapse into one Issue on upsert, the same way the alert-level id used to.
        finding_id = f"{base_id}:{uri}" if uri else (f"{base_id}#{idx}" if multi else base_id)

        findings.append(SecurityFinding(
            id=finding_id,
            tool="zap",
            severity=severity,
            title=name,
            description=description,
            host=site_name,
            uri=uri,
            recommendation=recommendation,
            raw_evidence=evidence if evidence else json.dumps(alert),
            rule=plugin_id or name,
            finding_type="VULNERABILITY",
            tags=tags,
            # Developer-friendly fields
            cwe_ids=cwe_ids,
            references=references,
        ))

    return findings


def parse_zap_report(raw_json: str) -> List[SecurityFinding]:
    """Parse ZAP JSON report to unified findings."""
    findings = []
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError as e:
        logger.error("ZAP report JSON decode failed: %s", e)
        raise ParseError(f"ZAP report is not valid JSON: {e}") from e

    sites = data.get("site", [])
    for site in sites:
        site_name = site.get("name", "")
        alerts = site.get("alerts", [])
        for alert in alerts:
            findings.extend(_parse_zap_alert(alert, site_name))

    return findings
