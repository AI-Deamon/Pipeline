#!/bin/bash
set -euo pipefail

# Migration script: systemd Jenkins → Docker Jenkins
# Usage: bash docker/jenkins/migrate.sh
# Run from repository root (same directory as docker/docker-compose.jenkins.yml)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/../docker-compose.jenkins.yml"
JENKINS_HOME_SRC="/var/lib/jenkins"
BACKUP_DIR="/tmp/jenkins-backup-$(date +%Y%m%d_%H%M%S)"
VOLUME_NAME="jenkins_home"

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

# Step 2: Backup JENKINS_HOME
echo "[2/5] Backing up JENKINS_HOME..."
sudo cp -a "$JENKINS_HOME_SRC" "$BACKUP_DIR"
sudo chown -R "$(whoami)" "$BACKUP_DIR"
echo "  Backed up to $BACKUP_DIR"

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
