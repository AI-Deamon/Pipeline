# API Contracts: SonarQube Docker Container

**Date**: 2026-05-26

## Changes to Existing Endpoints

None. No backend API endpoints are modified.

## New Endpoints

None. No new API endpoints are introduced.

## External API Dependencies

The backend connects to the SonarQube REST API at `http://{SONARQUBE_URL}/api/`. This URL remains `localhost:9000` — only the deployment method changes, not the endpoint. The backend's existing SonarQube API client code is unchanged.

| Endpoint | Method | Purpose | Used By |
|----------|--------|---------|---------|
| `/api/issues/search` | GET | Fetch SonarQube issues for a project | `fetch_sonar_issues()` in `backend/app/services/reporting/parsers/sonar.py` |
| `/api/system/status` | GET | Docker health check | Docker Compose `healthcheck` directive |

## Configuration Changes

| Config | File | Change |
|--------|------|--------|
| `SONARQUBE_URL` | `config/.env.dev` | Added: `localhost:9000` (was missing from dev env) |
| `SONARQUBE_PROTOCOL` | `.env.staging`, `config/.env.dev` | Added: `http` |
| `SONARQUBE_TOKEN` | `.env.staging`, `config/.env.dev` | Updated: operator generates new token |
