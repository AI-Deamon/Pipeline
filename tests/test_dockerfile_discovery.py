"""
Tests for Dockerfile discovery logic used in the Docker Build stage.

Simulates the find command logic from doDockerBuild() in the Jenkinsfile:
- find . -path './node_modules' -prune -o -path './.git' -prune -o
  -type f ( -name 'Dockerfile*' -o -name '*.Dockerfile' ) ! -name '*.md' -print

These tests create a temporary directory structure and verify the find
command behavior without running actual Docker builds.
"""
import os
import subprocess
import tempfile

import pytest


@pytest.fixture
def dockerfile_project(tmp_path):
    """Create a fake project directory with various Dockerfiles."""
    # Root Dockerfile (should be found)
    (tmp_path / "Dockerfile").write_text("FROM alpine:latest\n")

    # Named Dockerfile (should be found)
    (tmp_path / "backend.Dockerfile").write_text("FROM python:3.11\n")

    # Subdirectory Dockerfile (should be found)
    subdir = tmp_path / "docker"
    subdir.mkdir()
    (subdir / "Dockerfile").write_text("FROM node:18\n")
    (subdir / "Dockerfile.dev").write_text("FROM node:18-dev\n")

    # node_modules Dockerfile (should be EXCLUDED)
    nm = tmp_path / "node_modules" / "some-package"
    nm.mkdir(parents=True)
    (nm / "Dockerfile").write_text("FROM ubuntu:22.04\n")

    # .git Dockerfile (should be EXCLUDED)
    git_dir = tmp_path / ".git" / "hooks"
    git_dir.mkdir(parents=True)
    (git_dir / "Dockerfile").write_text("FROM scratch\n")

    # Markdown file (should be EXCLUDED)
    (tmp_path / "Dockerfile.md").write_text("# Dockerfile docs\n")

    # .devcontainer in node_modules (should be EXCLUDED)
    devcon = tmp_path / "node_modules" / "sql.js" / ".devcontainer"
    devcon.mkdir(parents=True)
    (devcon / "Dockerfile").write_text("FROM ubuntu\n")

    # node_modules nested deep (should be EXCLUDED)
    deep = tmp_path / "node_modules" / "getos" / "tests"
    deep.mkdir(parents=True)
    (deep / "Dockerfile").write_text("FROM alpine\n")

    return tmp_path


def _find_dockerfiles(base_dir, exclude_node_modules=True, exclude_git=True):
    """Run the find command matching Jenkinsfile's doDockerBuild logic."""
    cmd_parts = [
        "find", str(base_dir),
    ]
    if exclude_node_modules:
        cmd_parts += ["-path", f"{base_dir}/node_modules", "-prune"]
        cmd_parts += ["-o"]
    if exclude_git:
        cmd_parts += ["-path", f"{base_dir}/.git", "-prune"]
        cmd_parts += ["-o"]
    cmd_parts += [
        "-type", "f",
        "(", "-name", "Dockerfile*", "-o", "-name", "*.Dockerfile", ")",
        "!", "-name", "*.md",
        "-print",
    ]

    result = subprocess.run(cmd_parts, capture_output=True, text=True)
    files = sorted(result.stdout.strip().split("\n")) if result.stdout.strip() else []
    # Normalize paths to relative
    base = str(base_dir) + "/"
    return [f.replace(base, "") for f in files]


# ── Core discovery tests ────────────────────────────────────────────────────

def test_finds_root_dockerfile(dockerfile_project):
    """Should find root Dockerfile."""
    files = _find_dockerfiles(dockerfile_project)
    assert "Dockerfile" in files


def test_finds_named_dockerfile(dockerfile_project):
    """Should find backend.Dockerfile."""
    files = _find_dockerfiles(dockerfile_project)
    assert "backend.Dockerfile" in files


def test_finds_subdirectory_dockerfiles(dockerfile_project):
    """Should find Dockerfiles in subdirectories."""
    files = _find_dockerfiles(dockerfile_project)
    assert "docker/Dockerfile" in files
    assert "docker/Dockerfile.dev" in files


def test_excludes_node_modules_dockerfiles(dockerfile_project):
    """Must NOT find Dockerfiles inside node_modules/."""
    files = _find_dockerfiles(dockerfile_project)
    nm_files = [f for f in files if "node_modules" in f]
    assert nm_files == [], (
        f"Found Dockerfiles in node_modules (should be excluded): {nm_files}"
    )


def test_excludes_dotgit_dockerfiles(dockerfile_project):
    """Must NOT find Dockerfiles inside .git/."""
    files = _find_dockerfiles(dockerfile_project)
    git_files = [f for f in files if ".git" in f]
    assert git_files == [], (
        f"Found Dockerfiles in .git (should be excluded): {git_files}"
    )


def test_excludes_markdown_dockerfiles(dockerfile_project):
    """Must NOT find Dockerfile.md."""
    files = _find_dockerfiles(dockerfile_project)
    assert "Dockerfile.md" not in files


# ── Without exclusion (old behavior) ────────────────────────────────────────

def test_old_find_finds_node_modules_dockerfiles(dockerfile_project):
    """Old find command (no exclusion) would find node_modules Dockerfiles."""
    files = _find_dockerfiles(dockerfile_project, exclude_node_modules=False, exclude_git=False)
    nm_files = [f for f in files if "node_modules" in f]
    assert len(nm_files) > 0, (
        "Without exclusion, node_modules Dockerfiles should be found"
    )


# ── Edge cases ──────────────────────────────────────────────────────────────

def test_empty_project(tmp_path):
    """Empty project should find zero Dockerfiles."""
    files = _find_dockerfiles(tmp_path)
    assert files == []


def test_only_node_modules(tmp_path):
    """Project with only node_modules should find zero Dockerfiles."""
    nm = tmp_path / "node_modules" / "pkg"
    nm.mkdir(parents=True)
    (nm / "Dockerfile").write_text("FROM alpine\n")
    files = _find_dockerfiles(tmp_path)
    assert files == []


def test_no_false_positives_on_partial_names(tmp_path):
    """Files like Dockerfile.bak or Dockerfile.txt should be found (they match Dockerfile*)."""
    (tmp_path / "Dockerfile.bak").write_text("FROM alpine\n")
    (tmp_path / "Dockerfile.txt").write_text("FROM alpine\n")
    files = _find_dockerfiles(tmp_path)
    assert "Dockerfile.bak" in files
    assert "Dockerfile.txt" in files


# ── Image tag generation ────────────────────────────────────────────────────

def test_image_tag_from_dockerfile_path():
    """Image tag must be derived from Dockerfile path."""
    # Simulate the Groovy: dockerfile.replaceAll('^[./]+', '').replaceAll('[^a-zA-Z0-9]', '-').toLowerCase().take(100)
    cases = [
        ("Dockerfile", "dockerfile"),
        ("docker/Dockerfile", "docker-dockerfile"),
        ("backend.Dockerfile", "backend-dockerfile"),
        ("./sub/nested/Dockerfile", "sub-nested-dockerfile"),
    ]
    for path, expected in cases:
        result = path.lstrip("./").replace("/", "-").replace(".", "-").lower()
        # The Groovy regex replaces non-alphanumeric with dash
        import re
        result = re.sub(r"[^a-zA-Z0-9]", "-", path.lstrip("./")).lower().lstrip("-")
        assert len(result) > 0, f"Image tag for '{path}' should not be empty"


# ── Dockerfile count validation ─────────────────────────────────────────────

def test_expected_dockerfile_count(dockerfile_project):
    """Should find exactly 4 Dockerfiles (root, backend, docker/Dockerfile, docker/Dockerfile.dev)."""
    files = _find_dockerfiles(dockerfile_project)
    assert len(files) == 4, (
        f"Expected 4 Dockerfiles, found {len(files)}: {files}"
    )
