# CONTEXT.md — tests/

**Last updated**: 2026-06-05
**Location**: `tests/` at repo root
**Layer**: 2 (Distributed)
**Authoritative**: This file.

## 1. ROOM DEFINITION

**Persona**: pytest / Integration Test Engineer.
**Objective**: Cover backend behavior end-to-end. Mock external services. CI must pass before any merge.

## 2. LOCAL TOKEN BUDGET

| Task | Load | Skip |
|------|------|------|
| Run full suite | `tests/`, `conftest.py` | `docker/jenkins/`, `src/` |
| Run one test | `tests/test_<name>.py`, `conftest.py` | `src/`, `docs/` |
| Add a test | `tests/`, target module under `backend/app/` | `src/`, `docker/`, `specs/` |
| Debug a flaky test | `tests/`, `conftest.py`, `backend/app/services/` | `src/`, `Agent/Jenkinsfile` |
| Cross-feature test | `tests/`, `backend/app/`, `Agent/Jenkinsfile` | `src/components/` |

## 3. LOCAL MAP

```
tests/
├── conftest.py             # Adds backend/ to sys.path, sets test env vars
├── README.md
├── test_<module>.py        # Mirrors backend/app/<module>/
└── test_integration.py     # End-to-end (Jenkins callback, scan flow)
```

**Convention**: filename mirrors the module under test (`test_callback_stages.py` ↔ `backend/app/api/scans.py`).

## 4. THE PROCESS

1. **Source** — read the module under test + `conftest.py` fixtures
2. **Plan** — list mocks (Jenkins, SonarQube, Redis), list env-var overrides
3. **Execute** — write `test_<name>.py`, register fixtures in `conftest.py` if reusable
4. **Refine** — `pytest tests/<file>.py -v`; full suite `pytest tests/`; verify no postgres side effects

## 5. WHAT GOOD LOOKS LIKE

- Every endpoint has at least one success + one failure test. All external services mocked (Jenkins, SonarQube, Redis).
- Tests leave no side effects after teardown. Run without real containers or network access.
- Backend: `fastapi.testclient.TestClient`. Frontend: Vitest + jsdom.

## 6. CONSTRAINTS

- **Real services**: Don't call real external services. The CI has no real services — everything must be mocked.
- **Test env gotchas**: Don't skip `CALLBACK_TOKEN` validation in test env. Test env auto-skips; the test must still cover the prod path.
- **Side effects**: Don't mutate real scan state. DB constraint `ix_scans_project_state` blocks new scans. Tests use isolated fixtures.
- **Path setup**: Don't add `tests/` to the Python import path manually. `conftest.py` already does it.
- **Verbose**: Don't skip `pytest -v` before claiming done. Verbose mode surfaces collection errors.

## 7. MANDATORY SKILL TRIGGERS

- A test fails → trigger `systematic-debugging` (state hypothesis before editing test or code)
- A new feature is complete → trigger `test-driven-development` (write the failing test first)
- Two tests are redundant → trigger `dispatching-parallel-agents` to consolidate
- A test needs a real external service → trigger `verification-before-completion` (mock first)
- Coverage gap suspected → trigger `requesting-code-review`

## 8. HARD RULES

- **Thou shalt NOT call a real external service.** Mock Jenkins, SonarQube, Redis, Docker. The CI has no real services.
- **Thou shalt NOT use `test.db` outside the pytest run.** It is the test sqlite; production uses Postgres via Docker.
