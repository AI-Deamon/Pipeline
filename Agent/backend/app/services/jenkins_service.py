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
        project_payload = {
            "project_id": project_data.get("project_id"),
            "project_name": project_data.get("name"),
            "git_url": project_data.get("git_url"),
            "branch": project_data.get("branch"),
            "credentials_id": project_data.get("credentials_id"),
            "sonar_key": project_data.get("sonar_key"),
            "target_ip": project_data.get("target_ip"),
            "target_url": project_data.get("target_url"),
        }

        # Add scan configuration to project payload if provided
        if scan.configuration:
            project_payload["sonar_sources"] = scan.configuration.sonar_sources
            project_payload["sonar_exclusions"] = scan.configuration.sonar_exclusions
            project_payload["sonar_project_key"] = scan.configuration.sonar_project_key
            project_payload["dependency_scan_paths"] = (
                scan.configuration.dependency_scan_paths
            )
            project_payload["dependency_exclusions"] = (
                scan.configuration.dependency_exclusions
            )
            project_payload["npm_paths"] = scan.configuration.npm_paths
            project_payload["pip_paths"] = scan.configuration.pip_paths
            project_payload["yarn_paths"] = scan.configuration.yarn_paths
            project_payload["poetry_paths"] = scan.configuration.poetry_paths

        payload = {
            "SCAN_ID": scan.scan_id,
            "SCAN_MODE": scan.scan_mode.upper(),
            "PROJECT_DATA": json.dumps(project_payload),
            "SELECTED_STAGES": json.dumps(scan.selected_stages),
            "SCAN_TIMEOUT": str(
                project_data.get("scan_timeout", 7200)
            ),  # Dynamic timeout
        }

        # DEBUG: Log the exact payload being sent
        logger.info("=" * 60)
        logger.info(f"JENKINS TRIGGER - scan_id: {scan.scan_id}")
        logger.info(f"JENKINS TRIGGER - scan_mode: {scan.scan_mode}")
        logger.info(f"JENKINS TRIGGER - FULL PAYLOAD: {payload}")
        logger.info("=" * 60)

        # Centralized outbound call via standardized JenkinsClient
        try:
            logger.info(f"Triggering Jenkins job for scan {scan.scan_id}")
            logger.info(f"Jenkins payload being sent: {payload}")
            trigger_response = self.client.trigger_pipeline(
                job_name="Security-pipeline", parameters=payload
            )
            logger.info(f"Jenkins trigger response: {trigger_response}")
            queue_id = None
            if isinstance(trigger_response, dict):
                queue_id = trigger_response.get("queue_id") or trigger_response.get(
                    "queueId"
                )
            return True, queue_id
        except ExternalServiceError as e:
            logger.error(f"Jenkins trigger failed: {str(e)}")
            return False, None

    def cancel_jenkins_job(self, scan_id: str, jenkins_build_number: int = None):
        """
        Cancel a running Jenkins job.
        """
        if settings.MOCK_EXECUTION:
            logger.info(
                f"MOCK_EXECUTION enabled; simulating Jenkins cancel for scan {scan_id}"
            )
            return True

        try:
            logger.info(f"Cancelling Jenkins job for scan {scan_id}")
            if jenkins_build_number:
                # Cancel specific build
                self.client.abort_build(
                    job_name="Security-pipeline", build_number=jenkins_build_number
                )
                logger.info(f"Jenkins build {jenkins_build_number} cancelled")
                return True
            else:
                logger.warning(f"No build number available for scan {scan_id}")
                return False
        except ExternalServiceError as e:
            logger.error(f"Failed to cancel Jenkins job: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error cancelling Jenkins job: {str(e)}")
            return False

    def update_jenkinsfile(self, jenkinsfile_content: str) -> bool:
        """
        Update the Jenkinsfile in the Jenkins pipeline job.
        This allows automatic deployment of Jenkinsfile changes without manual copy-paste.
        """
        if settings.MOCK_EXECUTION:
            logger.info(f"MOCK_EXECUTION enabled; simulating Jenkinsfile update")
            return True

        try:
            logger.info("Updating Jenkinsfile in Jenkins pipeline")
            success = self.client.update_jenkinsfile(
                job_name="Security-pipeline", jenkinsfile_content=jenkinsfile_content
            )
            logger.info(f"Jenkinsfile update result: {success}")
            return success
        except Exception as e:
            logger.error(f"Unexpected error cancelling Jenkins job: {str(e)}")
            return False

    jenkins_service = JenkinsService()
