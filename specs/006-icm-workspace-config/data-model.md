# Data Model: ICM Workspace Configuration

## Entity: AGENTS.md (Layer 1 — Global Map)

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| sections | Section[8] | Ordered 8-section benchmark structure | Exactly 8, in prescribed order |
| project_identity | string | "Archer" | Must appear in WHAT THIS IS |
| tone | string | direct, professional, senior engineering partner | No hand-holding, no verbose explanations |

### Sections (AGENTS.md)

| # | Section Name | Format | Required Content |
|---|-------------|--------|-----------------|
| 1 | WHAT THIS IS | Paragraph(s) | Project identity + agent-drop-in philosophy + siloed workspace concept |
| 2 | FOLDER STRUCTURE | Code block (tree) | Root → AGENTS.md → `.ai/CONTEXT-*.md` — physical disk paths with room labels |
| 3 | QUICK NAVIGATION | Markdown table | Intent column → Room/File column. Min 10 rows. Must include Multi-Room category |
| 4 | CROSS-WORKSPACE FLOW | Code block or Mermaid diagram | Planning → Coding → Reviewing with labeled transition criteria. Min 3 transitions |
| 5 | ID & NAMING CONVENTIONS | Markdown table | Pattern + Example + Status columns. Min 4 file types (specs, Python, React, Docker) |
| 6 | FILE PLACEMENT RULES | Bulleted list | Draft → review → final lifecycle. `specs/` = drafts, CONTEXT.md files = final |
| 7 | TOKEN MANAGEMENT | Table + paragraphs | Siloed philosophy. Load vs. Skip table. All existing gotchas as global rules |
| 8 | SKILLS & TOOLS | Markdown table | !command → Room → Step mapping. Verify/test commands included |

## Entity: CONTEXT.md (Layer 2 — Room Manual)

One per room. Three instances: Planning, Coding, Reviewing.

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| room_name | string | Unique room identifier | One of: Planning, Coding, Reviewing |
| sections | Section[6] | Ordered Creation Kit template | Exactly 6, in prescribed order |
| file_location | path | `.ai/CONTEXT-{room_name}.md` | kebab-case filename |

### Sections (CONTEXT.md)

| # | Section Name (Canonical) | Creation Kit Name | Format | Driving Question |
|---|-------------------------|-------------------|--------|-----------------|
| 1 | Room Definition | Soul Check | 1 sentence | "If this room was a physical place, what would it be?" |
| 2 | Token Budget | Noise Filter | Table (Load/Skip) | "What information from other rooms will confuse me?" |
| 3 | Local Map | Blueprint | Directory references | "Where is the Working area and where is the Storage area?" |
| 4 | Process | Conversation | 4-step cycle | Source→Plan→Execute→Refine |
| 5 | Triggers | Magic Buttons | Table (!command → Step) | "Which Elite Shortcuts from Layer 1 apply here?" |
| 6 | Hard Rules | Safety Rail | Bulleted list | "What always goes wrong when I work on this topic?" |

### Room Instances

| Room | Primary Action | Specialist Persona | Key Directories |
|------|---------------|-------------------|-----------------|
| Planning | Defining security rules and stage configurations | Senior Security Architect | `specs/`, `.ai/`, `Agent/Jenkinsfile` |
| Coding | Implementing pipeline automation | Senior DevSecOps Engineer | `backend/app/api/scans/`, `backend/app/services/`, `backend/app/core/` |
| Reviewing | Triaging vulnerability findings | Senior Security Analyst | `backend/app/services/reporting/`, `src/pages/UnifiedReportPage.tsx`, `src/pages/ScanStatusPage.tsx` |

## Relationships

```
AGENTS.md (Layer 1)
  ├── QUICK NAVIGATION ──→ directs agent to ──→ CONTEXT-{room}.md (Layer 2)
  ├── CROSS-WORKSPACE FLOW ──→ shows transitions between rooms
  └── SKILLS & TOOLS ──→ maps !commands to rooms and process steps

CONTEXT-{room}.md (Layer 2)
  ├── Noise Filter ──→ Load/Skip paths (skip paths from OTHER rooms)
  ├── Blueprint ──→ specs/ = drafts, CONTEXT files = final
  ├── Conversation ──→ 4-step Source→Plan→Execute→Refine
  ├── Magic Buttons ──→ references global !commands from AGENTS.md
  └── Safety Rail ──→ anti-patterns sourced from AGENTS.md gotchas
```

## Validation Rules

| Rule | Description |
|------|-------------|
| FR-001 | AGENTS.md has exactly 8 sections in prescribed order |
| FR-002 | Zero data loss from original AGENTS.md + consolidated per-tool configs |
| FR-010 | Each CONTEXT.md has exactly 6 sections in Creation Kit order |
| SC-003 | Noise Filter ≤ 15 load paths, ≥ 10 skip paths per room |
| SC-009 | QUICK NAVIGATION ≥ 10 intent-to-path rows |
| SC-011 | Soul Check follows exact format: "This room is for [action]. Be a [persona]." |
| SC-012 | Magic Buttons ≥ 3 !commands mapped to specific Process steps |
