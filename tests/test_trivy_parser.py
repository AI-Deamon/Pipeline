"""Functional tests for the Trivy parser, covering the cross-target dedup bug
(finding #40) and the resulting issue-merging bug (finding #41). Before this fix,
the only test touching parse_trivy_report checked the corrupt-JSON error path — no
fixture exercised a realistic multi-Results[] payload at all.
"""
import json

from app.services.reporting.parsers.trivy import parse_trivy_report


def _report(*results):
    return json.dumps({"Results": list(results)})


def test_same_cve_in_two_targets_produces_two_findings():
    raw = _report(
        {
            "Target": "frontend/package-lock.json",
            "Vulnerabilities": [{
                "ID": "CVE-2024-1111", "Severity": "HIGH", "Package": "lodash",
                "InstalledVersion": "4.17.20", "FixedVersion": "4.17.21",
            }],
        },
        {
            "Target": "backend/requirements.txt",
            "Vulnerabilities": [{
                "ID": "CVE-2024-1111", "Severity": "HIGH", "Package": "lodash",
                "InstalledVersion": "4.17.20", "FixedVersion": "4.17.21",
            }],
        },
    )
    findings = parse_trivy_report(raw)
    assert len(findings) == 2
    targets = {f.host for f in findings}
    assert targets == {"frontend/package-lock.json", "backend/requirements.txt"}
    # Distinct issue identities so the two locations don't overwrite each other on upsert.
    ids = {f.id for f in findings}
    assert len(ids) == 2


def test_duplicate_cve_within_same_target_is_still_deduped():
    raw = _report({
        "Target": "frontend/package-lock.json",
        "Vulnerabilities": [
            {"ID": "CVE-2024-2222", "Severity": "LOW", "Package": "foo"},
            {"ID": "CVE-2024-2222", "Severity": "LOW", "Package": "foo"},
        ],
    })
    findings = parse_trivy_report(raw)
    assert len(findings) == 1


def test_different_cves_in_same_target_both_kept():
    raw = _report({
        "Target": "frontend/package-lock.json",
        "Vulnerabilities": [
            {"ID": "CVE-2024-3333", "Severity": "LOW", "Package": "foo"},
            {"ID": "CVE-2024-4444", "Severity": "LOW", "Package": "bar"},
        ],
    })
    findings = parse_trivy_report(raw)
    assert len(findings) == 2
