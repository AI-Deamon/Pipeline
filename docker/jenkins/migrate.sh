#!/bin/bash
set -euo pipefail

# Migration script: systemd Jenkins → Docker Jenkins
# Usage: bash docker/jenkins/migrate.sh
# Run from repository root (same directory as docker/docker-compose.jenkins.yml)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/../docker-compose.jenkins.yml"
JENKINS_HOME_SRC="/var/lib/jenkins"
# /tmp on this host is tmpfs (RAM-backed, ~7.8G) - JENKINS_HOME regularly exceeds
# that once tool/dependency caches are counted, so a full cp there fills RAM and
# fails with "No space left on device" (and can starve the rest of the system,
# since tmpfs eats real memory). /var/tmp lives on the root filesystem instead.
BACKUP_DIR="/var/tmp/jenkins-backup-$(date +%Y%m%d_%H%M%S)"
VOLUME_NAME="jenkins_home"
# Regenerable tool/dependency caches, not Jenkins state - excluding them keeps
# the backup to actual config/job/credential data instead of ~7G of re-downloadable
# cache (.npm, .cache, .ZAP, dependency-check's NVD mirror, sonar-scanner, Jenkins'
# own plugin-update cache, and in-progress build workspaces).
EXCLUDES=(
    --exclude=.npm
    --exclude=.cache
    --exclude=.ZAP
    --exclude=.dependency-check-data
    --exclude=.sonar
    --exclude=caches
    --exclude=.local
    --exclude=tools
    --exclude=updates
    --exclude=.mozilla
    --exclude=Downloads
    --exclude=workspace
)

echo "=== Jenkins Migration: systemd → Docker ==="
echo "Source: $JENKINS_HOME_SRC"
echo "Backup: $BACKUP_DIR"
echo ""

# Check prerequisites
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "ERROR: docker-compose.jenkins.yml not found at $COMPOSE_FILE"
    echo "Run this script from the repository root."
    exit 1
fi

# Step 1: Stop systemd Jenkins
echo "[1/5] Stopping systemd Jenkins..."
if systemctl is-active --quiet jenkins 2>/dev/null; then
    sudo systemctl stop jenkins
    echo "  systemd Jenkins stopped."
else
    echo "  systemd Jenkins not running."
fi

# Step 2: Backup JENKINS_HOME (excluding regenerable caches)
echo "[2/5] Backing up JENKINS_HOME (skipping regenerable caches)..."
NEEDED_KB=$(sudo du -sk "$JENKINS_HOME_SRC" "${EXCLUDES[@]}" 2>/dev/null | tail -1 | cut -f1)
AVAIL_KB=$(df -Pk "$(dirname "$BACKUP_DIR")" | tail -1 | awk '{print $4}')
if [ "${NEEDED_KB:-0}" -gt "${AVAIL_KB:-0}" ]; then
    echo "ERROR: backup needs ~$((NEEDED_KB / 1024))M but only $((AVAIL_KB / 1024))M free at $(dirname "$BACKUP_DIR")"
    exit 1
fi
sudo mkdir -p "$BACKUP_DIR"
sudo rsync -a "${EXCLUDES[@]}" "$JENKINS_HOME_SRC/" "$BACKUP_DIR/"
sudo chown -R "$(whoami)" "$BACKUP_DIR"
echo "  Backed up to $BACKUP_DIR ($(du -sh "$BACKUP_DIR" | cut -f1))"

# Step 3: Build Docker image
echo "[3/5] Building Docker image..."
docker compose -f "$COMPOSE_FILE" build
echo "  Image built."

# Step 4: Create volume and populate
echo "[4/5] Creating volume and copying data..."
docker volume rm "$VOLUME_NAME" 2>/dev/null || true
docker volume create "$VOLUME_NAME"
docker run --rm \
    -v "${VOLUME_NAME}:/target" \
    -v "${BACKUP_DIR}:/source" \
    alpine sh -c "cp -a /source/. /target/"
echo "  Data copied to volume $VOLUME_NAME."

# Step 5: Start Docker Jenkins
echo "[5/5] Starting Docker Jenkins..."
docker compose -f "$COMPOSE_FILE" up -d
echo ""

echo "=== Migration complete ==="
echo "Jenkins is starting at http://localhost:8080"
echo "Allow 1-2 minutes for initialization."
echo ""
echo "To verify:"
echo "  docker compose -f $COMPOSE_FILE logs -f"
echo ""
echo "To rollback:"
echo "  docker compose -f $COMPOSE_FILE down"
echo "  sudo systemctl start jenkins"
echo ""
echo "Backup saved at: $BACKUP_DIR"
