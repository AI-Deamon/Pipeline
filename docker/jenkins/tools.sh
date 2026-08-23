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

# Finding #85: verify each downloaded release tarball's sha256 before
# extracting. Both hashes below were pulled from GitHub's own Release API
# `digest` field for these exact pinned versions (`GET
# /repos/<org>/<repo>/releases/tags/v<version>`, per-asset `digest` key) —
# not fabricated. This matters more than usual here: the Jenkins agent this
# runs in already has Docker-socket access (#78), so a compromised or
# MITM'd release asset would run as a scanner binary on a host that can
# control the Docker daemon. Re-fetch the digest from the same API endpoint
# whenever ZAP_VERSION/TRIVY_VERSION is bumped.
verify_sha256() {
    local file="$1" expected="$2"
    local actual
    actual="$(sha256sum "$file" | awk '{print $1}')"
    if [ "$actual" != "$expected" ]; then
        echo "Checksum mismatch for $file: expected $expected, got $actual" >&2
        exit 1
    fi
}

# --- ZAP ---
ZAP_VERSION="2.17.0"
ZAP_SHA256="efe799aaa3627db683b43f00c9c210aea0b75c00cc8f0a0f0434d12bb3ddde5a"
ZAP_DIR="/opt/zaproxy"
if [ ! -d "$ZAP_DIR" ]; then
    wget -q "https://github.com/zaproxy/zaproxy/releases/download/v${ZAP_VERSION}/ZAP_${ZAP_VERSION}_Linux.tar.gz" -O /tmp/zap.tar.gz
    verify_sha256 /tmp/zap.tar.gz "$ZAP_SHA256"
    mkdir -p "$ZAP_DIR"
    tar -xf /tmp/zap.tar.gz -C "$ZAP_DIR" --strip-components=1
    ln -sf "$ZAP_DIR/zap.sh" /usr/local/bin/zap.sh
    rm /tmp/zap.tar.gz
fi

# --- Trivy ---
TRIVY_VERSION="0.70.0"
TRIVY_SHA256="8b4376d5d6befe5c24d503f10ff136d9e0c49f9127a4279fd110b727929a5aa9"
if ! command -v trivy &>/dev/null; then
    wget -q "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" -O /tmp/trivy.tar.gz
    verify_sha256 /tmp/trivy.tar.gz "$TRIVY_SHA256"
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
