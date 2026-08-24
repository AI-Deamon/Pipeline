"""Regression test for a real bug found live while verifying the code-snippet
endpoint (used by IssueDetailModal to show real source around a finding):
`_fetch_github_content` built the raw.githubusercontent.com URL via
`git_url.replace("github.com", "raw.githubusercontent.com").replace(".git", "")`.

That second `.replace(".git", "")` doesn't just strip the repo's trailing
".git" suffix — "raw.githubusercontent.com" itself contains the literal
substring ".git" (right after "raw"), so the blind replace corrupted the
hostname to "rawhubusercontent.com", which doesn't resolve. Every fetch for
a project configured with the standard `https://github.com/org/repo.git`
URL (both real projects in this deployment) failed with a DNS error,
silently caught and surfaced to the user as an indistinguishable 404.
"""
import os
from unittest.mock import patch, Mock

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_code_snippet_github_url.db')
os.environ.setdefault('JENKINS_BASE_URL', 'http://localhost:8080')
os.environ.setdefault('JENKINS_TOKEN', 'test-token')
os.environ.setdefault('STORAGE_PATH', '/tmp/storage-test')
os.environ.setdefault('SCAN_TIMEOUT', '7200')
os.environ.setdefault('LOG_LEVEL', 'INFO')
os.environ.setdefault('CALLBACK_TOKEN', 'test-callback-token-1234567890')
os.environ.setdefault('API_KEY', 'test-api-key-1234567890')
os.environ.setdefault('TEST_BYPASS_AUTH', 'True')
os.environ.setdefault('MOCK_EXECUTION', 'True')
os.environ.setdefault('SONARQUBE_TOKEN', 'test-sonar-token-1234567890')

from app.api.projects import _fetch_github_content


def test_raw_url_hostname_is_not_corrupted_for_dot_git_urls():
    """The dominant real-world case: a git_url ending in the standard `.git` suffix."""
    with patch("httpx.get") as mock_get:
        mock_get.return_value = Mock(status_code=200, text="print('hello')")
        content, source = _fetch_github_content(
            "https://github.com/CorentinTh/it-tools.git", "main", "src/app.ts"
        )

    assert content == "print('hello')"
    assert source == "github"
    requested_url = mock_get.call_args[0][0]
    assert requested_url == "https://raw.githubusercontent.com/CorentinTh/it-tools/main/src/app.ts"
    # The specific failure mode: hostname must never come out as "rawhubusercontent.com".
    assert "raw.githubusercontent.com" in requested_url


def test_raw_url_works_without_dot_git_suffix_too():
    with patch("httpx.get") as mock_get:
        mock_get.return_value = Mock(status_code=200, text="content")
        _fetch_github_content("https://github.com/org/repo", "develop", "a/b.py")

    requested_url = mock_get.call_args[0][0]
    assert requested_url == "https://raw.githubusercontent.com/org/repo/develop/a/b.py"
