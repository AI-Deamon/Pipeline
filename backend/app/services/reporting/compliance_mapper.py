"""
Compliance Mapping for Security Reports
Maps findings to OWASP Top 10 2021 and CWE Top 25
"""
from typing import Dict, List, Optional

_A03_2021 = "A03:2021"

# OWASP Top 10 2021
OWASP_TOP_10_2021 = {
    "A01:2021": {
        "name": "Broken Access Control",
        "cwe": ["CWE-284", "CWE-285", "CWE-639"],
    },
    "A02:2021": {
        "name": "Cryptographic Failures",
        "cwe": ["CWE-310", "CWE-311", "CWE-312"],
    },
    _A03_2021: {
        "name": "Injection",
        "cwe": ["CWE-89", "CWE-564", "CWE-917"],
    },
    "A04:2021": {
        "name": "Insecure Design",
        "cwe": ["CWE-209", "CWE-256", "CWE-327"],
    },
    "A05:2021": {
        "name": "Security Misconfiguration",
        "cwe": ["CWE-16", "CWE-614", "CWE-131"],
    },
    "A06:2021": {
        "name": "Vulnerable and Outdated Components",
        "cwe": ["CWE-1104", "CWE-1275"],
    },
    "A07:2021": {
        "name": "Identification and Authentication Failures",
        "cwe": ["CWE-287", "CWE-290", "CWE-294"],
    },
    "A08:2021": {
        "name": "Software and Data Integrity Failures",
        "cwe": ["CWE-829", "CWE-494", "CWE-502"],
    },
    "A09:2021": {
        "name": "Security Logging and Monitoring Failures",
        "cwe": ["CWE-778", "CWE-117"],
    },
    "A10:2021": {
        "name": "Server-Side Request Forgery (SSRF)",
        "cwe": ["CWE-918"],
    },
}

# CWE Top 25 2023 (common ones)
CWE_TOP_25_2023 = [
    {"id": "CWE-787", "name": "Out-of-bounds Write"},
    {"id": "CWE-79", "name": "Improper Neutralization of Input During Web Page Generation (XSS)"},
    {"id": "CWE-125", "name": "Out-of-bounds Read"},
    {"id": "CWE-78", "name": "Improper Neutralization of Input During Command Generation (OS Command Injection)"},
    {"id": "CWE-89", "name": "Improper Neutralization of Special Elements used in an SQL Command (SQL Injection)"},
    {"id": "CWE-416", "name": "Use After Free"},
    {"id": "CWE-20", "name": "Improper Input Validation"},
    {"id": "CWE-22", "name": "Improper Limitation of a Pathname to a Restricted Directory (Path Traversal)"},
    {"id": "CWE-352", "name": "Cross-Site Request Forgery (CSRF)"},
    {"id": "CWE-434", "name": "Unrestricted Upload of File with Dangerous Type"},
    {"id": "CWE-502", "name": "Deserialization of Untrusted Data"},
    {"id": "CWE-611", "name": "Improper Restriction of XML External Entity Reference (XXE)"},
    {"id": "CWE-613", "name": "Insufficient Session Expiration"},
    {"id": "CWE-676", "name": "Use of Potentially Dangerous Function"},
    {"id": "CWE-311", "name": "Missing Encryption of Sensitive Data"},
    {"id": "CWE-807", "name": "Reliance on Untrusted Inputs in a Security Decision"},
    {"id": "CWE-862", "name": "Missing Authorization"},
    {"id": "CWE-200", "name": "Exposure of Sensitive Information to an Unauthorized Actor"},
    {"id": "CWE-120", "name": "Buffer Copy without Checking Size of Input (Classic Buffer Overflow)"},
    {"id": "CWE-665", "name": "Improper Initialization"},
    {"id": "CWE-682", "name": "Incorrect Calculation"},
    {"id": "CWE-331", "name": "Insufficient Entropy"},
    {"id": "CWE-326", "name": "Inadequate Encryption Strength"},
    {"id": "CWE-969", "name": "Inherited from...?"},
]

_OWASP_KEYWORD_RULES = [
    (["sql", "injection", "sqli"], _A03_2021, "Injection"),
    (["crypto", "tls", "ssl", "certificate"], "A02:2021", "Cryptographic Failures"),
    (["access control", "authorization", "privilege escalation", "insecure direct object"], "A01:2021", "Broken Access Control"),
    (["misconfiguration", "default credentials", "debug", "exposed"], "A05:2021", "Security Misconfiguration"),
    (["xss", "cross site scripting", "cross-site scripting"], _A03_2021, "Injection"),
    (["ssrf", "server-side request forgery"], "A10:2021", "Server-Side Request Forgery (SSRF)"),
    (["authentication", "password", "login", "session"], "A07:2021", "Identification and Authentication Failures"),
    (["xml external entity", "xxe", "xml parser"], "A08:2021", "Software and Data Integrity Failures"),
]


def _matches_owasp_text(text: str, keywords: list) -> bool:
    return any(kw in text for kw in keywords)


def _matches_owasp_keywords(title: str, description: str, cve: str, keywords: list) -> bool:
    return _matches_owasp_text(title, keywords) or _matches_owasp_text(description, keywords) or _matches_owasp_text(cve, keywords)


class ComplianceMapper:
    """Map security findings to compliance frameworks"""

    def map_to_owasp(self, finding: Dict) -> Optional[Dict]:
        title = finding.get("title", "").lower()
        description = finding.get("description", "").lower()
        cve = (finding.get("cve") or "").lower()

        for keywords, owasp_id, name in _OWASP_KEYWORD_RULES:
            if _matches_owasp_keywords(title, description, cve, keywords):
                return {"id": owasp_id, "name": name, "found": True}

        return None

    def get_compliance_summary(self, findings: List[Dict]) -> Dict:
        owasp_summary = {f"A{idx:02d}:2021": {"id": f"A{idx:02d}:2021", "name": OWASP_TOP_10_2021.get(f"A{idx:02d}:2021", {}).get("name", ""), "count": 0} for idx in range(1, 11)}
        cwe_summary: Dict[str, int] = {}

        for finding in findings:
            owasp = self.map_to_owasp(finding)
            if owasp:
                owasp_summary[owasp["id"]]["count"] += 1

            raw = finding.get("raw_evidence", "").lower()
            for cwe_entry in CWE_TOP_25_2023:
                cwe_id_lower = cwe_entry["id"].lower()
                if cwe_id_lower.replace("-", "") in raw.replace("-", ""):
                    cwe_summary[cwe_entry["id"]] = cwe_summary.get(cwe_entry["id"], 0) + 1

        owasp_nonzero = [v for v in owasp_summary.values() if v["count"] > 0]

        return {
            "owasp_top_10": owasp_nonzero,
            "cwe_top_25": [{"id": k, "count": v} for k, v in cwe_summary.items()],
        }
