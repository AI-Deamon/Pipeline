# CONTEXT.md — Agent/

**Last updated**: 2026-06-05
**Location**: `Agent/` at repo root
**Layer**: 2 (Distributed)
**Authoritative**: This file.

## 1. ROOM DEFINITION

**Persona**: Jenkinsfile / Pipeline Engineer.
**Objective**: Define the CI/CD scan pipeline, callback contract, stage ordering. Touch only this folder unless the image needs building.

## 2. LOCAL TOKEN BUDGET

| Task | Load | Skip |
|------|------|------|
| Edit pipeline stages | `Agent/Jenkinsfile`, `Agent/JENKINSFILE_TEST_READY.md` | `src/`, `backend/app/api/auth.py` |
| Add a stage | `Agent/Jenkinsfile`, `backend/app/api/scans.py` (callback contract) | `src/`, `docker/postgres/` |
| Wire a callback | `Agent/Jenkinsfile`, `backend/app/api/scans.py`, `Agent/notes_track` | `src/`, `tests/conftest.py` |
| Pin a tool version | `Agent/Jenkinsfile`, `docker/jenkins/Dockerfile`, `docker/jenkins/plugins.txt` | `src/`, `backend/app/models/` |
| Debug a stage | `Agent/Jenkinsfile`, `backend/app/services/scan_orchestrator.py`, `backend/app/services/jenkins_service.py` | `src/` |
| Track a release | `Agent/notes_track`, `Agent/JENKINSFILE_TEST_READY.md` | `src/`, `specs/` |

## 3. LOCAL MAP

```
Agent/
├── Jenkinsfile                  # The pipeline (54KB, sole artifact)
├── JENKINSFILE_TEST_READY.md    # Test-ready version notes
└── notes_track                  # Release / stage notes
```

**Note**: This folder is a separate Git repo. Treat the Jenkinsfile as the only authoritative file.

## 4. THE PROCESS

1. **Source** — read `Agent/Jenkinsfile`, `docker/jenkins/Dockerfile`, `backend/app/api/scans.py` (callback contract)
2. **Plan** — draft the stage: name, tool, inputs, success criteria, failure handling, callback
3. **Execute** — edit `Jenkinsfile`; update `notes_track` if the release notes change
4. **Refine** — run `JENKINSFILE_TEST_READY.md` checklist; trigger containerized Jenkins via `docker/jenkins/Dockerfile` to dry-run

## 5. WHAT GOOD LOOKS LIKE

- Every stage has name, tool, inputs, success criteria, failure handling, callback. Jenkinsfile passes syntax validation.
- Callback payloads use `stages` key (not `STAGE_RESULTS`). Build logs are actionable — never raw pasted output.
- Each stage traceable to a feature spec. Pin versions only in `docker/jenkins/plugins.txt`.

## 6. CONSTRAINTS

- **Callback key**: Don't use `STAGE_RESULTS` in the callback. Backend expects `stages` (lowercase). Error keys accept both cases.
- **Pin management**: Don't pin a Jenkins plugin version outside `docker/jenkins/plugins.txt`. 133 plugins managed centrally.
- **Callback URL**: Don't change the callback URL without updating `CALLBACK_TOKEN` in backend env. Test env skips; prod must match exactly.
- **SonarScanner**: Don't assume SonarScanner is in the image. It is installed as a Jenkins managed tool via the SonarQube plugin.
- **Docker CLI**: Don't run the docker CLI in the Jenkins container. It is not installed. The Docker plugin uses the bind-mounted socket.
- **SonarQube false PASS**: SonarScanner exits 0 with zero findings when JS/TS/CSS analysis silently fails (Node.js v24 PostCSS crash). Always verify `findings.count > 0`, not just exit code.
- **Pasted logs**: Users paste raw Jenkins console output. Use the Jenkins MCP server to fetch logs directly instead.
- **Repo vs pipeline**: Every build failure triggers confusion — is it the repo code or the pipeline? Triage by checking `Agent/Jenkinsfile` for pipeline issues, then `src/` or `backend/` for repo issues.
- **Half-cooked reports**: Report generation can complete with `0 findings, 0 errors, 0 warnings`. Cross-check tool exit codes + finding counts before declaring success.

## 7. MANDATORY SKILL TRIGGERS

- A new stage is added → trigger `verification-before-completion` (lint + dry-run + callback contract test)
- A pinned version changes (SonarQube, Jenkins, NodeJS) → trigger `dispatching-parallel-agents` to update all references
- A callback payload shape changes → trigger `requesting-code-review` (cross-team contract)
- A Jenkinsfile syntax error blocks CI → trigger `systematic-debugging`

## 8. HARD RULES

- **Thou shalt NOT use `sonar.javascript.skip=true`.** Embedded Node.js v24 crashes PostCSS. Use `nodejs('Nodejs')` + `-Dsonar.nodejs.executable=\$(which node)`.
- **Thou shalt NOT omit `DOCKER_BUILDKIT=1` from `doDockerBuild()`.** Repos with BuildKit-only Dockerfiles fail without it.
