#!/bin/bash
set -euxo pipefail

# Install system packages
apt-get update

# Retry loop for apt in case of transient repo issues
for i in 1 2 3; do
    apt-get install -y --no-install-recommends \
        curl \
        wget \
        unzip \
        xz-utils \
        nmap \
        ca-certificates && break || {
        echo "apt-get install failed (attempt $i), retrying..."
        apt-get update
        sleep 2
    }
done

# --- ZAP ---
ZAP_VERSION="2.17.0"
ZAP_DIR="/opt/zaproxy"
if [ ! -d "$ZAP_DIR" ]; then
    wget -q "https://github.com/zaproxy/zaproxy/releases/download/v${ZAP_VERSION}/ZAP_${ZAP_VERSION}_Linux.tar.gz" -O /tmp/zap.tar.gz
    mkdir -p "$ZAP_DIR"
    tar -xf /tmp/zap.tar.gz -C "$ZAP_DIR" --strip-components=1
    ln -sf "$ZAP_DIR/zap.sh" /usr/local/bin/zap.sh
    rm /tmp/zap.tar.gz
fi

# --- Trivy ---
TRIVY_VERSION="0.70.0"
if ! command -v trivy &>/dev/null; then
    wget -q "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" -O /tmp/trivy.tar.gz
    tar -xf /tmp/trivy.tar.gz -C /usr/local/bin/ trivy
    rm /tmp/trivy.tar.gz
fi

# --- SonarScanner (managed by Jenkins SonarQube plugin) ---
# SonarScanner is installed as a Jenkins managed tool via the SonarQube plugin.
# The pipeline uses `tool 'sonar-scanner'` which resolves from JENKINS_HOME/tools/.
# No system-level install needed.

# --- OWASP Dependency-Check CLI (managed by Jenkins plugin) ---
# ODC CLI is installed as a Jenkins managed tool via the DependencyCheck plugin.
# The pipeline uses the Jenkins plugin's tool installation from JENKINS_HOME/tools/.
# No system-level install needed.

# Cleanup
apt-get clean
rm -rf /var/lib/apt/lists/*

echo "All tools installed successfully."
echo "=== ZAP ==="
zap.sh -version || true
echo "=== Trivy ==="
trivy --version || true
echo "=== Nmap ==="
nmap --version || true
