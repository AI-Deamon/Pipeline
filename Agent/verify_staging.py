#!/usr/bin/env python3
"""
Staging Verification Script

Tests all components of the staging environment:
1. Backend API endpoints
2. Database connectivity
3. Celery task processing
4. Jenkins integration
5. Frontend availability
"""

import urllib.request
import urllib.error
import json
import sys
from datetime import datetime

# Colors
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'
BOLD = '\033[1m'

BASE_URL = "http://localhost:8000/api/v1"
API_KEY = "z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4"
CALLBACK_TOKEN = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"

def print_header(text):
    print(f"\n{BOLD}{BLUE}{'=' * 60}{RESET}")
    print(f"{BOLD}{BLUE}{text.center(60)}{RESET}")
    print(f"{BOLD}{BLUE}{'=' * 60}{RESET}\n")

def success(text):
    print(f"{GREEN}✓ {text}{RESET}")

def error(text):
    print(f"{RED}✗ {text}{RESET}")

def info(text):
    print(f"{BLUE}ℹ {text}{RESET}")

def warning(text):
    print(f"{YELLOW}⚠ {text}{RESET}")

def api_request(endpoint, method='GET', data=None):
    """Make API request with authentication"""
    url = f"{BASE_URL}{endpoint}"
    headers = {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json"
    }
    
    if data:
        data = json.dumps(data).encode('utf-8')
    
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.status, json.loads(response.read().decode()) if response.read else None
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.read else ""
        try:
            return e.code, json.loads(body)
        except:
            return e.code, {"detail": body}
    except Exception as e:
        return None, {"detail": str(e)}

def callback_request(scan_id, data):
    """Make callback request"""
    url = f"{BASE_URL}/scans/{scan_id}/callback"
    headers = {
        "X-Callback-Token": CALLBACK_TOKEN,
        "Content-Type": "application/json"
    }
    data = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.status, json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.read else ""
        try:
            return e.code, json.loads(body)
        except:
            return e.code, {"detail": body}
    except Exception as e:
        return None, {"detail": str(e)}

def test_frontend():
    """Test frontend availability"""
    print_header("Test 1: Frontend Availability")
    try:
        req = urllib.request.Request("http://localhost:5173", method='GET')
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                success("Frontend is accessible at http://localhost:5173")
                return True
    except Exception as e:
        error(f"Frontend not accessible: {e}")
    return False

def test_backend_health():
    """Test backend API health"""
    print_header("Test 2: Backend API Health")
    try:
        req = urllib.request.Request(f"{BASE_URL}/projects", 
                                    headers={"X-API-Key": API_KEY}, 
                                    method='GET')
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                success("Backend API is healthy")
                return True
    except Exception as e:
        error(f"Backend API not healthy: {e}")
    return False

def test_project_crud():
    """Test project CRUD operations"""
    print_header("Test 2: Project CRUD Operations")
    all_passed = True
    
    # Create project
    info("Creating test project...")
    status, data = api_request("/projects", "POST", {
        "name": f"Verification Test {datetime.now().strftime('%H%M%S')}",
        "git_url": "https://github.com/test/verify.git",
        "branch": "main",
        "credentials_id": "verify-cred",
        "sonar_key": "verify-sonar"
    })
    
    if status == 200 and "project_id" in data:
        success(f"Project created: {data['project_id']}")
        project_id = data["project_id"]
    else:
        error(f"Project creation failed: {data}")
        return False
    
    # Get project
    info("Fetching project...")
    status, data = api_request(f"/projects/{project_id}")
    if status == 200:
        success("Project fetched successfully")
    else:
        error(f"Project fetch failed: {data}")
        all_passed = False
    
    # List projects
    info("Listing projects...")
    status, data = api_request("/projects")
    if status == 200 and isinstance(data, list):
        success(f"Found {len(data)} project(s)")
    else:
        error(f"Project list failed: {data}")
        all_passed = False
    
    return all_passed

def test_scan_lifecycle():
    """Test complete scan lifecycle"""
    print_header("Test 3: Scan Lifecycle")
    all_passed = True
    
    # Create project for scan
    info("Creating project for scan test...")
    status, project_data = api_request("/projects", "POST", {
        "name": f"Scan Test {datetime.now().strftime('%H%M%S')}",
        "git_url": "https://github.com/test/scan-test.git",
        "branch": "main",
        "credentials_id": "scan-cred",
        "sonar_key": "scan-sonar"
    })
    
    if status != 200:
        error(f"Project creation failed: {project_data}")
        return False
    
    project_id = project_data["project_id"]
    success(f"Project created: {project_id}")
    
    # Trigger scan
    info("Triggering scan...")
    status, scan_data = api_request("/scans", "POST", {
        "project_id": project_id,
        "scan_mode": "automated"
    })
    
    if status == 201 and "scan_id" in scan_data:
        scan_id = scan_data["scan_id"]
        success(f"Scan triggered: {scan_id}")
        success(f"Initial state: {scan_data.get('state')}")
    else:
        error(f"Scan trigger failed: {scan_data}")
        return False
    
    # Get scan status
    info("Checking scan status...")
    import time
    time.sleep(2)  # Wait for Celery task
    
    status, scan_data = api_request(f"/scans/{scan_id}")
    if status == 200:
        success(f"Scan status: {scan_data.get('state')}")
        if scan_data.get('state') in ['RUNNING', 'QUEUED']:
            success("Scan is being processed by Celery worker")
        else:
            warning(f"Unexpected scan state: {scan_data.get('state')}")
    else:
        error(f"Scan status check failed: {scan_data}")
        all_passed = False
    
    # Get scan results
    info("Checking scan results...")
    status, results_data = api_request(f"/scans/{scan_id}/results")
    if status == 200:
        success("Scan results endpoint working")
    else:
        error(f"Scan results failed: {results_data}")
        all_passed = False
    
    # Simulate callback
    info("Testing callback endpoint...")
    status, callback_data = callback_request(scan_id, {
        "status": "SUCCESS",
        "build_number": 123,
        "queue_id": 456,
        "finishedAt": datetime.utcnow().isoformat() + "Z",
        "stages": [
            {
                "name": "Git Checkout",
                "status": "PASSED",
                "stage": "git_checkout"
            },
            {
                "name": "Sonar Scanner",
                "status": "PASSED",
                "stage": "sonar_scanner"
            }
        ]
    })
    
    if status == 200:
        success("Callback processed successfully")
    else:
        error(f"Callback failed: {callback_data}")
        all_passed = False
    
    # Verify final state
    info("Verifying final scan state...")
    status, scan_data = api_request(f"/scans/{scan_id}")
    if status == 200:
        if scan_data.get('state') == 'COMPLETED':
            success(f"Final state: COMPLETED")
        else:
            warning(f"Final state: {scan_data.get('state')}")
        
        if scan_data.get('results'):
            success(f"Stage results: {len(scan_data.get('results', []))} stages")
    else:
        error(f"Final status check failed: {scan_data}")
        all_passed = False
    
    return all_passed

def test_jenkins_connection():
    """Test Jenkins connection"""
    print_header("Test 4: Jenkins Connection")
    jenkins_url = "http://192.168.1.101:8080"
    
    try:
        req = urllib.request.Request(jenkins_url, method='GET')
        with urllib.request.urlopen(req, timeout=10) as response:
            # 200 or 403 (needs auth) both mean Jenkins is accessible
            if response.status in [200, 403]:
                success(f"Jenkins accessible at {jenkins_url}")
                return True
    except urllib.error.HTTPError as e:
        if e.code in [200, 403, 401]:
            success(f"Jenkins accessible at {jenkins_url} (requires auth)")
            return True
        error(f"Jenkins returned HTTP {e.code}")
    except Exception as e:
        error(f"Jenkins connection failed: {e}")
    
    return False

def test_validation():
    """Test input validation"""
    print_header("Test 5: Input Validation")
    all_passed = True
    
    # Test invalid scan mode
    info("Testing invalid scan mode...")
    status, data = api_request("/scans", "POST", {
        "project_id": "test-id",
        "scan_mode": "invalid_mode"
    })
    
    if status == 400:
        success("Invalid scan mode rejected")
    else:
        error(f"Invalid scan mode not rejected: {status}")
        all_passed = False
    
    # Test duplicate active scan prevention
    info("Testing duplicate scan prevention...")
    # First create a project and scan
    status, project_data = api_request("/projects", "POST", {
        "name": f"Duplicate Test {datetime.now().strftime('%H%M%S')}",
        "git_url": "https://github.com/test/dup.git",
        "branch": "main",
        "credentials_id": "dup-cred"
    })
    
    if status == 200:
        project_id = project_data["project_id"]
        
        # First scan
        status1, _ = api_request("/scans", "POST", {
            "project_id": project_id,
            "scan_mode": "automated"
        })
        
        # Second scan (should be rejected or allowed based on implementation)
        status2, data2 = api_request("/scans", "POST", {
            "project_id": project_id,
            "scan_mode": "automated"
        })
        
        if status2 == 409:
            success("Duplicate active scan prevented")
        else:
            info("Multiple scans allowed (implementation specific)")
    else:
        warning("Could not test duplicate prevention")
    
    return all_passed

def print_summary(results):
    """Print test summary"""
    print_header("Test Summary")
    
    passed = sum(1 for r in results.values() if r)
    total = len(results)
    
    for test_name, passed_test in results.items():
        status = f"{GREEN}PASSED{RESET}" if passed_test else f"{RED}FAILED{RESET}"
        print(f"  {test_name:30} : {status}")
    
    print(f"\n  {BOLD}Total: {passed}/{total} tests passed{RESET}")
    
    if passed == total:
        print(f"\n  {GREEN}{BOLD}✓ All tests passed!{RESET}")
        return True
    else:
        print(f"\n  {YELLOW}{BOLD}⚠ Some tests failed{RESET}")
        return False

def main():
    print(f"\n{BOLD}Staging Verification Suite{RESET}")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Backend URL: {BASE_URL}")
    print(f"Frontend URL: http://localhost:5173")
    print(f"Jenkins URL: http://192.168.1.101:8080")
    
    results = {}
    
    # Run tests
    results["Frontend"] = test_frontend()
    results["Backend Health"] = test_backend_health()
    results["Project CRUD"] = test_project_crud()
    results["Scan Lifecycle"] = test_scan_lifecycle()
    results["Jenkins Connection"] = test_jenkins_connection()
    results["Input Validation"] = test_validation()
    
    # Print summary
    all_passed = print_summary(results)
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
