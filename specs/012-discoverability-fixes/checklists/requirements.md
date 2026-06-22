# Requirements Checklist: Discoverability & Navigation Fixes

**Spec**: `spec.md`
**Last updated**: 2026-06-16 (refinement pass)

## Spec quality

- [x] All 4 required components present (name, scope, success criteria, dependencies)
- [x] No `[NEEDS CLARIFICATION]` markers
- [x] User stories follow the format: "As a [role], I want [action], so that [outcome]"
- [x] Each user story has priority and independent test
- [x] FRs cite file:line where they touch
- [x] Success criteria are measurable (specific click counts, file paths)

## Plan quality

- [x] File-by-file change list with file:line
- [x] Component sketches for new components
- [x] Integration order with dependency graph
- [x] Risks table with mitigations (15 risks identified, all mitigated)
- [x] Out-of-scope section explicit
- [x] Verification commands

## Tasks quality

- [x] 37 tasks across 6 phases
- [x] Each task has ID, file(s), effort estimate, blocked-by
- [x] Critical path identified
- [x] Effort summary table
- [x] Tasks map directly to spec FRs (FR1-FR10 all covered)

## Cross-artifact consistency

- [x] spec.md FRs match tasks.md tasks (FR1-FR10 all referenced)
- [x] data-model.md route map matches App.tsx
- [x] data-model.md RBAC matrix includes all 8 actions
- [x] contracts/api.md references match backend file:line
- [x] research.md decisions match spec.md clarifications
- [x] plan.md file list matches tasks.md
- [x] quickstart.md test paths match SC1-SC9

## Constitutional compliance

- [x] P1 Security: No secrets introduced; no new API keys
- [x] P2 RBAC: All new UI surfaces gated by `useRbac()` (new `canViewProjectGroups`, `canUpdateProject` flags)
- [x] P3 300-line limit: All new files planned to stay under 300 lines (`IssuesTriagePage` target ~250 with all filters)
- [x] P4 Tests: New tests planned for every new component (T24-T31, 8 new/updated tests)
- [x] P5 A11y: `aria-label` on icon buttons, keyboard handlers on clickable cards, Escape key on modals
- [x] P6 Observability: No new metrics (out of scope)

## Pre-implementation gate

- [x] No backend schema changes (zero migration risk)
- [x] No new backend endpoints
- [x] All reused endpoints already exist
- [x] RBAC behavior matches spec 005
- [x] New page (`IssuesTriagePage`) follows existing patterns (grouped cards, RBAC guard, status filter)
- [x] Existing test impact identified (3 tests need updates: Layout, MyIssuesPage, FindingDetailModal)
- [x] Composite key strategy documented (`finding.id + ':' + scan_id` for `issue_id`)
- [x] 5-page lookup cap documented (catches 95% of real cases, prevents runaway loops)
- [x] In-page redirect documented for developers hitting `/issues` directly

## Gap-review resolution

- [x] GAP-1 (ProjectEditPage): addressed via T04 (Edit icon in active-project block)
- [x] GAP-2 (Groups RBAC): addressed via T01 (new `canViewProjectGroups` flag)
- [x] GAP-3 (no `finding_key`): addressed via Decision 6 (use `finding.id` for lookup)
- [x] GAP-4 (no `project_id` on Finding): addressed via T19 (add `projectId` prop)
- [x] GAP-5 (composite `issue_id`): addressed via Decision 6
- [x] GAP-6 (50+ projects): addressed via Decision 9 (hard cap at 10)
- [x] GAP-7 (no route guard): addressed via Decision 8 (in-page `<Navigate>`)
- [x] GAP-8 (breadcrumb path index): addressed via T06 (corrected to `pathnames[3]`)
- [x] GAP-9 (triage details): addressed via Decision 11 (sort, filter, refetch)
- [x] GAP-10 (user picker): addressed via T15-T17 (FR9)
- [x] GAP-11 (post-success behavior): addressed via T20-T21 (close modal, navigate, toast)
- [x] GAP-12 (T20 wording): addressed — T24 now reads "NEW FILE Layout.test.tsx"
- [x] GAP-13 (FindingDetailModal test): addressed via T30 (mock `useAuth`)
- [x] GAP-14 (MyIssuesPage test): addressed via T14 (mock `IssueDetailModal`)
- [x] GAP-15 (icon duplication): deferred to spec 013
- [x] GAP-16 (breadcrumb for filters): confirmed no change needed
- [x] GAP-17 (error toast): addressed via T21
- [x] GAP-18 (FR8 missing): addressed — FR8 added
- [x] GAP-19 (page 1 only): addressed via Decision 12 (5-page loop)
- [x] GAP-20 (snake_case tool name): addressed via Decision 15 (`STAGE_DISPLAY_NAMES`)

## Approval

- [x] User approved scope: Tier 1 + Tier 2
- [x] User approved nav location: Top-level sidebar
- [x] User approved process: Speckit workflow (spec → plan → tasks → implement)
- [x] User approved all 8 gap-review clarifications
- [x] User approved 8 follow-up decisions (Q9-Q15)

## Ready to implement

All checks pass. Proceed with `tasks.md` Phase 1 (T01-T07).
