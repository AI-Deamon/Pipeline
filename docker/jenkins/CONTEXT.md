# CONTEXT.md — docker/jenkins/

**Last updated**: 2026-06-05
**Location**: `docker/jenkins/` at repo root
**Layer**: 2 (Distributed)
**Authoritative**: This file.

## 1. ROOM DEFINITION

**Persona**: Jenkins Container Image Engineer.
**Objective**: Build the Jenkins image used by the staging overlay. Plugin set, init scripts, JCasC, networking.

## 2. LOCAL TOKEN BUDGET

| Task | Load | Skip |
|------|------|------|
| Pin a plugin | `docker/jenkins/plugins.txt`, `docker/jenkins/Dockerfile` | `src/`, `backend/app/api/` |
| Add an init script | `docker/jenkins/Dockerfile`, `docker/jenkins/*.groovy` | `src/`, `specs/` |
| Change the JENKINS_OPTS | `docker/jenkins/Dockerfile`, `docker/docker-compose.jenkins.yml` | `src/`, `Agent/Jenkinsfile` |
| Persist JENKINS_HOME | `docker/jenkins/Dockerfile`, `docker/docker-compose.jenkins.yml` | `src/`, `backend/app/` |
| Migrate from systemd | `docker/jenkins/migrate.sh`, `docker/docker-compose.jenkins.yml` | `src/`, `specs/00*/` |
| Debug a build | `docker/jenkins/Dockerfile`, `docker/jenkins/plugins.txt`, host Jenkins logs | `src/` |

## 3. LOCAL MAP

```
docker/jenkins/
├── Dockerfile                 # Pins jenkins/jenkins:2.541.3
├── plugins.txt                # 134 plugins (managed centrally) incl. mcp-server
├── migrate.sh                 # systemd → container migration
└── <init-script>.groovy       # Optional init scripts
```

**Note**: This image is consumed by `docker/docker-compose.jenkins.yml`, not by `docker-compose.staging.yml` directly.

## 4. THE PROCESS

1. **Source** — read `Dockerfile`, `plugins.txt`, `docker-compose.jenkins.yml`
2. **Plan** — decide what to add (plugin, init script, env var); confirm `JENKINS_OPTS`
3. **Execute** — edit `Dockerfile` / `plugins.txt` / `migrate.sh`
4. **Refine** — `docker compose -f docker/docker-compose.yml -f docker/docker-compose.jenkins.yml build jenkins`; `up -d --no-deps jenkins`; check `JENKINS_HOME` persistence

## 5. WHAT GOOD LOOKS LIKE

- Image pins exact base tag. Plugin count matches Dockerfile. `JENKINS_OPTS` used for port config (not `ports:` in compose).
- JENKINS_HOME preserved across restarts. Plugin and base-image versions changed atomically — never one without the other.
- MCP server plugin installed and endpoint accessible before declaring done.

## 6. CONSTRAINTS

- **Image/plugin pairing**: Don't change the image tag from `jenkins/jenkins:2.541.3` without verifying the 134 plugins.
- **Docker CLI**: Don't install `docker` CLI in the container. The Docker plugin uses the bind-mounted socket.
- **systemd**: Don't use systemd inside the container. Containerized Jenkins is managed by the Docker plugin + `JENKINS_OPTS`.
- **Port config**: Don't expect `ports:` in compose to take effect. `network_mode: host` ignores `ports:`. Port set via `JENKINS_OPTS`.
- **Volumes**: Don't run `docker compose down --volumes`. It destroys JENKINS_HOME. Use `restart jenkins` or `down && up -d`.
- **SonarScanner tool**: Don't install SonarScanner as a system tool. It is a Jenkins managed tool via the SonarQube plugin at `/var/lib/jenkins/tools/`.

## 7. MANDATORY SKILL TRIGGERS

- A plugin upgrade breaks the build → trigger `systematic-debugging` (pin previous version, isolate)
- A new init script is added → trigger `verification-before-completion` (restart + smoke job)
- A migration from systemd is planned → trigger `dispatching-parallel-agents` (migrate.sh + JENKINS_HOME backup)
- A plugin count changes → trigger `requesting-code-review` (cross-check `plugins.txt` + image tag)
- Adding MCP tools to Jenkins → trigger `verification-before-completion` (verify plugin installed + endpoint accessible)


## 8. HARD RULES

- **Thou shalt NOT skip `JENKINS_OPTS=--httpPort=8081` when running alongside host Jenkins on 8080.** Port conflict otherwise.

## 9. APPENDIX: DUAL JENKINS — MCP STRATEGY

This project has **two** Jenkins instances. Both need the `mcp-server` plugin for MCP access.

| Instance | Port | Install method | MCP endpoint |
|----------|------|----------------|--------------|
| Docker container | 8081 | Add `mcp-server` to `plugins.txt` | `http://localhost:8081/mcp-server/sse` |
| Host systemd | 8080 | `java -jar jenkins-cli.jar -s http://localhost:8080/ install-plugin mcp-server` | `http://localhost:8080/mcp-server/sse` |

**To install on the host Jenkins** (one-time):
```bash
curl -O http://localhost:8080/jnlpJars/jenkins-cli.jar
java -jar jenkins-cli.jar -s http://localhost:8080/ -auth admin:admin123 install-plugin mcp-server
java -jar jenkins-cli.jar -s http://localhost:8080/ -auth admin:admin123 restart
```

**Verification**: After plugin install, hit `http://localhost:{port}/mcp-server/sse` — should return SSE events with `event: endpoint` and `data: http://.../message?sessionId=...`.
