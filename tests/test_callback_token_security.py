"""
Test for callback token security - ensures no hardcoded tokens exist.
"""
import re
from pathlib import Path


def test_jenkinsfile_no_hardcoded_callback_token():
    """
    Security test: Verify Jenkinsfile does not contain hardcoded callback token.
    """
    jenkinsfile_path = Path(__file__).parent.parent / "Agent" / "Jenkinsfile"
    content = jenkinsfile_path.read_text()
    
    hardcoded_token_pattern = r'CALLBACK_TOKEN\s*=\s*["\'][a-z0-9]{32,}["\']'
    matches = re.findall(hardcoded_token_pattern, content, re.IGNORECASE)
    
    assert len(matches) == 0, (
        f"Hardcoded callback token found in Jenkinsfile ({len(matches)} occurrence(s)). "
        "Use withCredentials to load CALLBACK_TOKEN from Jenkins credentials."
    )


def test_jenkinsfile_callback_token_not_in_environment_block():
    """
    Security test: Verify CALLBACK_TOKEN is NOT in the environment block.
    It should be loaded via withCredentials only.
    """
    jenkinsfile_path = Path(__file__).parent.parent / "Agent" / "Jenkinsfile"
    content = jenkinsfile_path.read_text()
    
    # Find the environment block and check CALLBACK_TOKEN is not inside it
    in_env_block = False
    for line in content.split('\n'):
        if re.match(r'\s+environment\s*\{', line):
            in_env_block = True
            continue
        if in_env_block and line.strip() == '}':
            in_env_block = False
            continue
        if in_env_block and 'CALLBACK_TOKEN' in line:
            raise AssertionError(
                f"CALLBACK_TOKEN should not be in environment block. "
                f"Use withCredentials instead. Found: {line.strip()}"
            )


def test_jenkinsfile_callback_token_escaped_in_sh():
    """
    Security test: Verify CALLBACK_TOKEN is escaped with \\$ in sh blocks
    to prevent Groovy string interpolation of secrets.
    
    Check that every $CALLBACK_TOKEN in a sh block has a preceding backslash.
    """
    jenkinsfile_path = Path(__file__).parent.parent / "Agent" / "Jenkinsfile"
    content = jenkinsfile_path.read_text()
    
    # Find all $CALLBACK_TOKEN and verify each is preceded by \
    dollar_refs = [m.start() for m in re.finditer(r'\$CALLBACK_TOKEN', content)]
    for pos in dollar_refs:
        if pos == 0 or content[pos - 1] != '\\':
            snippet = content[max(0, pos - 5):pos + 20]
            raise AssertionError(
                f"$CALLBACK_TOKEN in sh block must be escaped as "
                f"\\$CALLBACK_TOKEN. Found unescaped at position {pos}: "
                f"{repr(snippet)}"
            )
    
    # Verify at least one properly escaped reference exists
    assert len(dollar_refs) > 0, (
        "Expected at least one $CALLBACK_TOKEN reference (escaped) in sh blocks"
    )


def test_jenkinsfile_no_hardcoded_nvd_key_fallback():
    """
    Security test: Verify NVD_API_KEY uses credentials() not env fallback.
    """
    jenkinsfile_path = Path(__file__).parent.parent / "Agent" / "Jenkinsfile"
    content = jenkinsfile_path.read_text()
    
    nvd_pattern = r'NVD_API_KEY\s*=\s*"\$\{env\.NVD_API_KEY\s*\?:\s*[\'"][^\'"]+[\'"]\s*\}"'
    matches = re.findall(nvd_pattern, content)
    assert len(matches) == 0, (
        f"Hardcoded NVD_API_KEY fallback found ({len(matches)} occurrence(s)). "
        "Use credentials() to load NVD_API_KEY from Jenkins."
    )
