import os
import subprocess
import time
import logging
from typing import Dict, List
from app.infrastructure.git.git_client import git_client, GitCloneError
from app.schemas.project import DependencyPaths

logger = logging.getLogger(__name__)


class DependencyDiscoveryService:
    """Service for discovering dependency files in git repositories"""

    PATTERNS = {
        "npm": ["package.json"],
        "pip": ["requirements.txt", "requirements-dev.txt"],
        "maven": ["pom.xml"],
        "gradle": ["build.gradle", "build.gradle.kts"]
    }

    EXCLUDES = [
        "node_modules", "venv", ".venv", "__pycache__",
        ".git", "target", "build", "dist", ".egg-info"
    ]

    def discover(self, git_url: str, branch: str = "main", credentials_id: str = None) -> DependencyPaths:
        """Discover dependency files in a git repository."""
        start_time = time.time()
        repo_path = None

        try:
            repo_path = git_client.clone_repository(git_url, branch, credentials_id)
            logger.info(f"Repository cloned to {repo_path}")

            discovered = {
                "npm": self._find_files(repo_path, "npm"),
                "pip": self._find_files(repo_path, "pip"),
                "maven": self._find_files(repo_path, "maven"),
                "gradle": self._find_files(repo_path, "gradle")
            }

            # Convert absolute paths to relative paths
            for key in discovered:
                discovered[key] = [
                    self._make_relative(path, repo_path)
                    for path in discovered[key]
                ]

            duration_ms = int((time.time() - start_time) * 1000)
            logger.info(f"Dependency discovery completed in {duration_ms}ms")

            return DependencyPaths(**discovered)

        finally:
            git_client.cleanup()

    def _find_files(self, repo_path: str, dep_type: str) -> List[str]:
        """Find dependency files of a specific type in repository."""
        patterns = self.PATTERNS[dep_type]

        # Build find command with proper escaping
        # Using shell=True for complex pattern matching with exclusions
        find_cmd = ["find", repo_path, "-type", "f"]
        
        # Add name patterns
        name_args = []
        for pattern in patterns:
            name_args.extend(["-name", pattern])

        if len(name_args) > 2:
            # Multiple patterns: \( -name pattern1 -o -name pattern2 \)
            find_cmd.extend(["\\("] + name_args + ["\\)"])
        else:
            # Single pattern
            find_cmd.extend(name_args)

        # Add exclusions
        for exclude in self.EXCLUDES:
            find_cmd.extend(["-path", f"*/{exclude}/*", "-prune", "-o"])

        # Remove trailing -o
        if find_cmd[-1] == "-o":
            find_cmd = find_cmd[:-1]

        try:
            # Join command for shell execution
            cmd_str = " ".join(find_cmd)
            result = subprocess.run(
                cmd_str,
                shell=True,
                capture_output=True,
                text=True,
                timeout=30
            )
            files = [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]
            logger.debug(f"Found {len(files)} files for {dep_type}: {files}")
            return files
        except subprocess.TimeoutExpired:
            logger.warning(f"Find command timed out for {dep_type}")
            return []
        except Exception as e:
            logger.error(f"Find command failed for {dep_type}: {e}")
            return []

    def _make_relative(self, absolute_path: str, repo_path: str) -> str:
        """Convert absolute path to relative path from repo root"""
        try:
            relative = os.path.relpath(absolute_path, repo_path)
            # Normalize path separators and add ./ prefix
            return "./" + relative.replace("\\", "/")
        except ValueError:
            logger.warning(f"Could not make path relative: {absolute_path} (repo: {repo_path})")
            return absolute_path


dependency_discovery_service = DependencyDiscoveryService()
