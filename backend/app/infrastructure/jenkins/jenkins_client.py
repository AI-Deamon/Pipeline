import re
from app.infrastructure.http.client import HttpClient
from app.core.config import settings
import urllib.parse
import base64
import logging

logger = logging.getLogger(__name__)


class JenkinsClient:
    def __init__(self):
        auth_string = base64.b64encode(
            b"admin:" + settings.JENKINS_TOKEN.encode()
        ).decode()
        self.client = HttpClient(
            base_url=settings.JENKINS_BASE_URL,
            default_headers={
                "Authorization": f"Basic {auth_string}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        self.csrf_token = None
        logger.info(
            f"JenkinsClient initialized with base_url={settings.JENKINS_BASE_URL}"
        )

    def _get_csrf_token(self):
        """Get Jenkins CSRF token for API requests"""
        if self.csrf_token:
            return self.csrf_token

        try:
            response = self.client.request(
                method="GET",
                path="crumbIssuer/api/json",
            )
            if response and "crumb" in response:
                self.csrf_token = response["crumb"]
                logger.debug("[JENKINS] CSRF token obtained")
                return self.csrf_token
        except Exception as e:
            logger.warning(
                f"[JENKINS] Failed to get CSRF token: {type(e).__name__}: {str(e)}"
            )
            return None

    def _extract_queue_id(self, response) -> int | None:
        if not response:
            return None
        if isinstance(response, dict):
            status_code = response.get("status_code")
            headers = response.get("headers", {})
            if status_code == 201:
                location = headers.get("Location", "")
                match = re.search(r"/queue/item/(\d+)/", location)
                if match:
                    return int(match.group(1))
        else:
            if response.status_code == 201:
                location = response.headers.get("Location", "")
                match = re.search(r"/queue/item/(\d+)/", location)
                if match:
                    return int(match.group(1))
        return None

    def trigger_pipeline(self, job_name: str, parameters: dict):
        logger.info(
            f"[JENKINS] Triggering pipeline '{job_name}' with params: {parameters}"
        )
        try:
            csrf_token = self._get_csrf_token()
            headers = {}
            if csrf_token:
                headers["Jenkins-Crumb"] = csrf_token

            logger.info(f"[JENKINS] Using headers: {headers}")
            logger.info(f"[JENKINS] Parameters to send: {parameters}")

            response = self.client.request(
                method="POST",
                path=f"job/{job_name}/buildWithParameters",
                params=parameters,
                headers=headers,
            )
            logger.info(f"[JENKINS] Pipeline trigger succeeded: {response}")

            queue_id = self._extract_queue_id(response)

            return {"accepted": True, "queue_id": queue_id, "response": response}
        except Exception as e:
            logger.error(
                f"[JENKINS] Pipeline trigger failed: {type(e).__name__}: {str(e)}"
            )
            logger.error(
                f"[JENKINS] Failed request details - job: {job_name}, params: {parameters}"
            )
            raise

    def get_build_status(self, job_name: str, build_number: int):
        return self.client.request(
            method="GET",
            path=f"job/{job_name}/{build_number}/api/json",
        )

    def get_queue_item(self, queue_id: int):
        return self.client.request(
            method="GET",
            path=f"queue/item/{queue_id}/api/json",
        )
