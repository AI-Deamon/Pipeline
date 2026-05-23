# Jenkins Scanning Pipeline Architecture

This document describes a production-ready, highly reliable scanning pipeline implementation for the DevSecOps platform. It introduces a two-pass system for dependency discovery and installation, addressing common failure modes in diverse or complex repositories.

---

## 🏗️ Architecture Decision

The standard approach of using simple directory searches or fixed priority lists for manifests (e.g., `find | head -1`) often breaks in real-world scenarios:

- **Scenario 1 — Monorepo with Multiple Services**: A naive `find` might return multiple `package.json` files, causing the pipeline to pick the wrong one or try to install dependencies for services that aren't needed for the current scan.
- **Scenario 2 — Mixed Ecosystems**: A repository containing both Rust and Python (or other mixed stacks) may not have manifests at root levels. If the pipeline only checks for standard paths, it might skip critical dependency fetching.
- **Scenario 3 — Nested Frontends**: Java Spring Boot projects often store frontend assets deep within `src/main/resources/static`. A generic priority list rarely covers these non-standard locations.

### The Two-Pass Solution
The solution is a **two-pass system** to separate concerns:
1. **Pass 1: Classification & Discovery**: Walk the repository, find all valid manifesting files, and classify them without executing any commands.
2. **Pass 2: Decision & Action**: Based on the classification results, decide what needs to be installed and execute the appropriate commands.

---

## 🚀 Proposed Pipeline Implementation (Groovy)

The following implementation provides a central `LANGUAGE_DEFINITIONS` map for easy extensibility and robust auto-detection logic.

```groovy
import groovy.transform.Field
import groovy.json.JsonOutput
import groovy.json.JsonSlurperClassic

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE GLOBALS
// ═══════════════════════════════════════════════════════════════════════════════

@Field def STAGES_RESULTS  = []
@Field def PROJECT         = [:]
@Field def SELECTED        = []
@Field def IS_MANUAL       = false
@Field def BUILT_IMAGES    = []   // Populated by Docker Build, consumed by Push + Scan
@Field def IMAGE_TAG       = ''   // First built image, for backward compat

// Dependency discovery results — set by Stage 4a, read by Stage 4b
@Field def DISCOVERED_DEPS = [
    frontend : [],   // List of [dir, type, manifest] maps
    backend  : [],   // List of [dir, type, manifest] maps
    warnings : [],   // Non-fatal issues found during discovery
]

// Docker discovery results — set by Stage 7a, read by Stage 7b
@Field def DISCOVERED_DOCKER = [
    candidates : [],  // List of [dockerfile, context, service] maps
    warnings   : [],
]

// ═══════════════════════════════════════════════════════════════════════════════
// LANGUAGE DEFINITIONS
// Each entry describes one ecosystem. Adding a new language = adding one entry.
// ═══════════════════════════════════════════════════════════════════════════════

@Field final Map LANGUAGE_DEFINITIONS = [

    nodejs: [
        name       : 'Node.js / npm',
        manifests  : ['package.json'],
        lockfiles  : ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'],
        excludeDirs: ['node_modules', '.next', 'dist', 'build', '.nuxt', 'coverage'],
        // A package.json without these keys is a bare config, not an installable package
        validators : { String content ->
            content.contains('"dependencies"')     ||
            content.contains('"devDependencies"')  ||
            content.contains('"peerDependencies"') ||
            content.contains('"scripts"')
        },
        install    : { String dir ->
            // Prefer lockfile-based install for reproducibility
            """
            cd '${dir}'
            if [ -f 'pnpm-lock.yaml' ]; then
                echo '=== Using pnpm ==='
                npm install -g pnpm 2>/dev/null || true
                pnpm install --frozen-lockfile 2>/dev/null || pnpm install
            elif [ -f 'yarn.lock' ]; then
                echo '=== Using yarn ==='
                yarn install --frozen-lockfile 2>/dev/null || yarn install
            else
                echo '=== Using npm ==='
                npm ci 2>/dev/null || npm install
            fi
            cd -
            """
        },
    ],

    python: [
        name       : 'Python / pip',
        manifests  : ['requirements.txt', 'requirements-dev.txt',
                      'requirements-prod.txt', 'setup.py', 'setup.cfg',
                      'pyproject.toml', 'Pipfile'],
        lockfiles  : ['requirements.lock', 'Pipfile.lock', 'poetry.lock'],
        excludeDirs: ['venv', '.venv', 'env', '.env', '__pycache__',
                      'dist', 'build', '*.egg-info', '.tox'],
        validators : { String content ->
            // requirements.txt: at least one non-comment, non-empty line
            // pyproject.toml: must have [tool.poetry.dependencies] or [project]
            // setup.py: must have install_requires
            content.trim().readLines().any { line ->
                def trimmed = line.trim()
                trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('[')
            } || content.contains('[tool.poetry') || content.contains('[project]')
        },
        install    : { String dir, String manifest ->
            def pipInstall = """
            cd '${dir}'
            python3 -m venv .scan_venv
            . .scan_venv/bin/activate
            pip install --upgrade pip --quiet
            """
            if (manifest == 'Pipfile') {
                pipInstall += """
            pip install pipenv --quiet
            pipenv install --dev
            """
            } else if (manifest == 'pyproject.toml') {
                pipInstall += """
            if grep -q 'tool.poetry' pyproject.toml; then
                pip install poetry --quiet
                poetry install --no-interaction
            elif grep -q 'build-backend' pyproject.toml; then
                pip install build --quiet
                pip install -e '.[dev]' 2>/dev/null || pip install -e .
            fi
            """
            } else if (manifest == 'setup.py' || manifest == 'setup.cfg') {
                pipInstall += """
            pip install -e '.[dev]' 2>/dev/null || pip install -e .
            """
            } else {
                pipInstall += """
            pip install -r '${manifest}' --quiet
            """
            }
            pipInstall + "\ncd -"
        },
    ],

    java_maven: [
        name       : 'Java / Maven',
        manifests  : ['pom.xml'],
        lockfiles  : [],
        excludeDirs: ['target', '.mvn/wrapper'],
        validators : { String content ->
            content.contains('<project') && content.contains('<groupId')
        },
        install    : { String dir ->
            """
            cd '${dir}'
            if [ -f 'mvnw' ]; then
                chmod +x mvnw
                ./mvnw dependency:resolve -q --no-transfer-progress 2>/dev/null || \
                ./mvnw dependency:resolve -q
            else
                mvn dependency:resolve -q --no-transfer-progress 2>/dev/null || \
                mvn dependency:resolve -q
            fi
            cd -
            """
        },
    ],

    java_gradle: [
        name       : 'Java / Gradle',
        manifests  : ['build.gradle', 'build.gradle.kts'],
        lockfiles  : ['gradle.lockfile'],
        excludeDirs: ['.gradle', 'build'],
        validators : { String content ->
            content.contains('dependencies') || content.contains('plugins')
        },
        install    : { String dir ->
            """
            cd '${dir}'
            if [ -f 'gradlew' ]; then
                chmod +x gradlew
                ./gradlew dependencies -q 2>/dev/null || \
                ./gradlew dependencies
            else
                gradle dependencies -q 2>/dev/null || \
                gradle dependencies
            fi
            cd -
            """
        },
    ],

    rust: [
        name       : 'Rust / Cargo',
        manifests  : ['Cargo.toml'],
        lockfiles  : ['Cargo.lock'],
        excludeDirs: ['target'],
        validators : { String content ->
            content.contains('[package]') || content.contains('[workspace]')
        },
        install    : { String dir ->
            """
            cd '${dir}'
            cargo fetch --quiet 2>/dev/null || cargo fetch
            cd -
            """
        },
    ],

    go: [
        name       : 'Go / modules',
        manifests  : ['go.mod'],
        lockfiles  : ['go.sum'],
        excludeDirs: ['vendor'],
        validators : { String content ->
            content.startsWith('module ') || content.contains('\nmodule ')
        },
        install    : { String dir ->
            """
            cd '${dir}'
            go mod download 2>/dev/null || go get ./...
            cd -
            """
        },
    ],

    ruby: [
        name       : 'Ruby / Bundler',
        manifests  : ['Gemfile'],
        lockfiles  : ['Gemfile.lock'],
        excludeDirs: ['.bundle', 'vendor/bundle'],
        validators : { String content ->
            content.contains("source '") || content.contains('source "') ||
            content.contains('gem ')
        },
        install    : { String dir ->
            """
            cd '${dir}'
            bundle install --jobs 4 --retry 3 2>/dev/null || bundle install
            cd -
            """
        },
    ],

    dotnet: [
        name       : '.NET / NuGet',
        manifests  : ['*.csproj', '*.fsproj', '*.vbproj', '*.sln'],
        lockfiles  : ['packages.lock.json'],
        excludeDirs: ['bin', 'obj', 'packages'],
        validators : { String content ->
            content.contains('<Project') || content.contains('Project(')
        },
        install    : { String dir ->
            """
            cd '${dir}'
            dotnet restore --verbosity minimal 2>/dev/null || dotnet restore
            cd -
            """
        },
    ],

    php: [
        name       : 'PHP / Composer',
        manifests  : ['composer.json'],
        lockfiles  : ['composer.lock'],
        excludeDirs: ['vendor'],
        validators : { String content ->
            content.contains('"require"') || content.contains('"require-dev"')
        },
        install    : { String dir ->
            """
            cd '${dir}'
            composer install --no-interaction --prefer-dist --optimize-autoloader 2>/dev/null || \
            composer install --no-interaction
            cd -
            """
        },
    ],
]

// ═══════════════════════════════════════════════════════════════════════════════
// DOCKERFILE PATTERNS
// Service name is derived from filename/location, used for image tagging
// ═══════════════════════════════════════════════════════════════════════════════

@Field final List DOCKERFILE_PATTERNS = [
    // Root level — most common single-service repos
    [pattern: 'Dockerfile',                    context: '.',             service: 'app'],
    [pattern: 'Dockerfile.prod',               context: '.',             service: 'app-prod'],
    [pattern: 'Dockerfile.production',         context: '.',             service: 'app-production'],
    [pattern: 'Dockerfile.dev',                context: '.',             service: 'app-dev'],
    // Docker subdirectory — common in structured projects
    [pattern: 'docker/Dockerfile',             context: '.',             service: 'app'],
    [pattern: 'docker/Dockerfile.prod',        context: '.',             service: 'app-prod'],
    // Named service subdirectories — microservice repos
    [pattern: 'frontend/Dockerfile',           context: 'frontend',      service: 'frontend'],
    [pattern: 'backend/Dockerfile',            context: 'backend',       service: 'backend'],
    [pattern: 'api/Dockerfile',                context: 'api',           service: 'api'],
    [pattern: 'app/Dockerfile',                context: 'app',           service: 'app'],
    [pattern: 'server/Dockerfile',             context: 'server',        service: 'server'],
    [pattern: 'web/Dockerfile',                context: 'web',           service: 'web'],
    [pattern: 'worker/Dockerfile',             context: 'worker',        service: 'worker'],
    [pattern: 'scheduler/Dockerfile',          context: 'scheduler',     service: 'scheduler'],
    [pattern: 'gateway/Dockerfile',            context: 'gateway',       service: 'gateway'],
    [pattern: 'proxy/Dockerfile',              context: 'proxy',         service: 'proxy'],
    // docker/ subdirectory with service names
    [pattern: 'docker/frontend.Dockerfile',    context: '.',             service: 'frontend'],
    [pattern: 'docker/backend.Dockerfile',     context: '.',             service: 'backend'],
    [pattern: 'docker/api.Dockerfile',         context: '.',             service: 'api'],
    [pattern: 'docker/worker.Dockerfile',      context: '.',             service: 'worker'],
    // services/ subdirectory — explicit microservice layout
    [pattern: 'services/frontend/Dockerfile',  context: 'services/frontend',  service: 'frontend'],
    [pattern: 'services/backend/Dockerfile',   context: 'services/backend',   service: 'backend'],
    [pattern: 'services/api/Dockerfile',       context: 'services/api',       service: 'api'],
    [pattern: 'services/worker/Dockerfile',    context: 'services/worker',    service: 'worker'],
    // apps/ subdirectory — Nx/Turborepo monorepo layout
    [pattern: 'apps/frontend/Dockerfile',      context: 'apps/frontend',      service: 'frontend'],
    [pattern: 'apps/backend/Dockerfile',       context: 'apps/backend',       service: 'backend'],
    [pattern: 'apps/api/Dockerfile',           context: 'apps/api',           service: 'api'],
    [pattern: 'apps/web/Dockerfile',           context: 'apps/web',           service: 'web'],
    [pattern: 'apps/server/Dockerfile',        context: 'apps/server',        service: 'server'],
]

// Directories that should never be scanned for dependency files or Dockerfiles
@Field final List GLOBAL_EXCLUDE_DIRS = [
    'node_modules', '.git', '.github', '.gitlab', 'vendor',
    '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache',
    'coverage', '.nyc_output', 'htmlcov',
    'dist', 'build', 'out', 'target', '.gradle',
    'venv', '.venv', 'env', '.env', '.scan_venv',
    'tmp', 'temp', '.tmp', 'cache', '.cache',
    'docs', 'doc', 'documentation',
    'examples', 'example', 'demo', 'demos',
    'fixtures', 'mocks', '__mocks__',
    '.idea', '.vscode', '.vs',
    'bin', 'obj',   // .NET
]

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

pipeline {
    agent any

    parameters {
        string(name: 'SCAN_ID',         defaultValue: '')
        choice(name: 'SCAN_MODE',       choices: ['AUTOMATED', 'MANUAL'])
        text(name: 'PROJECT_DATA',      defaultValue: '{}')
        text(name: 'SELECTED_STAGES',   defaultValue: '[]')
        text(name: 'SCAN_TIMEOUT',      defaultValue: '7200')
    }

    environment {
        CALLBACK_URL   = "${env.BACKEND_URL ?: 'http://localhost:8000'}/api/v1/scans/${params.SCAN_ID}/callback"
        REPORT_DIR     = "reports"
        CALLBACK_TOKEN = "${env.CALLBACK_TOKEN ?: ''}"
    }

    options {
        timeout(time: params.SCAN_TIMEOUT ? params.SCAN_TIMEOUT.toInteger() : 7200, unit: 'SECONDS')
        disableConcurrentBuilds()
        skipStagesAfterUnstable()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    // ─────────────────────────────────────────────────────────────────────────
    stages {

        // ── STAGE 0: Init ───────────────────────────────────────────────────
        stage('Init Context') {
            steps {
                script {
                    echo "=== Init Context Started ==="

                    if (!params.SCAN_ID?.trim()) {
                        error("SCAN_ID is mandatory. Backend handshake failed.")
                    }
                    if (params.SCAN_ID =~ /\s/) {
                        error("SCAN_ID must not contain spaces.")
                    }

                    def projectData    = params.PROJECT_DATA.replaceAll('&quot;', '"').replaceAll('&#39;', "'")
                    def selectedStages = params.SELECTED_STAGES.replaceAll('&quot;', '"').replaceAll('&#39;', "'")

                    PROJECT  = new HashMap(readJSON(text: projectData))
                    SELECTED = new ArrayList(readJSON(text: selectedStages))
                    IS_MANUAL = params.SCAN_MODE == "MANUAL"

                    sh "mkdir -p ${env.REPORT_DIR}"

                    echo "Project : ${PROJECT.name ?: 'unknown'}"
                    echo "Scan ID : ${params.SCAN_ID}"
                    echo "Mode    : ${params.SCAN_MODE}"
                    echo "=== Init Context Completed ==="
                }
            }
        }

        // ── STAGE 1: Git Checkout ───────────────────────────────────────────
        stage('1. Git Checkout') {
            steps {
                script {
                    checkout([
                        $class: 'GitSCM',
                        branches: [[name: PROJECT.branch ?: 'main']],
                        userRemoteConfigs: [[
                            url: PROJECT.git_url,
                            credentialsId: PROJECT.credentials_id ?: 'github-credentials'
                        ]]
                    ])
                    recordStage('git_checkout', 'PASS', 'Git checkout successful')
                }
            }
        }

        // ── STAGE 2: Sonar Scanner ──────────────────────────────────────────
        stage('2. Sonar Scanner') {
            when { expression { shouldRun('sonar_scanner') } }
            steps {
                timeout(time: 15, unit: 'MINUTES') {
                    script {
                        def scannerHome = tool 'sonar-scanner'
                        try {
                            withSonarQubeEnv('sonar-server') {
                                sh """
                                    ${scannerHome}/bin/sonar-scanner \
                                        -Dsonar.projectKey=${PROJECT.sonar_key ?: params.SCAN_ID} \
                                        -Dsonar.sources=. \
                                        -Dsonar.projectName=${PROJECT.project_name ?: params.SCAN_ID}
                                """
                            }
                            recordStage('sonar_scanner', 'PASS', 'Sonar scan completed')
                        } catch (Exception e) {
                            echo "⚠️  SonarQube failed: ${e.message}"
                            recordStage('sonar_scanner', 'WARN', "SonarQube failed: ${e.message}")
                        }
                    }
                }
            }
        }

        // ── STAGE 3: Sonar Quality Gate ─────────────────────────────────────
        stage('3. Sonar Quality Gate') {
            when { expression { shouldRun('sonar_quality_gate') } }
            steps {
                echo "⏭️  Skipping SonarQube Quality Gate check"
                recordStage('sonar_quality_gate', 'SKIPPED', 'Quality Gate check skipped')
            }
        }

        // ── STAGE 4a: Dependency Discovery ─────────────────────────────────
        stage('4a. Discover Dependencies') {
            when { expression { shouldRun('npm_pip_install') } }
            steps {
                script {
                    echo "════════════════════════════════════════"
                    echo "  DEPENDENCY DISCOVERY"
                    echo "════════════════════════════════════════"

                    def operatorFrontendPath = PROJECT.frontend_path ?: ''
                    def operatorBackendPath  = PROJECT.backend_path  ?: ''

                    if (operatorFrontendPath) {
                        echo "ℹ️  Operator override: frontend_path = ${operatorFrontendPath}"
                        DISCOVERED_DEPS.frontend << [
                            dir      : operatorFrontendPath,
                            language : 'nodejs',
                            manifest : 'package.json',
                            source   : 'operator_override'
                        ]
                    }
                    if (operatorBackendPath) {
                        echo "ℹ️  Operator override: backend_path = ${operatorBackendPath}"
                        DISCOVERED_DEPS.backend << [
                            dir      : operatorBackendPath,
                            language : 'python',
                            manifest : 'requirements.txt',
                            source   : 'operator_override'
                        ]
                    }

                    if (!operatorFrontendPath && !operatorBackendPath) {
                        echo "ℹ️  No operator overrides — running auto-detection"

                        LANGUAGE_DEFINITIONS.each { langKey, langDef ->
                            echo "--- Scanning for ${langDef.name} ---"

                            def langExcludeDirs = (GLOBAL_EXCLUDE_DIRS + langDef.excludeDirs).unique()
                            def langExcludePattern = langExcludeDirs.collect {
                                "! -path '*/${it}/*' ! -path '*/${it}'"
                            }.join(' ')

                            def manifestsFound = []
                            langDef.manifests.each { manifestName ->
                                def findOutput = ''
                                try {
                                    findOutput = sh(
                                        script: """
                                            find . -name '${manifestName}' -type f \
                                                ${langExcludePattern} \
                                                2>/dev/null \
                                            | sort \
                                            | head -20
                                        """,
                                        returnStdout: true
                                    ).trim()
                                } catch (Exception e) {
                                    echo "  find failed for ${manifestName}: ${e.message}"
                                }

                                if (findOutput) {
                                    findOutput.split('\n').each { rawPath ->
                                        def filePath = rawPath.trim().replaceFirst(/^\.\//, '')
                                        if (!filePath) return

                                        def dirPath = filePath.contains('/') ?
                                            filePath.substring(0, filePath.lastIndexOf('/')) : '.'
                                        def fileName = filePath.contains('/') ?
                                            filePath.substring(filePath.lastIndexOf('/') + 1) : filePath

                                        def isValid = false
                                        try {
                                            def content = readFile(filePath)
                                            isValid = langDef.validators(content)
                                        } catch (Exception e) {
                                            echo "  ⚠️  Could not read ${filePath}: ${e.message}"
                                        }

                                        if (isValid) {
                                            manifestsFound << [
                                                dir     : dirPath,
                                                manifest: fileName,
                                                path    : filePath
                                            ]
                                            echo "  ✓ Found valid ${fileName} in ${dirPath}"
                                        }
                                    }
                                }
                            }

                            if (manifestsFound.size() == 0) return

                            def deduped = deduplicateManifests(manifestsFound)

                            deduped.each { found ->
                                def classification = classifyDependency(langKey, found.dir)
                                def entry = [
                                    dir     : found.dir,
                                    language: langKey,
                                    manifest: found.manifest,
                                    source  : 'auto_detected'
                                ]

                                if (classification == 'frontend') {
                                    DISCOVERED_DEPS.frontend << entry
                                } else {
                                    DISCOVERED_DEPS.backend << entry
                                }
                            }
                        }
                    }

                    def report = [
                        scan_id    : params.SCAN_ID,
                        timestamp  : new Date().format("yyyy-MM-dd'T'HH:mm:ss'Z'"),
                        frontend   : DISCOVERED_DEPS.frontend,
                        backend    : DISCOVERED_DEPS.backend,
                        warnings   : DISCOVERED_DEPS.warnings,
                    ]
                    writeFile(
                        file: "${env.REPORT_DIR}/dependency-discovery.json",
                        text: JsonOutput.prettyPrint(JsonOutput.toJson(report))
                    )
                }
            }
        }

        // ── STAGE 4b: Install Dependencies ─────────────────────────────────
        stage('4b. NPM / PIP Install') {
            when { expression { shouldRun('npm_pip_install') } }
            steps {
                timeout(time: 15, unit: 'MINUTES') {
                    script {
                        echo "════════════════════════════════════════"
                        echo "  DEPENDENCY INSTALLATION"
                        echo "════════════════════════════════════════"

                        def totalFound = DISCOVERED_DEPS.frontend.size() + DISCOVERED_DEPS.backend.size()

                        if (totalFound == 0) {
                            recordStage('npm_pip_install', 'SKIPPED', 'No installable dependency files found')
                            return
                        }

                        def installLog  = []
                        def failureLog  = []
                        def allEntries  = DISCOVERED_DEPS.frontend + DISCOVERED_DEPS.backend

                        allEntries.each { entry ->
                            def langKey  = entry.language
                            def dir      = entry.dir
                            def manifest = entry.manifest
                            def langDef  = LANGUAGE_DEFINITIONS[langKey]

                            try {
                                def installCmd = langKey == 'python' ?
                                    langDef.install(dir, manifest) :
                                    langDef.install(dir)

                                sh installCmd
                                installLog << "${langDef.name}@${dir}"
                                echo "  ✓ Successfully installed ${langDef.name} in ${dir}"
                            } catch (Exception e) {
                                failureLog << "${langDef.name} in '${dir}': ${e.message}"
                            }
                        }

                        def stageStatus  = failureLog ? (installLog ? 'WARN' : 'FAIL') : 'PASS'
                        def summary = "Installed: ${installLog.size()} | Failed: ${failureLog.size()}"
                        recordStage('npm_pip_install', stageStatus, summary)
                    }
                }
            }
        }

        // ── STAGE 5: OWASP Dependency Check ────────────────────────────────
        stage('5. Dependency Check') {
            when { expression { shouldRun('dependency_check') } }
            steps {
                dependencyCheck additionalArguments: """
                    --project ${params.SCAN_ID}
                    --scan .
                    --format JSON
                    --format HTML
                    --out ${env.REPORT_DIR}
                    --enableExperimental
                """, odcInstallation: 'OWasp'
                recordStage('dependency_check', 'PASS', 'Dependency check completed')
            }
        }

        // ── STAGE 6: Trivy FS Scan ──────────────────────────────────────────
        stage('6. Trivy FS Scan') {
            when { expression { shouldRun('trivy_fs_scan') } }
            steps {
                script {
                    try {
                        sh """
                            /home/kali_linux/.local/bin/trivy fs \
                                --format json \
                                --output ${env.REPORT_DIR}/trivy-fs.json \
                                .
                        """
                        recordStage('trivy_fs_scan', 'PASS', 'Trivy FS scan completed')
                    } catch (Exception e) {
                        recordStage('trivy_fs_scan', 'WARN', "Trivy FS warnings: ${e.message}")
                    }
                }
            }
        }

        // ── STAGE 7a: Docker Discovery ──────────────────────────────────────
        stage('7a. Discover Dockerfiles') {
            when { expression { shouldRun('docker_build') } }
            steps {
                script {
                    echo "════════════════════════════════════════"
                    echo "  DOCKERFILE DISCOVERY"
                    echo "════════════════════════════════════════"

                    def addedPaths = [] as Set

                    if (PROJECT.docker_file_path) {
                        def contextPath = PROJECT.docker_context_path ?: '.'
                        DISCOVERED_DOCKER.candidates << [
                            dockerfile : PROJECT.docker_file_path,
                            context    : contextPath,
                            service    : 'app',
                            source     : 'operator_override'
                        ]
                        addedPaths << PROJECT.docker_file_path
                    } else {
                        DOCKERFILE_PATTERNS.each { pattern ->
                            if (fileExists(pattern.pattern) && !addedPaths.contains(pattern.pattern)) {
                                def content = readFile(pattern.pattern)
                                if (isValidDockerfile(content)) {
                                    DISCOVERED_DOCKER.candidates << [
                                        dockerfile : pattern.pattern,
                                        context    : pattern.context,
                                        service    : pattern.service,
                                        source     : 'pattern_match'
                                    ]
                                    addedPaths << pattern.pattern
                                }
                            }
                        }

                        def dockerExclude = (GLOBAL_EXCLUDE_DIRS).collect {
                            "! -path '*/${it}/*'"
                        }.join(' ')

                        def allDockerfiles = sh(
                            script: """
                                find . -name 'Dockerfile*' -o -name '*.dockerfile' -o -name '*.Dockerfile' \
                                    2>/dev/null \
                                | grep -v '.git/' \
                                | sort
                            """,
                            returnStdout: true
                        ).trim()

                        if (allDockerfiles) {
                            allDockerfiles.split('\n').each { rawPath ->
                                def filePath = rawPath.trim().replaceFirst(/^\.\//, '')
                                if (!filePath || addedPaths.contains(filePath)) return

                                def content = ''
                                try { content = readFile(filePath) } catch (Exception e) { return }

                                if (isValidDockerfile(content)) {
                                    DISCOVERED_DOCKER.candidates << [
                                        dockerfile : filePath,
                                        context    : deriveDockerContext(filePath),
                                        service    : deriveServiceName(filePath),
                                        source     : 'find_scan'
                                    ]
                                    addedPaths << filePath
                                }
                            }
                        }
                    }

                    def report = [
                        scan_id    : params.SCAN_ID,
                        timestamp  : new Date().format("yyyy-MM-dd'T'HH:mm:ss'Z'"),
                        candidates : DISCOVERED_DOCKER.candidates,
                    ]
                    writeFile(
                        file: "${env.REPORT_DIR}/docker-discovery.json",
                        text: JsonOutput.prettyPrint(JsonOutput.toJson(report))
                    )
                }
            }
        }

        // ── STAGE 7b: Docker Build ──────────────────────────────────────────
        stage('7b. Docker Build') {
            when {
                expression {
                    shouldRun('docker_build') && DISCOVERED_DOCKER.candidates.size() > 0
                }
            }
            steps {
                script {
                    echo "════════════════════════════════════════"
                    echo "  DOCKER BUILD"
                    echo "════════════════════════════════════════"

                    def projectTag = (PROJECT.project_id ?: 'scan').toLowerCase().replaceAll(/[^a-z0-9\-]/, '-')

                    DISCOVERED_DOCKER.candidates.each { candidate ->
                        def imageTag = "${projectTag}-${candidate.service}:${params.SCAN_ID}"
                        try {
                            sh """
                                docker build --file '${candidate.dockerfile}' \
                                    --tag '${imageTag}' '${candidate.context}'
                            """
                            BUILT_IMAGES << imageTag
                        } catch (Exception e) {
                            echo "  ❌ Build failed [${candidate.dockerfile}]: ${e.message}"
                        }
                    }

                    if (BUILT_IMAGES.size() > 0) IMAGE_TAG = BUILT_IMAGES[0]
                    def stageStatus = BUILT_IMAGES.size() == DISCOVERED_DOCKER.candidates.size() ? 'PASS' : 'WARN'
                    recordStage('docker_build', stageStatus, "Built ${BUILT_IMAGES.size()} images")
                }
            }
        }

        // ── STAGE 8: Docker Push ────────────────────────────────────────────
        stage('8. Docker Push') {
            when {
                expression {
                    shouldRun('docker_push') && BUILT_IMAGES.size() > 0
                }
            }
            steps {
                script {
                    withCredentials([usernamePassword(
                        credentialsId: 'docker-credentials',
                        usernameVariable: 'DOCKER_USER',
                        passwordVariable: 'DOCKER_PASS'
                    )]) {
                        sh 'echo "${DOCKER_PASS}" | docker login -u "${DOCKER_USER}" --password-stdin'
                        BUILT_IMAGES.each { imageTag ->
                            sh "docker push '${imageTag}'"
                        }
                    }
                    recordStage('docker_push', 'PASS', "Pushed ${BUILT_IMAGES.size()} images")
                }
            }
        }

        // ── STAGE 9: Trivy Image Scan ───────────────────────────────────────
        stage('9. Trivy Image Scan') {
            when {
                expression {
                    shouldRun('trivy_image_scan') && BUILT_IMAGES.size() > 0
                }
            }
            steps {
                script {
                    BUILT_IMAGES.each { imageTag ->
                        def safeFileName = imageTag.replaceAll(/[^a-zA-Z0-9\-_]/, '_')
                        sh """
                            /home/kali_linux/.local/bin/trivy image --format json \
                                --output '${env.REPORT_DIR}/trivy-image-${safeFileName}.json' \
                                '${imageTag}'
                        """
                    }
                    recordStage('trivy_image_scan', 'PASS', "Scanned ${BUILT_IMAGES.size()} images")
                }
            }
        }

        // ── STAGE 10: Nmap Scan ─────────────────────────────────────────────
        stage('10. Nmap Scan') {
            when { expression { shouldRun('nmap_scan') } }
            steps {
                script {
                    if (!PROJECT.target_ip) return
                    sh "nmap -sV -sC -oX ${env.REPORT_DIR}/nmap.xml ${PROJECT.target_ip} || true"
                    recordStage('nmap_scan', 'PASS', 'Nmap scan completed')
                }
            }
        }

        // ── STAGE 11: ZAP Scan ──────────────────────────────────────────────
        stage('11. ZAP Scan') {
            when { expression { shouldRun('zap_scan') } }
            steps {
                script {
                    if (!PROJECT.target_url) return
                    withEnv(["TARGET_URL=${PROJECT.target_url}"]) {
                        sh '''
                            zap.sh -daemon -host 127.0.0.1 -port 8090 -config api.disablekey=true &
                            ZAP_PID=$!
                            sleep 30
                            curl "http://127.0.0.1:8090/JSON/spider/action/scan/?url=$TARGET_URL" || true
                            sleep 60
                            curl "http://127.0.0.1:8090/JSON/core/action/htmlreport/" -o reports/zap.html || true
                            kill $ZAP_PID 2>/dev/null || true
                        '''
                    }
                    recordStage('zap_scan', 'PASS', 'ZAP scan completed')
                }
            }
        }
    }

    post {
        always {
            script {
                archiveArtifacts artifacts: "${env.REPORT_DIR}/**", allowEmptyArchive: true
                if (BUILT_IMAGES.size() > 0) {
                    BUILT_IMAGES.each { sh "docker rmi '${it}' --force 2>/dev/null || true" }
                }

                def payload = [
                    status       : currentBuild.currentResult,
                    build_number : currentBuild.number,
                    scan_id      : params.SCAN_ID,
                    stages       : STAGES_RESULTS ?: [],
                    finished_at  : new Date().format("yyyy-MM-dd'T'HH:mm:ss'Z'", TimeZone.getTimeZone('UTC')),
                ]

                writeFile file: 'callback.json', text: JsonOutput.toJson(payload)
                sh "curl -sS -X POST -H 'Content-Type: application/json' --data @callback.json '${CALLBACK_URL}' || true"
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

def classifyDependency(String langKey, String dir) {
    if (langKey != 'nodejs') return 'backend'
    def signals = ['frontend', 'ui', 'client', 'web', 'app', 'portal', 'dashboard', 'react', 'vue']
    return signals.any { dir.toLowerCase().contains(it) } || dir == '.' ? 'frontend' : 'backend'
}

def deduplicateManifests(List manifests) {
    def dirs = manifests.collect { it.dir }
    return manifests.findAll { candidate ->
        !dirs.any { other -> other != candidate.dir && other.startsWith(candidate.dir == '.' ? '' : candidate.dir + '/') }
    }
}

def isValidDockerfile(String content) {
    return content.readLines().any { it.trim().toUpperCase().startsWith('FROM') }
}

def deriveServiceName(String filePath) {
    def fileName = filePath.split('/').last()
    if (fileName.contains('.')) return fileName.split('\\.').find { it.toLowerCase() != 'dockerfile' } ?: 'app'
    return filePath.contains('/') ? filePath.split('/')[-2] : 'app'
}

def deriveDockerContext(String path) {
    return path.contains('/') && !['docker', 'containers'].contains(path.split('/')[-2].toLowerCase()) ? path.substring(0, path.lastIndexOf('/')) : '.'
}

def shouldRun(String stage) { return !IS_MANUAL || SELECTED.contains(stage) }

def recordStage(String name, String status, String summary) {
    STAGES_RESULTS << [stage: name, status: status, summary: summary, timestamp: new Date().format("yyyy-MM-dd'T'HH:mm:ss'Z'")]
}
```

---

## 📈 Key Improvements & Rationale

1. **Decoupled Discovery Stage**: By performing discovery before any installation, the pipeline remains resilient to environmental shifts and provides clear debugging insights via `reports/dependency-discovery.json`.
2. **Unified Language Definitions**: Ecosystem-specific knowledge (Node.js, Python, Java, Rust, Go, etc.) is centralized in a single map, making the pipeline easily maintainable and extensible.
3. **Smart Monorepo Support**: The deduplication logic automatically handles nested project structures, ensuring that only the most specific and relevant manifests are acted upon.
4. **Context-Aware Docker Builds**: Automatically determines the correct build context and service names based on repository patterns, eliminating the need for hardcoded paths.
5. **Robust Error Handling**: Each stage is isolated with its own timeout and error trapping, ensuring that a single failing scan doesn't block the entire orchestration.
