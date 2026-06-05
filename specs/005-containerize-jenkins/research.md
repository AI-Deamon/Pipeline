# Research: Containerize Jenkins

## Design Decisions

### Decision 1: Base Image — `jenkins/jenkins:2.528.3`

- **Decision**: Pin to the exact version currently installed (2.528.3)
- **Rationale**: Zero behavioral change. The current systemd Jenkins runs 2.528.3 with all plugins compatible. Using `lts` tag could introduce breaking plugin changes.
- **Alternatives considered**:
  - `jenkins/jenkins:lts` — always latest LTS; risk of incompatibility with current plugins
  - `jenkins/jenkins:latest` — unstable; not suitable for production

### Decision 2: Plugin Installation — `plugins.txt` via `jenkins-plugin-cli`

- **Decision**: Use `jenkins-plugin-cli` (built into the official image) with a `plugins.txt` file listing all 114 currently installed plugins
- **Rationale**: Official image supports this natively. Plugins are also persisted in JENKINS_HOME volume, so the file serves as a fallback for fresh starts.
- **Alternatives considered**:
  - Manual `curl`/`wget` of `.jpi` files — fragile, no dependency resolution
  - Copy from current `/var/lib/jenkins/plugins/` — works but only for current version

### Decision 3: Scan Tools — All Bundled in Image

- **Decision**: Install ZAP, Trivy, SonarScanner, Nmap, OWASP Dependency-Check CLI directly in the Docker image via `tools.sh`
- **Rationale**: True portability — the container runs on any Docker host without requiring any system packages. Matches the user's goal of "copy JENKINS_HOME + docker compose up = everything works."
- **Alternatives considered**:
  - Bind-mount tool binaries from host — defeats portability
  - Sidecar containers for each tool — requires significant pipeline refactoring

### Decision 4: Docker Socket — Bind-Mount

- **Decision**: Mount `/var/run/docker.sock:/var/run/docker.sock` (DooD pattern)
- **Rationale**: Jenkins pipeline runs `docker build` with `DOCKER_BUILDKIT=1`. The Docker CLI inside the container calls the host Docker daemon. This is the industry-standard pattern for Jenkins-in-Docker.
- **Alternatives considered**:
  - `DOCKER_HOST=tcp://...` — remote daemon; over-engineered for single-host setup
  - DinD (Docker-in-Docker) — nested Docker daemon; unnecessary complexity, known issues with build cache

### Decision 5: Networking — Host Mode

- **Decision**: Use `network_mode: host` to access SonarQube, ZAP, and backend on localhost
- **Rationale**: All pipeline services use host networking. Jenkins needs to reach SonarQube (port 9000), backend API (8000), and target apps. Host networking avoids container DNS/port mapping complexity.
- **Alternatives considered**:
  - Bridge network with container names — would require all other services to be on same Docker network; incompatible with host-networked services

### Decision 6: Compose File — Standalone

- **Decision**: Create `docker-compose.jenkins.yml` independent of the app's dev/test/staging overlays
- **Rationale**: Jenkins is a CI server, not an app service. It runs independently of which app environment is active. Standalone file can be copied to any server.
- **Alternatives considered**:
  - Add to `docker-compose.staging.yml` — ties Jenkins to a specific overlay
  - Add to base `docker-compose.yml` — always starts with the app stack

### Decision 7: JVM Heap — Environment Variable

- **Decision**: Set `JAVA_OPTS=-Djava.awt.headless=true -Xmx7g -Xms512m` via environment variable in the compose file
- **Rationale**: The `jenkins/jenkins` image passes `JAVA_OPTS` to the JVM. This is the cleanest way to set heap limits without modifying the entrypoint.
- **Alternatives considered**:
  - Custom entrypoint script — unnecessary; official image already supports `JAVA_OPTS`
  - Jenkins system config — heap must be set before JVM starts

## Tool Installation Details

| Tool | Installation Method | Version |
|------|-------------------|---------|
| ZAP | `zap.sh` from ZAP releases | Latest stable |
| Trivy | `trivy` from Aqua Security GitHub releases | Latest |
| SonarScanner | `sonar-scanner` from SonarSource | Latest |
| Nmap | `apt-get install nmap` | distro |
| ODC CLI | From OWASP Dependency Check GitHub releases | Latest |
