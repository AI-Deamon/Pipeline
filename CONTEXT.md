# CONTEXT.md

## 1. THE GATEKEEPER

Archer is siloed by work folder. The agent drops into the room that matches the user's intent and executes — no project archaeology, no library lookups, no manual cross-referencing.

## 2. INTENT ROUTING TABLE

| User Intent | Target Room | Target Context File |
|-------------|-------------|---------------------|
| Write spec, plan, or tasks | Planning | `specs/CONTEXT.md` |
| Implement backend code | Coding | `backend/CONTEXT.md` |
| Implement frontend code | Coding | `src/CONTEXT.md` |
| Add or run pytest | Coding | `tests/CONTEXT.md` |
| Edit the Jenkinsfile/pipeline | Coding | `Agent/CONTEXT.md` |
| Edit compose/infrastructure | Coding | `docker/CONTEXT.md` |
| Build the Jenkins image | Coding | `docker/jenkins/CONTEXT.md` |
| Configure the Postgres image | Coding | `docker/postgres/CONTEXT.md` |
| Read reference documentation | Reference | `docs/CONTEXT.md` |

## 3. THE SILO POLICY

NEVER load data from Room A while working in Room B unless the user explicitly requests it. `AGENTS.md` is the only always-loaded file (the static map). Each room's `CONTEXT.md` defines what to load and what to skip.

## 4. THE FIRST MOVE (SOP)

1. **Identify intent** — map the user's request to the Routing Table above
2. **Teleport** — read only the target room's `CONTEXT.md`
3. **Execute** — follow that room's Process; use its Hard Rules as guardrails
