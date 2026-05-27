"""
Tests for Jenkins pipeline stage selection logic.

Tests the shouldRun() logic in isolation using a Python simulation
of the Groovy shouldRun function. This verifies that:
- Automated scans always run all stages
- Manual scans only run selected stages
- Stage dependencies are enforced (backend side)
- install_dependencies is accepted as a valid stage
"""
import pytest
from app.services.validation import (
    VALID_STAGES,
    STAGE_DEPENDENCIES,
    validate_scan_request,
    _validate_manual_dependencies,
)
from app.schemas.scan import ScanCreate


# Override conftest autouse DB fixture — most tests here don't need a database.
@pytest.fixture(autouse=True)
def setup_database():
    """Skip database setup for pure logic tests."""
    yield


# ── Python simulation of Jenkins shouldRun() ────────────────────────────────

def should_run_sim(stage_name: str, is_manual: bool, selected: list[str]) -> bool:
    """Python mirror of Jenkinsfile shouldRun() logic."""
    if not is_manual:
        return True
    return stage_name in selected


# ── Automated mode ──────────────────────────────────────────────────────────

ALL_STAGE_IDS = [
    "git_checkout",
    "sonar_scanner",
    "install_dependencies",
    "dependency_check",
    "trivy_fs_scan",
    "docker_build",
    "docker_push",
    "trivy_image_scan",
    "nmap_scan",
    "zap_scan",
]


@pytest.mark.parametrize("stage_id", ALL_STAGE_IDS)
def test_automated_mode_runs_all_stages(stage_id):
    """In automated mode, all stages should run regardless of selected list."""
    assert should_run_sim(stage_id, is_manual=False, selected=[])


# ── Manual mode ─────────────────────────────────────────────────────────────

def test_manual_mode_runs_only_selected():
    """In manual mode, only selected stages run."""
    selected = ["git_checkout", "sonar_scanner"]
    assert should_run_sim("git_checkout", is_manual=True, selected=selected)
    assert should_run_sim("sonar_scanner", is_manual=True, selected=selected)
    assert not should_run_sim("zap_scan", is_manual=True, selected=selected)
    assert not should_run_sim("nmap_scan", is_manual=True, selected=selected)


def test_manual_mode_single_stage():
    """Selecting a single stage should only run that stage."""
    selected = ["trivy_fs_scan"]
    for stage_id in ALL_STAGE_IDS:
        expected = stage_id == "trivy_fs_scan"
        assert should_run_sim(stage_id, is_manual=True, selected=selected) == expected


def test_manual_mode_empty_selected_runs_nothing():
    """Empty selected list in manual mode should run nothing."""
    for stage_id in ALL_STAGE_IDS:
        assert not should_run_sim(stage_id, is_manual=True, selected=[])


def test_manual_mode_all_selected():
    """Selecting all stages in manual mode should run all."""
    for stage_id in ALL_STAGE_IDS:
        assert should_run_sim(stage_id, is_manual=True, selected=ALL_STAGE_IDS)


# ── Backend VALID_STAGES acceptance ─────────────────────────────────────────

def test_install_dependencies_in_valid_stages():
    """install_dependencies must be in VALID_STAGES for callback acceptance."""
    assert "install_dependencies" in VALID_STAGES, (
        "install_dependencies not in VALID_STAGES. "
        "Callbacks from Jenkins will get HTTP 400."
    )


def test_all_nine_user_stages_in_valid_stages():
    """All 9 user-selectable stages must be in VALID_STAGES."""
    user_stages = [
        "git_checkout", "sonar_scanner", "dependency_check",
        "trivy_fs_scan", "docker_build", "docker_push",
        "trivy_image_scan", "nmap_scan", "zap_scan",
    ]
    for stage in user_stages:
        assert stage in VALID_STAGES, f"{stage} missing from VALID_STAGES"


def test_valid_stages_count():
    """VALID_STAGES should have exactly 10 stages (9 user + install_dependencies)."""
    assert len(VALID_STAGES) == 10, (
        f"Expected 10 stages in VALID_STAGES, got {len(VALID_STAGES)}: {sorted(VALID_STAGES)}"
    )


# ── Stage dependency validation ─────────────────────────────────────────────

def test_dependency_requires_git_checkout():
    """sonar_scanner, dependency_check, trivy_fs_scan require git_checkout."""
    deps = ["sonar_scanner", "dependency_check", "trivy_fs_scan", "docker_build"]
    for stage in deps:
        assert "git_checkout" in STAGE_DEPENDENCIES.get(stage, set()), (
            f"{stage} should require git_checkout"
        )


def test_docker_push_requires_both_git_and_build():
    """docker_push requires both git_checkout and docker_build."""
    required = STAGE_DEPENDENCIES.get("docker_push", set())
    assert "git_checkout" in required
    assert "docker_build" in required


def test_trivy_image_requires_both_git_and_build():
    """trivy_image_scan requires both git_checkout and docker_build."""
    required = STAGE_DEPENDENCIES.get("trivy_image_scan", set())
    assert "git_checkout" in required
    assert "docker_build" in required


def test_git_checkout_has_no_dependencies():
    """git_checkout should have no upstream dependencies."""
    assert "git_checkout" not in STAGE_DEPENDENCIES


def test_nmap_and_zap_have_no_dependencies():
    """nmap_scan and zap_scan have no stage dependencies."""
    assert "nmap_scan" not in STAGE_DEPENDENCIES
    assert "zap_scan" not in STAGE_DEPENDENCIES


def test_install_dependencies_has_no_dependencies():
    """install_dependencies has no upstream dependencies."""
    assert "install_dependencies" not in STAGE_DEPENDENCIES


# ── Manual dependency validation ────────────────────────────────────────────

def test_manual_validation_passes_with_all_deps():
    """Selecting sonar_scanner + git_checkout should pass validation."""
    scan = ScanCreate(
        project_id="test",
        scan_mode="manual",
        selected_stages=["git_checkout", "sonar_scanner"],
    )
    assert validate_scan_request(scan) is True


def test_manual_validation_fails_without_git_checkout():
    """Selecting sonar_scanner alone should fail validation."""
    scan = ScanCreate(
        project_id="test",
        scan_mode="manual",
        selected_stages=["sonar_scanner"],
    )
    with pytest.raises(ValueError, match="requires"):
        validate_scan_request(scan)


def test_manual_validation_fails_for_docker_push_without_build():
    """docker_push without docker_build should fail."""
    scan = ScanCreate(
        project_id="test",
        scan_mode="manual",
        selected_stages=["git_checkout", "docker_push"],
    )
    with pytest.raises(ValueError, match="requires"):
        validate_scan_request(scan)


def test_manual_validation_accepts_install_dependencies():
    """install_dependencies should be accepted in manual scan."""
    scan = ScanCreate(
        project_id="test",
        scan_mode="manual",
        selected_stages=["install_dependencies"],
    )
    assert validate_scan_request(scan) is True


def test_manual_validation_rejects_unknown_stage():
    """Unknown stage IDs should be rejected."""
    scan = ScanCreate(
        project_id="test",
        scan_mode="manual",
        selected_stages=["git_checkout", "unknown_stage_xyz"],
    )
    with pytest.raises(ValueError, match="Invalid stage identifier"):
        validate_scan_request(scan)


def test_manual_validation_rejects_empty_stages():
    """Empty selected_stages should be rejected in manual mode."""
    scan = ScanCreate(
        project_id="test",
        scan_mode="manual",
        selected_stages=[],
    )
    with pytest.raises(ValueError, match="cannot be empty"):
        validate_scan_request(scan)


def test_manual_validation_rejects_duplicates():
    """Duplicate stage IDs should be rejected."""
    scan = ScanCreate(
        project_id="test",
        scan_mode="manual",
        selected_stages=["git_checkout", "git_checkout"],
    )
    with pytest.raises(ValueError, match="Duplicate"):
        validate_scan_request(scan)


# ── Automated mode validation ───────────────────────────────────────────────

def test_automated_mode_rejects_selected_stages():
    """Automated scans must not have selected_stages."""
    scan = ScanCreate(
        project_id="test",
        scan_mode="automated",
        selected_stages=["git_checkout"],
    )
    with pytest.raises(ValueError, match="must NOT be provided"):
        validate_scan_request(scan)


def test_automated_mode_accepts_no_selected_stages():
    """Automated scans with no selected_stages should pass."""
    scan = ScanCreate(
        project_id="test",
        scan_mode="automated",
        selected_stages=None,
    )
    assert validate_scan_request(scan) is True
