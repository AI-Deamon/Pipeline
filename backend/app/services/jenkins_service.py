import logging
from app.models.scan import Scan
from app.infrastructure.jenkins.jenkins_client import JenkinsClient
from app.core.exceptions import ExternalServiceError
from app.core.config import settings

logger = logging.getLogger(__name__)


class JenkinsService:
    def __init__(self):
        self.should_fail = False
        self.client = JenkinsClient()

    def trigger_scan_job(self, scan: Scan, project_data: dict):
        """
        Simulates triggering a Jenkins job.
        In production, this would use the Jenkins REST API.
        """
        import json

        if settings.MOCK_EXECUTION:
            logger.info(
                f"MOCK_EXECUTION enabled; simulating Jenkins enqueue for scan {scan.scan_id}"
            )
            return True, None

        if self.should_fail:
            logger.error(f"Simulating Jenkins trigger failure for scan {scan.scan_id}")
            return False, None

        # Convert project_data keys to camelCase for Jenkinsfile compatibility
        # If it's already a dict from a Pydantic model with aliases, this might be redundant
        # but let's be explicit.

        # Build payload for Jenkins pipeline
        payload = {
            "SCAN_ID": scan.scan_id,
            "SCAN_MODE": scan.scan_mode.upper(),
            "PROJECT_DATA": json.dumps(
                {
                    "project_id": project_data.get("project_id"),
                    "project_name": project_data.get("name"),
                    "git_url": project_data.get("git_url"),
                    "branch": project_data.get("branch"),
                    "credentials_id": project_data.get("credentials_id"),
                    "sonar_key": project_data.get("sonar_key"),
                    "target_ip": project_data.get("target_ip"),
                    "target_url": project_data.get("target_url"),
                }
            ),
            "SELECTED_STAGES": json.dumps(scan.selected_stages),
            "SCAN_TIMEOUT": str(
                project_data.get("scan_timeout", 7200)
            ),  # Dynamic timeout
        }

        # Centralized outbound call via standardized JenkinsClient
        try:
            logger.info(f"Triggering Jenkins job for scan {scan.scan_id}")
            logger.info(f"Jenkins payload being sent: {payload}")
            trigger_response = self.client.trigger_pipeline(
                job_name="Security-pipeline", parameters=payload
            )
            logger.info(f"Jenkins trigger response: {trigger_response}")

            # Extract accepted status and queue_id from response
            accepted = (
                trigger_response.get("accepted", False) if trigger_response else False
            )
            queue_id = trigger_response.get("queue_id") if trigger_response else None

            return accepted, queue_id
        except ExternalServiceError as e:
            logger.error(f"Jenkins trigger failed: {str(e)}")
            return False, None


jenkins_service = JenkinsService()
