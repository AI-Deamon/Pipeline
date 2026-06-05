# DevSecOps Pipeline Optimization - Research & Evaluation Plan

> **For Claude:** This is a research plan. Implementation begins June 15, 2026.

**Goal:** Evaluate and document OSS security scanning tools to optimize pipeline accuracy (B) and coverage (D) for mixed web + infrastructure environments.

**Architecture:** Research-only phase. No production changes. Test tools in isolated Docker environment. Document findings in comparison matrices.

**Tech Stack:** Jenkins CI/CD, Docker, Python, Go binaries, OSS security tools.

**Research Period:** May 27, 2026 - June 14, 2026
**Implementation Date:** June 15, 2026

---

## Research Overview

### Current Stack (Baseline)
| Tool | Version | Purpose | Known Issues |
|------|---------|---------|--------------|
| SonarQube | 26.5.0 | SAST + Code Quality | Basic security rules |
| OWASP ODC | Latest | SCA | High FP on npm, slow |
| Trivy | 0.67.2 | FS + Secrets | Limited IaC coverage |
| ZAP | Latest | DAST | API scanning not configured |
| Nmap | Latest | Network | Working well |
| Docker Build | Classic | Container | BuildKit compatibility issue |

### Target Stack (Post-Implementation)
| Tool | Purpose | Status |
|------|---------|--------|
| SonarQube | SAST + Code Quality | Keep |
| Trivy FS | SCA + Secrets | Keep (drop ODC) |
| Checkov | IaC Scanning | Research → Add |
| Semgrep | Security SAST | Research → Add |
| Gitleaks | Secrets Detection | Research → Add |
| Trivy Image | Container Scanning | Fix BuildKit |
| ZAP API | API Security | Research → Configure |

---

## Phase 1: Tool Discovery & Comparison (Week 1-2)

### Task 1.1: SCA Tool Comparison (Trivy vs ODC vs alternatives)

**Research Questions:**
- Which tool has the lowest false positive rate for npm/PyPI?
- Which has the most up-to-date vulnerability database?
- Which integrates best with Jenkins NDJSON output?

**Tools to Evaluate:**
| Tool | License | Install | Notes |
|------|---------|---------|-------|
| Trivy | Apache 2.0 | `apt install trivy` | Current pipeline |
| OWASP ODC | Apache 2.0 | Jenkins plugin | Current pipeline |
| Snyk CLI | Proprietary (free tier) | `snap install snyk` | Commercial DB |
| osv-scanner | Apache 2.0 | Go binary | Google OSV DB |
| grype | Apache 2.0 | Binary | Anchore project |

**Evaluation Script:**
```bash
#!/bin/bash
# Save to: scripts/research/sca-comparison.sh

TEST_REPO="https://github.com/OWASP/NodeGoat"  # Known vulnerable app

for tool in trivy snyk osv-scanner grype; do
    echo "=== Testing $tool ==="
    time $tool scan $TEST_REPO --format json > reports/sca-$tool.json
    jq '.Results[].Vulnerabilities | length' reports/sca-$tool.json
done

# Compare:
# - Vulnerability count
# - False positives (manual review)
# - Scan time
# - Report format usability
```

**Deliverable:** `docs/research/sca-tool-comparison.md`

---

### Task 1.2: IaC Scanning Tools (Checkov vs alternatives)

**Research Questions:**
- Which IaC frameworks are supported? (Terraform, K8s, CloudFormation, Dockerfile)
- How many policies/rules does each tool have?
- Can we write custom rules?
- Jenkins integration quality?

**Tools to Evaluate:**
| Tool | License | Frameworks | Custom Rules |
|------|---------|------------|--------------|
| Checkov | Apache 2.0 | TF, K8s, CF, Docker, Helm | ✅ Python |
| Terrascan | Apache 2.0 | TF, K8s, CF | ✅ Rego |
| tfsec | MIT | Terraform only | ❌ |
| Kube-bench | Apache 2.0 | K8s CIS only | ❌ |
| Hadolint | GPL-3.0 | Dockerfile only | ✅ Custom rules |

**Evaluation Script:**
```bash
#!/bin/bash
# Save to: scripts/research/iac-comparison.sh

# Test repos with known IaC issues
TEST_REPOS=(
    "https://github.com/OWASP/Serverless-Goat"
    "https://github.com/paloaltonetworks/terragoat"
    "https://github.com/paloaltonetworks/dockergoat"
)

for repo in "${TEST_REPOS[@]}"; do
    git clone $repo /tmp/iac-test
    cd /tmp/iac-test
    
    echo "=== Checkov ==="
    checkov -d . --output json > reports/checkov-$(basename $repo).json
    
    echo "=== Terrascan ==="
    terrascan scan -o json > reports/terrascan-$(basename $repo).json
    
    echo "=== tfsec ==="
    tfsec . --format json > reports/tfsec-$(basename $repo).json
    
    cd -
    rm -rf /tmp/iac-test
done
```

**Deliverable:** `docs/research/iac-tool-comparison.md`

---

### Task 1.3: Security SAST Tools (Semgrep vs alternatives)

**Research Questions:**
- How does Semgrep compare to SonarQube for security rules?
- What's the false positive rate?
- Can we write custom security rules?
- Performance on large TypeScript/Python codebases?

**Tools to Evaluate:**
| Tool | License | Languages | Security Rules |
|------|---------|-----------|----------------|
| Semgrep | LGPL-3.0 | 30+ | ✅ Community + Custom |
| SonarQube | LGPL | 27 | ✅ Built-in |
| CodeQL | MIT | 10 | ✅ Query language |
| Bandit | Apache 2.0 | Python only | ✅ Security focused |
| ESLint security | MIT | JS/TS | ✅ Plugin rules |

**Evaluation Script:**
```bash
#!/bin/bash
# Save to: scripts/research/sast-comparison.sh

# Use your own repo as test subject
TEST_REPO="/home/kali_linux/Agent-bfd7ff"

echo "=== Semgrep (auto rules) ==="
time semgrep scan --config auto --json $TEST_REPO > reports/semgrep-auto.json

echo "=== Semgrep (security rules only) ==="
time semgrep scan --config p/security --json $TEST_REPO > reports/semgrep-security.json

echo "=== Bandit (Python only) ==="
time bandit -r $TEST_REPO/backend -f json -o reports/bandit.json

echo "=== ESLint security ==="
cd $TEST_REPO && npx eslint --config .eslintrc.security.js -f json src > reports/eslint-security.json

# Compare:
# - Finding count by severity
# - False positives (manual review)
# - Scan time
# - Rule customization ability
```

**Deliverable:** `docs/research/sast-tool-comparison.md`

---

### Task 1.4: Secrets Detection Tools (Gitleaks vs alternatives)

**Research Questions:**
- Detection accuracy (FP/FN rate)?
- Git history scanning performance?
- Custom rule support for org-specific patterns?

**Tools to Evaluate:**
| Tool | License | Speed | Custom Rules |
|------|---------|-------|--------------|
| Gitleaks | MIT | Fast | ✅ Regex + entropy |
| TruffleHog | Apache 2.0 | Medium | ✅ Entropy + regex |
| detect-secrets | MIT | Fast | ✅ Plugin system |
| Secretlint | MIT | Fast | ✅ Plugin rules |
| Trivy secrets | Apache 2.0 | Fast | ⚠️ Limited |

**Evaluation Script:**
```bash
#!/bin/bash
# Save to: scripts/research/secrets-comparison.sh

TEST_REPO="/home/kali_linux/Agent-bfd7ff"

echo "=== Gitleaks (full history) ==="
time gitleaks detect --source $TEST_REPO --report-path reports/gitleaks.json

echo "=== TruffleHog ==="
time trufflehog filesystem $TEST_REPO --json > reports/trufflehog.json

echo "=== detect-secrets ==="
detect-secrets scan $TEST_REPO > reports/.secrets.baseline
detect-secrets audit reports/.secrets.baseline > reports/detect-secrets.json

echo "=== Trivy secrets ==="
time trivy fs --scanners secret $TEST_REPO --format json > reports/trivy-secrets.json

# Compare:
# - Secrets found (dedupe across tools)
# - False positives
# - Scan time (with/without history)
# - Custom rule ease
```

**Deliverable:** `docs/research/secrets-tool-comparison.md`

---

### Task 1.5: API Security Testing (ZAP API vs alternatives)

**Research Questions:**
- Can ZAP import OpenAPI/Swagger specs?
- How does API scanning differ from web DAST?
- Any OSS alternatives worth considering?

**Tools to Evaluate:**
| Tool | License | OpenAPI Support | Auth Support |
|------|---------|-----------------|--------------|
| ZAP API Scan | Apache 2.0 | ✅ Import | ✅ OAuth, JWT, API Key |
| Postman/Newman | Apache 2.0 | ✅ Import | ✅ All major types |
| Schemathesis | MIT | ✅ Property-based | ✅ Auth |
| BoB | MIT | ✅ Fuzzing | ⚠️ Limited |

**Evaluation Script:**
```bash
#!/bin/bash
# Save to: scripts/research/api-security-comparison.sh

# Your backend OpenAPI spec
OPENAPI_URL="http://localhost:8000/openapi.json"

echo "=== ZAP API Scan ==="
# Requires ZAP running
curl -s "http://localhost:${ZAP_PORT}/JSON/importview/action/importOpenAPI/?path=$OPENAPI_URL"
# Start active scan via API

echo "=== Schemathesis ==="
time schemathesis run $OPENAPI_URL --output-report-path reports/schemathesis.json

echo "=== Postman Collection Test ==="
# Export OpenAPI to Postman, run Newman
newman run api-tests.postman_collection.json --reporters json --reporter-json-export reports/newman.json
```

**Deliverable:** `docs/research/api-security-comparison.md`

---

## Phase 2: Integration Testing (Week 3)

### Task 2.1: Docker Test Environment Setup

**Goal:** Create isolated test environment for tool evaluation without affecting production.

**Deliverable:** `docker/docker-compose.research.yml`

```yaml
version: '3.8'
services:
  jenkins-research:
    build:
      context: ./docker/jenkins-research
      dockerfile: Dockerfile
    ports:
      - "8081:8080"  # Different port from prod Jenkins
    volumes:
      - jenkins-research-data:/var/jenkins_home
    environment:
      - JAVA_OPTS=-Xmx2g

  # Test scanners in isolation
  scanner-test:
    image: alpine:latest
    profiles: [trivy, semgrep, checkov, gitleaks]
    # Mount test repos, run tools
```

---

### Task 2.2: Jenkins Pipeline Test Job

**Goal:** Create parallel Jenkins job for tool testing without affecting production scans.

**Deliverable:** `Agent/Jenkinsfile.research`

```groovy
pipeline {
    agent any
    
    parameters {
        choice(name: 'TOOL', choices: ['trivy', 'semgrep', 'checkov', 'gitleaks'])
        string(name: 'TEST_REPO', defaultValue: 'https://github.com/OWASP/NodeGoat')
    }
    
    stages {
        stage('Install Tool') {
            steps {
                script {
                    // Install selected tool
                }
            }
        }
        stage('Run Scan') {
            steps {
                script {
                    // Run tool against test repo
                }
            }
        }
        stage('Generate Report') {
            steps {
                // Output comparison metrics
            }
        }
    }
}
```

---

### Task 2.3: Benchmark Test Repositories

**Goal:** Standardized test repos with known vulnerabilities for consistent comparison.

**Test Repositories:**
| Repo | Purpose | Vulnerabilities |
|------|---------|-----------------|
| OWASP NodeGoat | Node.js web app | XSS, SQLi, SSTI, deps |
| OWASP Serverless-Goat | AWS Lambda | IAM, S3, API Gateway |
| TerraGoat | Terraform | IAM, S3, Security Groups |
| DockerGoat | Dockerfiles | Privilege escalation, secrets |
| Juice Shop | Full-stack web app | OWASP Top 10 |

**Deliverable:** `scripts/research/setup-test-repos.sh`

---

## Phase 3: Documentation & Decision Matrix (Week 4)

### Task 3.1: Tool Comparison Matrix

**Deliverable:** `docs/research/tool-comparison-matrix.md`

```markdown
# Security Tool Comparison Matrix

## SCA Tools
| Criteria | Trivy | ODC | Snyk | osv-scanner | grype |
|----------|-------|-----|------|-------------|-------|
| npm accuracy | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| PyPI accuracy | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| Scan speed | 2 min | 8 min | 3 min | 1 min | 2 min |
| False positives | Low | High | Very Low | Low | Medium |
| Jenkins integration | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |
| License | Apache 2.0 | Apache 2.0 | Proprietary | Apache 2.0 | Apache 2.0 |
| **Recommendation** | ✅ KEEP | ❌ DROP | ⚠️ Consider | ✅ Backup | ⚠️ Backup |

[Repeat for each category: IaC, SAST, Secrets, API]
```

---

### Task 3.2: Migration Plan Draft

**Deliverable:** `docs/research/migration-plan-draft.md`

```markdown
# Pipeline Migration Plan (Draft)

## Phase 1: Remove ODC
- Update Jenkinsfile: remove `doDependencyCheck()` stage
- Update pipeline UI: remove ODC from stage selection
- Update backend: remove ODC result parsing
- Test: Verify Trivy FS covers all SCA needs

## Phase 2: Add Checkov
- Install on Jenkins: `pip install checkov`
- Add stage: `doCheckovScan()`
- Integrate reports into backend
- Test: Run against TerraGoat

## Phase 3: Add Semgrep
- Install on Jenkins
- Add stage: `doSemgrepScan()`
- Configure security rules only
- Test: Run against NodeGoat

## Phase 4: Add Gitleaks
- Install binary
- Add stage: `doGitleaksScan()`
- Configure custom rules
- Test: Plant test secrets, verify detection

## Phase 5: Fix Docker Build
- Add DOCKER_BUILDKIT=1 to environment
- Test: Build open-webui Dockerfile
- Verify Trivy Image scan works

## Rollback Plan
[Document how to revert each phase]
```

---

### Task 3.3: Cost/Benefit Analysis

**Deliverable:** `docs/research/cost-benefit-analysis.md`

```markdown
# Cost/Benefit Analysis

## Tool Addition Costs
| Tool | Install Time | Maintenance | Scan Time Add | FP Triage |
|------|--------------|-------------|---------------|-----------|
| Checkov | 1 hour | 2 hrs/month | +3 min | Low |
| Semgrep | 2 hours | 4 hrs/month | +5 min | Medium |
| Gitleaks | 30 min | 1 hr/month | +2 min | Low |

## Benefits
| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| IaC coverage | 0% | 95% | +95% |
| Security SAST | Basic | Enhanced | +40% rules |
| Secrets detection | Limited | Comprehensive | +60% patterns |
| Total scan time | 20 min | 18 min | -10% (drop ODC) |
| False positives | High | Low | -50% |

## ROI Calculation
- Engineer time saved: 2 hrs/week × 52 weeks = 104 hrs/year
- Vulnerabilities caught earlier: ~5/year × avg remediation cost
- Compliance readiness: SOC2/ISO27001 audit support
```

---

## Phase 4: Validation & Sign-off (June 1-14)

### Task 4.1: Stakeholder Review

**Audience:** Security team, DevOps, Engineering leads

**Deliverables:**
- Presentation: `docs/research/optimization-presentation.md`
- Executive summary: 1-page decision memo
- Demo: Live scan comparison (before/after)

---

### Task 4.2: Final Decision Document

**Deliverable:** `docs/research/final-recommendations.md`

```markdown
# Final Tool Recommendations

## Approved for Implementation (June 15, 2026)

### Add
1. **Checkov v3.x** - IaC scanning
2. **Semgrep v1.x** - Security SAST
3. **Gitleaks v8.x** - Secrets detection

### Remove
1. **OWASP ODC** - Redundant with Trivy FS

### Keep
1. SonarQube 26.5
2. Trivy FS
3. ZAP
4. Nmap

### Fix
1. Docker BuildKit compatibility

## Implementation Timeline
- June 15: Phase 1 (Remove ODC)
- June 16-17: Phase 2 (Add Checkov)
- June 18-19: Phase 3 (Add Semgrep)
- June 20: Phase 4 (Add Gitleaks)
- June 21: Phase 5 (Fix Docker)
- June 22-23: Testing + validation
- June 24: Production rollout

## Sign-off Required
- [ ] Security Team Lead
- [ ] DevOps Lead
- [ ] Engineering Manager
```

---

## Research Schedule

| Week | Dates | Focus | Deliverables |
|------|-------|-------|--------------|
| 1 | May 27 - Jun 2 | SCA + IaC tools | 2 comparison docs |
| 2 | Jun 3 - Jun 9 | SAST + Secrets + API | 3 comparison docs |
| 3 | Jun 10 - Jun 14 | Integration testing | Test env, pipeline |
| 4 | Jun 15 | Implementation begins | Migration starts |

---

## Research Notes Template

**Use this template for each tool evaluation:**

```markdown
# [Tool Name] Evaluation

## Installation
```bash
# Exact install commands tested
```

## Configuration
```yaml
# Sample config used
```

## Test Results
- Repo tested: [URL]
- Scan time: [duration]
- Findings: [count by severity]
- False positives: [count, examples]

## Pros
- 

## Cons
-

## Jenkins Integration
- Installation steps
- Pipeline snippet
- Report format

## Recommendation
[Keep/Drop/Alternative]

## Date Tested
[YYYY-MM-DD]
```

---

## Success Criteria

Research phase is complete when:
- [ ] All 5 comparison documents written
- [ ] Test environment functional
- [ ] At least 3 test repos scanned with each tool
- [ ] Migration plan reviewed and approved
- [ ] Stakeholder sign-off obtained

---

## Notes

- All research in isolated environment — no production impact
- Document everything (even failed experiments)
- Focus on OSS tools only (per user requirement B)
- Implementation begins June 15, 2026
