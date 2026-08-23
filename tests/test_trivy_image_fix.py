"""Test for Trivy image static filename fix in Jenkinsfile."""
from pathlib import Path

import pytest

JENKINSFILE_PATH = Path(__file__).parent.parent / "Agent" / "Jenkinsfile"


def test_trivy_image_static_filename():
    """Verify Jenkins outputs static trivy-image.json"""
    with open(JENKINSFILE_PATH) as f:
        content = f.read()

    # Check line 383 uses static filename
    assert 'trivy-image.json' in content, "Jenkinsfile should use static trivy-image.json"

    # Find the trivy image scan command section
    trivy_section = content.split('trivy-image')[1].split('\n')[0] if 'trivy-image' in content else ''
    assert 'md5sum' not in trivy_section, \
        "Should not use dynamic md5 filename in trivy image scan command"
