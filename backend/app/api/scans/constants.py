from app.state.scan_state import ScanState

TERMINAL_STATES = {ScanState.COMPLETED, ScanState.FAILED, ScanState.CANCELLED}
ACTIVE_STATES = {ScanState.CREATED, ScanState.QUEUED, ScanState.RUNNING}

MAX_ARTIFACT_URL_LENGTH = 2048
MAX_ARTIFACT_SIZE_BYTES = 50 * 1024 * 1024

STAGE_TIMEOUTS = {
    "git_checkout": 300,
    "sonar_scanner": 900,
    "sonar_quality_gate": 600,
    "dependency_check": 900,
    "trivy_fs_scan": 600,
    "docker_build": 900,
    "docker_push": 600,
    "trivy_image_scan": 600,
    "nmap_scan": 300,
    "zap_scan": 1800,
}

JENKINS_STAGE_NAME_TO_ID = {
    "Git Checkout": "git_checkout",
    "Sonar Scanner": "sonar_scanner",
    "Sonar Quality Gate": "sonar_quality_gate",
    "Dependency Check": "dependency_check",
    "Trivy FS Scan": "trivy_fs_scan",
    "Docker Build": "docker_build",
    "Docker Push": "docker_push",
    "Trivy Image Scan": "trivy_image_scan",
    "Nmap Scan": "nmap_scan",
    "ZAP Scan": "zap_scan",
}

STAGE_STATUS_MAP = {
    "PASSED": "PASS",
    "PASS": "PASS",
    "FAILED": "FAIL",
    "FAIL": "FAIL",
    "SUCCESS": "PASS",
    "FAILURE": "FAIL",
    "SKIPPED": "SKIPPED",
    "WARN": "WARN",
}

STAGE_ORDER = [
    "git_checkout",
    "sonar_scanner",
    "sonar_quality_gate",
    "dependency_check",
    "trivy_fs_scan",
    "docker_build",
    "docker_push",
    "trivy_image_scan",
    "nmap_scan",
    "zap_scan",
]
