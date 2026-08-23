# Plan: Reports Per Project — Redesign

## Objective
Redesign the per-project per-scan report to be cleaner, less scrolling, and friendly for both managers and developers.

## Current Problems

| Problem | Description |
|---------|-------------|
| Long scrolling | Page is ~2000px+ tall, hard to navigate |
| Filter bug | When filter selected, white cover with no text |
| Tools view clumsy | Accordion with 8+ elements per row |
| Not focused | Manager and dev have different needs |

## Proposed Solution

### 1. Layout: Side Panel

**Left Panel (Fixed, ~320px)**:
- Scan info (ID, date, duration, mode)
- Severity summary (compact list)
- Tools (compact cards)
- Quick actions (Export, View Unified, View Issues)

**Right Panel (Scrollable)**:
- Findings table with filters
- Grouped by finding type

### 2. Tools View: Compact Cards

**Current** (accordion, 8 elements/row):
```
SonarQube | SAST | icon | status | 5 pills | link | count | chevron
```

**Proposed** (compact card, 3 elements):
```
┌─────────────────────┐
│ ✅ SonarQube   45   │
│ [View in SonarQube] │
└─────────────────────┘
```

### 3. Fix Filter Bug

Investigate and fix CSS issue where filter selection shows white cover with no text.

### 4. Findings Table: Grouped by Type

**Current**: Flat table or grouped by rule
**Proposed**: Grouped by finding type first

```
▼ Vulnerabilities (12)
  ├── SQL injection in db.ts:45 [Critical] @sonar
  ├── XSS in login.ts:89 [High] @zap
  └── ... (10 more)

▼ Bugs (8)
  └── ...

▼ Code Smells (28)
  └── ...
```

---

## Implementation Steps

### Step 1: Create New Layout Component
- Create `ProjectReportLayout.tsx` with side panel structure
- Left panel: fixed width, contains scan info, severity, tools, actions
- Right panel: scrollable, contains findings table

### Step 2: Refactor ToolsTable to CompactCards
- Replace accordion with compact card grid
- Each card shows: status icon, tool name, finding count
- Click card to expand details (optional)

### Step 3: Fix Filter Bug
- Investigate CSS issue in FindingsTable filter buttons
- Fix active state styling

### Step 4: Refactor FindingsTable
- Group by finding_type first (Vulnerability, Bug, Code Smell)
- Then by rule within each type
- Add collapsible sections

### Step 5: Update ProjectReportsPage
- Use new layout component
- Pass data to side panel and findings table
- Remove old stacked layout

### Step 6: Test and Verify
- Run `npm run build` — no TypeScript errors
- Manual testing:
  - Navigate to project reports
  - Verify side panel layout
  - Test filters work correctly
  - Verify tools cards display properly
  - Check findings grouping

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `src/pages/ProjectReportsPage.tsx` | Modify | Use new layout, remove old sections |
| `src/components/reports/ProjectReportLayout.tsx` | Create | New side panel layout |
| `src/components/reports/ToolsTable.tsx` | Modify | Replace accordion with compact cards |
| `src/components/reports/FindingsTable.tsx` | Modify | Fix filter bug, group by type |

---

## Verification

1. `npm run build` — no TypeScript errors
2. `npm run lint` — no lint errors
3. Manual testing:
   - Navigate to `/projects/:id/reports`
   - Verify side panel shows scan info, severity, tools
   - Verify findings table is scrollable
   - Test severity filter works
   - Test tool filter works
   - Test search works
   - Verify Export PDF works
   - Verify View Unified Report link works

---

## Expected Result

```
┌────────────────────────────┬────────────────────────────────┐
│  LEFT PANEL (Fixed)        │  RIGHT PANEL (Scrollable)      │
├────────────────────────────┼────────────────────────────────┤
│  Scan Info                 │  Findings Table                │
│  - ID, Date, Duration      │  - Filters (working)           │
│                            │  - Grouped by type             │
│  Severity Summary          │                                │
│  - Critical: 3             │  ▼ Vulnerabilities (12)        │
│  - High: 12                │    ├── SQL injection...        │
│  - Medium: 28              │    └── XSS in login...        │
│  - Low: 15                 │  ▼ Bugs (8)                    │
│  - Info: 5                 │    └── ...                      │
│                            │  ▼ Code Smells (28)            │
│  Tools (compact cards)     │    └── ...                      │
│  ┌─────────────────────┐   │                                │
│  │ ✅ SonarQube   45   │   │                                │
│  │ ✅ Trivy FS    25   │   │                                │
│  │ ⚠️ ZAP         12   │   │                                │
│  └─────────────────────┘   │                                │
│                            │                                │
│  Actions                   │                                │
│  [Export PDF]              │                                │
│  [View Unified]            │                                │
└────────────────────────────┴────────────────────────────────┘
```
