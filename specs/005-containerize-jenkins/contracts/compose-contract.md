# Contract: Jenkins Docker Compose Service

## File

`docker/docker-compose.jenkins.yml`

## Service Definition

```yaml
services:
  jenkins:
    build:
      context: ./jenkins
      dockerfile: Dockerfile
    image: sentinel-jenkins:2.528.3
    container_name: jenkins
    network_mode: host
    ports:
      - "8080:8080"
    volumes:
      - jenkins_home:/var/jenkins_home
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - JAVA_OPTS=-Djava.awt.headless=true -Xmx7g -Xms512m
      - JENKINS_ADMIN_ID=${JENKINS_ADMIN_ID:-admin}
      - JENKINS_ADMIN_PASSWORD=${JENKINS_ADMIN_PASSWORD:-admin123}
    restart: unless-stopped

volumes:
  jenkins_home:
```

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `JAVA_OPTS` | No | `-Djava.awt.headless=true -Xmx7g -Xms512m` | JVM arguments including heap limits |
| `JENKINS_ADMIN_ID` | No | `admin` | Initial admin user ID |
| `JENKINS_ADMIN_PASSWORD` | No | `admin123` | Initial admin password |
| `JENKINS_OPTS` | No | (empty) | Additional Jenkins startup arguments |

## Volumes

| Volume | Mount | Purpose |
|--------|-------|---------|
| `jenkins_home` | `/var/jenkins_home` | Persist all Jenkins data across restarts |

## Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 8080 | HTTP | Jenkins web UI and API |
| 50000 | TCP | (optional) Jenkins inbound agents |

## Networking

- `network_mode: host` — Jenkins accesses SonarQube (9000), Backend API (8000), and target apps via localhost
- Requires all pipeline services to also use host networking (already configured)
