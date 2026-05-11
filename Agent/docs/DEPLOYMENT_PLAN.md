# 🚀 DEPLOYMENT PLAN: DevSecOps Scanning Platform

## 1. DEPLOYMENT PRINCIPLES
1. Backend first (Source of Truth)
2. Jenkins second (Executor)
3. Kali agent isolated (Execution Plane)
4. UI last (Consumer)

## 2. DEPLOYMENT ORDER
### STEP 1 — Backend Deployment
- Build backend container
- Deploy API service & database
- Expose `/api/v1`

### STEP 2 — Jenkins Controller
- Install Jenkins LTS & plugins
- Configure trigger tokens & credentials references

### STEP 3 — Kali Agent
- Deploy and harden Kali VM/container
- Preinstall security tools (Sonar, Trivy, ZAP, etc.)
- Register as Jenkins agent

### STEP 4 — Integration
- Backend triggers Jenkins
- Jenkins reports via v1 callback

### STEP 5 — UI Deployment
- Build static UI
- Configure API base URL
- Deploy behind Nginx

## 3. SECURITY & MONITORING
- HTTPS everywhere
- Immutable audit logs
- API health monitoring
- Scan duration alerts
