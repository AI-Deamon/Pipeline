"""
Tests for Jenkinsfile structure, stage definitions, and security.

Validates:
- All stage functions exist and are defined
- recordStage() calls use valid stage IDs
- No hardcoded secrets or tokens
- Sonar auth fix (no duplicate token injection)
- Trivy ignorefile is conditional
- Dockerfile discovery excludes node_modules
- Docker build uses PIPESTATUS for exit code
- Docker push uses proper secret handling
- sendIntermediateCallback is called after each stage
"""
import re
from pathlib import Path

import pytest

JENKINSFILE_PATH = Path(__file__).parent.parent / "Agent" / "Jenkinsfile"


@pytest.fixture(scope="module")
def jenkinsfile_content():
    return JENKINSFILE_PATH.read_text()


# ── Stage function definitions ──────────────────────────────────────────────

EXPECTED_FUNCTIONS = [
    "doInitContext",
    "doGitCheckout",
    "doSonarScanner",
    "doInstallDependencies",
    "doDependencyCheck",
    "doTrivyFsScan",
    "doDockerBuild",
    "doDockerPush",
    "doTrivyImageScan",
    "doNmapSystemScan",
    "doZapScan",
    "shouldRun",
    "recordStage",
    "sendIntermediateCallback",
    "validateStage",
    "findDependencyFiles",
    "getDependencyScanPaths",
]


@pytest.mark.parametrize("func_name", EXPECTED_FUNCTIONS)
def test_function_defined(func_name, jenkinsfile_content):
    """Every stage must have a corresponding Groovy function."""
    pattern = rf"def {func_name}\s*\("
    assert re.search(pattern, jenkinsfile_content), (
        f"Function '{func_name}()' not found in Jenkinsfile"
    )


# ── Stage pipeline definitions ──────────────────────────────────────────────

EXPECTED_PIPELINE_STAGES = [
    "Init Context",
    "Git Checkout",
    "Sonar Scanner",
    "Install Dependencies",
    "Dependency Check",
    "Trivy FS Scan",
    "Docker Build",
    "Docker Push",
    "Trivy Image Scan",
    "Nmap System Scan",
    "ZAP Scan",
]


@pytest.mark.parametrize("stage_name", EXPECTED_PIPELINE_STAGES)
def test_pipeline_stage_defined(stage_name, jenkinsfile_content):
    """Each expected stage must appear in the pipeline block."""
    pattern = rf"stage\(\s*['\"]{re.escape(stage_name)}['\"]\s*\)"
    assert re.search(pattern, jenkinsfile_content), (
        f"Pipeline stage '{stage_name}' not found in Jenkinsfile"
    )


# ── recordStage calls use valid IDs ─────────────────────────────────────────

VALID_STAGE_IDS = [
    "git_checkout",
    "sonar_scanner",
    "install_dependencies",
    "dependency_check",
    "trivy_fs_scan",
    "docker_build",
    "docker_push",
    "trivy_image_scan",
    "nmap_scan",
    "zap_scan",
]


def test_recordstage_uses_valid_ids(jenkinsfile_content):
    """recordStage() calls must use IDs from the VALID_STAGES set."""
    calls = re.findall(r"recordStage\(\s*'([^']+)'", jenkinsfile_content)
    for stage_id in calls:
        assert stage_id in VALID_STAGE_IDS, (
            f"recordStage('{stage_id}') uses ID not in VALID_STAGES. "
            f"Valid IDs: {VALID_STAGE_IDS}"
        )


def test_recordstage_ids_match_backend_validation():
    """recordStage IDs in Jenkinsfile must match backend VALID_STAGES."""
    from app.services.validation import VALID_STAGES

    jenkinsfile = JENKINSFILE_PATH.read_text()
    calls = set(re.findall(r"recordStage\(\s*'([^']+)'", jenkinsfile))

    for stage_id in calls:
        assert stage_id in VALID_STAGES, (
            f"Jenkinsfile stage '{stage_id}' not in backend VALID_STAGES. "
            f"Backend accepts: {sorted(VALID_STAGES)}"
        )


# ── SonarQube auth fix ─────────────────────────────────────────────────────

def test_no_duplicate_sonar_token_injection(jenkinsfile_content):
    """Sonar scanner must NOT pass -Dsonar.token=$SONAR_TOKEN.

    withSonarQubeEnv('sonar-server') already injects SONAR_TOKEN as an
    env var. Passing -Dsonar.token creates a duplicate that conflicts.
    """
    assert "-Dsonar.token" not in jenkinsfile_content, (
        "Found -Dsonar.token in Jenkinsfile. withSonarQubeEnv already injects "
        "SONAR_TOKEN — remove -Dsonar.token to avoid auth conflicts."
    )


def test_sonar_uses_with_sonarqube_env(jenkinsfile_content):
    """Sonar scanner must use withSonarQubeEnv for token injection."""
    assert "withSonarQubeEnv(" in jenkinsfile_content, (
        "withSonarQubeEnv() not found. Use it to inject SONAR_TOKEN."
    )


# ── Trivy ignorefile conditional ────────────────────────────────────────────

def test_trivy_ignorefile_is_conditional(jenkinsfile_content):
    """Trivy must only pass --ignorefile if .trivyignore exists."""
    # Look for conditional .trivyignore check in doTrivyFsScan
    assert "-f .trivyignore" in jenkinsfile_content, (
        "Missing conditional .trivyignore check. "
        "Use: [ -f .trivyignore ] && IGNORE_FLAG='--ignorefile .trivyignore'"
    )
    # The string '--ignorefile .trivyignore' may appear as a variable value,
    # but must NOT be passed directly to the trivy fs command.
    # Verify IGNORE_FLAG is used (not literal --ignorefile in trivy args)
    match = re.search(r"def doTrivyFsScan\(\)\s*\{(.*?)\ndef ", jenkinsfile_content, re.DOTALL)
    assert match, "doTrivyFsScan function not found"
    body = match.group(1)
    assert "IGNORE_FLAG" in body, (
        "IGNORE_FLAG variable not found in doTrivyFsScan. "
        "Must use conditional: [ -f .trivyignore ] && IGNORE_FLAG='--ignorefile .trivyignore'"
    )
    # Verify the trivy command uses $IGNORE_FLAG, not literal --ignorefile
    trivy_cmd = re.search(r"TRIVY_PATH.*?fs.*?-o reports", body, re.DOTALL)
    if trivy_cmd:
        assert "--ignorefile" not in trivy_cmd.group(0), (
            "--ignorefile passed directly to trivy fs command. "
            "Use $IGNORE_FLAG variable instead."
        )


# ── Dockerfile discovery ────────────────────────────────────────────────────

def test_dockerfile_discovery_excludes_node_modules(jenkinsfile_content):
    """Dockerfile discovery must exclude node_modules/."""
    assert "node_modules" in jenkinsfile_content, (
        "node_modules exclusion not found in Dockerfile discovery"
    )
    # The find command for Dockerfiles must have -prune for node_modules
    # Pattern: find . -path './node_modules' -prune -o ... -type f ... -print
    dockerfile_find_pattern = re.search(
        r"find\s+\.\s.*node_modules.*-prune.*Dockerfile", jenkinsfile_content
    )
    assert dockerfile_find_pattern, (
        "Dockerfile discovery does not prune node_modules. "
        "Use: find . -path './node_modules' -prune -o -type f -name 'Dockerfile*' -print"
    )


def test_dockerfile_discovery_excludes_dotgit(jenkinsfile_content):
    """Dockerfile discovery must exclude .git/."""
    git_prune = re.search(r"\.git.*-prune", jenkinsfile_content)
    assert git_prune, ".git/ not excluded from Dockerfile discovery"


# ── Docker build uses PIPESTATUS ────────────────────────────────────────────

def test_docker_build_uses_pipestatus(jenkinsfile_content):
    """Docker build must capture docker build exit code via PIPESTATUS."""
    assert "PIPESTATUS" in jenkinsfile_content, (
        "Docker build uses $? which captures tee's exit code, not docker build's. "
        "Use PIPESTATUS[0] to get the real docker build exit code."
    )


def test_docker_build_verifies_image_exists(jenkinsfile_content):
    """Docker build must verify the image exists after build."""
    assert "docker image inspect" in jenkinsfile_content, (
        "No docker image inspect after build. "
        "Verify image exists before marking build as successful."
    )


# ── Docker push secret handling ─────────────────────────────────────────────

def test_no_groovy_interpolation_of_docker_pass(jenkinsfile_content):
    """DOCKER_PASS must not be interpolated by Groovy.

    Groovy string interpolation (double-quoted strings) leaks secrets.
    Use shell expansion with \\$ in triple-quoted GStrings or single quotes.
    """
    # Find sh blocks with DOCKER_PASS
    dollar_pass_refs = [
        m.start() for m in re.finditer(r"\$DOCKER_PASS", jenkinsfile_content)
    ]
    assert len(dollar_pass_refs) > 0, (
        "Expected $DOCKER_PASS references in Docker push sh blocks"
    )
    # Each $DOCKER_PASS must be preceded by \\ (Groovy escaped) so shell expands it
    for pos in dollar_pass_refs:
        if pos == 0 or jenkinsfile_content[pos - 1] != "\\":
            snippet = jenkinsfile_content[max(0, pos - 10) : pos + 20]
            pytest.fail(
                f"$DOCKER_PASS at position {pos} is not escaped. "
                f"Use \\$DOCKER_PASS so shell expands it, not Groovy. "
                f"Context: {repr(snippet)}"
            )


# ── sendIntermediateCallback after each stage ───────────────────────────────

def test_recordstage_sends_intermediate_callback(jenkinsfile_content):
    """recordStage must call sendIntermediateCallback for live UI updates."""
    # Find the recordStage function body and check it calls sendIntermediateCallback
    record_stage_match = re.search(
        r"def recordStage\([^)]*\)\s*\{(.*?)\n\}", jenkinsfile_content, re.DOTALL
    )
    assert record_stage_match, "recordStage function not found"
    body = record_stage_match.group(1)
    assert "sendIntermediateCallback" in body, (
        "recordStage does not call sendIntermediateCallback. "
        "Frontend won't get live stage updates."
    )


# ── Helper utilities exist ──────────────────────────────────────────────────

def test_should_run_handles_manual_mode(jenkinsfile_content):
    """shouldRun must check SELECTED list for manual scans."""
    should_run_match = re.search(
        r"def shouldRun\([^)]*\)\s*\{(.*?)\n\}", jenkinsfile_content, re.DOTALL
    )
    assert should_run_match, "shouldRun function not found"
    body = should_run_match.group(1)
    assert "IS_MANUAL" in body, (
        "shouldRun does not check IS_MANUAL flag"
    )
    assert "SELECTED" in body, (
        "shouldRun does not check SELECTED list for manual mode"
    )


def test_validate_stage_exists(jenkinsfile_content):
    """validateStage utility must exist for post-condition checks."""
    assert "def validateStage(" in jenkinsfile_content
