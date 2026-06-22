import requests
import logging
from typing import Any, Dict, Optional
from app.core.exceptions import ExternalServiceError
from app.core.config import settings

logger = logging.getLogger(__name__)


class HttpClient:
    def __init__(self, base_url: str, default_headers: Optional[Dict[str, str]] = None):
        self.base_url = base_url.rstrip("/")
        self.default_headers = default_headers or {}
        self.session = requests.Session()
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

    def _process_response(self, response, is_jenkins_request: bool):
        if not response.ok:
            raise ExternalServiceError(
                service=response.url,
                status_code=response.status_code,
                message=response.text,
            )
        if is_jenkins_request:
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
            is_jenkins_request = "jenkins" in self.base_url.lower()

            if is_jenkins_request and method == "POST":
                request_headers = self._get_jenkins_crumb(request_headers)

            if is_jenkins_request and method == "POST":
                response = self._send_jenkins_post(url, params, request_headers, timeout)
            elif is_jenkins_request and method == "GET":
                response = self._send_jenkins_get(url, params, request_headers, timeout)
            else:
                response = self._send_generic(url, method, data, params, request_headers, timeout)

            return self._process_response(response, is_jenkins_request)

        except requests.RequestException as e:
            raise ExternalServiceError(
                service=url,
                status_code=500,
                message=str(e),
            )
