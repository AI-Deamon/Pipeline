# Research: SonarQube Docker Container

**Date**: 2026-05-26
**Branch**: `002-sonarqube-docker`

## Research Tasks

### R1: SonarQube Image Selection

**Decision**: Use `sonarqube:lts-community` Docker image.

**Rationale**: The `lts-community` tag auto-picks the latest LTS Community Edition, which is free, stable, and well-supported. The LTS track provides predictable upgrade paths and security patches without forcing major version upgrades.

**Alternatives considered**:
- `sonarqube:latest` (Developer Edition): Rejected — requires commercial license; unnecessary features for this use case.
- `sonarqube:9.9-community` (pinned version): Rejected — LTS tag provides automatic security patches while remaining in the LTS track.
- Host installation (current): Rejected — user explicitly wants containerization.

### R2: PostgreSQL Database Initialization

**Decision**: Create a dedicated `sonarqube` database and user via PostgreSQL init script at `docker/postgres/init/02-create-sonarqube-db.sql`.

**Rationale**: PostgreSQL's `/docker-entrypoint-initdb.d/` runs `.sql` files on first database initialization. The existing project already uses this pattern implicitly — adding a new script is consistent. A dedicated database keeps SonarQube data separate from application data while sharing the same PostgreSQL instance.

**Alternatives considered**:
- SonarQube embedded H2 database: Rejected — data loss on restart, not suitable for staging.
- Separate PostgreSQL container for SonarQube: Rejected — unnecessary resource overhead; sharing is simpler and matches Q2=B (user choice).
- Manual database creation: Rejected — automation is required for reproducible deployments.

### R3: Network Mode

**Decision**: Use `network_mode: host` (matching all other services).

**Rationale**: All existing services (`backend`, `frontend`, `celery_worker`, `postgres`, `redis`) use `network_mode: host`. SonarQube must be reachable at `localhost:9000` for:
- Jenkins `withSonarQubeEnv('sonar-server')` which connects to the configured URL (default `localhost:9000`)
- Backend `fetch_sonar_issues()` which connects to `localhost:9000`
- Operator browser access to check scan results

Host networking avoids port mapping complexity and is consistent with the rest of the stack.

**Alternatives considered**:
- Bridge network with port mapping (`9000:9000`): Rejected — inconsistent with existing services; other containers resolve localhost differently.
- Dedicated Docker network for SonarQube: Rejected — adds complexity with no benefit for single-host deployment.

### R4: Volume Persistence Strategy

**Decision**: Use three named volumes for SonarQube persistence: `sonarqube_data`, `sonarqube_extensions`, `sonarqube_logs`.

**Rationale**: SonarQube images expect these three mount points:
- `/opt/sonarqube/data` — Elasticsearch indices, project data, H2 (if used)
- `/opt/sonarqube/extensions` — Installed plugins
- `/opt/sonarqube/logs` — Server logs

Named volumes (vs bind mounts) are simpler, Docker-managed, and avoid permission issues with the SonarQube container user.

**Alternatives considered**:
- Bind mounts to `./storage/sonarqube/`: Rejected — permission issues with SonarQube's internal user (UID 1000).
- Single volume for all data: Rejected — SonarQube upstream recommendation is three separate volumes.
- No volumes (ephemeral): Rejected — data loss on restart violates FR-004.

### R5: Health Check Strategy

**Decision**: Use the built-in SonarQube health endpoint via `curl` against the SQ API.

**Rationale**: SonarQube provides `GET /api/system/health` returning `{"health": "GREEN"}` when fully operational. However, the container status API (`/api/system/status`) is available earlier and sufficient for a Docker health check. We use `curl -f http://localhost:9000/api/system/status`.

**Alternatives considered**:
- TCP port check only: Rejected — port open doesn't mean SonarQube is ready (Elasticsearch init can take minutes).
- No health check: Rejected — upstream/depends_on requires health check for proper ordering.

### R6: Elasticsearch Bootstrap Checks

**Decision**: Set `SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true` environment variable.

**Rationale**: SonarQube's embedded Elasticsearch performs bootstrap checks that fail in container environments (insufficient `vm.max_map_count`, file descriptor limits). Disabling these checks is the documented approach for Docker deployments. This is acceptable for a development/staging environment.

**Alternatives considered**:
- Configure host kernel parameters (`vm.max_map_count=262144`): Rejected — requires host-level change that contradicts the goal of self-contained containers.
- Use a custom Elasticsearch config file: Rejected — over-engineered for this use case; the env var approach is simpler.

### R7: Environment Variable Configuration

**Decision**: Add SonarQube configuration to both `.env.staging` and `config/.env.dev`, with per-environment overrides in the respective Compose overlay files.

**Rationale**: The base `docker-compose.yml` defines the service; each environment overlay supplies the correct `env_file` and volume paths. The base compose file sets defaults; overlays override as needed.

Variables needed:
- `SONARQUBE_URL` — Already in `.env.staging` as `localhost:9000`; add to `.env.dev`
- `SONARQUBE_PROTOCOL` — New, set to `http`
- `SONARQUBE_TOKEN` — Already in `.env.staging`; add to `.env.dev`; update both with new token
- `SONAR_JDBC_URL` — `jdbc:postgresql://localhost:5433/sonarqube`
- `SONAR_JDBC_USERNAME` — `sonarqube`
- `SONAR_JDBC_PASSWORD` — Generated or set explicitly
- `SONAR_ES_BOOTSTRAP_CHECKS_DISABLE` — `true`

**Alternatives considered**:
- Hardcode in compose file: Rejected — env vars should be configurable per environment.
- Use a dedicated `.env.sonarqube` file: Rejected — unnecessary fragmentation; existing env files work.

### R8: Token Update Strategy

**Decision**: Token update is a manual process documented in the quickstart. The operator:
1. Accesses SonarQube web UI after first startup
2. Logs in with default admin credentials
3. Generates a new token via Administration → Security → Users
4. Updates `.env.staging` and `config/.env.dev` with the new token value
5. Updates Jenkins credential `sonar-token` via Jenkins UI
6. Restarts backend and celery_worker containers to pick up new env vars

**Rationale**: SonarQube tokens must be generated through the SonarQube web UI — there is no API-based token generation enabled by default. Automation would require pre-configuring the admin password, which is a security anti-pattern.

**Alternatives considered**:
- Pre-generate a token via SonarQube REST API during init: Rejected — requires knowing the admin password at startup time.
- Skip token rotation (use default): Rejected — user explicitly stated old tokens don't work and need reset.
- Automated Jenkins credential update: Rejected — Jenkins credentials are managed externally; this project's code cannot modify them.
