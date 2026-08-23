"""Functional tests for the ZAP parser, covering finding #42: the parser used to read
alert.get("uri")/alert.get("evidence") directly, which don't exist in ZAP's real
jsonreport schema — affected endpoints are nested under alert["instances"]. Before
this fix, the only test touching parse_zap_report used a flattened fixture with
top-level uri/evidence, which happened to mask the bug rather than catch it.
"""
import json

from app.services.reporting.parsers.zap import parse_zap_report


def _report(*alerts):
    return json.dumps({"site": [{"name": "https://target.example", "alerts": list(alerts)}]})


def test_single_instance_alert_gets_real_uri():
    raw = _report({
        "pluginid": "40012",
        "name": "Cross Site Scripting (Reflected)",
        "riskdesc": "High (Medium)",
        "desc": "XSS found",
        "instances": [{"uri": "https://target.example/search?q=1", "evidence": "<script>"}],
    })
    findings = parse_zap_report(raw)
    assert len(findings) == 1
    assert findings[0].uri == "https://target.example/search?q=1"
    assert findings[0].raw_evidence == "<script>"


def test_multi_instance_alert_produces_one_finding_per_endpoint():
    raw = _report({
        "pluginid": "40012",
        "name": "Cross Site Scripting (Reflected)",
        "riskdesc": "High (Medium)",
        "desc": "XSS found",
        "instances": [
            {"uri": "https://target.example/a", "evidence": "e1"},
            {"uri": "https://target.example/b", "evidence": "e2"},
        ],
    })
    findings = parse_zap_report(raw)
    assert len(findings) == 2
    uris = {f.uri for f in findings}
    assert uris == {"https://target.example/a", "https://target.example/b"}
    # Distinct issue identities so the two endpoints don't overwrite each other.
    ids = {f.id for f in findings}
    assert len(ids) == 2


def test_alert_with_no_instances_falls_back_gracefully():
    # Defensive fallback for a report variant without nested instances — should not
    # crash, and should not silently produce a blank-uri finding either if the
    # top-level fields are present.
    raw = _report({
        "pluginid": "10202",
        "name": "Legacy-shaped alert",
        "riskdesc": "Low",
        "desc": "no instances array",
    })
    findings = parse_zap_report(raw)
    assert len(findings) == 1
    assert findings[0].uri == ""
