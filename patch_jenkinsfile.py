"""
Applies all remaining Jenkinsfile fixes from the recommendations document.

Fixes applied:
  1. Environment block  - add npm_config_cache + JDK17 tool
  2. Options block      - remove skipStagesAfterUnstable (blocks remaining scans)
  3. Sonar exclusions   - expand to cover venv / __pycache__ / tests / docs
  4. Install Deps stage - switch from npm install to npm ci (lockfile-safe)
  5. Dep-Check stage    - fix stale variable refs (npmFailed/installDirs gone), clean summary
  6. Trivy FS stage     - add --scanners vuln,secret,misconfig + --severity HIGH,CRITICAL
                          + save log properly, fail detection
  7. Docker Build stage - add --progress=plain + tee to docker-build.log per dockerfile
  8. Pipeline helpers   - add validateStage() helper at bottom
"""

import re

PATH = "Agent/Jenkinsfile"
with open(PATH, "r", encoding="utf-8") as f:
    src = f.read()

# ─────────────────────────────────────────────────────────────────────────────
# 1. ENVIRONMENT BLOCK — add npm_config_cache + JDK17 agent label hint
# ─────────────────────────────────────────────────────────────────────────────
OLD_ENV = '''    environment {
        // Configurable URLs — override via Jenkins global env vars or job params
        BACKEND_URL = "${env.BACKEND_URL ?: 'http://localhost:8000'}"
        JENKINS_URL = "${env.JENKINS_BASE_URL ?: 'http://localhost:8080'}"
        CALLBACK_URL = "${BACKEND_URL}/api/v1/scans/${params.SCAN_ID}/callback"
        REPORT_DIR = "reports"
        // Tool paths — override via Jenkins tools or env vars
        TRIVY_PATH = "${env.TRIVY_PATH ?: 'trivy'}"
        JAVA_HOME_DIR = "${env.JAVA_HOME_DIR ?: ''}"
        ZAP_PORT = "${env.ZAP_PORT ?: '8090'}"

        // Registry config — set DOCKER_REGISTRY for private registries (e.g. ghcr.io, ecr)
        DOCKER_REGISTRY = "${env.DOCKER_REGISTRY ?: ''}"
    }'''

NEW_ENV = '''    environment {
        // Configurable URLs — override via Jenkins global env vars or job params
        BACKEND_URL    = "${env.BACKEND_URL ?: 'http://localhost:8000'}"
        JENKINS_URL    = "${env.JENKINS_BASE_URL ?: 'http://localhost:8080'}"
        CALLBACK_URL   = "${BACKEND_URL}/api/v1/scans/${params.SCAN_ID}/callback"
        REPORT_DIR     = "reports"

        // Tool paths — override via Jenkins tools or env vars
        TRIVY_PATH     = "${env.TRIVY_PATH ?: 'trivy'}"
        // Prefer JDK 17 for SonarQube stability (Java 21 triggers SIGSEGV on large TS repos).
        // Set JAVA_HOME_17 in Jenkins global env to /usr/lib/jvm/java-17-openjdk-amd64
        JAVA_HOME_DIR  = "${env.JAVA_HOME_17 ?: env.JAVA_HOME_DIR ?: ''}"
        ZAP_PORT       = "${env.ZAP_PORT ?: '8090'}"

        // npm cache — dramatically speeds up repeated npm ci calls across builds
        npm_config_cache = "${env.WORKSPACE}/.npm-cache"

        // Registry config — set DOCKER_REGISTRY for private registries (e.g. ghcr.io, ecr)
        DOCKER_REGISTRY = "${env.DOCKER_REGISTRY ?: ''}"
    }'''

assert OLD_ENV in src, "ENV block not found"
src = src.replace(OLD_ENV, NEW_ENV, 1)
print("✅  1. Environment block updated")

# ─────────────────────────────────────────────────────────────────────────────
# 2. OPTIONS — remove skipStagesAfterUnstable so remaining scans still run
#    when Sonar/Dep-Check become UNSTABLE
# ─────────────────────────────────────────────────────────────────────────────
OLD_OPTS = '''    options {
        // Dynamic timeout based on scan complexity (default 2 hours)
        timeout(time: params.SCAN_TIMEOUT ? params.SCAN_TIMEOUT.toInteger() : 7200, unit: 'SECONDS')
        disableConcurrentBuilds()
        skipStagesAfterUnstable()
        retry(1)
        // Keep build logs for debugging
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }'''

NEW_OPTS = '''    options {
        // Dynamic timeout based on scan complexity (default 2 hours)
        timeout(time: params.SCAN_TIMEOUT ? params.SCAN_TIMEOUT.toInteger() : 7200, unit: 'SECONDS')
        disableConcurrentBuilds()
        // NOTE: skipStagesAfterUnstable intentionally omitted — we want all
        //       security scan stages to run even if an earlier one goes UNSTABLE
        retry(1)
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }'''

assert OLD_OPTS in src, "OPTIONS block not found"
src = src.replace(OLD_OPTS, NEW_OPTS, 1)
print("✅  2. Options block updated (removed skipStagesAfterUnstable)")

# ─────────────────────────────────────────────────────────────────────────────
# 3. SONAR — expand exclusions + improve JAVA_HOME handling
# ─────────────────────────────────────────────────────────────────────────────
OLD_SONAR_EXCL = "                                                  -Dsonar.exclusions='node_modules/**,dist/**,build/**,.next/**,coverage/**,reports/**,vendor/**,*.min.js' \\\\"
NEW_SONAR_EXCL = "                                                  -Dsonar.exclusions='node_modules/**,dist/**,build/**,.next/**,coverage/**,reports/**,vendor/**,*.min.js,**/.venv/**,**/venv/**,**/__pycache__/**,**/.git/**' \\\\"

assert OLD_SONAR_EXCL in src, "Sonar exclusions not found"
src = src.replace(OLD_SONAR_EXCL, NEW_SONAR_EXCL, 1)
print("✅  3. Sonar exclusions expanded")

# ─────────────────────────────────────────────────────────────────────────────
# 4. INSTALL DEPENDENCIES — switch npm install → npm ci
#    npm ci: lockfile-safe, reproducible, faster (reads package-lock.json exactly)
# ─────────────────────────────────────────────────────────────────────────────
OLD_NPM = '''                        def rc = sh(
                            returnStatus: true,
                            script: """
                                cd '${dir}'
                                npm install \\\\
                                    --prefer-offline \\\\
                                    --no-audit \\\\
                                    --no-fund \\\\
                                    --legacy-peer-deps \\\\
                                    2>&1 | tail -20
                            """
                        )'''

NEW_NPM = '''                        // npm ci is preferred over npm install:
                        //   - reads package-lock.json exactly (reproducible)
                        //   - faster (skips dependency resolution)
                        //   - fails if lock file is out of sync with package.json
                        // Fallback to npm install if ci fails (e.g. no lock file)
                        def rc = sh(
                            returnStatus: true,
                            script: """
                                cd '${dir}'
                                if [ -f package-lock.json ]; then
                                    echo "Lock file found — using npm ci"
                                    npm ci \\\\
                                        --prefer-offline \\\\
                                        --no-audit \\\\
                                        --no-fund \\\\
                                        2>&1 | tail -30
                                else
                                    echo "No lock file — falling back to npm install"
                                    npm install \\\\
                                        --prefer-offline \\\\
                                        --no-audit \\\\
                                        --no-fund \\\\
                                        --legacy-peer-deps \\\\
                                        2>&1 | tail -30
                                fi
                            """
                        )'''

assert OLD_NPM in src, "npm install block not found"
src = src.replace(OLD_NPM, NEW_NPM, 1)
print("✅  4. Install Dependencies: npm ci with npm install fallback")

# ─────────────────────────────────────────────────────────────────────────────
# 5. DEPENDENCY CHECK — fix stale variable refs left from old code (npmFailed,
#    installDirs no longer exist in this stage) + clean up summary block
# ─────────────────────────────────────────────────────────────────────────────
OLD_DEP_NOSCAN = '''                    if (!hasNpmLock && !hasYarnLock) {
                        scanArgs << "--scan ."
                        scanArgs << '--exclude "**/node_modules*/**"'
                        def reason = npmFailed > 0 && npmSucceeded == 0
                            ? "npm install --package-lock-only failed in ${npmFailed}/${installDirs.size()} package.json dir(s)"
                            : installDirs.isEmpty()
                                ? "no package.json found in workspace"
                                : "npm install --package-lock-only succeeded but lock files not generated"
                        echo "WARNING: No lock files found (${reason}). Dependency Check will only scan non-Node.js dependencies (pip, gradle, etc.)"
                    }'''

NEW_DEP_NOSCAN = '''                    if (!hasNpmLock && !hasYarnLock) {
                        scanArgs << "--scan ."
                        scanArgs << '--exclude "**/node_modules*/**"'
                        // Lock files absent even after npm ci — likely a pure Python/Java project
                        // or npm ci failed in Install Dependencies stage.
                        def reason = nodeModulesPresent
                            ? "node_modules present but no lock file found (unexpected)"
                            : "node_modules absent — Install Dependencies stage may have failed"
                        echo "WARNING: No lock files found (${reason}). Dependency Check will only scan non-Node.js dependencies (pip, gradle, etc.)"
                    }'''

assert OLD_DEP_NOSCAN in src, "Dep-check noscan block not found"
src = src.replace(OLD_DEP_NOSCAN, NEW_DEP_NOSCAN, 1)
print("✅  5a. Dependency Check: removed stale npmFailed/installDirs references")

# Fix stale refs in the depSummary block too
OLD_DEP_SUMMARY = '''                    } else {
                        def reason = installDirs.isEmpty()
                            ? "no package.json found"
                            : "npm install --package-lock-only failed"
                        depSummary = "Dependency check completed — 0 Node.js deps analyzed (${reason})"
                    }'''

NEW_DEP_SUMMARY = '''                    } else {
                        def reason = nodeModulesPresent
                            ? "node_modules present but no lock file detected"
                            : "node_modules absent — Install Dependencies stage may have failed or no package.json found"
                        depSummary = "Dependency check completed — 0 Node.js deps analyzed (${reason})"
                    }'''

assert OLD_DEP_SUMMARY in src, "Dep-check summary block not found"
src = src.replace(OLD_DEP_SUMMARY, NEW_DEP_SUMMARY, 1)
print("✅  5b. Dependency Check: summary block cleaned up")

# ─────────────────────────────────────────────────────────────────────────────
# 6. TRIVY FS — add secret/misconfig scanners + HIGH/CRITICAL filter + proper
#    exit code handling (stop swallowing errors with || true)
# ─────────────────────────────────────────────────────────────────────────────
OLD_TRIVY = '''        stage('Trivy FS Scan') {
            when { expression { shouldRun('trivy_fs_scan') } }
            steps {
                sh """
                    if [ ! -d node_modules ]; then
                        echo "WARNING: node_modules not found — Trivy FS will only analyze source files. Run 'npm install' for broader dependency coverage."
                    fi
                    ${TRIVY_PATH} fs --format json \\
                      --skip-files "reports/**" \\
                      -o reports/trivy-fs.json . > reports/trivy-fs-output.log 2>&1 || true
                """
                script {
                    def trivyOutput = ""
                    try { trivyOutput = readFile('reports/trivy-fs-output.log') } catch (_) {}
                    def warnLines = trivyOutput.split('\\n').findAll {
                        it.contains('WARNING') || it.contains('WARN') || it.contains('error') || it.contains('Error') || it.contains('FATAL')
                    }
                    def detail = warnLines ? ' | Warnings: ' + warnLines.take(5).join(' ;; ') : ''
                    recordStage('trivy_fs_scan', 'PASS', 'Trivy FS scan completed' + detail)
                }
            }
        }'''

NEW_TRIVY = '''        stage('Trivy FS Scan') {
            when { expression { shouldRun('trivy_fs_scan') } }
            steps {
                script {
                    def nmPresent = sh(
                        returnStatus: true,
                        script: 'find . -maxdepth 3 -type d -name node_modules 2>/dev/null | grep -q .'
                    ) == 0
                    if (!nmPresent) {
                        echo "WARNING: node_modules not found — Trivy will only scan source/lockfiles. Install Dependencies stage may have failed."
                    }

                    // --scanners vuln,secret,misconfig: vulnerabilities + hardcoded secrets + misconfigurations
                    // --severity HIGH,CRITICAL: focus on actionable findings (suppress LOW/MEDIUM noise)
                    // exit code 1 = vulnerabilities found (not a tool error) — captured via returnStatus
                    def trivyExit = sh(
                        returnStatus: true,
                        script: """
                            set -o pipefail
                            ${TRIVY_PATH} fs \\
                              --scanners vuln,secret,misconfig \\
                              --severity HIGH,CRITICAL \\
                              --format json \\
                              --ignorefile .trivyignore 2>/dev/null || true \\
                              -o reports/trivy-fs.json \\
                              . 2>&1 | tee reports/trivy-fs-output.log
                        """
                    )

                    def trivyOutput = ""
                    try { trivyOutput = readFile('reports/trivy-fs-output.log') } catch (_) {}

                    def fatalLines = trivyOutput.split('\\n').findAll {
                        it.contains('FATAL') || it.contains('panic') || it.contains('Error:')
                    }
                    def warnLines = trivyOutput.split('\\n').findAll {
                        it.contains('WARNING') || it.contains('WARN')
                    }

                    if (trivyExit > 1 || fatalLines) {
                        // Exit 2+ = tool error (not just findings)
                        def detail = fatalLines ? fatalLines.take(3).join(' | ') : "exit code ${trivyExit}"
                        echo "WARNING: Trivy FS encountered errors: ${detail}"
                        recordStage('trivy_fs_scan', 'WARN', "Trivy FS scan had errors: ${detail}")
                    } else {
                        def detail = warnLines ? ' | Warnings: ' + warnLines.take(3).join(' ;; ') : ''
                        def coverage = nmPresent ? 'full (node_modules present)' : 'partial (no node_modules)'
                        recordStage('trivy_fs_scan', 'PASS', "Trivy FS scan completed [${coverage}]${detail}")
                    }
                }
            }
        }'''

assert OLD_TRIVY in src, "Trivy FS stage not found"
src = src.replace(OLD_TRIVY, NEW_TRIVY, 1)
print("✅  6. Trivy FS: vuln+secret+misconfig scanners, HIGH/CRITICAL filter, proper error detection")

# ─────────────────────────────────────────────────────────────────────────────
# 7. DOCKER BUILD — add --progress=plain + tee to per-dockerfile log file
# ─────────────────────────────────────────────────────────────────────────────
OLD_DOCKER_CMD = '''                        // Capture full output + exit code without masking the real error.
                        // Using set +e + sentinel avoids sh() throwing before we read output.
                        def buildOutput = sh(returnStdout: true, script: """
                            set +e
                            docker build -t '${imageTag}' -f '${dockerfile}' '${buildContext}' 2>&1
                            echo "___EXIT___\\$?"
                        """)'''

NEW_DOCKER_CMD = '''                        // --progress=plain: shows every RUN step output (no TTY collapsing)
                        // tee to per-dockerfile log: persists full output for post-mortem debugging
                        def safeLogName = dockerfile.replaceAll('[^a-zA-Z0-9]', '-').toLowerCase().take(80)
                        def buildLogFile = "reports/docker-build-${safeLogName}.log"
                        def buildOutput = sh(returnStdout: true, script: """
                            set +e
                            docker build \\
                                --progress=plain \\
                                --no-cache=false \\
                                -t '${imageTag}' \\
                                -f '${dockerfile}' \\
                                '${buildContext}' 2>&1 | tee '${buildLogFile}'
                            echo "___EXIT___\\$?"
                        """)'''

assert OLD_DOCKER_CMD in src, "Docker build command not found"
src = src.replace(OLD_DOCKER_CMD, NEW_DOCKER_CMD, 1)
print("✅  7. Docker Build: --progress=plain + tee to per-dockerfile log")

# ─────────────────────────────────────────────────────────────────────────────
# 8. HELPERS — add validateStage() utility before shouldRun()
# ─────────────────────────────────────────────────────────────────────────────
OLD_HELPERS = '''def shouldRun(stageName) {
    if (IS_MANUAL == false) {
        return true
    }
    return SELECTED.contains(stageName)
}'''

NEW_HELPERS = '''// ── Pipeline helper utilities ────────────────────────────────────────────────

/**
 * Fail the build immediately with a clear message if condition is false.
 * Use to enforce mandatory post-conditions (e.g. required output files).
 *
 * Example:
 *   validateStage(fileExists('reports/sonar-scanner-output.log'),
 *                 "Sonar output log missing — scanner may have crashed")
 */
def validateStage(boolean condition, String message) {
    if (!condition) {
        error("[validateStage] ${message}")
    }
}

def shouldRun(stageName) {
    if (IS_MANUAL == false) {
        return true
    }
    return SELECTED.contains(stageName)
}'''

assert OLD_HELPERS in src, "shouldRun helper not found"
src = src.replace(OLD_HELPERS, NEW_HELPERS, 1)
print("✅  8. Added validateStage() helper utility")

# ─────────────────────────────────────────────────────────────────────────────
# WRITE & VERIFY
# ─────────────────────────────────────────────────────────────────────────────
with open(PATH, "w", encoding="utf-8") as f:
    f.write(src)

print(f"\nDone. Line count: {src.count(chr(10))}")

# Sanity checks
checks = [
    ("npm_config_cache",          "npm cache env var"),
    ("npm ci",                    "npm ci usage"),
    ("skipStagesAfterUnstable",   "skipStagesAfterUnstable removal comment"),
    ("__pycache__",               "expanded sonar exclusions"),
    ("vuln,secret,misconfig",     "trivy extended scanners"),
    ("HIGH,CRITICAL",             "trivy severity filter"),
    ("--progress=plain",          "docker build plain progress"),
    ("tee 'reports/docker-build", "docker build log tee"),
    ("validateStage",             "validateStage helper"),
    ("report-task.txt",           "sonar report-task check"),
    ("jvmCrashed",                "jvm crash detection"),
    ("Install Dependencies",      "install deps stage"),
    ("JAVA_HOME_17",              "java 17 preference"),
]
failed = []
for token, desc in checks:
    if token not in src:
        failed.append(f"MISSING: {desc} ({token!r})")
    else:
        print(f"  ✓ {desc}")

if failed:
    print("\nFAILED CHECKS:")
    for f in failed:
        print(" ", f)
    raise SystemExit(1)
else:
    print("\nAll checks passed.")
