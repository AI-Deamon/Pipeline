# Data Model: SonarQube Docker Container

**Date**: 2026-05-26

## PostgreSQL Schema Changes

### 1. New Database: `sonarqube`

A dedicated PostgreSQL database for SonarQube's internal schema. Created automatically by the init script `docker/postgres/init/02-create-sonarqube-db.sql`.

| Property | Value |
|----------|-------|
| Database name | `sonarqube` |
| Owner/User | `sonarqube` |
| Managed by | SonarQube application (auto-creates tables on first startup) |
| Init script | `02-create-sonarqube-db.sql` |

### 2. Init Script: `02-create-sonarqube-db.sql`

```sql
CREATE DATABASE sonarqube;
CREATE USER sonarqube WITH PASSWORD 'sonarqube';
GRANT ALL PRIVILEGES ON DATABASE sonarqube TO sonarqube;
\c sonarqube
GRANT ALL ON SCHEMA public TO sonarqube;
```

**Note**: The existing `01-*.sql` from the previous feature (001-deep-code-audit) runs before this script. PostgreSQL executes init scripts in alphabetical order.

### 3. No Changes to Application Models

The `ProjectDB`, `ScanDB`, `ScanReportDB`, and `UserDB` models are unchanged. SonarQube manages its own schema within the `sonarqube` database.

## Environment Variables

### New Variables

| Variable | Where Set | Purpose |
|----------|-----------|---------|
| `SONAR_JDBC_URL` | `.env.staging`, `.env.dev` | JDBC connection string for SonarQube (`jdbc:postgresql://localhost:5433/sonarqube`) |
| `SONAR_JDBC_USERNAME` | `.env.staging`, `.env.dev` | Database user (`sonarqube`) |
| `SONAR_JDBC_PASSWORD` | `.env.staging`, `.env.dev` | Database password |
| `SONARQUBE_PROTOCOL` | `.env.staging`, `.env.dev` | Protocol for backend API calls (`http`) |

### Updated Variables

| Variable | Current Value | New Value | Files |
|----------|--------------|-----------|-------|
| `SONARQUBE_TOKEN` | `sqa_4c31b5b8...` | (operator-generated) | `.env.staging`, `.env.dev` |
| `SONARQUBE_URL` | `localhost:9000` | (unchanged) | Already set in `.env.staging`; new in `.env.dev` |

## Docker Volumes

| Volume Name | Container Path | Purpose |
|-------------|---------------|---------|
| `sonarqube_data` | `/opt/sonarqube/data` | Elasticsearch indices, project data |
| `sonarqube_extensions` | `/opt/sonarqube/extensions` | Installed plugins |
| `sonarqube_logs` | `/opt/sonarqube/logs` | Application logs |
