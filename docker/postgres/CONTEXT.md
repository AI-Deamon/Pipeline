# CONTEXT.md — docker/postgres/

**Last updated**: 2026-06-05
**Location**: `docker/postgres/` at repo root
**Layer**: 2 (Distributed)
**Authoritative**: This file.

## 1. ROOM DEFINITION

**Persona**: Postgres Container Engineer.
**Objective**: Configure the Postgres image used by the dev/test/staging overlays. Init scripts, schemas, data persistence.

## 2. LOCAL TOKEN BUDGET

| Task | Load | Skip |
|------|------|------|
| Add an init script | `docker/postgres/initdb.d/`, `docker/postgres/Dockerfile` | `src/`, `backend/app/api/` |
| Change Postgres version | `docker/postgres/Dockerfile`, `docker/docker-compose*.yml` | `src/`, `Agent/Jenkinsfile` |
| Configure extensions | `docker/postgres/initdb.d/`, `docker/postgres/Dockerfile` | `src/`, `specs/` |
| Wire healthcheck | `docker/postgres/Dockerfile`, `docker/docker-compose*.yml` | `src/`, `Agent/Jenkinsfile` |
| Persist data | `docker/postgres/`, `docker/docker-compose*.yml` volumes | `src/`, `backend/app/` |
| Reset state | `docker/postgres/`, `docker/docker-compose*.yml` | `src/`, `specs/` |

## 3. LOCAL MAP

```
docker/postgres/
├── Dockerfile                  # Postgres base image + extensions + init scripts
├── postgresql.conf             # Optional custom config
├── pg_hba.conf                 # Optional auth config
└── initdb.d/                   # SQL init scripts run on first start
    └── 001_init.sql
```

**Note**: `initdb.d/` runs only on the first start of a fresh data volume. Re-running requires `docker compose down --volumes` (which destroys data).

## 4. THE PROCESS

1. **Source** — read `Dockerfile`, `initdb.d/`, `docker-compose*.yml`
2. **Plan** — decide init script vs. SQLAlchemy migration; decide volume strategy
3. **Execute** — edit `Dockerfile` / `initdb.d/*.sql`; add a migration under `backend/app/models/` if schema change
4. **Refine** — `docker compose -f ... -f ...<env>.yml up -d --no-deps postgres`; check `pg_isready`; verify backend healthcheck

## 5. WHAT GOOD LOOKS LIKE

- Postgres version pinned and checked against SQLAlchemy compatibility. Init scripts ordered with `NNN_` prefix.
- Migration history in SQLAlchemy (not `initdb.d/`). Healthcheck (`pg_isready`) verified before backend depends on it.
- Init scripts idempotent or documented as one-shot. Data preserved unless `--volumes` explicitly used.

## 6. CONSTRAINTS

- **Data safety**: Don't run `python run.py down` to reset Postgres data. It destroys all data. Use `down` without `--volumes`.
- **Init script lifecycle**: Don't assume init scripts re-run on restart. They run only on first start of a fresh volume.
- **Version compatibility**: Don't pin a Postgres version without checking SQLAlchemy compatibility. Backend models depend on it.
- **Healthcheck**: Don't bypass the healthcheck. Backend depends on a healthy DB. 2-3 min startup time.
- **Migration history**: Don't store migration history in `initdb.d/`. It belongs in `backend/app/models/`.
- **Init order**: Don't skip the `initdb.d/` order check. Files run alphabetically; prefix with `NNN_` to control order.

## 7. MANDATORY SKILL TRIGGERS

- An init script fails → trigger `systematic-debugging` (check initdb.d order, encoding, role)
- A schema change is needed → trigger `dispatching-parallel-agents` (SQLAlchemy migration + init script)
- A Postgres version is upgraded → trigger `verification-before-completion` (destructive: backup first)
- A healthcheck fails → trigger `verification-before-completion` (check `pg_isready`, network, credentials)

## 8. HARD RULES

- **Thou shalt NOT run `python run.py down` to reset Postgres data.** It runs `docker compose down --volumes` and destroys all data (scans, reports, projects). Use `down` without `--volumes` or restart.
- **Thou shalt NOT use `localhost` for service-to-service Postgres calls with `network_mode: host`.** Use `localhost` (host networking makes host services available).
- **Thou shalt NOT skip the `initdb.d/` order check.** Files run alphabetically; prefix with `NNN_` to control order.
