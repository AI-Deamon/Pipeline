# CONTEXT.md — docs/

**Last updated**: 2026-06-10
**Location**: `docs/` at repo root
**Layer**: 2 (Distributed)

## 1. Room Definition

**Persona**: Technical Writer / Solutions Architect
**Objective**: Maintain architectural documentation, API references, flow diagrams, deployment plans, and troubleshooting guides. No code in this folder.

## 2. Token Budget

| Task | Load | Skip |
|------|------|------|
| Read architecture overview | `docs/architecture-overview.md`, `docs/FINALIZED_ARCHITECTURE.md` | `src/`, `backend/`, `docker/` |
| Update API reference | `docs/api/`, `backend/app/api/`, `backend/app/schemas/` | `src/`, `docker/` |
| Document a flow | `docs/flows/`, relevant page in `src/pages/`, relevant service in `backend/app/services/` | `docker/`, `Agent/` |
| Write a deployment plan | `docs/plans/`, `docker/docker-compose*.yml`, `Agent/Jenkinsfile` | `src/`, `backend/app/` |
| Update troubleshooting guide | `docs/TROUBLESHOOTING_AND_KNOWN_ISSUES.md`, `docker/`, `backend/app/` | `src/`, `specs/` |
| Review CI/CD docs | `docs/CI_CD_PIPELINE.md`, `docs/jenkins_pipeline_architecture.md`, `Agent/Jenkinsfile` | `src/`, `backend/app/` |

## 3. Local Map

```
docs/
├── architecture-overview.md          # High-level architecture
├── FINALIZED_ARCHITECTURE.md         # Approved architecture decisions
├── FRONTEND_ARCHITECTURE.md          # Frontend-specific architecture
├── SYSTEM_DESIGN.md                  # System design document
├── INFRASTRUCTURE_DIAGRAM.md         # Infrastructure layout
├── api/                              # API reference docs
│   └── request-response-reference.md
├── flows/                            # User/system flow documentation
│   ├── authentication-flow.md
│   ├── automated-scan-flow.md
│   ├── manual-scan-flow.md
│   ├── project-creation-flow.md
│   ├── scan-history-flow.md
│   └── scan-termination-flows.md
├── plans/                            # Implementation/design plans
│   ├── 2026-03-17-code-review-fixes.md
│   ├── 2026-05-20-scan-state-fix-design.md
│   └── ... (date-prefixed plan files)
├── docker/                           # Docker-specific docs
│   └── containerization-issues.md
├── CI_CD_PIPELINE.md                 # CI/CD pipeline documentation
├── jenkins_payload_contract.md       # Jenkins callback contract
├── jenkins_pipeline_architecture.md  # Jenkins pipeline design
├── TROUBLESHOOTING_AND_KNOWN_ISSUES.md # Known issues + fixes
├── DEPLOYMENT_PLAN.md                # Deployment procedures
├── SECRETS_POLICY.md                 # Secrets management policy
├── RELIABILITY_POLICY.md             # Reliability standards
└── ... (other reference docs)
```

## 4. The Process

1. **Source** — read the relevant doc file + the source code it documents (if updating)
2. **Plan** — identify the audience (developer, operator, architect); decide the scope
3. **Execute** — write or update the doc; cross-reference related docs; update diagrams if needed
4. **Refine** — verify all code references still exist; check links; ensure consistency with `AGENTS.md` gotchas

## 5. What Good Looks Like

- Every flow doc has a clear trigger, steps, and expected outcome. Diagrams use Mermaid or ASCII.
- API docs match the actual Pydantic schemas in `backend/app/schemas/`. No stale endpoints.
- Troubleshooting entries have: symptom, cause, fix, verification command.
- Plans have: goal, approach, risks, rollback strategy.

## 6. Constraints

- **No code in docs**: Docs reference code, they don't contain it. Code belongs in `src/` or `backend/`.
- **Cross-reference AGENTS.md**: Gotchas in `AGENTS.md` are authoritative. Don't duplicate them here — link instead.
- **Date-prefix plans**: New plan files use `YYYY-MM-DD-<topic>.md` format for chronological ordering.
- **Stale doc risk**: If a doc references a file path that no longer exists, update or remove the reference.

## 7. Hard Rules

- **Thou shalt NOT duplicate gotchas from `AGENTS.md`.** Link to them instead. Duplication causes drift when one is updated and the other isn't.

- **Thou shalt NOT leave broken file references.** If a doc references `backend/app/api/scans.py` but it's now `backend/app/api/scans/routes.py`, update the reference. Broken references waste debugging time.
