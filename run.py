from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
DOCKER_DIR = REPO_ROOT / "docker"

BASE_FILES = [
    "-f",
    str(DOCKER_DIR / "docker-compose.yml"),
]

ENVIRONMENTS = {
    "dev": {
        "env_file": REPO_ROOT / ".env.dev",
        "overlay": DOCKER_DIR / "docker-compose.dev.yml",
        "up_args": ["up", "--build"],
    },
    "test": {
        "env_file": REPO_ROOT / ".env.test",
        "overlay": DOCKER_DIR / "docker-compose.test.yml",
        "up_args": ["up", "--build", "-d"],
    },
    "staging": {
        "env_file": REPO_ROOT / ".env.staging",
        "overlay": DOCKER_DIR / "docker-compose.staging.yml",
        "up_args": ["up", "--build", "-d"],
    },
}


def run_compose(environment: str) -> int:
    cfg = ENVIRONMENTS[environment]
    cmd = [
        "docker",
        "compose",
        *BASE_FILES,
        "--env-file",
        str(cfg["env_file"]),
        "-f",
        str(cfg["overlay"]),
        *cfg["up_args"],
    ]
    print("Running:", " ".join(cmd))
    try:
        proc = subprocess.run(cmd, cwd=REPO_ROOT)
    except FileNotFoundError:
        print("Docker CLI not found. Install Docker Desktop (Windows/macOS) or Docker Engine (Linux).")
        return 1
    return proc.returncode


def run_down() -> int:
    cmd = [
        "docker",
        "compose",
        *BASE_FILES,
        "-f",
        str(DOCKER_DIR / "docker-compose.dev.yml"),
        "-f",
        str(DOCKER_DIR / "docker-compose.test.yml"),
        "-f",
        str(DOCKER_DIR / "docker-compose.staging.yml"),
        "down",
        "--volumes",
        "--remove-orphans",
    ]
    print("Running:", " ".join(cmd))
    try:
        proc = subprocess.run(cmd, cwd=REPO_ROOT)
    except FileNotFoundError:
        print("Docker CLI not found. Install Docker Desktop (Windows/macOS) or Docker Engine (Linux).")
        return 1
    return proc.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description="Cross-platform Docker runner")
    parser.add_argument("command", choices=["dev", "test", "staging", "down"])
    args = parser.parse_args()

    if args.command == "down":
        return run_down()

    return run_compose(args.command)


if __name__ == "__main__":
    sys.exit(main())
