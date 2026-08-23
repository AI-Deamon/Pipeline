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
        # Distinct Compose project name per environment (finding #79): without this,
        # dev/test/staging all resolved to the same default project name (derived
        # from cwd) and therefore the same named volumes (postgres_data,
        # sonarqube_data, ...). `python run.py down` — or start-dev.sh's Ctrl+C
        # trap, which calls it unconditionally — merged all three environments'
        # compose files and ran `down --volumes`, silently wiping staging's DB and
        # SonarQube data if staging was ever brought up on the same host. Distinct
        # project names give each environment its own isolated set of volumes.
        "project_name": "sentinel-dev",
    },
    "test": {
        "env_file": REPO_ROOT / ".env.test",
        "overlay": DOCKER_DIR / "docker-compose.test.yml",
        "up_args": ["up", "--build", "-d"],
        "project_name": "sentinel-test",
    },
    "staging": {
        "env_file": REPO_ROOT / ".env.staging",
        "overlay": DOCKER_DIR / "docker-compose.staging.yml",
        "up_args": ["up", "--build", "-d"],
        "project_name": "sentinel-staging",
    },
}


def _compose_base_cmd(environment: str) -> list[str]:
    cfg = ENVIRONMENTS[environment]
    return [
        "docker",
        "compose",
        "-p",
        cfg["project_name"],
        *BASE_FILES,
        "--env-file",
        str(cfg["env_file"]),
        "-f",
        str(cfg["overlay"]),
    ]


def run_compose(environment: str) -> int:
    cfg = ENVIRONMENTS[environment]
    cmd = _compose_base_cmd(environment) + cfg["up_args"]
    print("Running:", " ".join(cmd))
    try:
        proc = subprocess.run(cmd, cwd=REPO_ROOT)
    except FileNotFoundError:
        print("Docker CLI not found. Install Docker Desktop (Windows/macOS) or Docker Engine (Linux).")
        return 1
    return proc.returncode


def run_down(environment: str) -> int:
    # Scoped to a single environment's own project — this used to merge all three
    # environments' compose files and tear all of them down together (see the
    # comment on ENVIRONMENTS above). Only the requested environment's containers
    # and volumes are touched now.
    cmd = _compose_base_cmd(environment) + ["down", "--volumes", "--remove-orphans"]
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
    parser.add_argument(
        "--env",
        choices=["dev", "test", "staging"],
        default="dev",
        help="Which environment 'down' should tear down (default: dev). Ignored for dev/test/staging commands.",
    )
    args = parser.parse_args()

    if args.command == "down":
        return run_down(args.env)

    return run_compose(args.command)


if __name__ == "__main__":
    sys.exit(main())
