
PASS 9 stages
SKIP 1 stage
FAIL 0 stages
Issues found 7 stages have problems despite PASS
Checked out branch main of https://github.com/Bhaskar-ITM/Agent successfully with credentials.
The pipeline's own Jenkinsfile was loaded from branch origin/pr-49 (a PR branch), but the target code was checked out from main. This means your pipeline code and the scanned code are from different branches — can cause confusion during debugging.
No issues with credentials or fetch. Clean.
Analysis succeeded. Scanned 402 files across 9 languages (Python, JS, TS, CSS, HTML, JSON, YAML, XML, Docker). Total time 48 seconds.
Project name has a space: -Dsonar.projectName=test 1 — the shell splits this into two arguments. Works here only by luck; will break if the project name has quotes or special chars. Wrap in quotes or use withEnv.
No Python version set: WARN: analyzed as compatible with all Python 3 versions. Add -Dsonar.python.version=3.11 for more precise analysis.
Encoding warning: two .md files in .agent/ have invalid UTF-8 characters at specific lines. SonarQube flagged them. Fix the file encoding or add -Dsonar.sourceEncoding=ISO-8859-1.
Secrets scan timed out on the azure-subscription-keys rule while scanning dependency-check-report.json (12MB file). Add --exclude reports/ or -Dsonar.exclusions=reports/** to skip generated report files from source scanning.
Zero cache hits: all 46 JS/TS files show ANALYSIS_MODE_INELIGIBLE. SonarQube is not caching JS analysis between runs — this adds ~16 seconds every build. Investigate enabling incremental analysis.
SCM blame missing for reports/zap.html and reports/nmap.xml. These generated files are tracked by git, which confuses SonarQube's SCM publisher. Add reports/ to .gitignore.
Found ./package.json and ran npm ci successfully. 312 packages installed in 6 seconds.
10 vulnerabilities found but completely ignored: 3 moderate, 6 high, 1 critical. The stage records PASS without logging or reporting these. At minimum run npm audit --json > reports/npm-audit.json || true so the report is captured.
Found ./backend/requirements.txt and ran pip install successfully. All packages were already satisfied (no re-install needed).
recordStage is called outside the script {} block — it's placed after the timeout {} wrapper. This works only because of how Jenkins handles it, but it's incorrect and fragile. Move it inside a script {} block.
Auto-detected 2 scan paths: . (npm) and ./backend (pip). Reports written to both JSON and HTML formats.
Yarn audit disabled with an error: Yarn executable is not found. Even though there's no yarn.lock, the analyzer still tried and failed. You can explicitly disable it: add --disableYarnAudit to your scanArgs.
Pnpm audit disabled for the same reason. Add --disablePnpmAudit to avoid the noise.
OSS Index analyzer disabled: Authentication is now required. This was previously a free unauthenticated source of vulnerability data. You're now missing it. Either register at ossindex.sonatype.org and add credentials, or explicitly disable with --disableOssIndex.
Took 279 seconds (4.6 minutes) total. RetireJS alone took 139 seconds. Consider adding --disableRetireJS if you already cover JS via npm audit or Trivy, to save significant time.
The HTML report (35MB) triggered a Sonar warning in Stage 2. These files should not be in the scanned source tree.
Scanned filesystem successfully. Detected 2 language-specific files (npm, pnpm) and ran vulnerability + secret scanning.
Scanning its own report files: Trivy warns that reports/dependency-check-report.json (11MB) and reports/dependency-check-report.html (35MB) are too large for secret scanning and risk high memory use. Add --skip-files reports/ to the Trivy command.
Trivy is outdated: running v0.67.2, current is v0.69.3. Outdated Trivy = outdated vulnerability DB coverage. Update with pip install --upgrade trivy or your install method.
Python site-packages not found: License detection is skipped. Not critical, but if you need license scanning for Python packages, point Trivy at the virtual env or install dir.
Auto-detected docker/backend.Dockerfile correctly. Built image f37ed6d4...:1b2020d1... successfully in ~45 seconds.
All 6 build layers completed cleanly. Layers 2–6 include workdir, requirements copy, pip install, backend copy, and user creation.
Running pip as root inside container: WARNING: Running pip as the 'root' user. The Dockerfile does create an appuser at the end, but pip runs as root during build. This is a common Docker practice but worth noting for hardening.
The buildContext variable in Stage 7 of the Jenkinsfile computes to '.' in both branches of a ternary, then is never used — the sh docker build hardcodes . anyway. Dead code, should be removed.
Push was DENIED but recorded as PASS. The log clearly shows: denied: requested access to the resource is denied. The image was never pushed to Docker Hub. The || true on the push command swallowed the error silently.
The image tag uses the project_id UUID as the repository name (f37ed6d4-3cfc-44c5-8eba-a45a99c2b4f1). Docker Hub requires the format username/repo-name. The push will always fail unless you own a repo with that exact UUID name.
Credentials security warning: Jenkins flagged DOCKER_PASS was passed to sh using Groovy String interpolation, which is insecure. The password could leak into logs. Use single-quoted shell ''' with the variable injected via withEnv instead.
Scanned local image successfully. Detected Debian 13.4, 87 OS packages, 1 language-specific file (Python). Both OS and python-pkg scanners ran.
Results not surfaced: the scan ran and wrote trivy-image.json but there's no parsing or summary logged. You don't know how many CVEs were found. Add a trivy image --exit-code 1 --severity HIGH,CRITICAL step to actually gate on findings.
Same outdated version (v0.67.2 vs v0.69.3) as Stage 6.
Scan of 192.168.1.101 completed in 21 seconds. Found 5 open ports: 22 (SSH), 3000 (Grafana), 3389 (RDP), 8080 (Jetty/Jenkins), 9000 (SonarQube).
RDP (port 3389) is open on your server. This is a significant attack surface, especially on an internet-facing machine. If this is only used internally, firewall it.
The Nmap scan uses -sV -sC (service version + default scripts). For a security-focused pipeline, also consider adding --script vuln to detect known vulnerabilities on those open ports, or outputting in all formats with -oA.
The scan results are saved as XML only. No automated parsing of findings — the pipeline always records PASS regardless of what Nmap finds.
Both report exports failed with BAD_ACTION but the stage was recorded as PASS. The ZAP API endpoints /JSON/core/action/htmlreport/ and /JSON/core/action/jsonreport/ do not exist in ZAP 2.17. The correct paths are /OTHER/core/other/htmlreport/ and /OTHER/core/other/jsonreport/.
Spider completed in under 1 second (started at 13:11:05.590, finished at 13:11:06.369). For a React SPA at http://192.168.1.101:5173, the standard spider finds almost nothing since the content is JS-rendered. You need the AJAX spider for SPAs: /JSON/ajaxSpider/action/scan/?url=... and wait for it to complete.
No active scan was run. ZAP only spidered (passively). Active scanning is what finds real vulnerabilities like XSS, SQLi, etc. Add /JSON/ascan/action/scan/ after spidering and wait for it to finish before pulling the report.
The sleep 30 before the spider call is for ZAP to start up. This is fragile — on a slow machine ZAP might not be ready in 30 seconds. Better: poll the /JSON/core/view/version/ endpoint in a loop until it responds.
ZAP startup logs are verbose (100+ lines of extension loading). Consider redirecting ZAP stderr to a log file: zap.sh ... > zap-startup.log 2>&1 &
Callback to backend failed: curl: (7) Failed to connect to 192.168.1.101 port 8000. Your backend was not reachable from the Jenkins agent. The build reported SUCCESS even though no result was delivered. Ensure BACKEND_URL is set as a Jenkins environment variable pointing to the correct address.
Default token is hardcoded in plain text in the Jenkinsfile: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6. This is visible in your public GitHub repo. Replace with a Jenkins secret credential.
