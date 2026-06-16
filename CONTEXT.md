# CONTEXT.md

## The Silo Rule

Sentinel is siloed by work type. Drop into the correct room, read its CONTEXT.md, execute — never load files from a different room unless the task explicitly crosses a boundary.

`AGENTS.md` is the only always-loaded file. Each room's `CONTEXT.md` defines its own load/skip budget.

## Intent Routing

| If the user wants to... | Go to | Read |
|-------------------------|-------|------|
| Add or fix a backend API endpoint | `backend/` | CONTEXT.md |
| Wire a Celery task or fix a parser | `backend/` | CONTEXT.md |
| Fix a UI bug or add a React component | `src/` | CONTEXT.md |
| Write or fix a backend pytest test | `tests/` | CONTEXT.md |
| Write or fix a frontend Vitest test | `src/tests/` | CONTEXT.md |
| Edit docker-compose, Dockerfiles, or infra | `docker/` | CONTEXT.md |
| Edit Jenkinsfile or pipeline stages | `Agent/` | CONTEXT.md |
| Write a feature spec or implementation plan | `specs/` | CONTEXT.md |
| Read or edit API/Docker/flow documentation | `docs/` | CONTEXT.md |

## First Move (SOP)

1. Identify intent — match to the routing table above
2. Teleport — read only the target room's CONTEXT.md
3. Execute — follow that room's process and hard rules
4. Never load Room A files while working in Room B
