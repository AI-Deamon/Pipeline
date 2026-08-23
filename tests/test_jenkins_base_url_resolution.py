"""Regression test for finding #15: resolve_jenkins_base_url used to swap in a
project's target_ip as the entire Jenkins base URL. Since fetch_artifact() attaches
the real Jenkins admin Basic-auth credential to requests against that URL, an
attacker-controlled target_ip meant the admin token got sent straight to them —
and it was SSRF-capable against internal targets too, since only IP-shape was
validated. target_ip is the IP of the *scanned application* (see the Nmap stage in
docs/jenkins_pipeline_architecture.md), never a Jenkins endpoint.
"""

import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_jenkins_base_url.db')
os.environ.setdefault('JENKINS_BASE_URL', 'http://real-jenkins.internal:8080')
os.environ.setdefault('JENKINS_TOKEN', 'test-token')
os.environ.setdefault('STORAGE_PATH', '/tmp/storage-test')
os.environ.setdefault('SCAN_TIMEOUT', '7200')
os.environ.setdefault('LOG_LEVEL', 'INFO')
os.environ.setdefault('CALLBACK_TOKEN', 'test-callback-token-1234567890')
os.environ.setdefault('API_KEY', 'test-api-key-1234567890')
os.environ.setdefault('TEST_BYPASS_AUTH', 'True')
os.environ.setdefault('MOCK_EXECUTION', 'True')
os.environ.setdefault('SONARQUBE_TOKEN', 'test-sonar-token-1234567890')

from types import SimpleNamespace

from app.api.scans.utils import resolve_jenkins_base_url
from app.core.config import settings

# NOTE: settings is a module-level singleton read once at import time, so its
# JENKINS_BASE_URL value depends on whichever env var was in os.environ when
# app.core.config was first imported (test collection order, not this file's
# os.environ.setdefault above). Asserting against settings.JENKINS_BASE_URL itself
# — rather than a hardcoded string — keeps this test correct regardless of that.


def test_target_ip_does_not_override_jenkins_base_url():
    project = SimpleNamespace(target_ip="203.0.113.7")  # attacker-controlled, in prod
    assert resolve_jenkins_base_url(project) == settings.JENKINS_BASE_URL


def test_no_target_ip_still_returns_configured_jenkins_url():
    project = SimpleNamespace(target_ip=None)
    assert resolve_jenkins_base_url(project) == settings.JENKINS_BASE_URL


def test_none_project_returns_configured_jenkins_url():
    assert resolve_jenkins_base_url(None) == settings.JENKINS_BASE_URL
