import requests
import logging
from typing import Any, Dict, Optional
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from app.core.exceptions import ExternalServiceError
from app.core.config import settings

logger = logging.getLogger(__name__)


def _build_retrying_session() -> requests.Session:
    """A session with connection pooling and bounded retry/backoff for transient
    failures (connection errors, 429, 5xx) against flaky Jenkins/SonarQube endpoints.
    Only idempotent-ish methods are retried; POST is NOT auto-retried to avoid
    double-triggering builds."""
    session = requests.Session()
    retry = Retry(
        total=3,
        connect=3,
        read=2,
        backoff_factor=0.5,  # 0.5s, 1s, 2s
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET", "HEAD", "OPTIONS"}),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=10, pool_maxsize=10)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


class HttpClient:
    def __init__(
        self,
        base_url: str,
        default_headers: Optional[Dict[str, str]] = None,
        is_jenkins: bool = False,
    ):
        # Finding #20: previously inferred per-request via `"jenkins" in
        # self.base_url.lower()` — a substring match on whatever URL the caller
        # configured. A real Jenkins instance reachable at a URL without the
        # literal word "jenkins" (e.g. `https://ci.internal.example.com`) would
        # silently skip CSRF-crumb issuance and break every POST. The caller
        # already knows which service this client talks to, so take it as an
        # explicit constructor flag instead of re-guessing from the URL string
        # on every request.
        self.base_url = base_url.rstrip("/")
        self.default_headers = default_headers or {}
        self.is_jenkins = is_jenkins
        self.session = _build_retrying_session()
        if self.default_headers:
            self.session.headers.update(self.default_headers)

    def _get_jenkins_crumb(self, request_headers: dict) -> dict:
        try:
            crumb_response = self.session.get(
                f"{self.base_url}/crumbIssuer/api/json", timeout=10
            )
            if crumb_response.ok:
                crumb_data = crumb_response.json()
                crumb_field = crumb_data.get("crumbRequestField", "Jenkins-Crumb")
                crumb_value = crumb_data.get("crumb")
                if crumb_value:
                    request_headers[crumb_field] = crumb_value
        except Exception as e:
            logger.warning(f"Failed to get Jenkins crumb: {e}")
        return request_headers

    def _send_jenkins_post(self, url: str, params: Optional[Dict], request_headers: dict, timeout: int):
        logger.info(f"[HTTP] Sending Jenkins POST request to {url}")
        logger.info(f"[HTTP] Query params: {params}")
        return self.session.request(
            method="POST", url=url, params=params,
            headers=request_headers, timeout=timeout, allow_redirects=True,
        )

    def _send_jenkins_get(self, url: str, params: Optional[Dict], request_headers: dict, timeout: int):
        logger.info(f"[HTTP] Sending Jenkins GET request to {url}")
        return self.session.request(
            method="GET", url=url, params=params,
            headers=request_headers, timeout=timeout,
        )

    def _send_generic(self, url: str, method: str, data: Optional[Dict], params: Optional[Dict], request_headers: dict, timeout: int):
        logger.info(f"[HTTP] Sending request to {url} with params: {params}, json: {data}")
        return self.session.request(
            method=method, url=url, json=data, params=params,
            headers=request_headers, timeout=timeout,
        )

    def _process_response(self, response, is_jenkins_request: bool, method: str = "GET"):
        if not response.ok:
            raise ExternalServiceError(
                service=response.url,
                status_code=response.status_code,
                message=response.text,
            )
        # The raw-response passthrough only exists for Jenkins POST (trigger_pipeline
        # needs the Location header to extract a queue id — see
        # JenkinsClient._extract_queue_id, which already defensively handles both this
        # raw-Response shape and the parsed-dict shape). GET requests — including
        # get_build_status/get_queue_item's status polls — have no such need and
        # every caller expects a parsed dict. Previously *all* Jenkins requests (GET
        # included) returned the raw response whenever `is_jenkins_request` was true,
        # so `scan_recovery.py`'s `.get("building", ...)` calls raised an uncaught
        # AttributeError (requests.Response has no `.get()`) the moment
        # JENKINS_BASE_URL happened to contain "jenkins" (finding #119) — which also
        # silently aborted that recovery cycle's separate timeout-based sweep, since
        # both run in the same try block.
        if is_jenkins_request and method == "POST":
            return response
        if response.content:
            return response.json()
        return {"status_code": response.status_code, "headers": dict(response.headers)}

    def request(
        self,
        method: str,
        path: str,
        data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: int = 30,
    ):
        url = f"{self.base_url}/{path.lstrip('/')}"
        request_headers = dict(self.session.headers)
        if headers:
            request_headers.update(headers)

        try:
            is_jenkins_request = self.is_jenkins

            if is_jenkins_request and method == "POST":
                request_headers = self._get_jenkins_crumb(request_headers)

            if is_jenkins_request and method == "POST":
                response = self._send_jenkins_post(url, params, request_headers, timeout)
            elif is_jenkins_request and method == "GET":
                response = self._send_jenkins_get(url, params, request_headers, timeout)
            else:
                response = self._send_generic(url, method, data, params, request_headers, timeout)

            return self._process_response(response, is_jenkins_request, method)

        except requests.RequestException as e:
            raise ExternalServiceError(
                service=url,
                status_code=500,
                message=str(e),
            )
