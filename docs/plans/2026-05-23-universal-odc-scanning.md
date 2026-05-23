# Universal OWASP Dependency Check Scanning

**Goal**: Scan all ODC-supported dependency types (Go, Rust, PHP, Ruby, Java, .NET, etc.) without touching the Sonar scanner stage.

**Single file changed**: `Agent/Jenkinsfile`

---

## Current Problem

```groovy
if (hasNpmLock || hasYarnLock) {
    scanArgs << "--scan ./**/package-lock.json"
    scanArgs << "--scan ./**/yarn.lock"
} else {
    scanArgs << "--scan ."
}
```

The architecture is binary: **either** npm/yarn only **or** everything else. When npm/yarn lock files exist in the repo, Go, Rust, PHP, Ruby, Java, .NET, and all other dependency types are silently skipped.

## What ODC Supports vs What We Scan

| Language | Lock/manifest file | ODC supports | We detect | We scan |
|----------|-------------------|:------------:|:---------:|:-------:|
| npm | `package-lock.json`, `npm-shrinkwrap.json` | ✅ | ✅ | ✅ |
| Yarn | `yarn.lock` | ✅ | ✅ | ✅ |
| Pip | `requirements.txt` | ✅ | ✅ | ❌* |
| Poetry | `pyproject.toml`, `poetry.lock` | ✅ | partial | ❌* |
| **Go** | `go.sum`, `go.mod` | ✅ (v6.4+) | ❌ | ❌ |
| **Rust** | `Cargo.lock` | ✅ (v7.0+) | ❌ | ❌ |
| **PHP** | `composer.lock`, `composer.json` | ✅ | ❌ | ❌ |
| **Ruby** | `Gemfile.lock`, `*.gemspec` | ✅ | ❌ | ❌ |
| **Maven** | `pom.xml` | ✅ | ❌ | ❌ |
| **Gradle** | `build.gradle`, `build.gradle.kts` | ✅ | ❌ | ❌ |
| **.NET** | `packages.config`, `*.csproj` | ✅ | ❌ | ❌ |
| **Pipenv** | `Pipfile`, `Pipfile.lock` | ✅ | ❌ | ❌ |
| **pnpm** | `pnpm-lock.yaml` | ✅ (v6+) | ❌ | ❌ |
| **Swift** | `Package.resolved`, `Package.swift` | ✅ | ❌ | ❌ |
| **CocoaPods** | `Podfile.lock` | ✅ | ❌ | ❌ |
| **Elixir** | `mix.exs` | ✅ | ❌ | ❌ |

\* Detected by `findDependencyFiles()` but not explicitly scanned when npm/yarn lock files exist.

## Implementation Steps

### Step 1: Expand `findDependencyFiles()` (lines 9-47)

**Detect**  | **Find command**
-----------|-----------------
Go         | `find . -name 'go.sum' ! -path '*/node_modules/*'`
Rust       | `find . -name 'Cargo.lock' ! -path '*/node_modules/*'`
PHP        | `find . -name 'composer.lock' ! -path '*/node_modules/*'`
Ruby       | `find . -name 'Gemfile.lock' ! -path '*/node_modules/*'`
Maven      | `find . -name 'pom.xml' ! -path '*/node_modules/*'`
Gradle     | `find . -name 'build.gradle' -o -name 'build.gradle.kts' ! -path '*/node_modules/*'`
.NET       | `find . -name 'packages.config' -o -name '*.csproj' ! -path '*/node_modules/*'`
Pipenv     | `find . -name 'Pipfile.lock' ! -path '*/node_modules/*'`
Poetry     | `find . -name 'poetry.lock' ! -path '*/node_modules/*'`
pnpm       | `find . -name 'pnpm-lock.yaml' ! -path '*/node_modules/*'`
Swift      | `find . -name 'Package.resolved' ! -path '*/node_modules/*'`
CocoaPods  | `find . -name 'Podfile.lock' ! -path '*/node_modules/*'`
Elixir     | `find . -name 'mix.exs' ! -path '*/node_modules/*'`

Add each to the returned `dependencies` map. Write results to temp files, read them back (same pattern as existing code).

### Step 2: Add Go/Rust lock file generation (new code after line 308)

After `npm install --package-lock-only` succeeds:

```groovy
// Go: generate go.sum if go.mod exists and go CLI is available
def goDirs = sh(
    script: "which go 2>/dev/null && find . -name 'go.mod' ! -path '*/node_modules/*' -exec dirname {} \\; | sort -u || true",
    returnStdout: true
).trim()
goDirs.split('\n').findAll { it }.each { dir ->
    sh "cd ${dir} && go mod tidy 2>&1 || echo 'go mod tidy failed in ${dir}'"
}

// Rust: generate Cargo.lock if Cargo.toml exists and cargo CLI is available
def cargoDirs = sh(
    script: "which cargo 2>/dev/null && find . -name 'Cargo.toml' ! -path '*/node_modules/*' -exec dirname {} \\; | sort -u || true",
    returnStdout: true
).trim()
cargoDirs.split('\n').findAll { it }.each { dir ->
    sh "cd ${dir} && cargo generate-lockfile 2>&1 || echo 'cargo generate-lockfile failed in ${dir}'"
}
```

Both wrapped so failure doesn't block the pipeline (`|| true` / `|| echo ...`).

### Step 3: Replace scan logic (lines 337-355)

**Before:**
```groovy
if (hasNpmLock) {
    scanArgs << "--scan ./**/package-lock.json"
    echo "Found ${lockFileCount} package-lock.json file(s)"
}
if (hasYarnLock) {
    scanArgs << "--scan ./**/yarn.lock"
    echo "Found ${yarnLockCount} yarn.lock file(s)"
}
if (!hasNpmLock && !hasYarnLock) {
    scanArgs << "--scan ."
    scanArgs << '--exclude "**/node_modules*/**"'
    def reason = ...
    echo "WARNING: No lock files found ..."
}
```

**After:**
```groovy
scanArgs << "--scan ."
```

Remove the `if/else` entirely. The existing `--exclude` directives (`node_modules`, `.venv`, `dist`, `build`, `reports`) remain. This single `--scan .` tells ODC to find every supported file type in one pass.

### Step 4: Update summary message (lines 382-396)

**Before:**
```groovy
def depSummary = "Dependency check completed"
if (lockFileCount > 0 || yarnLockCount > 0) {
    def parts = []
    if (lockFileCount > 0) { parts << "${lockFileCount} npm" }
    if (yarnLockCount > 0) { parts << "${yarnLockCount} yarn" }
    depSummary = "Dependency check completed (${parts.join(' + ')} lock file(s))"
} else {
    ...
}
```

**After:** Build summary dynamically from all detected lock file counts (filtering out zeroes):
```
"Dependency check completed (3 npm + 1 go + 2 Cargo + 1 Gemfile + 1 composer file(s))"
```

If zero lock files of any type detected:
```
"Dependency check completed — no recognized dependencies found"
```

### Step 5: Rename `getDependencyScanPaths()` (line 50)

Rename to `getNpmInstallDirs()` to reflect it only returns `package.json` directories for the npm install step. Update the single call site at line 292.

## Sonar Safety

The Sonar scanner stage (lines 215-282) and Dependency Check stage (lines 284-397) are completely independent:
- Different `when` guards (`shouldRun('sonar_scanner')` vs `shouldRun('dependency_check')`)
- Different steps — no shared variables, no shared state
- Sonar runs its own scanner CLI; ODC runs its own

**Zero changes to Sonar code. No risk of disruption.**

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Repo has npm + Go + Rust files | All scanned by `--scan .` |
| Repo has only Go files | `go mod tidy` runs (if Go installed), then `--scan .` finds `go.sum` |
| Repo has nothing ODC supports | ODC reports 0 findings, stage passes normally |
| Go CLI not installed | `go.sum` generation skipped; existing `go.sum` (committed) still scanned |
| Rust CLI not installed | Same as above |
| npm install fails | Existing lock files still scanned; npm failure noted in summary |
| ODC JVM crash | Same `catchError` wrapper — no change |

## Verification

1. Run a manual scan on juice-shop → confirm npm findings still appear (regression test)
2. Run a scan on a repo with `go.sum` → confirm Go findings appear in depSummary
3. Run a scan on a repo with `Cargo.lock` → confirm Rust findings appear
4. Verify Sonar scanner output is identical (zero lines changed in that stage)
