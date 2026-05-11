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
            if "jenkins" in self.base_url.lower() and method == "POST":
                try:
                    crumb_response = self.session.get(
                        f"{self.base_url}/crumbIssuer/api/json",
                        timeout=10
                    )
                    if crumb_response.ok:
                        crumb_data = crumb_response.json()
                        crumb_field = crumb_data.get('crumbRequestField', 'Jenkins-Crumb')
                        crumb_value = crumb_data.get('crumb')
                        if crumb_value:
                            request_headers[crumb_field] = crumb_value
                except Exception as e:
                    logger.warning(f"Failed to get Jenkins crumb: {e}")

            # Check if this is a Jenkins request with parameters
            is_jenkins_request = "jenkins" in self.base_url.lower()
            
            if is_jenkins_request and method == "POST":
                # Jenkins buildWithParameters: POST to URL with params as query string
                logger.info(f"[HTTP] Sending Jenkins POST request to {url}")
                logger.info(f"[HTTP] Query params: {params}")
                
                # Performance Optimization (Bolt ⚡): Use self.session.request for connection pooling
                response = self.session.request(
                    method=method,
                    url=url,
                    params=params,  # Jenkins expects params in query string
                    headers=request_headers,
                    timeout=timeout,
                    allow_redirects=True,
                )
                logger.info(f"[HTTP] Jenkins response status: {response.status_code}")
            elif is_jenkins_request and method == "GET":
                # GET requests with params
                # Performance Optimization (Bolt ⚡): Use self.session.request for connection pooling
                response = self.session.request(
                    method=method,
                    url=url,
                    params=params,
                    headers=request_headers,
                    timeout=timeout,
                )
            else:
                # For all other requests, use JSON
                logger.info(f"[HTTP] Sending request to {url} with params: {params}, json: {data}")
                # Performance Optimization (Bolt ⚡): Use self.session.request for connection pooling
                response = self.session.request(
                    method=method,
                    url=url,
                    json=data,
                    params=params,
                    headers=request_headers,
                    timeout=timeout,
                )

            if not response.ok:
                raise ExternalServiceError(
                    service=url,
                    status_code=response.status_code,
                    message=response.text,
                )

            return response.json() if response.content else None

        except requests.RequestException as e:
            raise ExternalServiceError(
                service=url,
                status_code=500,
                message=str(e),
            )
