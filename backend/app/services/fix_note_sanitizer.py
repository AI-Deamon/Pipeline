"""Sanitize free-text developer fix notes to remove obvious secrets.

The sanitizer scans the text for common secret patterns (AWS keys, GitHub
tokens, JWT tokens, password= values) and replaces them with a redaction
placeholder. The original text is preserved alongside the sanitized version
for admin audit access via a separate, admin-only endpoint.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("aws_access_key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("aws_secret", re.compile(r"(?i)aws[_\-]?secret[_\-]?access[_\-]?key\s*[:=]\s*['\"]?([A-Za-z0-9/+=]{40})['\"]?")),
    ("github_pat", re.compile(r"\bghp_[A-Za-z0-9]{36}\b")),
    ("github_oauth", re.compile(r"\bgho_[A-Za-z0-9]{36}\b")),
    ("github_app", re.compile(r"\b(ghu|ghs)_[A-Za-z0-9]{36}\b")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b")),
    ("password_kv", re.compile(r"(?i)(password|passwd|pwd|secret|token|api[_\-]?key)\s*[:=]\s*['\"]?([^\s'\"<>]{6,})['\"]?")),
    ("private_key", re.compile(r"-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----")),
    ("bearer_token", re.compile(r"(?i)bearer\s+[A-Za-z0-9\-._~+/]{20,}")),
]


@dataclass
class SanitizationResult:
    sanitized: str
    raw: str
    redactions: list[dict[str, str]]


def _mask(value: str) -> str:
    if len(value) <= 8:
        return "***REDACTED***"
    return f"{value[:4]}…{value[-4:]}***REDACTED***"


def sanitize(text: str) -> SanitizationResult:
    """Sanitize a fix note.

    Returns the sanitized text, the original text, and a list of redactions
    that occurred (each entry has 'kind' and 'mask' keys).
    """
    if not text:
        return SanitizationResult(sanitized="", raw="", redactions=[])

    sanitized = text
    redactions: list[dict[str, str]] = []
    for kind, pattern in _PATTERNS:
        matches = list(pattern.finditer(sanitized))
        if not matches:
            continue
        for m in reversed(matches):
            matched_text = m.group(0)
            replacement = f"***REDACTED:{kind}***"
            sanitized = sanitized[: m.start()] + replacement + sanitized[m.end() :]
            redactions.append({"kind": kind, "mask": _mask(matched_text)})
    return SanitizationResult(sanitized=sanitized, raw=text, redactions=redactions)
