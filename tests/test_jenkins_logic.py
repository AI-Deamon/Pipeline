import json

def should_run_sim(stage_name, mode, selected_stages, files, target_ip, target_url, state):
    if mode == 'MANUAL':
        return stage_name in selected_stages
    else:
        if stage_name == 'Git Checkout': return True
        if stage_name == 'Sonar Scanner':
            return 'sonar-project.properties' in files or 'pom.xml' in files or 'build.gradle' in files
        if stage_name == 'Sonar Quality Gate':
            return state.get('SONAR_SCANNER_RAN') == True
        if stage_name == 'NPM / PIP Install':
            return 'package.json' in files or 'requirements.txt' in files or 'Pipfile' in files
        if stage_name == 'Dependency Check':
            return 'package.json' in files or 'requirements.txt' in files or 'Pipfile' in files
        if stage_name == 'Trivy FS Scan': return True
        if stage_name == 'Docker Build': return 'Dockerfile' in files
        if stage_name == 'Docker Push': return 'Dockerfile' in files
        if stage_name == 'Trivy Image Scan': return state.get('DOCKER_BUILD_RAN') == True
        if stage_name == 'Nmap Scan': return True
        if stage_name == 'ZAP Scan': return True
        return False

def run_stage_sim(stage_name, mode, selected_stages, files, target_ip, target_url, state):
    if not should_run_sim(stage_name, mode, selected_stages, files, target_ip, target_url, state):
        return "SKIPPED"

    if stage_name == 'Nmap Scan':
        if not target_ip:
            return "FAILED" if mode == "MANUAL" else "SKIPPED"
        return "PASSED"

    if stage_name == 'ZAP Scan':
        if not target_url:
            return "FAILED" if mode == "MANUAL" else "SKIPPED"
        return "PASSED"

    return "PASSED"

def test_jenkins_logic():
    # 1. Automated Mode - Skip Nmap if no IP
    res = run_stage_sim('Nmap Scan', 'AUTOMATED', [], [], "", "", {})
    assert res == "SKIPPED", f"Expected SKIPPED, got {res}"

    # 2. Manual Mode - Fail Nmap if no IP but selected
    res = run_stage_sim('Nmap Scan', 'MANUAL', ['Nmap Scan'], [], "", "", {})
    assert res == "FAILED", f"Expected FAILED, got {res}"

    # 3. Automated Mode - Run Docker Build if Dockerfile exists
    res = run_stage_sim('Docker Build', 'AUTOMATED', [], ['Dockerfile'], "", "", {})
    assert res == "PASSED", f"Expected PASSED, got {res}"

    # 4. Automated Mode - Skip Sonar if no marker
    res = run_stage_sim('Sonar Scanner', 'AUTOMATED', [], [], "", "", {})
    assert res == "SKIPPED", f"Expected SKIPPED, got {res}"

    # 5. Manual Mode - Skip unselected stage
    res = run_stage_sim('Git Checkout', 'MANUAL', ['Nmap Scan'], [], "1.1.1.1", "", {})
    assert res == "SKIPPED", f"Expected SKIPPED, got {res}"

    print("Jenkins logic simulation tests passed!")

if __name__ == "__main__":
    test_jenkins_logic()
