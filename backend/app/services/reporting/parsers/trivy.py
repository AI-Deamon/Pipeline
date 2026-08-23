import json
import logging
from typing import List, Dict, Any
from .base import SecurityFinding, normalize_severity, ParseError

logger = logging.getLogger(__name__)


def _extract_cvss_score(vuln: Dict[str, Any]) -> tuple[float, str]:
    """Extract CVSS score and severity from vulnerability."""
    cvss = vuln.get("CVSS", {})
    if not cvss:
        return 0.0, ""

    # Try V3 first, then V2
    for source, data in cvss.items():
        if isinstance(data, dict):
            score = data.get("V3Score") or data.get("V2Score")
            if score is not None:
                # Determine severity from score
                if score >= 9.0:
                    severity = "Critical"
                elif score >= 7.0:
                    severity = "High"
                elif score >= 4.0:
                    severity = "Medium"
                elif score > 0:
                    severity = "Low"
                else:
                    severity = "Info"
                return float(score), severity

    return 0.0, ""


def _extract_cvss_summary(vuln: Dict[str, Any]) -> str:
    """Extract CVSS summary from vulnerability."""
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


def _build_fix_command(pkg: str, installed_version: str, fixed_version: str) -> str:
    """Build a fix command based on package type."""
    if not fixed_version:
        return f"# No fix available for {pkg}"

    # Generic upgrade command
    return f"Upgrade {pkg} from {installed_version} to {fixed_version}"


def _build_trivy_recommendation(vuln: Dict[str, Any]) -> str:
    """Build detailed recommendation for developer."""
    pkg = vuln.get("Package", "")
    installed = vuln.get("InstalledVersion", "")
    fix_version = vuln.get("FixedVersion", "")
    parts = []

    # Fix guidance
    if fix_version:
        parts.append(f"Update {pkg} from {installed} to {fix_version}")
    else:
        parts.append(f"No fix available for {pkg} — consider alternatives or removing the dependency")

    # CVSS info
    cvss_summary = _extract_cvss_summary(vuln)
    if cvss_summary:
        parts.append(f"CVSS: {cvss_summary}")

    # References
    refs = vuln.get("References", [])
    if refs:
        parts.append(f"More info: {refs[0]}")

    return " | ".join(parts)


def _extract_references(vuln: Dict[str, Any]) -> List[str]:
    """Extract reference URLs from vulnerability."""
    refs = vuln.get("References", [])
    if isinstance(refs, list):
        return [r for r in refs if isinstance(r, str) and r.startswith("http")]
    return []


def parse_trivy_report(raw_json: str, tool_name: str = "trivy_fs") -> List[SecurityFinding]:
    """Parse Trivy JSON report to unified findings with developer-friendly data."""
    findings = []
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError as e:
        logger.error("Trivy report JSON decode failed: %s", e)
        raise ParseError(f"Trivy report is not valid JSON: {e}") from e

    results = data.get("Results", [])
    # Keyed by (target, vuln_id): a scan commonly has multiple Results[] entries (one
    # per lockfile/target), and the same CVE can legitimately appear in more than one
    # target (e.g. a shared transitive dependency in both frontend/ and backend/). A
    # vuln_id-only key silently discards every occurrence after the first one, which
    # is a real false negative — the vulnerable copy in the second target never
    # becomes a finding at all.
    seen = set()

    for result in results:
        target = result.get("Target", "")
        vulns = result.get("Vulnerabilities", [])

        for vuln in vulns:
            vuln_id = vuln.get("ID", "")
            dedup_key = (target, vuln_id)
            if dedup_key in seen:
                continue
            seen.add(dedup_key)

            severity = normalize_severity(vuln.get("Severity", "UNKNOWN"))
            pkg = vuln.get("Package", "")
            installed_version = vuln.get("InstalledVersion", "")
            fixed_version = vuln.get("FixedVersion", "")
            title = vuln.get("Title", "")
            description = vuln.get("Description", "")

            # Extract CVSS score
            cvss_score, cvss_severity = _extract_cvss_score(vuln)

            # Extract CVE
            cve = None
            if vuln_id.startswith("CVE-"):
                cve = vuln_id

            # Extract CWE IDs
            cwe_ids = vuln.get("CweIDs", []) or []

            # Extract references
            references = _extract_references(vuln)

            # Build fix command
            fix_command = _build_fix_command(pkg, installed_version, fixed_version)

            # Build tags
            tags = list(cwe_ids)
            if cvss_score >= 9.0:
                tags.append("critical-cvss")
            elif cvss_score >= 7.0:
                tags.append("high-cvss")
            if fixed_version:
                tags.append("fix-available")

            finding = SecurityFinding(
                # Includes the target so two distinct vulnerable locations (finding
                # #41) don't collapse into one Issue row on upsert — without this, the
                # same CVE in two targets would share an issue_id and overwrite each
                # other's host/location on every ingest even after the dedup fix above.
                id=f"TRIVY-{vuln_id}:{target}" if target else f"TRIVY-{vuln_id}",
                tool=tool_name,
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
                # Developer-friendly fields
                cvss_score=cvss_score,
                cvss_severity=cvss_severity,
                package_version=installed_version,
                fixed_version=fixed_version,
                references=references,
                exploit_available=False,  # Trivy doesn't provide this directly
                fix_command=fix_command,
                cwe_ids=cwe_ids,
            )
            findings.append(finding)

    return findings


def parse_trivy_image_report(raw_json: str) -> List[SecurityFinding]:
    """Parse Trivy image scan report (same format as fs)."""
    return parse_trivy_report(raw_json, tool_name="trivy_image")
