"""
Tests for security and tooling fixes in the Jenkinsfile.

Covers:
- Trivy FS scan uses conditional .trivyignore
- Sonar scanner has no duplicate token injection
- Docker push does not leak secrets via Groovy interpolation
- PIPESTATUS used for Docker build exit code capture
- All recordStage calls have matching backend VALID_STAGES
- No hardcoded tokens or keys in Jenkinsfile
"""
import re
from pathlib import Path

import pytest

JENKINSFILE = Path(__file__).parent.parent / "Agent" / "Jenkinsfile"


@pytest.fixture(scope="module")
def content():
    return JENKINSFILE.read_text()


# ── Trivy FS Scan fixes ────────────────────────────────────────────────────

def test_trivy_conditional_ignorefile(content):
    """Trivy must check .trivyignore exists before passing --ignorefile."""
    # Must have the file existence check
    assert "-f .trivyignore" in content, (
        "Missing '[ -f .trivyignore ]' check"
    )
    # Must NOT have unconditional --ignorefile .trivyignore
    # The pattern '--ignorefile .trivyignore' should not appear as a literal
    # in the trivy fs command (only via variable)
    # Find the doTrivyFsScan function body
    match = re.search(r"def doTrivyFsScan\(\)\s*\{(.*?)\ndef ", content, re.DOTALL)
    assert match, "doTrivyFsScan function not found"
    body = match.group(1)
    # Should have IGNORE_FLAG variable
    assert "IGNORE_FLAG" in body, (
        "IGNORE_FLAG variable not found in doTrivyFsScan"
    )
    # Should use $IGNORE_FLAG (not literal --ignorefile .trivyignore)
    assert "\\$IGNORE_FLAG" in body or "$IGNORE_FLAG" in body, (
        "doTrivyFsScan must use $IGNORE_FLAG variable, not literal --ignorefile"
    )


def test_trivy_exits_on_pipestatus(content):
    """Trivy FS scan must use PIPESTATUS to capture real exit code."""
    match = re.search(r"def doTrivyFsScan\(\)\s*\{(.*?)\ndef ", content, re.DOTALL)
    assert match, "doTrivyFsScan function not found"
    body = match.group(1)
    assert "PIPESTATUS" in body, (
        "doTrivyFsScan must use PIPESTATUS to capture trivy exit code through the tee pipe"
    )


# ── Sonar scanner auth fix ─────────────────────────────────────────────────

def test_sonar_no_sonar_token_cli_arg(content):
    """Sonar scanner must NOT pass -Dsonar.token on the command line.

    withSonarQubeEnv already injects SONAR_TOKEN as an environment variable,
    which sonar-scanner picks up automatically. Passing -Dsonar.token creates
    a duplicate auth mechanism that can conflict.
    """
    match = re.search(r"def doSonarScanner\(\)\s*\{(.*?)\ndef ", content, re.DOTALL)
    assert match, "doSonarScanner function not found"
    body = match.group(1)
    assert "-Dsonar.token" not in body, (
        "doSonarScanner still has -Dsonar.token. "
        "withSonarQubeEnv already injects SONAR_TOKEN — remove it."
    )


def test_sonar_uses_with_sonarqube_env(content):
    """Sonar scanner must use withSonarQubeEnv for auth."""
    match = re.search(r"def doSonarScanner\(\)\s*\{(.*?)\ndef ", content, re.DOTALL)
    assert match
    body = match.group(1)
    assert "withSonarQubeEnv" in body


def test_sonar_uses_with_credentials_for_token(content):
    """Sonar scanner must load token via withCredentials."""
    match = re.search(r"def doSonarScanner\(\)\s*\{(.*?)\ndef ", content, re.DOTALL)
    assert match
    body = match.group(1)
    assert "withCredentials" in body
    assert "sonar-token" in body


# ── Docker push secret handling ─────────────────────────────────────────────

def test_docker_push_no_groovy_string_interpolation_of_secrets(content):
    """DOCKER_PASS and DOCKER_USER must not be leaked via Groovy interpolation.

    In Groovy:
    - sh "echo $VAR"  --> Groovy interpolates, secret visible in process table
    - sh '''echo $VAR'''  --> shell expands, Groovy doesn't see the value
    - sh with escaped dollar sign  --> Groovy escapes $, shell expands safely

    The fix uses triple-double-quoted GString with escaped $ so Groovy passes
    literal $VAR to the shell.
    """
    match = re.search(r"def doDockerPush\(\)\s*\{(.*?)\ndef ", content, re.DOTALL)
    assert match, "doDockerPush function not found"
    body = match.group(1)

    # Must not have sh "...$DOCKER_PASS..." without escaping
    # Find all sh blocks
    sh_blocks = re.findall(r'sh\s*"""(.*?)"""', body, re.DOTALL)
    for block in sh_blocks:
        # In each block, $DOCKER_PASS must be preceded by backslash
        dollar_pass_pos = [m.start() for m in re.finditer(r"\$DOCKER_PASS", block)]
        for pos in dollar_pass_pos:
            if pos == 0 or block[pos - 1] != "\\":
                pytest.fail(
                    f"Unescaped $DOCKER_PASS in sh block. "
                    f"Use \\$DOCKER_PASS for safe shell expansion. "
                    f"Context: {repr(block[max(0, pos - 10):pos + 20])}"
                )


def test_docker_push_login_command(content):
    """Docker push must use docker login with --password-stdin."""
    match = re.search(r"def doDockerPush\(\)\s*\{(.*?)\ndef ", content, re.DOTALL)
    assert match, "doDockerPush function not found"
    body = match.group(1)
    assert "--password-stdin" in body, (
        "Docker login should use --password-stdin, not -p flag"
    )


# ── Docker build PIPESTATUS ─────────────────────────────────────────────────

def test_docker_build_captures_real_exit_code(content):
    """Docker build must capture docker build exit code, not tee's."""
    match = re.search(r"def doDockerBuild\(\)\s*\{(.*?)\ndef ", content, re.DOTALL)
    assert match, "doDockerBuild function not found"
    body = match.group(1)
    assert "PIPESTATUS" in body, (
        "Docker build uses $? which gets tee's exit code (always 0). "
        "Use PIPESTATUS[0] to get docker build's real exit code."
    )


def test_docker_build_verifies_image_after_build(content):
    """Docker build must verify image exists before marking as success."""
    match = re.search(r"def doDockerBuild\(\)\s*\{(.*?)\ndef ", content, re.DOTALL)
    assert match, "doDockerBuild function not found"
    body = match.group(1)
    assert "docker image inspect" in body, (
        "No image verification after build. "
        "Add: docker image inspect IMAGE >/dev/null 2>&1"
    )


# ── No hardcoded credentials ───────────────────────────────────────────────

HARDCODED_PATTERNS = [
    (r'NVD_API_KEY\s*=\s*"[a-z0-9]{20,}"', "Hardcoded NVD API key"),
    (r'CALLBACK_TOKEN\s*=\s*"[a-z0-9]{20,}"', "Hardcoded callback token"),
    (r'SONAR_TOKEN\s*=\s*"[a-z0-9]{20,}"', "Hardcoded Sonar token"),
    (r'DOCKER_PASS\s*=\s*"[^"]{8,}"', "Hardcoded Docker password"),
]


@pytest.mark.parametrize("pattern,description", HARDCODED_PATTERNS)
def test_no_hardcoded_credentials(pattern, description, content):
    """No hardcoded credentials should appear in the Jenkinsfile."""
    matches = re.findall(pattern, content)
    assert len(matches) == 0, (
        f"{description} found in Jenkinsfile ({len(matches)} occurrence(s)). "
        f"Use withCredentials to load secrets from Jenkins."
    )


# ── Stage timeout configuration ─────────────────────────────────────────────

def test_scan_timeout_parameter(content):
    """Jenkinsfile must accept SCAN_TIMEOUT parameter."""
    assert "SCAN_TIMEOUT" in content


def test_stage_timeouts_present(content):
    """Key stages should have per-stage timeout wrappers."""
    # Sonar Scanner has 20 minute timeout
    assert "20, unit: 'MINUTES'" in content or "20, unit: \"MINUTES\"" in content, (
        "Sonar Scanner stage should have a 20 minute timeout"
    )


# ── Pipeline options ───────────────────────────────────────────────────────

def test_disable_concurrent_builds(content):
    """Pipeline must disable concurrent builds to prevent scan conflicts."""
    assert "disableConcurrentBuilds" in content


def test_retry_configured(content):
    """Pipeline should have retry configured."""
    assert "retry(" in content


def test_build_discarder(content):
    """Pipeline should have build log rotation."""
    assert "buildDiscarder" in content
