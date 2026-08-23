"""Regression test for finding #119: HttpClient._process_response returned the raw
requests.Response object for *every* Jenkins request (GET included) whenever
JENKINS_BASE_URL happened to contain "jenkins" — JenkinsClient.get_build_status/
get_queue_item hand that straight to scan_recovery.py, which calls .get("building",
...) on it. requests.Response has no .get(), so this raised an uncaught
AttributeError, which also aborted that recovery cycle's separate timeout-based
sweep since both run in the same try block. GET requests must always return parsed
JSON; only Jenkins POST (which needs the Location header for queue-id extraction)
keeps the raw-response passthrough.
"""

import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_http_client.db')
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

from unittest.mock import MagicMock, patch

from app.infrastructure.http.client import HttpClient


def _mock_response(json_body=None, status_code=200, headers=None, content=b'{"a":1}'):
    resp = MagicMock()
    resp.ok = 200 <= status_code < 300
    resp.status_code = status_code
    resp.content = content
    resp.headers = headers or {}
    resp.json.return_value = json_body if json_body is not None else {}
    return resp


class TestJenkinsGetAlwaysReturnsDict:
    def test_get_request_to_jenkins_hostname_returns_dict_not_raw_response(self):
        # Base URL deliberately contains "jenkins" — this is exactly the condition
        # that used to trigger the raw-response bug.
        client = HttpClient(base_url="https://jenkins.internal.corp")
        fake_response = _mock_response(json_body={"building": False, "result": "SUCCESS"})

        with patch.object(client.session, "request", return_value=fake_response):
            result = client.request(method="GET", path="job/foo/1/api/json")

        assert isinstance(result, dict)
        assert result.get("building") is False  # would raise AttributeError pre-fix
        assert result.get("result") == "SUCCESS"

    def test_post_request_to_jenkins_hostname_still_returns_raw_response(self):
        # trigger_pipeline's queue-id extraction needs the raw response for headers —
        # this behavior must be preserved. Finding #20: Jenkins-ness is now an
        # explicit constructor flag, not inferred from the URL string.
        client = HttpClient(base_url="https://jenkins.internal.corp", is_jenkins=True)
        fake_response = _mock_response(
            status_code=201, headers={"Location": "https://jenkins.internal.corp/queue/item/42/"}
        )

        with patch.object(client.session, "request", return_value=fake_response):
            result = client.request(method="POST", path="job/foo/buildWithParameters")

        assert result is fake_response

    def test_get_request_to_non_jenkins_hostname_also_returns_dict(self):
        # Non-regression: the non-"jenkins" path already worked correctly.
        client = HttpClient(base_url="http://192.168.1.101:8080")
        fake_response = _mock_response(json_body={"building": True})

        with patch.object(client.session, "request", return_value=fake_response):
            result = client.request(method="GET", path="job/foo/1/api/json")

        assert isinstance(result, dict)
        assert result.get("building") is True


class TestJenkinsDetectionIsExplicitNotUrlBased:
    """Regression tests for #20: Jenkins-ness used to be a substring match on the
    base URL (`"jenkins" in self.base_url.lower()`). A real Jenkins instance
    reachable at a URL without that literal word (e.g. an internal hostname) would
    silently skip CSRF-crumb issuance and break every POST. Now it's an explicit
    constructor flag."""

    def test_post_to_url_without_jenkins_in_it_still_gets_jenkins_treatment_when_flagged(self):
        client = HttpClient(base_url="https://ci.internal.example.com", is_jenkins=True)
        crumb_response = _mock_response(json_body={"crumbRequestField": "Jenkins-Crumb", "crumb": "abc123"})
        post_response = _mock_response(
            status_code=201, headers={"Location": "https://ci.internal.example.com/queue/item/7/"}
        )

        with patch.object(client.session, "get", return_value=crumb_response), \
             patch.object(client.session, "request", return_value=post_response) as mock_request:
            result = client.request(method="POST", path="job/foo/buildWithParameters")

        # Would previously never fetch a crumb or return the raw response for a URL
        # without the literal word "jenkins" in it.
        assert mock_request.call_args.kwargs["headers"].get("Jenkins-Crumb") == "abc123"
        assert result is post_response

    def test_post_to_url_containing_jenkins_gets_generic_treatment_when_not_flagged(self):
        client = HttpClient(base_url="https://jenkins.internal.corp")  # is_jenkins defaults False
        generic_response = _mock_response(json_body={"ok": True})

        with patch.object(client.session, "request", return_value=generic_response):
            result = client.request(method="POST", path="some/generic/endpoint")

        # No longer raw-passthrough just because the URL string contains "jenkins".
        assert result == {"ok": True}
