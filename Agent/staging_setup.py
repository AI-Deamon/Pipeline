#!/usr/bin/env python3
"""
Staging Setup and Test Script

This script:
1. Starts all required services (PostgreSQL, Redis, Backend, Celery, Frontend)
2. Waits for services to be healthy
3. Runs integration tests against localhost Jenkins
4. Reports the status of all components
"""

from __future__ import annotations

import subprocess
import sys
import time
import urllib.request
import urllib.error
import json
from pathlib import Path
from datetime import datetime

REPO_ROOT = Path(__file__).resolve().parent
DOCKER_DIR = REPO_ROOT / "docker"

# Colors for output
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    RESET = '\033[0m'
    BOLD = '\033[1m'


def print_header(text: str):
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'=' * 60}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN}{text.center(60)}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN}{'=' * 60}{Colors.RESET}\n")


def print_success(text: str):
    print(f"{Colors.GREEN}✓ {text}{Colors.RESET}")


def print_error(text: str):
    print(f"{Colors.RED}✗ {text}{Colors.RESET}")


def print_info(text: str):
    print(f"{Colors.BLUE}ℹ {text}{Colors.RESET}")


def print_warning(text: str):
    print(f"{Colors.YELLOW}⚠ {text}{Colors.RESET}")


def run_command(cmd: list, cwd: Path = None, capture: bool = False) -> tuple:
    """Run a shell command and return (success, output)"""
    try:
        print_info(f"Running: {' '.join(cmd)}")
        if capture:
            result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
            return result.returncode == 0, result.stdout + result.stderr
        else:
            result = subprocess.run(cmd, cwd=cwd)
            return result.returncode == 0, ""
    except Exception as e:
        return False, str(e)


def stop_existing_containers():
    """Stop any existing containers"""
    print_header("Stopping Existing Containers")
    cmd = [
        "docker", "compose",
        "-f", str(DOCKER_DIR / "docker-compose.yml"),
        "-f", str(DOCKER_DIR / "docker-compose.staging.yml"),
        "down", "--volumes", "--remove-orphans"
    ]
    success, _ = run_command(cmd, cwd=REPO_ROOT, capture=True)
    if success:
        print_success("Containers stopped")
    else:
        print_warning("No containers to stop or stop failed")
    time.sleep(2)


def start_services():
    """Start all staging services"""
    print_header("Starting Staging Services")
    
    cmd = [
        "docker", "compose",
        "-f", str(DOCKER_DIR / "docker-compose.yml"),
        "--env-file", str(REPO_ROOT / ".env.staging"),
        "-f", str(DOCKER_DIR / "docker-compose.staging.yml"),
        "up", "--build", "-d"
    ]
    
    success, output = run_command(cmd, cwd=REPO_ROOT, capture=True)
    
    if success:
        print_success("Services started successfully")
        return True
    else:
        print_error(f"Failed to start services: {output}")
        return False


def wait_for_service(url: str, name: str, timeout: int = 60) -> bool:
    """Wait for a service to become available"""
    print_info(f"Waiting for {name} to be ready...")
    start_time = time.time()
    
    while time.time() - start_time < timeout:
        try:
            req = urllib.request.Request(url, method='GET')
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status == 200:
                    print_success(f"{name} is ready ({url})")
                    return True
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
            pass
        except Exception:
            pass
        
        time.sleep(2)
    
    print_error(f"{name} failed to become ready within {timeout}s")
    return False


def wait_for_postgres(timeout: int = 60) -> bool:
    """Wait for PostgreSQL to be ready"""
    print_info(f"Waiting for PostgreSQL to be ready...")
    start_time = time.time()
    
    cmd = [
        "docker", "compose",
        "-f", str(DOCKER_DIR / "docker-compose.yml"),
        "--env-file", str(REPO_ROOT / ".env.staging"),
        "-f", str(DOCKER_DIR / "docker-compose.staging.yml"),
        "exec", "-T", "postgres",
        "pg_isready", "-U", "devsecops", "-d", "devsecops_staging"
    ]
    
    while time.time() - start_time < timeout:
        success, _ = run_command(cmd, cwd=REPO_ROOT, capture=True)
        if success:
            print_success("PostgreSQL is ready")
            return True
        time.sleep(2)
    
    print_error("PostgreSQL failed to become ready")
    return False


def check_services_health() -> dict:
    """Check health of all services"""
    print_header("Checking Services Health")
    
    results = {}
    
    # Check Backend API
    results['backend'] = wait_for_service(
        "http://localhost:8000/api/v1/health",
        "Backend API",
        timeout=90
    )
    
    # Check Frontend
    results['frontend'] = wait_for_service(
        "http://localhost:5173",
        "Frontend",
        timeout=60
    )
    
    # Check PostgreSQL
    results['postgres'] = wait_for_postgres(timeout=60)
    
    # Check Redis (via backend health or direct ping)
    cmd = [
        "docker", "compose",
        "-f", str(DOCKER_DIR / "docker-compose.yml"),
        "--env-file", str(REPO_ROOT / ".env.staging"),
        "-f", str(DOCKER_DIR / "docker-compose.staging.yml"),
        "exec", "-T", "redis",
        "redis-cli", "ping"
    ]
    success, output = run_command(cmd, cwd=REPO_ROOT, capture=True)
    results['redis'] = success and "PONG" in output
    if results['redis']:
        print_success("Redis is ready")
    else:
        print_error("Redis is not responding")
    
    # Check Celery worker
    cmd = [
        "docker", "compose",
        "-f", str(DOCKER_DIR / "docker-compose.yml"),
        "--env-file", str(REPO_ROOT / ".env.staging"),
        "-f", str(DOCKER_DIR / "docker-compose.staging.yml"),
        "ps", "celery_worker"
    ]
    success, output = run_command(cmd, cwd=REPO_ROOT, capture=True)
    results['celery'] = success and ("running" in output.lower() or "Up" in output)
    if results['celery']:
        print_success("Celery worker is running")
    else:
        print_warning("Celery worker status unknown")
    
    return results


def check_jenkins_connection() -> bool:
    """Check if Jenkins is accessible"""
    print_header("Checking Jenkins Connection")
    
    jenkins_url = "http://192.168.1.101:8080"
    
    try:
        req = urllib.request.Request(jenkins_url, method='GET')
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                print_success(f"Jenkins is accessible at {jenkins_url}")
                return True
    except Exception as e:
        print_error(f"Cannot connect to Jenkins at {jenkins_url}: {e}")
        print_warning("Make sure Jenkins is running on localhost (192.168.1.101:8080)")
        return False
    
    return False


def test_backend_api() -> bool:
    """Test backend API endpoints"""
    print_header("Testing Backend API")
    
    base_url = "http://localhost:8000/api/v1"
    all_passed = True
    
    # Test 1: Health check
    print_info("Testing health endpoint...")
    try:
        req = urllib.request.Request(f"{base_url}/health", method='GET')
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                print_success("Health endpoint OK")
            else:
                print_error("Health endpoint returned non-200 status")
                all_passed = False
    except Exception as e:
        print_error(f"Health endpoint failed: {e}")
        all_passed = False
    
    # Test 2: Create a test project
    print_info("Testing project creation...")
    try:
        project_data = json.dumps({
            "name": "Staging Test Project",
            "git_url": "https://github.com/test/staging-repo.git",
            "branch": "main",
            "credentials_id": "test-cred",
            "sonar_key": "test-sonar"
        }).encode('utf-8')
        
        req = urllib.request.Request(
            f"{base_url}/projects",
            data=project_data,
            headers={"Content-Type": "application/json"},
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                project_id = data.get('project_id')
                print_success(f"Project created: {project_id}")
                
                # Test 3: Trigger a scan
                print_info("Testing scan trigger...")
                scan_data = json.dumps({
                    "project_id": project_id,
                    "scan_mode": "automated"
                }).encode('utf-8')
                
                req = urllib.request.Request(
                    f"{base_url}/scans",
                    data=scan_data,
                    headers={"Content-Type": "application/json"},
                    method='POST'
                )
                with urllib.request.urlopen(req, timeout=10) as response:
                    if response.status == 201:
                        scan_data = json.loads(response.read().decode())
                        scan_id = scan_data.get('scan_id')
                        print_success(f"Scan triggered: {scan_id}")
                        print_success(f"Scan state: {scan_data.get('state')}")
                    else:
                        print_error("Scan trigger returned non-201 status")
                        all_passed = False
                        
            else:
                print_error("Project creation returned non-200 status")
                all_passed = False
    except urllib.error.HTTPError as e:
        if e.code == 409:
            print_warning("Active scan already exists for project (this is OK)")
        else:
            print_error(f"API test failed with HTTP error: {e}")
            all_passed = False
    except Exception as e:
        print_error(f"API test failed: {e}")
        all_passed = False
    
    # Test 4: List projects
    print_info("Testing list projects...")
    try:
        req = urllib.request.Request(f"{base_url}/projects", method='GET')
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                projects = json.loads(response.read().decode())
                print_success(f"Found {len(projects)} project(s)")
            else:
                print_error("List projects returned non-200 status")
                all_passed = False
    except Exception as e:
        print_error(f"List projects failed: {e}")
        all_passed = False
    
    # Test 5: List scans
    print_info("Testing list scans...")
    try:
        req = urllib.request.Request(f"{base_url}/scans", method='GET')
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                scans = json.loads(response.read().decode())
                print_success(f"Found {len(scans)} scan(s)")
            else:
                print_error("List scans returned non-200 status")
                all_passed = False
    except Exception as e:
        print_error(f"List scans failed: {e}")
        all_passed = False
    
    return all_passed


def show_container_status():
    """Show status of all containers"""
    print_header("Container Status")
    
    cmd = [
        "docker", "compose",
        "-f", str(DOCKER_DIR / "docker-compose.yml"),
        "--env-file", str(REPO_ROOT / ".env.staging"),
        "-f", str(DOCKER_DIR / "docker-compose.staging.yml"),
        "ps", "-a"
    ]
    
    success, output = run_command(cmd, cwd=REPO_ROOT, capture=True)
    if success:
        print(output)
    else:
        print_warning("Could not retrieve container status")


def show_logs(service: str, lines: int = 50):
    """Show logs for a specific service"""
    print_header(f"Recent Logs: {service}")
    
    cmd = [
        "docker", "compose",
        "-f", str(DOCKER_DIR / "docker-compose.yml"),
        "--env-file", str(REPO_ROOT / ".env.staging"),
        "-f", str(DOCKER_DIR / "docker-compose.staging.yml"),
        "logs", "--tail", str(lines),
        service
    ]
    
    run_command(cmd, cwd=REPO_ROOT)


def print_summary(health_results: dict, api_test_passed: bool, jenkins_ok: bool):
    """Print summary of all tests"""
    print_header("Staging Setup Summary")
    
    print(f"\n{Colors.BOLD}Services Status:{Colors.RESET}")
    for service, ok in health_results.items():
        status = f"{Colors.GREEN}RUNNING{Colors.RESET}" if ok else f"{Colors.RED}NOT READY{Colors.RESET}"
        print(f"  {service:15} : {status}")
    
    print(f"\n{Colors.BOLD}Integration Tests:{Colors.RESET}")
    api_status = f"{Colors.GREEN}PASSED{Colors.RESET}" if api_test_passed else f"{Colors.RED}FAILED{Colors.RESET}"
    print(f"  Backend API     : {api_status}")
    
    jenkins_status = f"{Colors.GREEN}CONNECTED{Colors.RESET}" if jenkins_ok else f"{Colors.YELLOW}NOT AVAILABLE{Colors.RESET}"
    print(f"  Jenkins         : {jenkins_status}")
    
    print(f"\n{Colors.BOLD}Access URLs:{Colors.RESET}")
    print(f"  Frontend        : http://localhost:5173")
    print(f"  Backend API     : http://localhost:8000/api/v1")
    print(f"  API Docs        : http://localhost:8000/docs")
    
    all_ok = all(health_results.values()) and api_test_passed
    
    print(f"\n{Colors.BOLD}Overall Status:{Colors.RESET}")
    if all_ok:
        print(f"  {Colors.GREEN}✓ All services are running and tests passed!{Colors.RESET}")
    else:
        print(f"  {Colors.YELLOW}⚠ Some services or tests need attention{Colors.RESET}")
    
    print()


def main():
    print(f"\n{Colors.BOLD}Staging Setup Script{Colors.RESET}")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Parse arguments
    import argparse
    parser = argparse.ArgumentParser(description="Staging setup and test script")
    parser.add_argument("--skip-stop", action="store_true", help="Skip stopping existing containers")
    parser.add_argument("--logs", type=str, help="Show logs for a specific service")
    parser.add_argument("--status", action="store_true", help="Only show container status")
    args = parser.parse_args()
    
    if args.status:
        show_container_status()
        return 0
    
    if args.logs:
        show_logs(args.logs)
        return 0
    
    # Step 1: Stop existing containers
    if not args.skip_stop:
        stop_existing_containers()
    else:
        print_info("Skipping container stop (--skip-stop)")
    
    # Step 2: Start services
    if not start_services():
        print_error("Failed to start services. Exiting.")
        return 1
    
    print_info("Waiting for services to initialize...")
    time.sleep(10)  # Give services time to start
    
    # Step 3: Check health
    health_results = check_services_health()
    
    # Step 4: Check Jenkins
    jenkins_ok = check_jenkins_connection()
    
    # Step 5: Test API
    api_test_passed = test_backend_api()
    
    # Step 6: Show container status
    show_container_status()
    
    # Step 7: Print summary
    print_summary(health_results, api_test_passed, jenkins_ok)
    
    # Return appropriate exit code
    if all(health_results.values()) and api_test_passed:
        return 0
    else:
        return 1


if __name__ == "__main__":
    sys.exit(main())
