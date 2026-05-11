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
                logger.info(f"[JENKINS] CSRF token obtained: {self.csrf_token}")
                return self.csrf_token
        except Exception as e:
            logger.warning(
                f"[JENKINS] Failed to get CSRF token: {type(e).__name__}: {str(e)}"
            )
            # Continue without CSRF token for compatibility
            return None

    def trigger_pipeline(self, job_name: str, parameters: dict):
        logger.info(
            f"[JENKINS] Triggering pipeline '{job_name}' with params: {parameters}"
        )

        # DEBUG: Log each parameter individually
        for key, value in parameters.items():
            logger.info(
                f"[JENKINS] Parameter {key}: {value} (type: {type(value).__name__})"
            )

        try:
            # Get CSRF token for POST requests
            csrf_token = self._get_csrf_token()
            headers = {}
            if csrf_token:
                headers["Jenkins-Crumb"] = csrf_token

            logger.info(f"[JENKINS] Using headers: {headers}")
            logger.info(f"[JENKINS] Parameters to send: {parameters}")

            # Jenkins buildWithParameters works best with parameters as query string
            # POST to the URL with params in query string
            response = self.client.request(
                method="POST",
                path=f"job/{job_name}/buildWithParameters",
                params=parameters,  # Pass as query parameters
                headers=headers,
            )
            logger.info(f"[JENKINS] Pipeline trigger succeeded: {response}")
            return response
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

    def abort_build(self, job_name: str, build_number: int):
        """
        Abort a running Jenkins build.
        """
        logger.info(f"[JENKINS] Aborting build {build_number} for job '{job_name}'")
        try:
            # Get CSRF token
            csrf_token = self._get_csrf_token()
            headers = {}
            if csrf_token:
                headers["Jenkins-Crumb"] = csrf_token

            # POST to the stop endpoint
            response = self.client.request(
                method="POST",
                path=f"job/{job_name}/{build_number}/stop",
                headers=headers,
            )
            logger.info(f"[JENKINS] Build abort succeeded: {response}")
            return response
        except Exception as e:
            logger.error(f"[JENKINS] Build abort failed: {type(e).__name__}: {str(e)}")
            logger.error(
                f"[JENKINS] Failed request details - job: {job_name}, build: {build_number}"
            )
            raise

    def get_job_config(self, job_name: str) -> str:
        """
        Get current job configuration XML.
        """
        logger.info(f"[JENKINS] Fetching config for job '{job_name}'")
        response = self.client.request(
            method="GET",
            path=f"job/{job_name}/config.xml",
        )
        return response

    def update_job_config(self, job_name: str, config_xml: str) -> bool:
        """
        Update job configuration (including Jenkinsfile).
        """
        logger.info(f"[JENKINS] Updating config for job '{job_name}'")
        try:
            csrf_token = self._get_csrf_token()
            headers = {"Content-Type": "application/xml"}
            if csrf_token:
                headers["Jenkins-Crumb"] = csrf_token

            response = self.client.request(
                method="POST",
                path=f"job/{job_name}/config.xml",
                data=config_xml,
                headers=headers,
            )
            logger.info(f"[JENKINS] Job config updated successfully")
            return True
        except Exception as e:
            logger.error(
                f"[JENKINS] Failed to update job config: {type(e).__name__}: {str(e)}"
            )
            raise

    def update_jenkinsfile(self, job_name: str, jenkinsfile_content: str) -> bool:
        """
        Update the Jenkinsfile for a pipeline job.
        This fetches current config, replaces the script, and pushes it back.
        """
        logger.info(f"[JENKINS] Updating Jenkinsfile for job '{job_name}'")

        # Get current config
        current_config = self.get_job_config(job_name)

        # Replace the script content
        # The pipeline script is in <definition><script>...</script></definition>
        import re

        # Find and replace the script section
        pattern = r"(<script>)(.*?)(</script>)"
        replacement = (
            r"\1"
            + jenkinsfile_content.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            + r"\3"
        )

        new_config = re.sub(pattern, replacement, current_config, flags=re.DOTALL)

        return self.update_job_config(job_name, new_config)

    def configure_scm_with_jenkinsfile(
        self,
        job_name: str,
        repo_url: str,
        branch: str = "*/main",
        jenkinsfile_path: str = "Jenkinsfile",
        credentials_id: str = None,
    ) -> bool:
        """
        Configure job to use Pipeline from SCM with Jenkinsfile from repo.
        This is the preferred approach - Jenkins pulls Jenkinsfile directly from Git.
        """
        logger.info(f"[JENKINS] Configuring SCM with Jenkinsfile for job '{job_name}'")

        current_config = self.get_job_config(job_name)

        # Build SCM config that tells Jenkins to load Jenkinsfile from repo
        scm_xml = f"""<?xml version='1.1' encoding='UTF-8'?>
<flow-definition plugin="workflow-job">
  <description>Pipeline managed by DevSecOps Platform</description>
  <keepDependencies>false</keepDependencies>
  <properties/>
  <scm plugin="git">
    <configVersion>2</configVersion>
    <userRemoteConfigs>
      <hudson.plugins.git.UserRemoteConfig>
        <url>{repo_url}</url>
        {f"<credentialsId>{credentials_id}</credentialsId>" if credentials_id else ""}
      </hudson.plugins.git.UserRemoteConfig>
    </userRemoteConfigs>
    <branches>
      <hudson.plugins.git.BranchSpec>
        <name>{branch}</name>
      </hudson.plugins.git.BranchSpec>
    </branches>
  </scm>
  <triggers/>
  <authToken/>
  <disabled>false</disabled>
  <blockBuildWhenDownstreamBuilding>false</blockBuildWhenDownstreamBuilding>
  <blockBuildWhenUpstreamBuilding>false</blockBuildWhenUpstreamBuilding>
  <triggers/>
  <concurrentBuild>false</concurrentBuild>
  <definition plugin="workflow-cps">
    <scriptPath>{jenkinsfile_path}</scriptPath>
    <sandbox>true</sandbox>
  </definition>
</flow-definition>"""

        return self.update_job_config(job_name, scm_xml)
