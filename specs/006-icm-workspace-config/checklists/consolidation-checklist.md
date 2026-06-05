# Per-Tool AI Config Consolidation Checklist

**Purpose**: Catalog every distinct unit of content in per-tool AI config directories (`.opencode/`, `.claude/`, `.kilo/`, `.qwen/`, `.agents/`) so relevant content is consolidated into `AGENTS.md` and `.ai/CONTEXT-*.md` before the source directories are deleted.
**Verification**: Side-by-side review (T042) before deletion (T043).

---

## A. `.opencode/`

### `.opencode/commands/` (14 slash-command files)

| # | File | Purpose (inferred from filename) |
|---|------|----------------------------------|
| 1 | `speckit.analyze.md` | Speckit `/analyze` workflow |
| 2 | `speckit.checklist.md` | Speckit `/checklist` workflow |
| 3 | `speckit.clarify.md` | Speckit `/clarify` workflow |
| 4 | `speckit.constitution.md` | Speckit `/constitution` workflow |
| 5 | `speckit.git.commit.md` | Speckit `/git.commit` workflow |
| 6 | `speckit.git.feature.md` | Speckit `/git.feature` workflow |
| 7 | `speckit.git.initialize.md` | Speckit `/git.initialize` workflow |
| 8 | `speckit.git.remote.md` | Speckit `/git.remote` workflow |
| 9 | `speckit.git.validate.md` | Speckit `/git.validate` workflow |
| 10 | `speckit.implement.md` | Speckit `/implement` workflow |
| 11 | `speckit.plan.md` | Speckit `/plan` workflow |
| 12 | `speckit.specify.md` | Speckit `/specify` workflow |
| 13 | `speckit.tasks.md` | Speckit `/tasks` workflow |
| 14 | `speckit.taskstoissues.md` | Speckit `/taskstoissues` workflow |

**Action**: 14 speckit commands → mention in `AGENTS.md` `## SKILLS & TOOLS` table (T041). Do not duplicate command bodies.

### `.opencode/.gitignore` (5 lines)

```
node_modules
package.json
package-lock.json
bun.lock
.gitignore
```

**Action**: Not relevant — local tool artifact. Drop.

### `.opencode/node_modules/`, `package.json`, `package-lock.json`

**Action**: Not content — tool install artifacts. Drop.

---

## B. `.claude/`

### `.claude/skills/` (6 skill directories)

| # | Skill | Purpose (inferred from filename) |
|---|-------|----------------------------------|
| 1 | `speckit-git-commit` | Git commit workflow |
| 2 | `speckit-git-feature` | Git feature branch workflow |
| 3 | `speckit-git-initialize` | Git init workflow |
| 4 | `speckit-git-remote` | Git remote detection |
| 5 | `speckit-git-validate` | Git branch validation |
| 6 | `superdesign` | UI design skill |

**Action**: 5 git-related skills + `superdesign` (UI design). Cross-reference with `.agents/skills/` (next section) — overlap. Consolidate names only into `AGENTS.md` `## SKILLS & TOOLS` table (T041). Drop redundant descriptions.

---

## C. `.kilo/`

### `.kilo/agent-manager.json` (9 lines)

```json
{
  "worktrees": {},
  "sessions": {},
  "tabOrder": {
    "local": [
      "pending:1"
    ]
  }
}
```

**Action**: Tool runtime state — not content. Drop.

### `.kilo/plans/` (5 plan files)

| # | File | Notes |
|---|------|-------|
| 1 | `1777270555871-cosmic-squid.md` | Historical plan artifact (timestamp 1777270555871) |
| 2 | `1777446772579-sunny-cactus.md` | Historical plan artifact |
| 3 | `1777547346184-crisp-tiger.md` | Historical plan artifact |
| 4 | `1777581000000-proper-report-system.md` | Historical plan artifact — possible `proper-report-system` reference |
| 5 | `1778495218207-gentle-tiger.md` | Historical plan artifact |

**Action**: Historical artifacts only — not authoritative content. Drop. If a `proper-report-system` exists in current specs, it has its own folder.

### `.kilo/.gitignore` (7 lines)

```
node_modules
package.json
package-lock.json
pnpm-lock.yaml
bun.lock
yarn.lock
.gitignore
```

**Action**: Not content. Drop.

### `.kilo/node_modules/`, `package.json`, `package-lock.json`

**Action**: Not content. Drop.

---

## D. `.qwen/`

### `.qwen/settings.json` (8 lines)

```json
{
  "permissions": {
    "allow": [
      "Bash(mkdir *)"
    ]
  },
  "$version": 3
}
```

**Action**: Permission config — not content. Drop. Note: `mkdir` allow rule is auto-default in other tools.

### `.qwen/settings.json.orig` (7 lines)

```json
{
  "permissions": {
    "allow": [
      "Bash(mkdir *)"
    ]
  }
}
```

**Action**: Backup of original settings. Drop.

---

## E. `.agents/`

### `.agents/skills/` (9 skill directories)

| # | Skill | Purpose (inferred from filename) |
|---|-------|----------------------------------|
| 1 | `speckit-analyze` | Speckit `/analyze` workflow |
| 2 | `speckit-checklist` | Speckit `/checklist` workflow |
| 3 | `speckit-clarify` | Speckit `/clarify` workflow |
| 4 | `speckit-constitution` | Speckit `/constitution` workflow |
| 5 | `speckit-implement` | Speckit `/implement` workflow |
| 6 | `speckit-plan` | Speckit `/plan` workflow |
| 7 | `speckit-specify` | Speckit `/specify` workflow |
| 8 | `speckit-tasks` | Speckit `/tasks` workflow |
| 9 | `speckit-taskstoissues` | Speckit `/taskstoissues` workflow |

**Action**: 9 speckit workflow skills. Cross-reference with `.opencode/commands/` (A) — same set, different format. Consolidate names into `AGENTS.md` `## SKILLS & TOOLS` table (T041). Drop redundant descriptions.

---

## F. Cross-Directory Overlap Matrix

| Skill/Command | `.opencode/commands/` | `.claude/skills/` | `.agents/skills/` |
|---------------|----------------------|-------------------|-------------------|
| speckit.analyze | ✓ | — | ✓ (`speckit-analyze`) |
| speckit.checklist | ✓ | — | ✓ (`speckit-checklist`) |
| speckit.clarify | ✓ | — | ✓ (`speckit-clarify`) |
| speckit.constitution | ✓ | — | ✓ (`speckit-constitution`) |
| speckit.implement | ✓ | — | ✓ (`speckit-implement`) |
| speckit.plan | ✓ | — | ✓ (`speckit-plan`) |
| speckit.specify | ✓ | — | ✓ (`speckit-specify`) |
| speckit.tasks | ✓ | — | ✓ (`speckit-tasks`) |
| speckit.taskstoissues | ✓ | — | ✓ (`speckit-taskstoissues`) |
| speckit.git.commit | ✓ | ✓ (`speckit-git-commit`) | — |
| speckit.git.feature | ✓ | ✓ (`speckit-git-feature`) | — |
| speckit.git.initialize | ✓ | ✓ (`speckit-git-initialize`) | — |
| speckit.git.remote | ✓ | ✓ (`speckit-git-remote`) | — |
| speckit.git.validate | ✓ | ✓ (`speckit-git-validate`) | — |
| superdesign | — | ✓ | — |

**Conclusion**: 20 unique speckit commands/skills + `superdesign` UI skill. The same 9 speckit workflows are duplicated across `.opencode/commands/` and `.agents/skills/`. The 5 speckit-git-* workflows are duplicated across `.opencode/commands/` and `.claude/skills/`. After consolidation, all 20+1 names go in `AGENTS.md` `## SKILLS & TOOLS` once.

---

## Summary Counts

- **`.opencode/commands/`**: 14 speckit commands
- **`.claude/skills/`**: 6 skills (5 git + superdesign)
- **`.kilo/`**: 0 content (tool state only)
- **`.qwen/`**: 0 content (permission config only)
- **`.agents/skills/`**: 9 speckit skills
- **Total unique skills/commands**: 20 speckit + 1 superdesign = 21
- **Config files to drop**: 4 (`.opencode/.gitignore`, `.kilo/agent-manager.json`, `.kilo/.gitignore`, `.qwen/settings.json`, `.qwen/settings.json.orig`)

## Consolidation Procedure (T042)

1. Build the `## SKILLS & TOOLS` table in `AGENTS.md` with all 21 unique skills/commands.
2. For each row, map to the appropriate room (Planning / Coding / Reviewing) and stage (Source / Plan / Execute / Refine).
3. Verify against section F overlap matrix — no duplicates.
4. Mark this checklist `[✓]` row by row.

## Deletion Procedure (T043)

After T042 is complete and verified:

```bash
rm -rf /home/kali_linux/Agent-bfd7ff/.opencode
rm -rf /home/kali_linux/Agent-bfd7ff/.claude
rm -rf /home/kali_linux/Agent-bfd7ff/.kilo
rm -rf /home/kali_linux/Agent-bfd7ff/.qwen
rm -rf /home/kali_linux/Agent-bfd7ff/.agents
```

Verify with: `ls -la /home/kali_linux/Agent-bfd7ff/ | grep -E '\.(opencode|claude|kilo|qwen|agents)$'` returns nothing.
