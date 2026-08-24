import json
import logging
from typing import List, Dict, Any, Optional
import httpx
from .base import SecurityFinding, normalize_severity, ParseError

logger = logging.getLogger(__name__)

_OSV_API_TIMEOUT = 5.0
# Bounds worst-case added latency on a report with many unique CVEs — this
# runs synchronously inside report parsing (see #128/#129/#131 in the
# partner review tracker for why external calls here need to stay bounded
# and failure-safe), so a report with hundreds of distinct CVEs can't turn
# into minutes of sequential HTTP round trips.
_MAX_OSV_LOOKUPS_PER_REPORT = 30


def _extract_fixed_version(data: Dict[str, Any]) -> Optional[str]:
    """Pull the first human-readable fixed version out of an OSV record.

    Only SEMVER/ECOSYSTEM ranges carry an actual version string in `fixed` —
    a GIT range's `fixed` event is a commit hash, which is worse than useless
    to show a developer as "the version that fixes this" (confirmed live:
    querying a bare CVE ID directly often resolves to a CVE-wide record whose
    only range is GIT-typed, even though its GHSA alias has a clean
    npm/PyPI/etc SEMVER range — see the GHSA fallback in _fetch_fixed_version).
    """
    for affected in data.get("affected", []):
        for rng in affected.get("ranges", []):
            if rng.get("type") not in ("SEMVER", "ECOSYSTEM"):
                continue
            for event in rng.get("events", []):
                fixed = event.get("fixed")
                if fixed:
                    return fixed
    return None


def _fetch_fixed_version(cve: str) -> Optional[str]:
    """Look up a CVE's fixed version via OSV.dev.

    OWASP Dependency-Check's own report has no fix-version field at all — a
    developer gets a CVE ID and a description, nothing telling them what
    version actually fixes it (unlike Trivy, whose scanner output includes
    `FixedVersion` directly). This is best-effort: any failure (network,
    non-200, no usable fix data anywhere in the response or its GHSA
    aliases) returns None rather than raising — a slow or broken external
    lookup must never block report parsing or fail a scan.
    """
    try:
        resp = httpx.get(f"https://api.osv.dev/v1/vulns/{cve}", timeout=_OSV_API_TIMEOUT)
        if resp.status_code != 200:
            return None
        data = resp.json()
    except Exception as e:
        logger.warning("OSV.dev lookup failed for %s: %s", cve, e)
        return None

    fixed = _extract_fixed_version(data)
    if fixed:
        return fixed

    # Fall back to the first GHSA alias — CVE records are sometimes only
    # GIT-ranged, but their GHSA alias is ecosystem-specific and almost
    # always carries a proper SEMVER/ECOSYSTEM range instead.
    for alias in data.get("aliases", []):
        if not alias.startswith("GHSA-"):
            continue
        try:
            alias_resp = httpx.get(f"https://api.osv.dev/v1/vulns/{alias}", timeout=_OSV_API_TIMEOUT)
            if alias_resp.status_code == 200:
                return _extract_fixed_version(alias_resp.json())
        except Exception as e:
            logger.warning("OSV.dev alias lookup failed for %s (via %s): %s", alias, cve, e)
        break

    return None


def _build_fix_command(package: str, fixed_version: Optional[str]) -> Optional[str]:
    if not fixed_version:
        return None
    label = package or "the affected dependency"
    return f"Upgrade {label} to version {fixed_version} or later"


def _build_no_findings_fallback(dependencies: List[Dict[str, Any]]) -> List[SecurityFinding]:
    """Build fallback findings when no vulnerabilities found."""
    total_deps = len(dependencies)
    if total_deps > 0:
        return [SecurityFinding(
            id="DEPC-NO-VULN",
            tool="dependency_check",
            severity="Info",
            title="No known vulnerabilities found",
            description="ODC analyzed {} dependency file(s) and found zero known CVEs. This means either all dependencies are up-to-date, or ODC could not identify package versions (e.g., lock files missing or npm install not run).".format(total_deps),
            finding_type="VULNERABILITY",
            rule="NO_VULNERABILITIES_FOUND",
        )]
    return [SecurityFinding(
        id="DEPC-NO-DEPS",
        tool="dependency_check",
        severity="Info",
        title="Dependency analysis incomplete",
        description="No dependencies were analyzed. OWASP Dependency-Check requires package-lock.json or yarn.lock files to detect known vulnerabilities. Run 'npm install --package-lock-only' to generate lock files, or commit them to the repository.",
        finding_type="VULNERABILITY",
        rule="NO_DEPENDENCIES_ANALYZED",
    )]


def _extract_cvss_score(vuln: Dict[str, Any]) -> tuple[float, str]:
    """Extract CVSS score and severity from vulnerability."""
    # Try CVSS v3 first
    cvss_v3 = vuln.get("cvssv3", {})
    if cvss_v3:
        score = cvss_v3.get("baseScore", 0)
        if score:
            severity = _score_to_severity(score)
            return float(score), severity

    # Try CVSS v2
    cvss_v2 = vuln.get("cvssv2", {})
    if cvss_v2:
        score = cvss_v2.get("baseScore", 0)
        if score:
            severity = _score_to_severity(score)
            return float(score), severity

    # Try.cvssScore (alternative format)
    score = vuln.get("cvssScore", 0)
    if score:
        severity = _score_to_severity(float(score))
        return float(score), severity

    return 0.0, ""


def _score_to_severity(score: float) -> str:
    """Convert CVSS score to severity level."""
    if score >= 9.0:
        return "Critical"
    elif score >= 7.0:
        return "High"
    elif score >= 4.0:
        return "Medium"
    elif score > 0:
        return "Low"
    return "Info"


def _extract_references(vuln: Dict[str, Any]) -> List[str]:
    """Extract reference URLs from vulnerability."""
    refs = []
    # Check for references in different formats
    references = vuln.get("references", [])
    if isinstance(references, list):
        for ref in references:
            if isinstance(ref, str) and ref.startswith("http"):
                refs.append(ref)
            elif isinstance(ref, dict):
                url = ref.get("url", "")
                if url and url.startswith("http"):
                    refs.append(url)

    # Check for URL field
    url = vuln.get("url", "")
    if url and url.startswith("http") and url not in refs:
        refs.append(url)

    return refs


def _extract_cwe_ids(vuln: Dict[str, Any]) -> List[str]:
    """Extract CWE IDs from vulnerability."""
    cwe_ids = []
    cwes = vuln.get("cwes", [])
    if isinstance(cwes, list):
        for cwe in cwes:
            cwe_str = str(cwe)
            if not cwe_str.startswith("CWE-"):
                cwe_str = f"CWE-{cwe_str}"
            cwe_ids.append(cwe_str)
    return cwe_ids


def _build_recommendation(vuln: Dict[str, Any], file_name: str, fixed_version: Optional[str] = None) -> str:
    """Build detailed recommendation for developer."""
    parts = []
    vuln_id = vuln.get("name", "")
    severity = vuln.get("severity", "MEDIUM")

    # Fix guidance — a specific version beats a vague "update" when OSV.dev has one.
    if fixed_version:
        parts.append(f"Upgrade {file_name} to version {fixed_version} or later to fix {vuln_id}")
    else:
        version = vuln.get("version", "")
        if version:
            parts.append(f"Update {file_name} to a version without {vuln_id}")
        else:
            parts.append(f"Update {file_name} to fix {vuln_id}")

    # CVSS info
    cvss_score, cvss_severity = _extract_cvss_score(vuln)
    if cvss_score > 0:
        parts.append(f"CVSS: {cvss_score} ({cvss_severity})")

    # References
    refs = _extract_references(vuln)
    if refs:
        parts.append(f"More info: {refs[0]}")

    return " | ".join(parts)


def parse_depcheck_report(raw_json: str) -> List[SecurityFinding]:
    """Parse OWASP Dependency-Check JSON report to unified findings."""
    findings = []
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError as e:
        logger.error("Dependency-Check report JSON decode failed: %s", e)
        raise ParseError(f"Dependency-Check report is not valid JSON: {e}") from e

    dependencies = data.get("dependencies", [])
    all_vulns = [
        (dep.get("fileName", ""), vuln)
        for dep in dependencies
        for vuln in dep.get("vulnerabilities", [])
    ]

    # Dedupe: the same CVE often shows up against several dependency files in one
    # report, and OSV.dev only needs to be asked once per distinct CVE.
    unique_cves = list(dict.fromkeys(
        vuln.get("name", "") for _, vuln in all_vulns if "CVE-" in vuln.get("name", "")
    ))[:_MAX_OSV_LOOKUPS_PER_REPORT]
    fixed_versions = {cve: _fetch_fixed_version(cve) for cve in unique_cves}

    for file_name, vuln in all_vulns:
        findings.append(_parse_vulnerability(vuln, file_name, fixed_versions))

    if not findings:
        return _build_no_findings_fallback(dependencies)

    return findings


def _parse_vulnerability(
    vuln: Dict[str, Any], file_name: str, fixed_versions: Optional[Dict[str, Optional[str]]] = None
) -> SecurityFinding:
    """Parse a single vulnerability into a SecurityFinding."""
    vuln_id = vuln.get("name", "")
    severity = normalize_severity(vuln.get("severity", "MEDIUM"))
    cve = vuln_id if "CVE-" in vuln_id else None
    description = vuln.get("description", "")
    version = vuln.get("version", "")

    # Extract CVSS score
    cvss_score, cvss_severity = _extract_cvss_score(vuln)

    # Extract CWE IDs
    cwe_ids = _extract_cwe_ids(vuln)

    # Extract references
    references = _extract_references(vuln)

    # OWASP Dependency-Check's own report never includes a fix version — look it
    # up from the OSV.dev batch already fetched for this report (see
    # parse_depcheck_report), keyed by CVE ID.
    fixed_version = (fixed_versions or {}).get(vuln_id)

    # Build recommendation
    recommendation = _build_recommendation(vuln, file_name, fixed_version)

    # Build tags
    tags = list(cwe_ids)
    if cvss_score >= 9.0:
        tags.append("critical-cvss")
    elif cvss_score >= 7.0:
        tags.append("high-cvss")

    package_name = file_name.split("/")[-1] if file_name else None

    return SecurityFinding(
        # Includes the file so two distinct vulnerable locations (finding #41, same
        # fix already applied to trivy.py) don't collapse into one Issue row on
        # upsert — without this, the same CVE flagged in two different dependency
        # files would share an issue_id and overwrite each other's host/location.
        id=f"DEPC-{vuln_id}:{file_name}" if file_name else f"DEPC-{vuln_id}",
        tool="dependency_check",
        severity=severity,
        title=vuln_id,
        description=description,
        cve=cve,
        host=file_name,
        package=package_name,
        recommendation=recommendation,
        raw_evidence=json.dumps(vuln),
        rule=vuln_id,
        finding_type="VULNERABILITY",
        tags=tags,
        # Developer-friendly fields
        cvss_score=cvss_score,
        cvss_severity=cvss_severity,
        package_version=version,
        fixed_version=fixed_version,
        fix_command=_build_fix_command(package_name, fixed_version),
        references=references,
        cwe_ids=cwe_ids,
    )
