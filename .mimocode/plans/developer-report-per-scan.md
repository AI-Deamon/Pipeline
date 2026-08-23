# Plan: Developer Dashboard with SonarQube Data

## Objective
Build a developer-focused dashboard that pulls rich data from SonarQube API to help developers understand and fix issues faster. Based on SonarQube's native issue detail view which provides: code snippets, fix guidance, issue context, and file health metrics.

---

## SonarQube Data Sources

### Currently Used (3 endpoints)

| Endpoint | Data | Usage |
|----------|------|-------|
| `/api/issues/search` | Issues, severity, file, line, rule, effort | Main findings |
| `/api/hotspots/search` | Security hotspots | Security review |
| `/api/rules/search` | Rule name, description, recommendation | Fix guidance |

### NEW: Additional Endpoints for Developer Dashboard

| Endpoint | Data | Developer Value |
|----------|------|-----------------|
| `/api/measures/component` | Coverage, complexity, duplication, debt | **File health metrics** |
| `/api/qualitygates/project_status` | Gate pass/fail, conditions | **Quality gate status** |
| `/api/sources/show` | Annotated source code | **Inline code view** |
| `/api/issues/search` (detailed) | Issue message, effort, type, creation date | **Issue details** |
| `/api/rules/show` | Rule htmlDesc, htmlNote, debtRemFn | **Fix guidance** |
| `/api/hotspots/search` | Vulnerability probability, status | **Security context** |

---

## What SonarQube Shows Developers (Reference)

Based on SonarQube's native issue detail view:

```
┌─────────────────────────────────────────────────────────────┐
│  ISSUE DETAIL                                               │
├─────────────────────────────────────────────────────────────┤
│  Title: Visible, non-interactive elements with click       │
│         handlers must have at least one keyboard listener  │
│                                                             │
│  Rule: typescript:S1082                                     │
│  Type: Bug                                                  │
│  Severity: Minor                                            │
│  Effort: 5min                                               │
│  Introduced: 2 months ago                                   │
│  Status: Open                                               │
│                                                             │
│  File: Agent/src/components/Layout.tsx                      │
│  Line: 109                                                  │
│                                                             │
│  CODE SNIPPET:                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 107:       {isMobileMenuOpen ? (                    │   │
│  │ 108:         <div                                   │   │
│  │ 109:           onClick={() => setIsMobileMenuOpen}  │   │
│  │    //     ^^^ Issue here                            │   │
│  │ 110:         />                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  WHERE IS THE ISSUE?                                        │
│  The element has an onClick handler but no keyboard        │
│  equivalent (onKeyDown, onKeyPress).                       │
│                                                             │
│  WHY IS THIS AN ISSUE?                                      │
│  Users who cannot use a mouse are unable to activate       │
│  this element.                                             │
│                                                             │
│  HOW CAN I FIX IT?                                         │
│  Add an onKeyDown handler that triggers the same           │
│  action on Enter or Space key press.                       │
│                                                             │
│  [Open in IDE]  [See all issues in this file]              │
└─────────────────────────────────────────────────────────────┘
```

---

## Proposed: Developer Dashboard Features

### 1. File Health Card (per file)
**Data**: `/api/measures/component`

```
┌─────────────────────────────────────────────────────────────┐
│  📁 src/components/Layout.tsx                               │
├─────────────────────────────────────────────────────────────┤
│  Coverage    ████████████░░░░  78%                          │
│  Complexity  ████████████████  15 (high)                    │
│  Duplication ██░░░░░░░░░░░░░░  3.2%                         │
│  Lines       311 lines of code                              │
│                                                             │
│  Issues in this file: 5                                     │
│  🔴 1 Critical  🟠 2 High  🟡 2 Medium                     │
└─────────────────────────────────────────────────────────────┘
```

### 2. Issue Detail Panel (when clicking an issue)
**Data**: `/api/issues/search` + `/api/rules/show`

```
┌─────────────────────────────────────────────────────────────┐
│  🔴 Bug: typescript:S1082                                   │
│  Visible, non-interactive elements with click handlers     │
│  must have at least one keyboard listener                  │
├─────────────────────────────────────────────────────────────┤
│  File: src/components/Layout.tsx:109                        │
│  Effort: 5min  │  Introduced: 2 months ago                 │
│  Status: Open  │  Severity: Minor                          │
├─────────────────────────────────────────────────────────────┤
│  CODE SNIPPET                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 107:       {isMobileMenuOpen ? (                    │   │
│  │ 108:         <div                                   │   │
│  │▶109:           onClick={() => setIsMobileMenuOpen}  │   │
│  │ 110:         />                                     │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  WHERE IS THE ISSUE?                                        │
│  The element has an onClick handler but no keyboard        │
│  equivalent.                                               │
│                                                             │
│  WHY IS THIS AN ISSUE?                                      │
│  Users who cannot use a mouse are unable to activate       │
│  this element.                                             │
│                                                             │
│  HOW CAN I FIX IT?                                         │
│  Add onKeyDown handler for Enter/Space key.                │
├─────────────────────────────────────────────────────────────┤
│  [View in SonarQube]  [See all issues in this file]        │
└─────────────────────────────────────────────────────────────┘
```

### 3. File Issues List (all issues in a file)
**Data**: `/api/issues/search` filtered by component

```
┌─────────────────────────────────────────────────────────────┐
│  📁 src/components/Layout.tsx — 5 issues                   │
├─────────────────────────────────────────────────────────────┤
│  🔴 L109  Click handler without keyboard listener          │
│  🟠 L45   Missing aria-label on icon button                │
│  🟠 L78   Focus trap not implemented in modal              │
│  🟡 L120  Low contrast text on dark background             │
│  🟡 L156  Missing alt text on decorative image             │
└─────────────────────────────────────────────────────────────┘
```

### 4. Quality Gate Status
**Data**: `/api/qualitygates/project_status`

```
┌─────────────────────────────────────────────────────────────┐
│  Quality Gate: ✅ PASSED                                    │
├─────────────────────────────────────────────────────────────┤
│  Coverage ≥ 70%        ✅ 78% (actual)                     │
│  Duplications ≤ 3%     ✅ 2.1% (actual)                    │
│  Security Rating ≥ A   ✅ A (actual)                       │
│  Reliability Rating ≥ A ✅ A (actual)                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Backend — Add SonarQube Measures Endpoint
- Add `fetch_sonar_measures()` in `backend/app/services/reporting/parsers/sonar.py`
- Fetch coverage, complexity, duplication per file
- Store in new `SonarMeasuresDB` or extend existing models

### Step 2: Backend — Add Developer Dashboard API
- New endpoint: `GET /api/v1/projects/:id/reports/:scanId/developer`
- Aggregate: file health, issues per file, quality gate
- Response includes file-level metrics and issue details

### Step 3: Frontend — Create DeveloperReportPage
- Side panel layout (similar to ProjectReportsPage)
- Left panel: file list with health metrics
- Right panel: selected file's issues with detail

### Step 4: Frontend — Create FileHealthCard Component
- Display coverage, complexity, duplication per file
- Visual progress bars
- Issue count badge

### Step 5: Frontend — Create IssueDetailPanel Component
- Show full issue details from SonarQube
- Code snippet with line highlighting
- Fix guidance (WHERE, WHY, HOW)

### Step 6: Frontend — Add Button to ProjectReportsPage
- "Developer View" button in left panel actions
- Navigate to `/projects/:id/reports/:scanId/developer`

### Step 7: Register Route
- Add route in App.tsx for DeveloperReportPage

---

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `backend/app/services/reporting/parsers/sonar.py` | Modify | Add `fetch_sonar_measures()` |
| `backend/app/api/reports.py` | Modify | Add developer dashboard endpoint |
| `src/pages/DeveloperReportPage.tsx` | **Create** | New developer-focused page |
| `src/components/reports/FileHealthCard.tsx` | **Create** | File health metrics card |
| `src/components/reports/IssueDetailPanel.tsx` | **Create** | Issue detail with code snippet |
| `src/components/reports/QualityGateCard.tsx` | **Create** | Quality gate status |
| `src/pages/ProjectReportsPage.tsx` | Modify | Add "Developer View" button |
| `src/App.tsx` | Modify | Add route |

---

## Verification

1. `npm run build` — no TypeScript errors
2. `pytest tests/` — backend tests pass
3. Manual testing:
   - Navigate to project reports
   - Click "Developer View" button
   - Verify file health metrics display
   - Click file to see issues
   - Click issue to see detail with code snippet
   - Verify quality gate status shows

---

## Expected Result

```
┌────────────────────────────┬────────────────────────────────┐
│  LEFT PANEL (Fixed)        │  RIGHT PANEL (Scrollable)      │
├────────────────────────────┼────────────────────────────────┤
│  Scan Info                 │  FILE HEALTH                   │
│  - ID, Date, Duration      │  📁 src/components/Layout.tsx │
│                            │  Coverage: 78%                 │
│  Quality Gate: ✅ PASSED   │  Complexity: 15 (high)         │
│                            │  Duplication: 3.2%             │
│  Files with Issues: 8      │                                │
│                            │  ISSUES IN THIS FILE (5)       │
│  Files List                │  🔴 L109 Click handler...      │
│  ┌─────────────────────┐   │  🟠 L45  Missing aria-label   │
│  │ Layout.tsx     5    │   │  🟠 L78  Focus trap...        │
│  │ ScanStatus.tsx 3    │   │                                │
│  │ Modal.tsx       2    │   │  ISSUE DETAIL                 │
│  └─────────────────────┘   │  ┌─────────────────────────┐  │
│                            │  │ Code snippet with line   │  │
│  Actions                   │  │ WHERE: The element...    │  │
│  [← Manager View]          │  │ WHY: Users who...        │  │
│  [Export PDF]              │  │ HOW: Add onKeyDown...    │  │
│                            │  └─────────────────────────┘  │
└────────────────────────────┴────────────────────────────────┘
```
