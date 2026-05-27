# Data Model: Upgrade SonarQube

**Date**: 2026-05-26

No new data entities are introduced by this feature. The existing data model (SonarQube instance, PostgreSQL sonarqube database, SonarQube projects, API tokens) remains unchanged. This upgrade preserves all existing data and entities.

## Existing Entities (unchanged)

| Entity | Description | Storage | Persistence |
|--------|-------------|---------|-------------|
| SonarQube Instance | Server application | Docker container + named volumes | `sonarqube_data`, `sonarqube_extensions`, `sonarqube_logs` |
| SonarQube Database | Analysis data, projects, users | PostgreSQL 15 `sonarqube` database | Database backup + tables |
| SonarQube Projects | Project configs with `sonar_key` | PostgreSQL (in sonarqube DB) | Preserved |
| API Tokens | Auth tokens (`squ_...`) | PostgreSQL (in sonarqube DB) + Jenkins credentials | Preserved |
