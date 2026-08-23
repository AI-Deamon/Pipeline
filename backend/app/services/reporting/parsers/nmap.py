import json
import logging
from typing import List, Dict, Any, Optional
from .base import SecurityFinding, normalize_severity, ParseError

logger = logging.getLogger(__name__)


# Common vulnerable services and their risks
VULNERABLE_SERVICES = {
    "ftp": {"risk": "high", "recommendation": "Disable FTP or replace with SFTP/SCP"},
    "telnet": {"risk": "critical", "recommendation": "Disable Telnet immediately — use SSH instead"},
    "smtp": {"risk": "medium", "recommendation": "Ensure SMTP is configured securely, use TLS"},
    "http": {"risk": "medium", "recommendation": "Ensure HTTPS is available, redirect HTTP to HTTPS"},
    "https": {"risk": "low", "recommendation": "Verify TLS configuration is secure"},
    "ssh": {"risk": "low", "recommendation": "Ensure SSH is configured with key-based auth"},
    "mysql": {"risk": "high", "recommendation": "Restrict database access to internal networks only"},
    "postgresql": {"risk": "high", "recommendation": "Restrict database access to internal networks only"},
    "mongodb": {"risk": "high", "recommendation": "Enable authentication, restrict network access"},
    "redis": {"risk": "critical", "recommendation": "Enable authentication, bind to localhost only"},
    "memcached": {"risk": "high", "recommendation": "Bind to localhost, enable authentication"},
    "vnc": {"risk": "critical", "recommendation": "Disable VNC or use VPN tunnel"},
    "rdp": {"risk": "high", "recommendation": "Use VPN, enable NLA, change default port"},
    "smb": {"risk": "high", "recommendation": "Disable SMBv1, use SMBv3 with encryption"},
    "netbios": {"risk": "high", "recommendation": "Block NetBIOS from external access"},
}


def _assess_port_risk(port: int, service: str, version: str = "") -> str:
    """Assess risk level for an open port/service."""
    service_lower = service.lower() if service else ""

    # Check against known vulnerable services
    for vuln_service, config in VULNERABLE_SERVICES.items():
        if vuln_service in service_lower:
            return config["risk"]

    # High-risk ports
    high_risk_ports = {21, 23, 135, 139, 445, 1433, 3306, 3389, 5432, 5900, 6379, 11211, 27017}
    if port in high_risk_ports:
        return "high"

    # Medium-risk ports
    medium_risk_ports = {25, 80, 110, 143, 993, 995, 1433, 5432}
    if port in medium_risk_ports:
        return "medium"

    # Well-known ports
    if port < 1024:
        return "medium"

    # Registered ports
    if port < 10000:
        return "low"

    return "info"


def _generate_recommendation(port: int, service: str, version: str = "", risk: str = "medium") -> str:
    """Generate remediation recommendation based on port/service."""
    parts = []
    service_lower = service.lower() if service else ""

    # Get service-specific recommendation
    for vuln_service, config in VULNERABLE_SERVICES.items():
        if vuln_service in service_lower:
            parts.append(config["recommendation"])
            break

    # General recommendations based on risk
    if risk == "critical":
        parts.append("This service poses an immediate security risk. Consider disabling or restricting access.")
    elif risk == "high":
        parts.append("Review if this service needs to be exposed. Consider firewall rules or VPN.")

    # Version-specific advice
    if version:
        parts.append(f"Current version: {version}. Check for security updates.")

    # Port-specific advice
    if port in [21, 23]:
        parts.append("Replace with secure alternatives (SFTP/SSH).")
    elif port in [3306, 5432, 27017]:
        parts.append("Ensure database is not exposed to public internet.")
    elif port == 6379:
        parts.append("Enable Redis authentication, bind to localhost.")
    elif port == 3389:
        parts.append("Use VPN for remote access, enable Network Level Authentication.")

    if not parts:
        parts.append(f"Review service on port {port} and ensure it's necessary.")

    return " | ".join(parts)


def parse_nmap_findings(raw_json: str) -> List[SecurityFinding]:
    """
    Parse Nmap_system findings.json to unified findings with developer-friendly data.
    """
    findings = []
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError as e:
        logger.error("Nmap report JSON decode failed: %s", e)
        raise ParseError(f"Nmap report is not valid JSON: {e}") from e

    raw_findings = data.get("findings", [])

    for i, finding in enumerate(raw_findings):
        title = finding.get("title", "")
        severity_raw = finding.get("severity", "Medium")
        severity = normalize_severity(severity_raw)

        description = finding.get("description", "")
        cve = finding.get("cve")
        host = finding.get("host")
        ip = finding.get("ip")
        port = finding.get("port")
        service = finding.get("service")
        version = finding.get("version", "")
        scan_type = finding.get("scan_type")
        recommendation = finding.get("recommendation", "")
        raw_evidence = finding.get("raw_evidence", "")

        # Convert port to int
        port_int = int(port) if port and str(port).isdigit() else None

        # Assess risk
        risk = _assess_port_risk(port_int or 0, service or "", version)

        # Generate recommendation if not provided
        if not recommendation:
            recommendation = _generate_recommendation(port_int or 0, service or "", version, risk)

        # Stable identity from finding content, not list position (finding #44) — a
        # fallback keyed on list index made the same real finding get a different ID
        # between scans whenever the Jenkins-generated findings.json ordering shifted
        # (host added/removed, sort change), causing spurious "old issue disappeared
        # + new issue appeared" churn — and in the worst case, a still-open port
        # getting auto-verified as fixed purely because its index moved.
        explicit_id = finding.get("id")
        if explicit_id:
            finding_id = f"NMAP-{explicit_id}"
        else:
            identity_parts = [str(p) for p in (host or ip, port, service, cve) if p]
            finding_id = f"NMAP-{'-'.join(identity_parts)}" if identity_parts else f"NMAP-idx{i+1}"

        # Build tags
        tags = []
        if cve:
            tags.append(f"CVE:{cve}")
        if service:
            tags.append(f"service:{service}")
        tags.append(f"risk:{risk}")

        finding_obj = SecurityFinding(
            id=finding_id,
            tool="nmap",
            severity=severity,
            title=title,
            description=description,
            cve=cve,
            host=host or ip,
            port=port_int,
            service=service,
            uri=None,
            package=None,
            package_version=version,
            recommendation=recommendation,
            raw_evidence=raw_evidence,
            rule=title,
            finding_type="VULNERABILITY",
            tags=tags,
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
