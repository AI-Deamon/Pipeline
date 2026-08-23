# PLAN: SonarQube Security Hotspots Integration (Agent-Actionable)

## Goal
Implement the missing backend fetching, database normalization, and frontend presentation for SonarQube **Security Hotspots** (querying `/api/hotspots/search`) in the Sentinel platform, ensuring users do not need to access the SonarQube server.

## Project Type
- **Type:** WEB & BACKEND
- **Primary Agents:** `backend-specialist` (Python/FastAPI) and `frontend-specialist` (React/TS)

---

## Task Breakdown for AI Agent

### [ ] Task 1: Add `fetch_sonar_hotspots` parser
- **Agent:** `backend-specialist`
- **Skill:** `api-patterns`
- **Target File:** `backend/app/services/reporting/parsers/sonar.py`
- **Action:** Create `fetch_sonar_hotspots(sonar_key: str, sonar_url: str = None) -> tuple[List[SecurityFinding], str]` that fetches hotspots from `/api/hotspots/search` and normalizes them into `SecurityFinding` models with `finding_type="HOTSPOT"`.
- **INPUT:** Project SonarQube key.
- **OUTPUT:** Tuple of normalized `SecurityFinding` instances and the raw HTTP JSON response.
- **VERIFY:** Assert that calling this function returns findings with `finding_type` set to `"HOTSPOT"`.

### [ ] Task 2: Combine Issues and Hotspots in Report Ingestion
- **Agent:** `backend-specialist`
- **Skill:** `python-patterns`
- **Target File:** `backend/app/services/reporting/fetcher.py`
- **Action:** Update the `create_sonar_link` method to call both `fetch_sonar_issues` and the new `fetch_sonar_hotspots` functions, merging their findings lists into one array before calculating the severity summary and saving to `ScanReportDB`.
- **INPUT:** `scan_id`, `project_id`, `sonar_key`.
- **OUTPUT:** Merged findings list saved to the database.
- **VERIFY:** Run `pytest tests/` to confirm that SonarQube report parsing still completes successfully.

### [ ] Task 3: Support Hotspot Severity and Type Serialization
- **Agent:** `backend-specialist`
- **Skill:** `database-design`
- **Target File:** `backend/app/schemas/issue.py`
- **Action:** Ensure the Pydantic schemas (such as `IssueResponse`) allow and serialize `finding_type` as `"HOTSPOT"`.
- **INPUT:** `IssueResponse` schema definition.
- **OUTPUT:** Serialized JSON showing `"finding_type": "HOTSPOT"`.
- **VERIFY:** `GET /api/v1/issues` returns the `finding_type` field with correct values.

### [ ] Task 4: Add Hotspot Badge Visuals in Frontend
- **Agent:** `frontend-specialist`
- **Skill:** `frontend-design`
- **Target File:** `src/components/IssueDetailModal.tsx`
- **Action:** Update `severityToBadgeVariant` to return `'info'` (blue badge) when `finding_type === 'HOTSPOT'`. Display the hotspot status (e.g. TO_REVIEW, REVIEWED) and map it contextually in the layout.
- **INPUT:** `finding_type` and `sonar_status` fields.
- **OUTPUT:** Color-coded badges and icons representing Security Hotspots.
- **VERIFY:** Open the issue modal for a hotspot; verify the type badge is correctly colored.

### [ ] Task 5: Enable Hotspot Filtering in Triage Page
- **Agent:** `frontend-specialist`
- **Skill:** `react-best-practices`
- **Target File:** `src/pages/IssuesTriagePage.tsx`
- **Action:** Add `"HOTSPOT"` to the list of selectable issue types. Update filters to ensure selecting "Hotspots" filters out standard bugs and vulnerabilities.
- **INPUT:** Selector buttons/toggle component.
- **OUTPUT:** Filtered issues grid showing only hotspots.
- **VERIFY:** Select the "Hotspot" filter chip in the triage view and confirm only hotspot items remain.

---

## Phase X: Verification Checklist

### Automated Verifications
- [ ] Run backend tests verifying SonarQube parsing: `pytest tests/`
- [ ] Verify frontend build and typecheck: `npm run build`
- [ ] Run Playwright E2E tests: `npx playwright test`

### Compliance Checklist
- [ ] No purple or violet hex colors are used in new components (Compliance with workspace guidelines).
- [ ] Access controls (RBAC) are verified for all new endpoints.

---
## ✅ PHASE X COMPLETE
- Lint: [ ]
- Security: [ ]
- Build: [ ]
- Date: [Current Date]
