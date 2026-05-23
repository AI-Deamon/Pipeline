# Docker Auto-Detection for Jenkinsfile

## Current Problem

```groovy
// Current Jenkinsfile - Line 203
sh "docker build -t ${IMAGE_TAG} ."  // Always builds from root!
```

**Fails for:**
- ❌ `docker/Dockerfile`
- ❌ `backend/Dockerfile`  
- ❌ `Dockerfile.prod`
- ❌ Multi-service repos

---

## Simple Solution (Matches Your Dependency Discovery)

Add a **Stage 7a: Discover Dockerfiles** before the build:

```groovy
// ── STAGE 7a: Discover Dockerfiles ───────────────────────────────
stage('7a. Discover Dockerfiles') {
    when { expression { shouldRun('docker_build') } }
    steps {
        script {
            echo "════════════════════════════════════════"
            echo "  DOCKERFILE DISCOVERY"
            echo "════════════════════════════════════════"
            
            // Search for Dockerfiles in common locations
            def dockerfiles = []
            
            // Priority 1: Root level Dockerfile
            if (fileExists('Dockerfile')) {
                dockerfiles << [file: 'Dockerfile', context: '.', service: 'app']
                echo "✓ Found: Dockerfile (root)"
            }
            // Priority 2: docker/ subdirectory
            else if (fileExists('docker/Dockerfile')) {
                dockerfiles << [file: 'docker/Dockerfile', context: '.', service: 'app']
                echo "✓ Found: docker/Dockerfile"
            }
            // Priority 3: backend/ subdirectory
            else if (fileExists('backend/Dockerfile')) {
                dockerfiles << [file: 'backend/Dockerfile', context: 'backend', service: 'backend']
                echo "✓ Found: backend/Dockerfile"
            }
            // Priority 4: Search with find (fallback)
            else {
                def findOutput = sh(
                    script: "find . -name 'Dockerfile*' -type f | head -5",
                    returnStdout: true
                ).trim()
                
                if (findOutput) {
                    findOutput.split('\n').each { path ->
                        def dir = path.contains('/') ? path.substring(0, path.lastIndexOf('/')) : '.'
                        dockerfiles << [file: path, context: dir, service: 'app']
                        echo "✓ Found: ${path}"
                    }
                }
            }
            
            // Store for Stage 7b to use
            env.DISCOVERED_DOCKERFILES = dockerfiles.size() > 0 ? 
                dockerfiles[0].file : ''
            env.DISCOVERED_CONTEXT = dockerfiles.size() > 0 ? 
                dockerfiles[0].context : '.'
            
            if (dockerfiles.size() == 0) {
                echo "⚠️  No Dockerfiles found - will skip Docker stages"
            } else {
                echo "Using: ${env.DISCOVERED_DOCKERFILES} (context: ${env.DISCOVERED_CONTEXT})"
            }
        }
    }
}

// ── STAGE 7b: Docker Build ───────────────────────────────────────
stage('7b. Docker Build') {
    when { 
        expression { 
            shouldRun('docker_build') && env.DISCOVERED_DOCKERFILES 
        } 
    }
    steps {
        script {
            IMAGE_TAG = "${PROJECT.project_id ?: 'scan'}:${params.SCAN_ID}"
            sh "docker build -t ${IMAGE_TAG} -f ${env.DISCOVERED_DOCKERFILES} ${env.DISCOVERED_CONTEXT}"
            recordStage('docker_build', 'PASS', 'Docker image built from ${env.DISCOVERED_DOCKERFILES}')
        }
    }
}
```

---

## Even Simpler: One-Liner Discovery

If you don't want a separate discovery stage:

```groovy
stage('7. Docker Build') {
    when { expression { shouldRun('docker_build') } }
    steps {
        script {
            // Auto-detect Dockerfile location
            def dockerfile = ''
            def context = '.'
            
            if (fileExists('Dockerfile')) {
                dockerfile = 'Dockerfile'
                context = '.'
            }
            else if (fileExists('docker/Dockerfile')) {
                dockerfile = 'docker/Dockerfile'
                context = '.'
            }
            else if (fileExists('backend/Dockerfile')) {
                dockerfile = 'backend/Dockerfile'
                context = 'backend'
            }
            else if (fileExists('frontend/Dockerfile')) {
                dockerfile = 'frontend/Dockerfile'
                context = 'frontend'
            }
            else {
                // Fallback: find first Dockerfile
                def output = sh(
                    script: "find . -name 'Dockerfile*' -type f | head -1",
                    returnStdout: true
                ).trim()
                if (output) {
                    dockerfile = output
                    context = output.contains('/') ? 
                        output.substring(0, output.lastIndexOf('/')) : '.'
                }
            }
            
            if (dockerfile) {
                IMAGE_TAG = "${PROJECT.project_id ?: 'scan'}:${params.SCAN_ID}"
                sh "docker build -t ${IMAGE_TAG} -f ${dockerfile} ${context}"
                recordStage('docker_build', 'PASS', 'Built from ${dockerfile}')
            } else {
                recordStage('docker_build', 'SKIPPED', 'No Dockerfile found')
            }
        }
    }
}
```

---

## Recommended: Middle Ground Approach

Add this to your current Jenkinsfile (minimal changes):

```groovy
stage('7. Docker Build') {
    when { expression { shouldRun('docker_build') } }
    steps {
        script {
            // Auto-detect Dockerfile with priority order
            def dockerfile = ''
            def context = '.'
            
            // Check common locations in priority order
            def locations = [
                [file: 'Dockerfile', context: '.'],
                [file: 'docker/Dockerfile', context: '.'],
                [file: 'backend/Dockerfile', context: 'backend'],
                [file: 'frontend/Dockerfile', context: 'frontend'],
                [file: 'api/Dockerfile', context: 'api'],
                [file: 'app/Dockerfile', context: 'app'],
            ]
            
            for (loc in locations) {
                if (fileExists(loc.file)) {
                    dockerfile = loc.file
                    context = loc.context
                    echo "✓ Using ${dockerfile} (context: ${context})"
                    break
                }
            }
            
            // Fallback to find command
            if (!dockerfile) {
                def output = sh(
                    script: "find . -name 'Dockerfile*' -type f | head -1",
                    returnStdout: true
                ).trim()
                if (output) {
                    dockerfile = output
                    context = output.contains('/') ? 
                        output.substring(0, output.lastIndexOf('/')) : '.'
                    echo "✓ Found via find: ${dockerfile}"
                }
            }
            
            // Build or skip
            if (dockerfile) {
                IMAGE_TAG = "${PROJECT.project_id ?: 'scan'}:${params.SCAN_ID}"
                sh "docker build -t ${IMAGE_TAG} -f ${dockerfile} ${context}"
                recordStage('docker_build', 'PASS', 'Built from ${dockerfile}')
            } else {
                recordStage('docker_build', 'SKIPPED', 'No Dockerfile found')
            }
        }
    }
}
```

---

## Test Scenarios

| Project Structure | Detected | Context |
|-------------------|----------|---------|
| `Dockerfile` (root) | ✅ `Dockerfile` | `.` |
| `docker/Dockerfile` | ✅ `docker/Dockerfile` | `.` |
| `backend/Dockerfile` | ✅ `backend/Dockerfile` | `backend` |
| `frontend/Dockerfile` + `backend/Dockerfile` | ✅ `backend/Dockerfile` (priority) | `backend` |
| No Dockerfile | ⚠️ SKIPPED | - |

---

## Benefits vs. Proposed Architecture

| Aspect | Simple Approach | Proposed Architecture |
|--------|----------------|----------------------|
| **Lines added** | ~30 | ~200 |
| **Closures** | ✅ None | ❌ Multiple |
| **@Field maps** | ✅ None | ❌ Complex |
| **Serialization** | ✅ Safe | ❌ Risk |
| **Docker patterns** | ✅ 6 common | ✅ 30+ patterns |
| **Multi-service** | ⚠️ First match | ✅ All detected |
| **Coverage** | ~90% | ~99% |

**Recommendation:** Start with the simple approach. Add multi-service support only if you encounter repos with multiple Dockerfiles that need building.

---

## Implementation Steps

1. **Backup current Jenkinsfile**
2. **Replace Stage 7** with the middle-ground approach above
3. **Test with your repos:**
   ```bash
   # Test root Dockerfile
   # Test docker/Dockerfile
   # Test backend/Dockerfile
   ```
4. **Monitor Jenkins logs** for "Using..." messages
5. **Add more locations** if you encounter missed patterns

---

## Future Enhancement (If Needed)

If you find repos with **multiple Dockerfiles that all need building**:

```groovy
// Build ALL discovered Dockerfiles
def builtImages = []
for (loc in locations) {
    if (fileExists(loc.file)) {
        def tag = "${PROJECT.project_id}-${loc.service}:${params.SCAN_ID}"
        sh "docker build -t ${tag} -f ${loc.file} ${loc.context}"
        builtImages << tag
        recordStage('docker_build', 'PASS', "Built ${loc.file} -> ${tag}")
    }
}
env.BUILT_IMAGES = builtImages.join(',')
```

Then update Stage 8 (Push) and Stage 9 (Trivy Image Scan) to iterate over `builtImages`.
