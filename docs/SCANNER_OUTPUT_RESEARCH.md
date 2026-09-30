# Scanner Output Research: Raw Tool Data vs. What Our Reports Show

This document compares each scanning tool's **official** raw-output schema to what
`backend/app/services/reporting/parsers/*.py` actually extracts into `SecurityFinding`
(`backend/app/services/reporting/parsers/base.py`), and lists concrete report-content
improvements per tool.

`SecurityFinding` (base.py) currently has these fields available to any parser:
`id, tool, severity, title, description, cve, host, port, service, uri, package,
recommendation, raw_evidence, rule, finding_type, line_number, file_path, effort,
tags, sonar_status, sonar_resolution, code_snippet, code_snippet_language,
cvss_score, cvss_severity, package_version, fixed_version, references,
exploit_available, fix_command, cwe_ids`.

---

## Nmap

**Important correction to the task's premise:** this platform does **not** parse
Nmap's XML output (`-oX`) anywhere in the report pipeline. Confirmed by reading the
code:

- `backend/nmap_system/scanner.py` invokes plain `nmap` commands with **no `-oX`/`-oN
  -` structured flag** (e.g. `nmap -sV --script ssl-enum-ciphers {ip}`,
  `nmap -Pn --script vuln,exploit ...`, `nmap -T4 -A -v {ip}`) and captures raw
  **stdout text** into `.txt` files under `scans/{date}/raw/`.
- `backend/nmap_system/parser.py` (`FindingDetector`) then regex-scrapes that plain
  text (patterns like `CVE-(\d{4}-\d+)`, `Not valid after:`, `VULNERABLE`, `smb-vuln-
  ms17-010`, etc. — 17 hand-written detection rules) and writes a custom
  `findings.json`.
- `backend/app/services/reporting/parsers/nmap.py::parse_nmap_findings()` is what
  actually feeds the report — it parses that custom `findings.json`, **not** Nmap
  XML.
- `parse_nmap_xml()` in the same file is a dead stub: `def parse_nmap_xml(raw_xml):
  findings = []; return findings` — it always returns an empty list and does nothing.
  If real Nmap XML is ever handed to it, every finding is silently dropped.

So the "what Nmap's raw output contains" research below documents the DTD/XML
capability Nmap actually has, to show what is being left on the table by scraping
plain-text stdout with regexes instead of consuming structured XML — which is the
single biggest opportunity for this tool.

**Source**: [Nmap XML Output DTD, Appendix A of the Nmap book](https://nmap.org/book/app-nmap-dtd.html) (points to the canonical DTD at `https://svn.nmap.org/nmap/docs/nmap.dtd`, mirrored at [github.com/nmap/nmap/blob/master/docs/nmap.dtd](https://github.com/nmap/nmap/blob/master/docs/nmap.dtd)); [XML Output (-oX)](https://nmap.org/book/output-formats-xml-output.html).

**What the raw tool output contains** (from the DTD, if `-oX`/`-oX -` were used):
- `<port protocol="tcp" portid="443">` → `<state state="open" reason="syn-ack"/>`
- `<service name="https" product="nginx" version="1.24.0" extrainfo="..." tunnel="ssl" method="probed" conf="10" ostype="Linux" servicefp="..."/>` — structured, machine-parsable product/version/confidence, not embedded in free text.
- `<script id="ssl-cert" output="...">` and `<hostscript>` blocks — every NSE script (including `vuln`, `vulners`, `http-slowloris`, `ssl-enum-ciphers`, `smb-vuln-ms17-010`, etc.) emits its output as a structured `id`/`output` pair, plus nested `<table>`/`<elem>` sub-structures for scripts that support structured output (e.g. `vulners` emits per-CVE `<table>` entries with CVSS scores and links).
- `<os>` → `<osmatch name="..." accuracy="98" line="...">` → `<osclass vendor="..." osfamily="Linux" osgen="..." type="..." accuracy="98"><cpe>cpe:/o:linux:linux_kernel</cpe></osclass>` — OS fingerprinting with accuracy percentage and CPE.
- `<address addr="10.0.0.5" addrtype="ipv4" vendor="..."/>` and `<hostname name="..." type="user"/>` / `type="PTR"`.
- No single canonical "CVE" element exists in core Nmap XML; CVE/vulnerability data comes only through NSE script `output` text or structured script `<table>` elements (script-dependent, e.g. `vulners`/`vuln` category scripts).

**What our parser currently extracts:**
- `parse_nmap_findings()` reads the pre-processed `findings.json` (title, severity, description, cve, host, ip, port, service, version, recommendation, raw_evidence) — all of which is text the regex layer in `nmap_system/parser.py` scraped out of stdout.
- Fields it does **not** get, because they never existed in the plain-text scrape path: NSE script `id` (which script produced a finding), structured script table/elem data, OS detection (`osmatch`/`osclass`/CPE), service `conf` (detection confidence), `method` (probed vs. table-guessed), multiple hostnames, per-port `reason` (why nmap thinks it's open), address `vendor` (MAC vendor lookup).
- `parse_nmap_xml()` extracts nothing at all — it is unreachable/unused dead code that returns `[]` unconditionally.

**Concrete suggestions:**
1. Switch `nmap_system/scanner.py` to run with `-oX <file>` (in addition to, or instead of, plain stdout capture) and parse the DTD-defined structure instead of regexing free text. This alone would fix multiple regex fragility issues already flagged in `nmap_system/parser.py`'s own comments (e.g. "Issue 7: Fix port extraction," "Issue 13: Fix hardcoded port 3389," cross-script contamination guards) — those are exactly the class of bug that goes away with structured XML/`<script id output>` parsing.
2. Surface the NSE **script id** (e.g. `ssl-dh-params`, `smb-vuln-ms17-010`, `vulners`) as `SecurityFinding.rule` instead of only a derived title — currently `rule=title`, which loses the actual script name that triggered the finding.
3. Surface **OS detection** (`osmatch`/`osclass`/CPE) as its own finding type or as `SecurityFinding.tags` (e.g. `os:Linux`, `cpe:/o:linux:linux_kernel`) — currently completely absent from the pipeline (no OS-detection finding exists at all).
4. Surface service **detection confidence** (`conf` attribute, 1–10 scale) and **detection method** (`probed` vs `table`) so a report reader can tell "nmap actively probed and identified nginx 1.24.0" from "nmap guessed based on port number" — currently every service/version finding reads with equal certainty regardless of confidence.
5. Even without moving to XML immediately, fix `parse_nmap_xml()` — right now it is a silent no-op landmine: if any code path ever calls it (e.g. a future direct-XML upload path), all findings vanish with no error.

---

## Trivy (filesystem + image scans)

**Source**: [Trivy vulnerability report JSON examples](https://trivy.dev) (aquasecurity/trivy project; page structure confirmed via search of `aquasecurity.github.io/trivy` "Report Formats" and GitHub discussions #1050 "BREAKING CHANGE: migration to new JSON schema" and #10281 on CVSS-per-source); [`types` package godoc](https://pkg.go.dev/github.com/aquasecurity/trivy-db/pkg/types) for `DataSource`/`CVSS` struct shape. Some pages returned 404 during this session (Trivy's docs site has moved between `aquasecurity.github.io/trivy` and `trivy.dev` across versions); field list below is corroborated across the reachable pages plus the actual repo code in `backend/app/services/reporting/parsers/trivy.py`, which itself references the exact field names (`CVSS`, `V3Score`, `V2Score`, `References`, `CweIDs`) confirming the schema.

**What the raw tool output contains** (`Results[].Vulnerabilities[]`):
- `VulnerabilityID`, `PkgID`, `PkgName`, `InstalledVersion`, `FixedVersion`, `Status` (e.g. `fixed`, `affected`, `will_not_fix`, `end_of_life`)
- `Title`, `Description`, `Severity`, **`SeveritySource`** (which vendor DB — nvd/redhat/ghsa/etc. — supplied the severity Trivy is showing)
- **`CVSS`** — keyed by source (`nvd`, `redhat`, `ghsa`, etc.), each with `V2Vector`/`V3Vector`/`V2Score`/`V3Score` — i.e. Trivy deliberately preserves multiple vendors' independent CVSS scores rather than collapsing to one number.
- `PrimaryURL` (a single canonical link) plus a full `References` array
- **`DataSource`** — `{ID, Name, URL}` identifying which vulnerability database produced this specific record
- `CweIDs`
- **`Layer`** (image scans only) — `{Digest, DiggestID, DiffID}`-style info identifying which container layer introduced the vulnerable package — critical for telling a developer "this came from your Dockerfile's `apt-get install` line" vs. "this is in the base image you didn't choose."

**What our parser currently extracts** (`trivy.py`):
- Extracts `Severity`, `Package`, `InstalledVersion`, `FixedVersion`, `Title`, `Description`, `CweIDs`, and builds `references` from `References[]` (any string starting with `http`).
- `_extract_cvss_score()` **iterates all CVSS sources but keeps only the first one it finds with a V3/V2 score** (dict iteration order, effectively arbitrary/whichever source key comes first in the JSON) — it does not prefer NVD specifically, and does not retain per-source detail; `_extract_cvss_summary()` builds a human string of all sources but that string is only embedded inside `recommendation`, not a structured field.
- **Silently drops**: `SeveritySource` (never captured — no visibility into whether "Critical" came from NVD or a vendor advisory that may disagree), `DataSource` (`ID`/`Name`/`URL` of the vulnerability database — dropped entirely), `PrimaryURL` (dropped; only the raw `References[]` list is used, and only the *first* reference becomes the "More info" link in the recommendation text — not necessarily Trivy's own designated primary URL), `Status` (fixed/affected/end_of_life — dropped, so a report can't distinguish "there's a real fix" from "this package is EOL, no fix will ever exist"), `Layer` (image scans — completely dropped, so two image-scan findings look identical whether they came from the base OS image or the app's own Dockerfile layer).

**Concrete suggestions:**
1. Report the **CVSS score per source** (`CVSS.nvd.V3Score` vs `CVSS.redhat.V3Score` vs `CVSS.ghsa.V3Score`) instead of one opaque "cvss_score" derived from dict-iteration order — this is explicitly called out as a real-world discrepancy in Trivy's own issue tracker (e.g. GHSA vs NVD disagreeing by multiple points on the same CVE). At minimum, prefer `nvd` deterministically (the de facto standard) and show it labeled as "(NVD)" rather than an unlabeled number that silently changes source from finding to finding.
2. Surface `SeveritySource` next to severity, so a report reader knows "Trivy is showing you the Red Hat rating for this CVE, not NVD's" when they differ.
3. Surface `Status` (`fixed`/`affected`/`will_not_fix`/`end_of_life`) as its own field or tag — "no fix available" currently reads identically whether a fix is merely not-yet-released or the package is dead upstream and will never be patched. This changes the recommended remediation entirely (upgrade vs. replace the dependency).
4. For image scans specifically, surface `Layer` info so the report can say which Dockerfile layer introduced the vulnerable package — this is one of Trivy's most-requested differentiators for image scanning and is currently thrown away by `parse_trivy_image_report()`, which is just an alias of the filesystem parser with no layer-aware logic.
5. Use `DataSource.URL`/`DataSource.Name` to label which vulnerability database (NVD, GHSA, Red Hat, Debian, Alpine's secdb, etc.) is the source of truth for that particular vulnerability record — currently invisible; useful when a CVE is disputed or has inconsistent severities across ecosystems.

---

## OWASP Dependency-Check

**Source**: Dependency-Check JSON/XML report schema, corroborated via the project's XSD schema files in [jeremylong/DependencyCheck](https://github.com/jeremylong/DependencyCheck) (`core/src/main/resources/schema/`) and the [sample report page](https://jeremylong.github.io/DependencyCheck/general/SampleReport.html); GitHub issue #2547 ("Need CVSSv3.1 or 3.0 specification in reports") and #2190 confirm the `cvssv2`/`cvssv3` split. **Caveat**: I could not fetch the exact current-version XSD file content directly (GitHub raw/blob fetches for the schema file 404'd/redirected in this session); field names below are corroborated by (a) the search-engine-summarized XSD structure, and (b) direct inspection of this repo's own parser code (`depcheck.py`), which already implements handling for `cvssv3.baseScore`, `cvssv2.baseScore`, `cvssScore` as an alternate format, `references[].url`, and `cwes[]` — i.e. the parser's own field names are strong corroborating evidence of the real schema, cross-checked against the XSD summary.

**What the raw tool output contains** (`dependencies[].vulnerabilities[]`):
- `name` (CVE/GHSA id), `severity`, `description`
- **`cvssv3`**: `baseScore`, `baseSeverity`, plus the full vector breakdown — `attackVector`, `attackComplexity`, `privilegesRequired`, `userInteraction`, `scope`, `confidentialityImpact`, `integrityImpact`, `availabilityImpact`
- **`cvssv2`**: `score`, `accessVector`, `accessComplexity`, `authentication`, `confidentialImpact`, `integrityImpact`, `availabilityImpact`, `severity`
- `cwes[]` (list of CWE ids)
- `references[]`: each with `source`, `url`, `name` — Dependency-Check tags *which* source (NVD, GitHub Advisory, etc.) each reference came from, not just a bare URL
- `vulnerableSoftware[].software[]`: version-range matching info (`versionStartIncluding`, `versionEndExcluding`, `vulnerable` boolean) — this is the data Dependency-Check used to decide the dependency is actually in the vulnerable range, i.e. the "why we think you're affected" evidence
- Per-dependency **`confidence`** ratings and **`evidenceCollected`** (the raw strings/filenames/hashes Dependency-Check used to identify the CPE/package identity) — this is the tool's "how sure are we this is really log4j 2.14" transparency data, important because Dependency-Check is known for identity false positives
- `notes` field on vulnerabilities for supplementary vendor commentary

**What our parser currently extracts** (`depcheck.py`):
- Extracts `cvssv3.baseScore` (preferred) or `cvssv2.baseScore` or a flat `cvssScore` fallback, severity, description, `cwes[]` → `cwe_ids`, `references[]` (both string and `{url}` dict forms) → flat URL list, `version` (the vulnerable software's version string on the *finding* dict, not `vulnerableSoftware[]`).
- **Silently drops**: the full CVSS **vector breakdown** (`attackVector`, `attackComplexity`, `privilegesRequired`, `userInteraction`, `scope` — all the "how would this actually be exploited" context, reduced to a single number), reference `source`/`name` (a report just sees a bare URL, not "this is the NVD advisory" vs. "this is a GitHub Security Advisory"), `vulnerableSoftware[]` version-range evidence entirely (no way to show *why* Dependency-Check thinks this version range is vulnerable), per-dependency `confidence`/`evidenceCollected` (no signal in the report about how confident Dependency-Check is that its CPE identification is correct — this matters a lot given Dependency-Check's known false-positive-prone CPE matching), and `notes`.

**Concrete suggestions:**
1. Surface the CVSS **attack vector** (`AV:N` remote vs `AV:L` local, etc.) from `cvssv3` — currently collapsed into a bare score, but "remotely exploitable with no privileges" vs. "requires local access and high privileges" is exactly the kind of thing that changes prioritization and is sitting unused in the raw report.
2. Show reference **source** labels (e.g. "NVD", "GitHub Advisory") next to each link, using `references[].source`/`name`, instead of an unlabeled bare URL.
3. Surface Dependency-Check's own **identification confidence** for the dependency (evidence/confidence data) somewhere in the finding — even a simple "identification confidence: HIGH/MEDIUM/LOW" tag would let a report reader immediately flag likely false positives before triaging, which matters because Dependency-Check false-positives on CPE identity more than most of the other tools in this pipeline.
4. Consider surfacing `vulnerableSoftware[]` range info (e.g. "vulnerable if version < 2.17.1") as part of the recommendation text, rather than only stating the vulnerability name — this is literally the rule Dependency-Check used to flag the dependency and currently isn't shown at all.

---

## OWASP ZAP

**Source**: [ZAP Traditional JSON Report](https://www.zaproxy.org/docs/desktop/addons/report-generation/report-traditional-json/) and [Traditional JSON Report Plus (with requests/responses)](https://www.zaproxy.org/docs/desktop/addons/report-generation/report-traditional-json-plus/); riskdesc format confirmed via [Lightrun/zaproxy discussion "Document riskdesc in reports"](https://lightrun.com/answers/zaproxy-zaproxy-document-riskdesc-in-reports).

**What the raw tool output contains** (`site[].alerts[]`):
- Alert-level: `pluginid`, `alertRef`, `alert`/`name`, `riskcode` (0–3 numeric), `confidence`, **`riskdesc`** (a combined string like `"High (Medium)"` = Risk level + Confidence in parens), `desc`, `solution`, `otherinfo`, `reference` (raw text, possibly multiple URLs), `cweid`, `wascid`, `sourceid`, `count` (total instance count), `systemic` (boolean)
- **`instances[]`** — the actual per-occurrence data: `uri`, `nodeName`, `method`, `param` (which parameter triggered the alert), `attack` (the actual payload ZAP sent), `evidence` (the actual proof-string ZAP found in the response), `otherinfo`

**What our parser currently extracts** (`zap.py`):
- Correctly reads `instances[]` and emits **one `SecurityFinding` per instance** (a deliberate, already-good design per the code's own comment explaining this was previously a bug where `uri`/`evidence` were read from the wrong nesting level).
- Per instance it captures `uri` and `evidence` (into `raw_evidence`).
- At the alert level it captures `name`, `desc`, `solution` (folded into `recommendation`), `cweid`, `reference` → `references[]`, and a derived `confidence` value that only becomes a **tag** (`confidence:Medium`), not a first-class field.
- **Silently drops**: instance-level `method` (GET/POST — which HTTP method was actually attacked) and `param` (which parameter/field was the attack vector — arguably one of the most actionable pieces of data for a developer trying to reproduce/fix an XSS or injection finding) and `attack` (the exact payload ZAP sent — without this, "evidence" alone often isn't enough to reproduce the finding). Also drops `wascid` (WASC classification, a second taxonomy alongside CWE), `sourceid`, `systemic` (whether ZAP considers this a systemic issue across the whole site vs. one-off), and the numeric `riskcode`.

**Concrete suggestions:**
1. Surface `param` and `method` per instance (already available on the `instance` dict being iterated in `_parse_zap_alert` — literally sitting one line away from where `uri`/`evidence` are already pulled). This is the single highest-value, lowest-effort fix here: a report currently says "XSS found at `/search`" with no indication it was the `q` parameter via a `GET` request — `param`/`method` make the finding directly reproducible.
2. Surface `attack` (the actual payload sent) alongside `evidence` (the proof found) — together they let a developer literally replay the exact request that triggered the finding, versus today's `evidence`-only view which is proof without the reproduction steps.
3. Promote `confidence` from a plain tag string to the same first-class treatment CVSS-derived confidence gets elsewhere, since ZAP's own confidence levels (High/Medium/Low/False Positive) materially affect whether a finding should be prioritized or is likely noise.
4. Add `wascid` alongside the existing `cweid`/CWE tagging — WASC is a second standard taxonomy ZAP natively provides and is currently thrown away entirely.

---

## SonarQube

**Source**: [SonarQube Web API reference](https://docs.sonarsource.com/sonarqube-server/latest/extension-guide/web-api/) (the live `/api/issues/search` and `/api/hotspots/search` endpoints our code actually calls); field semantics for `impacts`/`cleanCodeAttribute`/`textRange` corroborated via [Generic formatted reports / generic issue import format docs](https://docs.sonarsource.com/sonarqube-server/10.6/analyzing-source-code/importing-external-issues/generic-issue-import-format/) (same field names/semantics SonarQube uses internally) and community confirmation of `flows`/`quickFixAvailable` on the live search endpoint response ([SonarQube community forum](https://community.sonarsource.com/t/list-issues-with-webapi/45931), [SDK docs mirroring the response model](https://sonarqube-sdk.readthedocs.io/en/latest/api/issues.html)).

**What the raw tool output contains** (`/api/issues/search` → `issues[]`, and `/api/hotspots/search` → `hotspots[]`):
- `key`, `component`, `message`, `severity` (legacy) plus the newer **clean-code taxonomy**: `cleanCodeAttribute` (e.g. `CLEAR`, `LOGICAL`, `TRUSTWORTHY`...) and **`impacts[]`** — an array of `{softwareQuality: SECURITY|RELIABILITY|MAINTAINABILITY, severity: BLOCKER|HIGH|MEDIUM|LOW|INFO}` — SonarQube's modern replacement for the single `type`/`severity` pair, explicitly designed to show *multiple* dimensions of impact for one issue (e.g. a single issue can be both a Security and a Maintainability impact simultaneously).
- `textRange`: `{startLine, endLine, startOffset, endOffset}` — precise column-level location, not just a line number.
- **`flows[]`** — for taint-analysis/dataflow issues (SQL injection, path traversal, etc.), each flow is an ordered list of secondary locations (`{component, textRange, msg}`) tracing the exact data path from a tainted source to the vulnerable sink. This is the single most valuable piece of data SonarQube provides for security vulnerabilities and is entirely separate from the primary issue location.
- `quickFixAvailable` (boolean — whether Sonar's own tooling can auto-fix it)
- `effort`/`debt`, `status`, `resolution`, `tags[]`, `rule` key
- Rule metadata (via `/api/rules/search`, which the code already calls separately): `htmlDesc`, `htmlNote`, `debtRemFnType`/`debtRemFnOffset`, `name`, `lang`

**What our parser currently extracts** (`sonar.py`):
- `_build_sonar_finding()` maps legacy `severity` via a hardcoded `SEVERITY_MAP` (BLOCKER→Critical, etc.), `message`→title, `component`/file path, `line` (single line only, not full `textRange`), `effort`, `tags`, `status`/`resolution`, plus separately-fetched rule `htmlDesc`/`htmlNote`/`debtRemFnType+Offset` for description/recommendation.
- **Silently drops**: `impacts[]` (the modern clean-code severity model — the parser only ever uses the legacy single `severity` field, so a MAINTAINABILITY-only issue and a SECURITY-critical issue that happen to share the same legacy severity are indistinguishable in the report), `cleanCodeAttribute`, **`flows[]`** (completely absent — for taint-vulnerability findings like SQL injection, the report shows only the sink location and loses the entire source→sink data-flow path that is the actual explanation of *why* it's exploitable), `textRange`'s column offsets (only `line` is kept, so multiple issues on one long line can't be distinguished by column), `quickFixAvailable`.
- `fetch_sonar_hotspots()` similarly keeps only `message`, `component`, `line`, `ruleKey`, `status`, `tags` — drops hotspot-specific fields like `vulnerabilityProbability`'s underlying category context and any hotspot-specific rule guidance beyond a generic canned sentence.

**Concrete suggestions:**
1. Surface `flows[]` for taint/injection-type findings — this is the biggest gap for SonarQube specifically. Today a SQL-injection finding shows only "tainted value flows into this query" at one line; the actual `flows[]` array contains the full traced path (every intermediate variable assignment/parameter pass) that a developer needs to actually understand and fix the vulnerability. Render it as a numbered list of file:line hops in the report.
2. Surface `impacts[]` (softwareQuality + severity pairs) instead of, or alongside, the legacy severity mapping — an issue that impacts both SECURITY and MAINTAINABILITY at different severities is currently flattened to one number, which under- or over-states its security relevance depending on which legacy `severity` SonarQube happened to also emit.
3. Use full `textRange` (`startLine`/`endLine`/`startColumn`/`endColumn`) instead of just `line`, so the report can point at the exact expression, not just a whole (possibly very long) line.
4. Surface `cleanCodeAttribute` — it's a one-word categorical hint (e.g. "TRUSTWORTHY", "LOGICAL") that maps directly to *why* the code is a problem, and is currently fetched from the rule cache path for description/recommendation but never itself surfaced as a labeled field.

---

## npm audit

**Source**: [`npm-audit` CLI docs](https://docs.npmjs.com/cli/v10/commands/npm-audit/); corroborated by [GitHub community discussion confirming there is no officially published JSON schema for `npm audit --json`](https://github.com/orgs/community/discussions/153882) (the structure is defined by the npm CLI source, not a versioned public schema) and by [`better-npm-audit`](https://www.npmjs.com/package/better-npm-audit) / community tooling that documents the practical shape of `vulnerabilities{}` and `via[]`.
**Explicit caveat**: npm has no official JSON schema doc (confirmed above), so the field list below is the de facto structure documented informally by the CLI's own help/changelog and third-party tooling that consumes it, not a versioned spec — flagged here per the task's fallback instructions.

**What the raw tool output contains** (`vulnerabilities{pkgName}`):
- Per-package: `severity`, `via[]` (mix of plain strings — transitive references to other package names — and advisory objects), `fixAvailable` (`false`, `true`, or `{name, version, isSemVerMajor}` — telling you not just *whether* a fix exists but whether applying it is a **major version bump** that could break your code), `version` (installed range)
- Per-advisory (inside `via[]` when it's an object, not a string): `title`, `url` (canonical advisory URL, usually a GitHub Security Advisory), `severity`, `cwe[]`, `cvss: {score, vectorString}`, `range` (affected version range)

**What our parser currently extracts** (`npm.py`):
- Extracts `title`, `url` → both `uri` and `references[]`, `severity`, CVE (regex-extracted from title or `cve[]` list), `cvss.score` → `cvss_score`, `cwe[]` → `cwe_ids`, `version`, and builds a recommendation string using `fixAvailable` only as a boolean.
- **Silently drops**: the CVSS **`vectorString`** (the full attack-vector breakdown, same category of loss as Dependency-Check above — score without vector context), the **structured `fixAvailable` object** — when `fixAvailable` is an object (not just `true`), it contains `{name, version, isSemVerMajor}`, i.e. npm is explicitly telling you "fixing this requires bumping to major version X.Y.Z" — but `parse_npm_audit_report()` only does `bool(pkg_data.get("fixAvailable"))`, discarding the target version and the major-bump warning entirely. It also drops the advisory `range` (affected version range) field.

**Concrete suggestions:**
1. When `fixAvailable` is an object, surface its `version` and `isSemVerMajor` fields directly — "a fix exists, but it's a major version bump to 5.0.0 that may include breaking changes" is materially different guidance from the current generic "Update {pkg} to a non-vulnerable version," and npm is handing us this exact structured warning today and it is thrown away by the `bool()` cast.
2. Surface `cvss.vectorString` next to the score, same rationale as Trivy/Dependency-Check above — consistent treatment across every CVSS-emitting tool in this pipeline.
3. Surface the advisory's affected version `range` so a report reader can immediately tell if their exact installed version is definitely in the vulnerable range or on the edge of it.

---

## Cross-tool patterns

1. **CVSS score without vector context, everywhere.** Trivy, Dependency-Check, and npm audit all provide a CVSS *vector string* (attack vector/complexity/privileges/etc.) alongside the bare numeric score, and all three of our parsers keep only the number. This is the single most consistent gap across the pipeline — a report full of "CVSS 9.8" numbers with no indication of whether that's "remote, no auth needed" or something requiring local access.
2. **Multiple CVSS sources collapsed to one, when the tool gives you several.** Trivy explicitly gives per-vendor CVSS (nvd/redhat/ghsa/...) and Dependency-Check gives both v2 and v3; our code picks one deterministically-ish (Dependency-Check: v3-then-v2, reasonable) or effectively arbitrarily (Trivy: first dict key with a score, not guaranteed to be NVD). Standardizing on "prefer NVD, but show the source label" across both parsers would remove an inconsistency and match how most security dashboards present this.
3. **Reference URLs are flattened to bare strings; the tools tell you more.** Trivy's `DataSource`/ZAP's `reference` block/Dependency-Check's `references[].source`+`name` all let the tool tell you *which* authority a link comes from (NVD vs. vendor advisory vs. GHSA). Every parser in this codebase reduces references to an unlabeled list of URL strings.
4. **Exact reproduction data (params, payloads, data-flow paths) is the biggest per-tool loss.** ZAP's `instances[].param`/`method`/`attack` and SonarQube's `flows[]` are each, for their respective tool, the actual "how do I reproduce/understand this" data — and both are currently dropped even though `raw_evidence`/`code_snippet` fields already exist on `SecurityFinding` that could hold them.
5. **"Is there really a fix, and how big a change is it" is inconsistently modeled.** Trivy's `Status` (fixed/affected/will_not_fix/end_of_life) and npm's structured `fixAvailable` (with `isSemVerMajor`) both encode "yes there's a fix, but here's the catch" — neither currently reaches the report; both parsers reduce this to a boolean/string with no nuance. A shared `SecurityFinding.fix_confidence`-style field could unify this across tools.
6. **Nmap is the outlier: it isn't actually consuming structured tool output at all.** Every other tool in this pipeline is parsed from that tool's native structured JSON. Nmap's report path instead runs plain-text `nmap` invocations and regex-scrapes stdout through 17 hand-maintained detection rules, then routes through a JSON intermediate (`findings.json`) before hitting the same `SecurityFinding` model. The dead `parse_nmap_xml()` stub in `nmap.py` suggests XML support was planned but never finished — that's the natural fix, and it would also resolve several of the regex-fragility issues already called out in `nmap_system/parser.py`'s own inline comments.
