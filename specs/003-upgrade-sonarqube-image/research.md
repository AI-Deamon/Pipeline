# Research: Upgrade SonarQube to Current Stable Version

**Date**: 2026-05-26
**Branch**: `003-upgrade-sonarqube-image`

## Research Tasks

### R1: Target Version Selection

**Decision**: Upgrade to SonarQube Community Build `26.5.0.122743` (Docker tag `community`)

**Rationale**:
- The `lts-community` Docker tag is deprecated — only `community` (latest) and `26.5.0.122743-community` (pinned) are available for Community Build on Docker Hub
- The latest Community Build `26.5.0.122743` provides the most up-to-date security analysis rules
- PostgreSQL 16 is currently the SonarQube requirement (PG 15 may need verification during upgrade — if PG 15 is incompatible, a PG 16 upgrade is needed)
- The `community` tag auto-updates to the latest Community Build, but we will pin to `26.5.0.122743-community` for stability

**Alternatives considered**:
- Pinning to an older Community Build (24.12, 25.12) — no Docker tags exist for these versions
- Using `sonarqube:lts-community` — still points to 9.9.8, no longer updated
- Using Server edition Docker tags — commercial license required

### R2: Upgrade Path

**Decision**: Three-step upgrade: 9.9.8 → 24.12.0.100206 → 26.1.0.118079 → 26.5.0.122743

**Rationale**:
- Direct upgrade from 9.9 to 26.x is NOT supported (database schema too old)
- Per SonarSource community: "If you're in different calendar years, must upgrade to December (xx.12) build of intervening year first"
- **Actual path discovered at runtime**: 9.9 → 24.12 (custom ZIP-built image, no Docker tag exists) → 26.1 (substitutes for 25.12 per docs) → 26.5
- Direct 24.12 → 26.5 fails with "upgrade to 25.12 first"
- No `sonarqube:24.12-community` Docker tag exists on Docker Hub — built custom image from official ZIP at `https://binaries.sonarsource.com/Distribution/sonarqube/sonarqube-24.12.0.100206.zip`
- Three separate Docker container starts required, each with DB migration

**Upgrade step details**:
1. **9.9.8 → 24.12.0.100206**: Custom Dockerfile using `eclipse-temurin:21-jre` base, copies extracted ZIP
2. **24.12.0.100206 → 26.1.0.118079**: Official `sonarqube:26.1.0.118079-community` tag on Docker Hub
3. **26.1.0.118079 → 26.5.0.122743**: Official `sonarqube:26.5.0.122743-community` tag on Docker Hub

**Alternatives considered**:
- Direct 9.9 → 26.5 — rejected (database incompatibility error)
- 9.9 → 24.12 → 26.5 — rejected (26.5 requires upgrade to 25.12 first)
- Using `sonarqube:community` tag — not recommended for cross-version upgrades

### R3: Docker Image Tags

**Decision**: Custom-built `sonarqube:24.12.0.100206` from official ZIP for intermediate step, then `sonarqube:26.1.0.118079-community` for second intermediate, then `sonarqube:26.5.0.122743-community` for final version

**Rationale**:
- Only `community`, `26.5.0.122743-community`, and `26.1.0.118079-community` tags exist for Community Build on Docker Hub
- No 24.12 Community Build Docker tag exists — built custom image from official ZIP at `https://binaries.sonarsource.com/Distribution/sonarqube/sonarqube-24.12.0.100206.zip`
- Custom Dockerfile used `eclipse-temurin:21-jre` base, extracted ZIP, kept same volumes as final image
- 26.1.0 was used as a substitute for the missing 25.12 intermediate (both serve the same purpose — bridging the gap between 24.12 and 26.5)

**Alternatives considered**:
- Pulling 24.12 from ZIP and running manually — done (worked but complex). Addressed by building a Docker image from the ZIP.
- Bypassing 24.12 entirely — rejected (9.9 schema too old for 26.x)
- Using 25.12 intermediate — no Docker tag for 25.12 Community Build; 26.1 substituted per docs

### R4: Sonar-Scanner Compatibility

**Decision**: No scanner upgrade needed — Jenkins already has SonarScanner CLI 8.0.1.6346, which is fully compatible with SonarQube 26.x

**Rationale**:
- Jenkins pipeline uses `tool 'sonar-scanner'` with auto-install from Maven Central (`https://repo1.maven.org/maven2/org/sonarsource/scanner/cli/sonar-scanner-cli/`)
- Auto-installed version resolved to **SonarScanner CLI 8.0.1.6346** (well above the 6.x minimum required for 26.x)
- Scanner communicates successfully with SonarQube Community Build 26.5.0.122743
- End-to-end scan verified: scanner → CE submit → project created → scan data stored

**Note**: In SonarQube 26.x, if the project doesn't exist, the scanner token may not have auto-provisioning permission. For first scans, create the project manually via API first, or ensure the token has "Create Projects" permission. Verified that after creating the project, CE processing succeeds.

**Alternatives considered**:
- Upgrading scanner — not needed (already 8.x)
- Using `sonar-scanner-cli` Docker image — not needed
- Pinning scanner version in Jenkins — optional, not required for compatibility

### R5: Plugin Compatibility

**Decision**: No plugin migration needed — all installed plugins are built-in and ship with the Community Build

**Rationale**:
- Current installed plugins: csharp, config, flex, go, web, iac, jacoco, java, javascript, kotlin, php, python, ruby, scala, text, vbnet, xml
- All are official SonarSource plugins bundled with the Community Build
- No third-party or community plugins are installed
- The new version will include updated compatible versions of all these plugins

**Alternatives considered**: N/A

### R6: PostgreSQL Compatibility

**Decision**: No PostgreSQL upgrade needed — already running PostgreSQL 16.12

**Rationale**:
- Pre-upgrade verification found PostgreSQL **16.12** (not 15 as initially assumed)
- SonarQube 26.5 requires PostgreSQL 16+, and 16.12 is fully compatible
- No PG upgrade was required since the running version already meets requirements
- The shared PostgreSQL instance (port 5433) serves both app DB and SonarQube DB — verified compatible through the full 3-step upgrade

**Alternatives considered**:
- Upgrading PG from 15 to 16 — not needed (already on 16)
- Forcing older SonarQube version — not needed (PG was already compatible)
