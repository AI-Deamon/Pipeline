import json
from typing import List, Dict, Any, Optional
from .base import SecurityFinding, normalize_severity


def parse_nmap_findings(raw_json: str) -> List[SecurityFinding]:
    """
    Parse Nmap_system findings.json to unified findings.
    Adapted from Nmap_system/pentest_system/parser.py
    """
    findings = []
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError:
        return findings

    raw_findings = data.get("findings", [])

    for i, finding in enumerate(raw_findings):
        title = finding.get("title", "")
        severity_raw = finding.get("severity", "Medium")
        severity = normalize_severity(severity_raw)

        description = finding.get("description", "")[:500]
        cve = finding.get("cve")
        host = finding.get("host")
        ip = finding.get("ip")
        port = finding.get("port")
        service = finding.get("service")
        scan_type = finding.get("scan_type")
        recommendation = finding.get("recommendation", "")
        raw_evidence = finding.get("raw_evidence", "")[:200]

        finding_id = f"NMAP-{finding.get('id', str(i+1).zfill(3))}"

        finding_obj = SecurityFinding(
            id=finding_id,
            tool="nmap",
            severity=severity,
            title=title,
            description=description,
            cve=cve,
            host=host or ip,
            port=int(port) if port and port.isdigit() else None,
            service=service,
            uri=None,
            package=None,
            recommendation=recommendation,
            raw_evidence=raw_evidence,
            rule=title,
            finding_type="VULNERABILITY",
        )
        findings.append(finding_obj)

    return findings


def parse_nmap_xml(raw_xml: str) -> List[SecurityFinding]:
    """
    Parse simple nmap XML output (fallback for basic nmap).
    This is used if Nmap_system is not available.
    """
    findings = []
    return findings
