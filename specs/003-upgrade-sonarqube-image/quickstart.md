# Quickstart: Upgrade SonarQube

## Prerequisites

- Access to Docker host with `docker compose` commands
- PostgreSQL `pg_dump` available
- SonarQube admin credentials (admin / admin123)
- Jenkins admin access for scanner update

## Upgrade Steps

### 1. Backup the SonarQube Database

```bash
PGPASSWORD=sonarqube pg_dump -h localhost -p 5433 -U sonarqube sonarqube > /tmp/sonarqube-backup-$(date +%Y%m%d).sql
```

### 2. Note Current State

```bash
# Record current project list, user list, and analysis results
curl -s -u admin:admin123 "http://localhost:9000/api/projects/search" | python3 -m json.tool > /tmp/sonar-projects-before.json
curl -s -u admin:admin123 "http://localhost:9000/api/users/search" | python3 -m json.tool > /tmp/sonar-users-before.json
```

### 3. Upgrade to Intermediate Version (24.12)

```bash
# Stop current SonarQube
docker compose -f docker/docker-compose.yml stop sonarqube

# Remove old container (data volumes persist)
docker compose -f docker/docker-compose.yml rm -f sonarqube

# Update image tag in docker-compose.yml to 24.12.x-community
# (Verify exact 24.12 community tag first, may need direct image pull)

# Start upgraded instance
docker compose -f docker/docker-compose.yml up -d sonarqube

# Wait for healthcheck
docker compose -f docker/docker-compose.yml ps sonarqube

# Verify version
curl -s http://localhost:9000/api/server/version
# Expected: 24.12.x

# Verify data preserved
curl -s -u admin:admin123 "http://localhost:9000/api/projects/search"
```

### 4. Upgrade to Target Version (26.5)

```bash
# Stop intermediate SonarQube
docker compose -f docker/docker-compose.yml stop sonarqube
docker compose -f docker/docker-compose.yml rm -f sonarqube

# Update image tag to sonarqube:26.5.0.122743-community
docker compose -f docker/docker-compose.yml up -d sonarqube

# Wait for healthcheck
docker compose -f docker/docker-compose.yml ps sonarqube

# Verify version
curl -s http://localhost:9000/api/server/version
# Expected: 26.5.0.122743
```

### 5. Verify Post-Upgrade

```bash
# Verify data preserved
curl -s -u admin:admin123 "http://localhost:9000/api/projects/search"
curl -s -u admin:admin123 "http://localhost:9000/api/users/search"

# Verify API token still works
curl -s -u "squ_38aedbbc9186c8bf59f9e2f70d4cd2b83ca79969:" "http://localhost:9000/api/issues/search?componentKeys=Soner_key&ps=1"

# Verify dashboard access
curl -s -o /dev/null -w "%{http_code}" "http://localhost:9000/project/issues?id=Soner_key"
```

### 6. Upgrade Sonar-Scanner in Jenkins

```bash
# Via Jenkins script console or UI, update sonar-scanner tool
# to a version compatible with SonarQube 26.x (scanner 6.x+)
```

### 7. End-to-End Verification

Trigger a manual scan from the application and verify:
- Scan completes with `sonar_scanner` stage showing PASS
- Findings visible in scan results
- Finding count matches SonarQube API count
- "Review ↗" link points to SonarQube issues page

### 8. Update Compose Files

Update image tag in all Docker Compose overlays:
- `docker/docker-compose.yml`
- `docker/docker-compose.dev.yml`
- `docker/docker-compose.staging.yml`
- `docker/docker-compose.test.yml`

### Rollback Procedure

```bash
# If upgrade fails:
docker compose -f docker/docker-compose.yml stop sonarqube
docker compose -f docker/docker-compose.yml rm -f sonarqube
# Restore image tag to sonarqube:lts-community
docker compose -f docker/docker-compose.yml up -d sonarqube

# If data corruption:
psql -h localhost -p 5433 -U sonarqube -d sonarqube -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
psql -h localhost -p 5433 -U sonarqube -d sonarqube < /tmp/sonarqube-backup-YYYYMMDD.sql
```
