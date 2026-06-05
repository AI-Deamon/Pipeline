# Data Model: Containerize Jenkins

## Entities

### Jenkins Docker Image

| Field | Value |
|-------|-------|
| Base | `jenkins/jenkins:2.528.3` |
| Plugins | 114 plugins (from `plugins.txt`) |
| Tools | ZAP, Trivy, SonarScanner, Nmap, ODC CLI (via `tools.sh`) |
| JVM Args | `-Djava.awt.headless=true -Xmx7g -Xms512m` |
| Build Context | `docker/jenkins/` |

### JENKINS_HOME Volume

| Field | Value |
|-------|-------|
| Name | `jenkins_home` |
| Mount | `/var/jenkins_home` |
| Contents | Jobs, credentials, build history, plugin binaries, config XMLs |
| Persistence | Docker named volume (not bind mount for portability) |
| Migration | Copy `/var/lib/jenkins` contents directly (same structure) |

### Docker Compose Service

| Field | Value |
|-------|-------|
| File | `docker/docker-compose.jenkins.yml` |
| Service name | `jenkins` |
| Port | `8080:8080` (also `50000:50000` for agents if needed) |
| Networking | `network_mode: host` |
| Volumes | `jenkins_home:/var/jenkins_home`, `/var/run/docker.sock:/var/run/docker.sock` |
| Env vars | `JAVA_OPTS`, `JENKINS_ADMIN_ID`, `JENKINS_ADMIN_PASSWORD`, `JENKINS_OPTS` |

### Scan Tools (installed in image)

| Tool | Binary | Purpose |
|------|--------|---------|
| ZAP | `zap.sh` | Active web application scanning |
| Trivy | `trivy` | Filesystem and container image vulnerability scanning |
| SonarScanner | `sonar-scanner` | Code quality and static analysis |
| Nmap | `nmap` | Network port scanning |
| ODC CLI | `dependency-check` | OWASP Dependency-Check |

### Docker Socket

| Field | Value |
|-------|-------|
| Host path | `/var/run/docker.sock` |
| Container path | `/var/run/docker.sock` |
| Purpose | Allow Jenkins pipeline to execute `docker build` and `docker run` |

## Relationships

```
Jenkins Docker Image
  └─ uses base: jenkins/jenkins:2.528.3
  └─ installs plugins from: plugins.txt
  └─ installs tools via: tools.sh
  └─ runs with JVM args from: JAVA_OPTS env var

Docker Compose Service (docker-compose.jenkins.yml)
  └─ builds from: docker/jenkins/Dockerfile
  └─ mounts volume: jenkins_home → /var/jenkins_home
  └─ mounts socket: /var/run/docker.sock → /var/run/docker.sock
  └─ uses network: host

JENKINS_HOME Volume
  └─ contains: jobs, credentials, plugins, build history
  └─ source (migration): /var/lib/jenkins (systemd install)
```

## State Transitions

```
[systemd Jenkins] → migration: copy /var/lib/jenkins → [Docker volume]
                                        ↓
                          [Docker Jenkins container]
                          ├─ first start: plugins from image
                          ├─ subsequent starts: plugins from volume
                          ├─ docker build: via host socket
                          └─ scan tools: from image (no host deps)
```
