# Report Content Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the Technical and Executive security reports from discarding finding data (description, recommendation, CVE, exact location) that every scanner parser already collects, and give the Executive report a real, data-driven narrative instead of two hardcoded sentences.

**Architecture:** `SecurityFinding` (in `backend/app/services/reporting/parsers/base.py`) gains a `location()` method — the file:line → URL → host:port → package fallback chain is a fact about the finding, not about how a report happens to render it, so it moves onto the data class rather than staying private to the renderer. `UnifiedReportGenerator` (in `backend/app/services/reporting/reporter.py`) gets two small rendering-only helpers (`_strip_html_to_text`, `_finding_cve_display`) and rewrites its Technical and Executive section builders — both HTML and PDF — to use them. No new files, no new dependencies, no schema/API changes.

**Tech Stack:** Python 3.13, pytest, reportlab (already a dependency), PostgreSQL (tests run against the real `devsecops_staging` test DB, matching this repo's existing pattern in `tests/test_reporter_trend.py` — no mocking).

**Spec:** This plan implements the decisions reached in conversation (grilling session, 2026-09-30): both Technical and Executive reports fixed in one pass; compact table + per-finding detail block (not a wide table); all tool-supplied text stripped to plain text before escaping (closes a stored-content risk from scanned-target data reflected through ZAP evidence); Executive report gets a data-driven risk posture line + top-5-findings table, no generated business-impact prose; NVD enrichment, SonarQube's rule-cache gap, and the newly-found per-tool parser gaps (`docs/SCANNER_OUTPUT_RESEARCH.md`) are explicitly out of scope, deferred to follow-up work.

## Global Constraints

- No new dependencies. `reportlab>=4.0,<5.0` (already in `backend/requirements.txt`) is the only PDF library available — do not add `pypdf`/`pdfminer` for test verification; verify PDF output structurally (`%PDF` header + byte-length growth) instead of extracting text.
- All tool-supplied text (`description`, `recommendation`) must pass through `_strip_html_to_text()` before `_esc()` — never render raw HTML from a `SecurityFinding` field.
- Tests run from repo root: `pytest tests/test_reporter_integration.py tests/test_security_finding.py -v` (uses `tests/conftest.py`'s existing `sys.path` setup for `app.*` imports).
- Follow this repo's existing pattern of testing `UnifiedReportGenerator` against the real test DB (`app.core.db.engine`/`Session`), not mocks — see `tests/test_reporter_trend.py` for the established shape.

---

### Task 1: `SecurityFinding.location()`

**Files:**
- Modify: `backend/app/services/reporting/parsers/base.py`
- Test: `tests/test_security_finding.py` (new file)

**Interfaces:**
- Produces: `SecurityFinding.location(self) -> str` — instance method on the existing dataclass. Later tasks call `finding.location()`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_security_finding.py
from app.services.reporting.parsers.base import SecurityFinding


def _finding(**overrides) -> SecurityFinding:
    defaults = dict(id="F1", tool="test", severity="High", title="T")
    defaults.update(overrides)
    return SecurityFinding(**defaults)


def test_location_prefers_file_path_and_line_number():
    f = _finding(file_path="src/app.ts", line_number=42, uri="https://example.com", host="h")
    assert f.location() == "src/app.ts:42"


def test_location_file_path_without_line_number():
    f = _finding(file_path="src/app.ts")
    assert f.location() == "src/app.ts"


def test_location_falls_back_to_uri_when_no_file_path():
    f = _finding(uri="https://example.com/app.js", host="h")
    assert f.location() == "https://example.com/app.js"


def test_location_falls_back_to_host_and_port():
    f = _finding(host="10.0.0.1", port=443, package="pkg")
    assert f.location() == "10.0.0.1:443"


def test_location_host_without_port():
    f = _finding(host="10.0.0.1")
    assert f.location() == "10.0.0.1"


def test_location_falls_back_to_package_and_version():
    f = _finding(package="lodash", package_version="4.17.15")
    assert f.location() == "lodash@4.17.15"


def test_location_package_without_version():
    f = _finding(package="lodash")
    assert f.location() == "lodash"


def test_location_dash_when_nothing_available():
    f = _finding()
    assert f.location() == "-"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/kali_linux/Agent-bfd7ff && pytest tests/test_security_finding.py -v`
Expected: FAIL with `AttributeError: 'SecurityFinding' object has no attribute 'location'` (8 failures)

- [ ] **Step 3: Add the method**

In `backend/app/services/reporting/parsers/base.py`, add this method to the `SecurityFinding` dataclass, after `to_dict()`:

```python
    def location(self) -> str:
        """Best-available human-readable location for this finding.

        Priority: exact code location, then exact network/URL location, then
        host, then package identity. This is a fact about the finding, not a
        rendering concern — every consumer (report generator, a future API
        field) gets the same answer instead of re-deriving this fallback
        chain independently.
        """
        if self.file_path:
            if self.line_number is not None:
                return f"{self.file_path}:{self.line_number}"
            return self.file_path
        if self.uri:
            return self.uri
        if self.host:
            if self.port:
                return f"{self.host}:{self.port}"
            return self.host
        if self.package:
            if self.package_version:
                return f"{self.package}@{self.package_version}"
            return self.package
        return "-"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/kali_linux/Agent-bfd7ff && pytest tests/test_security_finding.py -v`
Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
cd /home/kali_linux/Agent-bfd7ff
git add tests/test_security_finding.py backend/app/services/reporting/parsers/base.py
git commit -m "feat(reporting): add SecurityFinding.location() fallback chain"
```

---

### Task 2: Rendering-only helpers in `reporter.py`

**Files:**
- Modify: `backend/app/services/reporting/reporter.py`
- Test: `tests/test_reporter_integration.py` (existing file, extended)

**Interfaces:**
- Consumes: nothing new (module-level functions, no dependency on Task 1)
- Produces: `_strip_html_to_text(raw: str) -> str`, `_finding_cve_display(f: SecurityFinding) -> str` — module-level functions in `reporter.py`. Tasks 3, 4, 5 call both.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_reporter_integration.py`:

```python
def test_strip_html_to_text_removes_tags():
    from app.services.reporting.reporter import _strip_html_to_text

    assert _strip_html_to_text("<p>Upgrade to the latest version.</p>") == "Upgrade to the latest version."


def test_strip_html_to_text_neutralizes_embedded_script():
    from app.services.reporting.reporter import _strip_html_to_text

    result = _strip_html_to_text("<script>alert(1)</script>Evidence text")
    assert "<" not in result
    assert result == "alert(1) Evidence text"


def test_strip_html_to_text_empty_string():
    from app.services.reporting.reporter import _strip_html_to_text

    assert _strip_html_to_text("") == ""


def test_finding_cve_display_with_score():
    from app.services.reporting.reporter import _finding_cve_display
    from app.services.reporting.parsers.base import SecurityFinding

    f = SecurityFinding(id="F1", tool="t", severity="High", title="T", cve="CVE-2024-1234", cvss_score=9.8)
    assert _finding_cve_display(f) == "CVE-2024-1234 (CVSS 9.8)"


def test_finding_cve_display_no_score():
    from app.services.reporting.reporter import _finding_cve_display
    from app.services.reporting.parsers.base import SecurityFinding

    f = SecurityFinding(id="F1", tool="t", severity="High", title="T", cve="CVE-2024-1234")
    assert _finding_cve_display(f) == "CVE-2024-1234"


def test_finding_cve_display_no_cve():
    from app.services.reporting.reporter import _finding_cve_display
    from app.services.reporting.parsers.base import SecurityFinding

    f = SecurityFinding(id="F1", tool="t", severity="High", title="T")
    assert _finding_cve_display(f) == "-"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/kali_linux/Agent-bfd7ff && pytest tests/test_reporter_integration.py -v -k "strip_html or cve_display"`
Expected: FAIL with `ImportError: cannot import name '_strip_html_to_text'` (6 failures)

- [ ] **Step 3: Add the helpers**

In `backend/app/services/reporting/reporter.py`, add near the top, after the existing `_esc`/`_AMP_ENTITY`/`_CLOSING_TABLE_DIV` module-level definitions:

```python
import re

_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html_to_text(raw: str) -> str:
    """Plain-text a tool-supplied string that may already contain HTML.

    ZAP's own description/recommendation fields arrive with embedded HTML
    ("<p>...</p>"). They — and raw_evidence, transitively — can also carry
    content ZAP captured from the SCANNED site itself, i.e. attacker-
    controlled text. Stripping tags here, before _esc() runs, means neither
    case can render as live markup in the report: ZAP's own formatting reads
    as clean text, and anything reflected from a scanned target can't
    execute as HTML/script inside a security tool's own output.
    """
    if not raw:
        return ""
    text = _TAG_RE.sub(" ", raw)
    return " ".join(text.split())


def _finding_cve_display(f: "SecurityFinding") -> str:
    """"CVE-2024-1234 (CVSS 9.8)" / "CVE-2024-1234" / "-" — thin formatting
    of fields already on the object, no fallback logic, so this stays a
    rendering-local helper rather than moving onto SecurityFinding."""
    if not f.cve:
        return "-"
    if f.cvss_score is not None:
        return f"{f.cve} (CVSS {f.cvss_score})"
    return f.cve
```

(`SecurityFinding` is already imported at the top of `reporter.py` via `from app.services.reporting.parsers.base import SecurityFinding, calculate_severity_summary` — the string-quoted type hint above is defensive only; use the real import in the type hint instead: `def _finding_cve_display(f: SecurityFinding) -> str:`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/kali_linux/Agent-bfd7ff && pytest tests/test_reporter_integration.py -v -k "strip_html or cve_display"`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
cd /home/kali_linux/Agent-bfd7ff
git add backend/app/services/reporting/reporter.py tests/test_reporter_integration.py
git commit -m "feat(reporting): add HTML-stripping and CVE-display helpers"
```

---

### Task 3: Technical report (HTML) — compact table + detail block

**Files:**
- Modify: `backend/app/services/reporting/reporter.py`
- Test: `tests/test_reporter_integration.py`

**Interfaces:**
- Consumes: `SecurityFinding.location()` (Task 1), `_strip_html_to_text`, `_finding_cve_display` (Task 2)
- Produces: rewritten `_html_technical_section(self) -> str` and a new `_finding_detail_block(self, finding: SecurityFinding) -> str` method on `UnifiedReportGenerator`. Task 6's demo depends on this.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_reporter_integration.py`:

```python
def test_technical_report_shows_full_finding_detail():
    """Regression test for the real finding found during investigation:
    High | Vulnerable JS Library | zap | - with no fix, no location."""
    from app.services.reporting.reporter import UnifiedReportGenerator
    from app.services.reporting.parsers.base import SecurityFinding

    finding = SecurityFinding(
        id="ZAP-1",
        tool="zap",
        severity="High",
        title="Vulnerable JS Library",
        description="<p>The identified library appears to be vulnerable.</p>",
        uri="https://it-tools.tech/assets/index-61effc08.js",
        recommendation="<p>Upgrade to the latest version of the affected library.</p>",
        cwe_ids=["CWE-1395"],
    )
    generator = UnifiedReportGenerator(
        project_id="p1", scan_id="s1", findings=[finding], report_type="technical"
    )
    html = generator.generate_html()

    assert "https://it-tools.tech/assets/index-61effc08.js" in html
    assert "The identified library appears to be vulnerable." in html
    assert "Upgrade to the latest version of the affected library." in html
    # the tool's own HTML must not survive as live markup
    assert "<p>The identified library" not in html


def test_technical_report_neutralizes_embedded_script_in_description():
    from app.services.reporting.reporter import UnifiedReportGenerator
    from app.services.reporting.parsers.base import SecurityFinding

    finding = SecurityFinding(
        id="F1", tool="zap", severity="High", title="Reflected content",
        description="<script>alert(document.cookie)</script>",
    )
    generator = UnifiedReportGenerator(project_id="p1", scan_id="s1", findings=[finding])
    html = generator.generate_html()
    assert "<script>" not in html


def test_technical_report_location_prefers_file_path_over_host():
    """Regression test for the real bug found: a SonarQube finding showed the
    project key ("IT_tools_soner") instead of src/composable/validation.ts:6."""
    from app.services.reporting.reporter import UnifiedReportGenerator
    from app.services.reporting.parsers.base import SecurityFinding

    finding = SecurityFinding(
        id="S1", tool="sonar", severity="Medium", title="Code smell",
        host="IT_tools_soner", file_path="src/composable/validation.ts", line_number=6,
    )
    generator = UnifiedReportGenerator(project_id="p1", scan_id="s1", findings=[finding])
    html = generator.generate_html()
    assert "src/composable/validation.ts:6" in html
    assert "<td>IT_tools_soner</td>" not in html


def test_technical_report_omits_detail_block_when_no_description_or_recommendation():
    from app.services.reporting.reporter import UnifiedReportGenerator
    from app.services.reporting.parsers.base import SecurityFinding

    finding = SecurityFinding(id="F1", tool="nmap", severity="Low", title="Open port", host="10.0.0.1", port=22)
    generator = UnifiedReportGenerator(project_id="p1", scan_id="s1", findings=[finding])
    html = generator.generate_html()
    assert "<strong>What:</strong>" not in html
    assert "<strong>Fix:</strong>" not in html
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/kali_linux/Agent-bfd7ff && pytest tests/test_reporter_integration.py -v -k "technical_report"`
Expected: FAIL — the location assertions fail because the current table only has a "Host/Package" column showing `finding.host`/`finding.package`, and the description/recommendation text isn't rendered at all (4 failures)

- [ ] **Step 3: Rewrite the technical section**

In `backend/app/services/reporting/reporter.py`, replace the existing `_html_technical_section` method with:

```python
    def _finding_detail_block(self, finding: SecurityFinding) -> str:
        desc = _strip_html_to_text(finding.description)
        reco = _strip_html_to_text(finding.recommendation)
        if not desc and not reco:
            return ""
        parts = ['<tr class="detail"><td colspan="5">']
        if desc:
            parts.append(f'<div><strong>What:</strong> {_esc(desc)}</div>')
        if reco:
            parts.append(f'<div><strong>Fix:</strong> {_esc(reco)}</div>')
        parts.append('</td></tr>')
        return "".join(parts)

    def _html_technical_section(self) -> str:
        parts = [f"""<div class="section">
<h2>Findings ({len(self.findings)} total)</h2>
<table>
    <tr>
        <th>Severity</th>
        <th>Title</th>
        <th>Tool</th>
        <th>Location</th>
        <th>CVE</th>
    </tr>
"""]
        for finding in self.findings:
            severity_class = finding.severity.lower()
            parts.append(f"""
    <tr>
        <td class="{severity_class}">{_esc(finding.severity)}</td>
        <td>{_esc(finding.title)}</td>
        <td>{_esc(finding.tool)}</td>
        <td>{_esc(finding.location())}</td>
        <td>{_esc(_finding_cve_display(finding))}</td>
    </tr>
""")
            parts.append(self._finding_detail_block(finding))
        parts.append(_CLOSING_TABLE_DIV)
        return "".join(parts)
```

This replaces the old 4-column version that used manual `.replace()` chains for escaping (`safe_title = finding.title.replace("&", ...)`) — switched to the file's own existing `_esc()` helper for consistency, and the `Host/Package` column is gone in favor of `Location` (via `finding.location()`) and a new `CVE` column.

Also add detail-row styling to `_html_header`'s `<style>` block — in the existing `<style>` string (inside `_html_header`), add one rule after the existing `table { ... }` rule:

```css
        .detail td { background-color: #fafafa; font-size: 13px; padding: 8px 16px 16px 16px; }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/kali_linux/Agent-bfd7ff && pytest tests/test_reporter_integration.py -v`
Expected: all passed (including Task 1/2's tests and the pre-existing `test_reporter_module_exists`/`test_reporter_accepts_findings`)

- [ ] **Step 5: Commit**

```bash
cd /home/kali_linux/Agent-bfd7ff
git add backend/app/services/reporting/reporter.py tests/test_reporter_integration.py
git commit -m "fix(reporting): technical HTML report shows location, CVE, description, fix"
```

---

### Task 4: Technical report (PDF) — mirror the HTML content

**Files:**
- Modify: `backend/app/services/reporting/reporter.py`
- Test: `tests/test_reporter_integration.py`

**Interfaces:**
- Consumes: same as Task 3
- Produces: rewritten `_pdf_technical_elements(self, styles) -> list`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_reporter_integration.py`:

```python
def test_generate_pdf_grows_when_finding_has_description_and_recommendation():
    from app.services.reporting.reporter import UnifiedReportGenerator
    from app.services.reporting.parsers.base import SecurityFinding

    sparse = SecurityFinding(id="F1", tool="zap", severity="High", title="Vulnerable JS Library")
    rich = SecurityFinding(
        id="F1", tool="zap", severity="High", title="Vulnerable JS Library",
        description="The identified library appears to be vulnerable.",
        recommendation="Upgrade to the latest version of the affected library.",
        uri="https://it-tools.tech/assets/index-61effc08.js",
    )

    sparse_pdf = UnifiedReportGenerator(project_id="p1", scan_id="s1", findings=[sparse]).generate_pdf()
    rich_pdf = UnifiedReportGenerator(project_id="p1", scan_id="s1", findings=[rich]).generate_pdf()

    assert sparse_pdf[:4] == b"%PDF"
    assert rich_pdf[:4] == b"%PDF"
    assert len(rich_pdf) > len(sparse_pdf)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/kali_linux/Agent-bfd7ff && pytest tests/test_reporter_integration.py -v -k "generate_pdf_grows"`
Expected: FAIL — currently `_pdf_technical_elements` only renders Severity/Title/Tool/Host-Package, so `description`/`recommendation`/`uri` make no difference to output size (the assertion `len(rich_pdf) > len(sparse_pdf)` fails, or the difference is negligible/random noise from PDF internals, not a meaningful content difference)

- [ ] **Step 3: Rewrite the PDF technical elements**

In `backend/app/services/reporting/reporter.py`, replace the existing `_pdf_technical_elements` method with:

```python
    def _pdf_technical_elements(self, styles) -> list:
        elements = [
            Paragraph("Detailed Findings", styles['Heading2']),
        ]
        findings_data = [[
            Paragraph("Severity", styles["BodyText"]),
            Paragraph("Title", styles["BodyText"]),
            Paragraph("Tool", styles["BodyText"]),
            Paragraph("Location", styles["BodyText"]),
            Paragraph("CVE", styles["BodyText"]),
        ]]
        for f in self.findings:
            findings_data.append([
                Paragraph(str(f.severity), styles["BodyText"]),
                Paragraph(str(f.title), styles["BodyText"]),
                Paragraph(str(f.tool), styles["BodyText"]),
                Paragraph(_esc(f.location()), styles["BodyText"]),
                Paragraph(_esc(_finding_cve_display(f)), styles["BodyText"]),
            ])
        findings_table = Table(findings_data, colWidths=[0.7*inch, 3.0*inch, 0.8*inch, 2.3*inch, 1.3*inch])
        findings_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
        ]))
        elements.append(findings_table)
        elements.append(Spacer(1, 0.2 * inch))

        for f in self.findings:
            desc = _strip_html_to_text(f.description)
            reco = _strip_html_to_text(f.recommendation)
            if not desc and not reco:
                continue
            elements.append(Paragraph(f"<b>{_esc(f.title)}</b>", styles["BodyText"]))
            if desc:
                elements.append(Paragraph(f"<b>What:</b> {_esc(desc)}", styles["BodyText"]))
            if reco:
                elements.append(Paragraph(f"<b>Fix:</b> {_esc(reco)}", styles["BodyText"]))
            elements.append(Spacer(1, 0.12 * inch))

        return elements
```

Column widths total 8.1in (unchanged from the original 4-column version), which fits within landscape letter's ~9in usable width (11in page minus 1in margins each side). The `<b>` tags here are reportlab's own Paragraph markup (a small, safe, reportlab-interpreted subset, unrelated to the tool-supplied HTML `_strip_html_to_text` guards against) — they wrap `_esc()`-escaped content, so a finding whose title literally contained `<b>` would render as the literal text `&lt;b&gt;`, not break out of the intended bold formatting.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/kali_linux/Agent-bfd7ff && pytest tests/test_reporter_integration.py -v`
Expected: all passed

- [ ] **Step 5: Commit**

```bash
cd /home/kali_linux/Agent-bfd7ff
git add backend/app/services/reporting/reporter.py tests/test_reporter_integration.py
git commit -m "fix(reporting): technical PDF report shows location, CVE, description, fix"
```

---

### Task 5: Executive report — data-driven posture + top findings (HTML + PDF)

**Files:**
- Modify: `backend/app/services/reporting/reporter.py`
- Test: `tests/test_reporter_integration.py`

**Interfaces:**
- Consumes: `self.generate_risk_summary()` (already exists, unchanged), `SecurityFinding.location()` (Task 1)
- Produces: `_posture_line(self) -> str`, `_top_findings(self, limit: int = 5) -> List[SecurityFinding]`, rewritten `_html_executive_section(self) -> str` and `_pdf_executive_elements(self, styles) -> list`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_reporter_integration.py`:

```python
def test_executive_report_replaces_static_boilerplate():
    from app.services.reporting.reporter import UnifiedReportGenerator
    from app.services.reporting.parsers.base import SecurityFinding

    findings = [
        SecurityFinding(id="1", tool="zap", severity="Critical", title="SQLi", host="a"),
        SecurityFinding(id="2", tool="zap", severity="High", title="XSS", host="b"),
    ]
    generator = UnifiedReportGenerator(
        project_id="p-exec-1", scan_id="s-exec-1", findings=findings, report_type="executive"
    )
    html = generator.generate_html()

    assert "This executive summary presents the high-level security posture" not in html
    assert "Risk score:" in html
    assert "SQLi" in html
    assert "XSS" in html


def test_executive_report_top_findings_ranked_by_severity():
    from app.services.reporting.reporter import UnifiedReportGenerator
    from app.services.reporting.parsers.base import SecurityFinding

    findings = [
        SecurityFinding(id="1", tool="t", severity="Low", title="Low one"),
        SecurityFinding(id="2", tool="t", severity="Critical", title="Critical one"),
        SecurityFinding(id="3", tool="t", severity="Medium", title="Medium one"),
    ]
    generator = UnifiedReportGenerator(project_id="p-exec-2", scan_id="s-exec-2", findings=findings)
    top = generator._top_findings(limit=2)

    assert [f.title for f in top] == ["Critical one", "Medium one"]


def test_executive_report_handles_zero_findings():
    from app.services.reporting.reporter import UnifiedReportGenerator

    generator = UnifiedReportGenerator(
        project_id="p-exec-3", scan_id="s-exec-3", findings=[], report_type="executive"
    )
    html = generator.generate_html()
    assert "No findings to report." in html


def test_executive_pdf_generates_without_error():
    from app.services.reporting.reporter import UnifiedReportGenerator
    from app.services.reporting.parsers.base import SecurityFinding

    findings = [SecurityFinding(id="1", tool="zap", severity="Critical", title="SQLi", host="a")]
    generator = UnifiedReportGenerator(
        project_id="p-exec-4", scan_id="s-exec-4", findings=findings, report_type="executive"
    )
    pdf_bytes = generator.generate_pdf()
    assert pdf_bytes[:4] == b"%PDF"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/kali_linux/Agent-bfd7ff && pytest tests/test_reporter_integration.py -v -k "executive"`
Expected: FAIL — `test_executive_report_replaces_static_boilerplate` fails because the boilerplate sentence is still present; `test_executive_report_top_findings_ranked_by_severity` fails with `AttributeError: 'UnifiedReportGenerator' object has no attribute '_top_findings'` (4 failures; the PDF one may pass already since PDF generation doesn't currently error, just note actual result)

- [ ] **Step 3: Add the helpers and rewrite both executive sections**

In `backend/app/services/reporting/reporter.py`, add these two methods to `UnifiedReportGenerator` (near `generate_risk_summary`):

```python
    def _posture_line(self) -> str:
        risk = self.generate_risk_summary()
        trend_word = {"improving": "down", "worsening": "up", "stable": "flat"}.get(risk["trend"], risk["trend"])
        prev = risk.get("previous_score")
        if prev is not None and prev != risk["score"]:
            delta = risk["score"] - prev
            trend_line = f"{trend_word} {abs(delta)} points since the last scan"
        else:
            trend_line = "no previous scan to compare"
        return f"Risk score: {risk['score']}/100 ({risk['level']}) — {trend_line}."

    def _top_findings(self, limit: int = 5) -> list:
        order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
        return sorted(
            self.findings,
            key=lambda f: order.get(f.severity.lower(), len(order)),
        )[:limit]
```

Replace `_html_executive_section`:

```python
    def _html_executive_section(self) -> str:
        posture = self._posture_line()
        top = self._top_findings()
        if top:
            rows = "".join(
                f"<tr><td>{_esc(f.severity)}</td><td>{_esc(f.title)}</td>"
                f"<td>{_esc(f.tool)}</td><td>{_esc(f.location())}</td></tr>"
                for f in top
            )
            top_table = f"""<table>
    <tr><th>Severity</th><th>Title</th><th>Tool</th><th>Location</th></tr>
    {rows}
</table>"""
        else:
            top_table = "<p>No findings to report.</p>"

        return f"""<div class="section">
<h2>Executive Summary</h2>
<p>{_esc(posture)}</p>
<h3>Top Findings</h3>
{top_table}
</div>
"""
```

Replace `_pdf_executive_elements`:

```python
    def _pdf_executive_elements(self, styles) -> list:
        elements = [
            Paragraph("Executive Summary", styles['Heading2']),
            Paragraph(_esc(self._posture_line()), styles['Normal']),
            Spacer(1, 0.2 * inch),
            Paragraph("Top Findings", styles['Heading3']),
        ]

        top = self._top_findings()
        if top:
            data = [["Severity", "Title", "Tool", "Location"]]
            for f in top:
                data.append([f.severity, f.title, f.tool, f.location()])
            table = Table(data, colWidths=[0.9*inch, 3.5*inch, 1*inch, 2.5*inch])
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), DARK_BLUE),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
            ]))
            elements.append(table)
        else:
            elements.append(Paragraph("No findings to report.", styles['Normal']))

        return elements
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/kali_linux/Agent-bfd7ff && pytest tests/test_reporter_integration.py tests/test_security_finding.py tests/test_reporter_trend.py -v`
Expected: all passed — this is the full reporter test suite, confirming no regressions in the trend/DB-dependent tests either

- [ ] **Step 5: Commit**

```bash
cd /home/kali_linux/Agent-bfd7ff
git add backend/app/services/reporting/reporter.py tests/test_reporter_integration.py
git commit -m "fix(reporting): executive report shows real risk posture and top findings"
```

---

### Task 6: Real before/after evidence artifact

**Files:**
- Create: none (uses the Artifact tool directly, not a repo file)

**Interfaces:**
- Consumes: `UnifiedReportGenerator` (Tasks 3–5), a real finding already confirmed present in the `devsecops_staging` database (the ZAP "Vulnerable JS Library" finding investigated earlier in this effort)

This task has no automated test — it's a demonstration artifact for showing the fix to management, built from real data, not shipped code. Do this after Tasks 1–5 are committed and their tests pass.

- [ ] **Step 1: Pull the real finding and render it with the fixed code**

```bash
cd /home/kali_linux/Agent-bfd7ff
docker exec docker-postgres-1 psql -U devsecops -d devsecops_staging -Atc \
  "select findings::jsonb->0 from scan_reports where tool_name='zap' and findings is not null and jsonb_array_length(findings::jsonb) > 0 order by created_at desc limit 1" \
  > /tmp/claude-1000/-home-kali-linux-Agent-bfd7ff/cbf7f238-9392-4a15-a2b7-34e1c216b477/scratchpad/real_finding.json
```

Then, from a Python shell with `backend` on `sys.path` (matching `tests/conftest.py`'s setup), load that JSON, construct a `SecurityFinding` from its fields (the same field names as `SecurityFinding.to_dict()`), and call `UnifiedReportGenerator(...).generate_html()` on it — this is the AFTER output.

- [ ] **Step 2: Build the before/after comparison page**

Using the Artifact tool (Design-canvas type, same flow as the architecture diagram already published to `https://claude.ai/artifact/The6DM93ybW7MJa5giYHB8`): one artboard showing, side by side, the exact old row text captured during investigation (`High | Vulnerable JS Library | zap | -`) next to the new rendered output from Step 1 (real location, description, recommendation).

- [ ] **Step 3: Publish and share the link**

Publish via the Artifact tool. No commit for this task — it's a standalone shareable link, not a repo change.

---

## Self-Review

**Spec coverage:**
- Both Technical and Executive reports fixed in one pass — Tasks 3–4 (Technical) and Task 5 (Executive). ✓
- Compact table + per-finding block, not a wide table — Task 3's `_finding_detail_block`. ✓
- Plain-text stripping of tool-supplied HTML — Task 2's `_strip_html_to_text`, applied in Tasks 3–5. ✓
- Data-driven Executive narrative (posture line + top 5, no generated prose) — Task 5. ✓
- Location fallback moved onto `SecurityFinding` per the codebase-design discussion — Task 1. ✓
- Real before/after evidence artifact — Task 6. ✓
- NVD enrichment, SonarQube rule-cache gap, and the `docs/SCANNER_OUTPUT_RESEARCH.md` findings (Trivy CVSS-source ambiguity, Dependency-Check confidence signal, ZAP `instances[]`, SonarQube `flows[]`, npm audit gaps, Nmap dead-XML-stub) — explicitly out of scope per Global Constraints; not ticketed here, left for the wayfinder map.

**Placeholder scan:** none found — every step has real code or real shell commands.

**Type consistency:** `location()` returns `str` everywhere it's used (Tasks 3, 4, 5). `_finding_cve_display`/`_strip_html_to_text` signatures match their single call sites. `_top_findings` returns `list[SecurityFinding]`, consumed identically in both `_html_executive_section` and `_pdf_executive_elements`.
