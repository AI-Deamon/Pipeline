# Troubleshooting Guide & Known Issues

> **Purpose**: This document captures all issues encountered during development and their resolutions to prevent recurrence in future deployments.

---

## Table of Contents

1. [Frontend Issues](#frontend-issues)
2. [Backend Issues](#backend-issues)
3. [Docker/Container Issues](#dockercontainer-issues)
4. [Nginx Configuration Issues](#nginx-configuration-issues)
5. [Database Issues](#database-issues)
6. [Jenkins Integration Issues](#jenkins-integration-issues)
7. [Authentication Issues](#authentication-issues)
8. [Build & Deployment Issues](#build--deployment-issues)

---

## Frontend Issues

### 1. Perpetual White Loading Screen

**Symptom**: Frontend displays a white screen with loading spinner indefinitely, no errors in browser console.

**Root Cause**: `isLoading` state in `AuthProvider` was initialized to `true` but never updated to `false`.

**Affected File**: `src/hooks/useAuth.tsx`

**Before (Buggy Code)**:
```typescript
const [isLoading] = useState<boolean>(() => {
  const storedToken = localStorage.getItem('token');
  return storedToken === null;  // Always true for new visitors!
});
```

**After (Fixed Code)**:
```typescript
const [isLoading, setIsLoading] = useState<boolean>(true);

useEffect(() => {
  setIsLoading(false);  // Set to false after initial mount
}, []);
```

**Prevention**: 
- Always ensure state variables that control UI rendering are properly updated
- Use `useEffect` for side effects and state updates after mount
- Test authentication flow with fresh browser session (no localStorage)

**Detection**:
```bash
# Check if frontend is serving content
curl http://localhost:5173

# Verify JS bundle loads
curl http://localhost:5173/assets/index-*.js | head -5

# Check for runtime errors in browser console (F12)
```

---

### 2. Nginx Port Mismatch

**Symptom**: Frontend returns connection reset or doesn't load assets.

**Root Cause**: Nginx configuration listened on port 5173 inside container, but Dockerfile exposed port 80.

**Affected Files**:
- `docker/nginx.conf`
- `docker/frontend.Dockerfile`
- `docker/docker-compose.staging.yml`

**Fix Applied**:
```nginx
# nginx.conf - Changed from 5173 to 80
server {
    listen 80;  # Was: listen 5173
    server_name localhost;
    ...
}
```

```dockerfile
# frontend.Dockerfile - Changed from 8080 to 80
EXPOSE 80  # Was: EXPOSE 8080
```

```yaml
# docker-compose.staging.yml - Correct port mapping
frontend:
  ports:
    - "5173:80"  # Map host 5173 to container port 80
  volumes:
    - ../docker/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    - ../dist:/usr/share/nginx/html:ro
```

**Prevention**:
- Always verify container ports match nginx configuration
- Use volume mounts for nginx config during development
- Test with `curl -v` to see connection details

---

### 3. Missing Build Artifacts

**Symptom**: Nginx returns 404 for JS/CSS bundles.

**Root Cause**: Built files not available in container.

**Solution**:
```bash
# Always rebuild before deploying
cd Agent
npm run build

# Verify dist folder exists
ls -la dist/

# Restart frontend to pick up new files
docker compose restart frontend
```

**Prevention**:
- Always run `npm run build` before restarting frontend container
- Use volume mounts for `dist/` folder in development
- Verify build output before deployment

---

## Backend Issues

### 1. Database Connection Failure

**Symptom**: Backend returns 500 Internal Server Error, logs show "could not translate host name".

**Root Cause**: PostgreSQL container not running or DNS resolution failure in Docker network.

**Error Message**:
```
sqlalchemy.exc.OperationalError: (psycopg2.OperationalError) 
could not translate host name "postgres" to address: Name or service not known
```

**Fix**:
```bash
# Check container status
docker compose ps

# Start PostgreSQL if missing
docker compose up -d postgres

# Wait for health check
sleep 10

# Restart backend to reconnect
docker compose restart backend celery_worker
```

**Prevention**:
- Always verify all containers are running: `docker compose ps`
- Check PostgreSQL health: `docker compose ps postgres`
- Wait for health checks before dependent services

**Detection Script**:
```bash
#!/bin/bash
cd /home/kali_linux/Pipeline/Agent

echo "Checking container status..."
docker compose ps

echo -e "\nChecking PostgreSQL health..."
docker compose exec -T postgres pg_isready -U devsecops -d devsecops_staging

echo -e "\nTesting backend connectivity..."
curl -s http://localhost:8000/api/v1/health || echo "Backend not responding"
```

---

### 2. Missing API Endpoints

**Symptom**: 404 Not Found for expected endpoints.

**Root Cause**: FastAPI router not properly registered or incorrect base path.

**Verification**:
```bash
# Check available endpoints
curl http://localhost:8000/docs

# Test specific endpoint
curl -H "X-API-Key: YOUR_KEY" http://localhost:8000/api/v1/projects
```

**Prevention**:
- Verify all routers are included in `main.py`
- Check API version prefix consistency
- Test endpoints after deployment

---

## Docker/Container Issues

### 1. Container Port Conflicts

**Symptom**: Container fails to start with "address already in use".

**Error**:
```
failed to bind port 0.0.0.0:5432/tcp: address already in use
```

**Cause**: Host port already bound by another process or container.

**Solutions**:
```bash
# Find process using port
lsof -i :5432

# Stop conflicting container
docker compose down

# Or use different port in compose file
ports:
  - "5433:5432"  # Use different host port
```

**Prevention**:
- Always run `docker compose down` before starting new environment
- Check port availability: `netstat -tlnp | grep 5432`
- Use environment-specific port mappings

---

### 2. Docker Network DNS Resolution

**Symptom**: Containers can't resolve service names (e.g., "postgres", "redis").

**Cause**: Docker network not properly configured or container restarted outside network.

**Fix**:
```bash
# Recreate network
docker compose down
docker compose up -d

# Verify network
docker network ls
docker network inspect docker_default
```

**Prevention**:
- Use Docker Compose for multi-container deployments
- Don't manually restart containers outside Compose
- Verify network connectivity: `docker compose exec backend ping postgres`

---

### 3. Volume Mount Path Issues

**Symptom**: Container fails with "not a directory" or mount errors.

**Error**:
```
error mounting "/path/to/nginx.conf" to rootfs at "/etc/nginx/conf.d/default.conf": 
not a directory
```

**Cause**: Incorrect relative path in volume mount.

**Fix**:
```yaml
# WRONG (relative to wrong directory)
volumes:
  - ./docker/nginx.conf:/etc/nginx/conf.d/default.conf:ro

# CORRECT (relative to docker-compose.yml location)
volumes:
  - ../docker/nginx.conf:/etc/nginx/conf.d/default.conf:ro
```

**Prevention**:
- Always verify paths relative to `docker-compose.yml` location
- Use absolute paths in production
- Test mounts: `docker compose config` to validate

---

## Nginx Configuration Issues

### 1. API Proxy Not Working

**Symptom**: Frontend can't reach backend API, CORS errors in console.

**Cause**: Nginx proxy configuration missing or incorrect.

**Required Configuration**:
```nginx
location /api/ {
    proxy_pass http://backend:8000/api/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
```

**Verification**:
```bash
# Test API through nginx
curl http://localhost:5173/api/v1/projects

# Should return same as direct backend call
curl http://localhost:8000/api/v1/projects
```

---

### 2. Static Assets Not Loading

**Symptom**: HTML loads but JS/CSS return 404.

**Cause**: Nginx root not pointing to correct directory.

**Fix**:
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;  # Must match Docker volume mount
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;  # SPA fallback
    }
}
```

**Prevention**:
- Verify `root` directive matches build output location
- Use `try_files` for SPA routing
- Test all asset paths after deployment

---

## Database Issues

### 1. Database Not Initialized

**Symptom**: Backend starts but returns errors on first API call.

**Cause**: Database tables not created.

**Solution**:
```python
# Ensure models are imported and tables created
from app.core.db import engine, Base
from app.models.db_models import ProjectDB, ScanDB  # Import all models

# Create tables
Base.metadata.create_all(bind=engine)
```

**Prevention**:
- Run migrations on container startup
- Use SQLAlchemy's `create_all` in development
- Implement proper migration strategy for production

---

### 2. Database State Persistence

**Symptom**: Data lost after container restart.

**Cause**: Database volume not configured or incorrect mount path.

**Fix**:
```yaml
# docker-compose.yml
postgres:
  volumes:
    - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:  # Named volume for persistence
```

**Verification**:
```bash
# Check volume exists
docker volume ls | grep postgres

# Verify data persists after restart
docker compose restart postgres
curl http://localhost:8000/api/v1/projects  # Should return existing data
```

---

## Jenkins Integration Issues

### 1. Jenkins Connection Refused

**Symptom**: Scan triggers fail, logs show connection refused.

**Cause**: Jenkins not accessible from Docker network or incorrect URL.

**Configuration**:
```env
# .env.staging
JENKINS_BASE_URL=http://192.168.1.101:8080
JENKINS_TOKEN=your_token_here
```

**Verification**:
```bash
# Test Jenkins connectivity from host
curl http://192.168.1.101:8080

# Test from inside container
docker compose exec backend curl http://192.168.1.101:8080
```

**Prevention**:
- Use host IP instead of `localhost` for Jenkins
- Ensure Jenkins allows connections from Docker network
- Configure CORS in Jenkins if needed

---

### 2. CSRF Token Issues

**Symptom**: Jenkins returns 403 Forbidden on scan trigger.

**Cause**: Missing or expired CSRF crumb.

**Fix in Code**:
```python
# Always fetch fresh crumb before request
crumb_response = requests.get(f"{JENKINS_URL}/crumbIssuer/api/json")
crumb = crumb_response.json().get('crumb')
headers = {'Jenkins-Crumb': crumb}
```

**Prevention**:
- Fetch CSRF crumb for each request
- Handle crumb expiration gracefully
- Log crumb acquisition for debugging

---

## Authentication Issues

### 1. API Key Not Configured

**Symptom**: All API calls return 401 Unauthorized.

**Cause**: Missing API key in environment or localStorage.

**Configuration**:
```env
# .env.staging
API_KEY=your_api_key_here
CALLBACK_TOKEN=your_callback_token
```

**Frontend Fallback**:
```typescript
// src/services/api.ts
const apiKey = localStorage.getItem('API_KEY') || import.meta.env.VITE_API_KEY;
if (apiKey) {
  config.headers['X-API-Key'] = apiKey;
}
```

**Verification**:
```bash
# Test with API key
curl -H "X-API-Key: your_key" http://localhost:8000/api/v1/projects

# Should return 200 OK
```

---

### 2. Token Expiration Not Handled

**Symptom**: User suddenly logged out during active session.

**Cause**: No token refresh mechanism implemented.

**Future Fix Required**:
```typescript
// TODO: Implement token refresh
api.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      // Attempt token refresh
      await refreshToken();
      return retryOriginalRequest(error);
    }
    return Promise.reject(error);
  }
);
```

**Current Workaround**:
- Use long-lived tokens in development
- Implement session persistence
- Clear error messages on auth failure

---

## Build & Deployment Issues

### 1. TypeScript Build Errors

**Symptom**: `npm run build` fails with type errors.

**Common Causes**:
- Missing type definitions
- Incorrect import paths
- Strict mode violations

**Solution**:
```bash
# Check TypeScript config
cat tsconfig.json

# Run type check separately
npx tsc --noEmit

# Fix reported errors before build
```

**Prevention**:
- Keep TypeScript updated
- Use strict mode gradually
- Add type definitions for all dependencies

---

### 2. Vite Build Cache Issues

**Symptom**: Build succeeds but old code still runs.

**Cause**: Vite cache not invalidated.

**Solution**:
```bash
# Clear Vite cache
rm -rf node_modules/.vite

# Force rebuild
npm run build -- --force

# Or clean build
rm -rf dist
npm run build
```

**Prevention**:
- Clear cache on major changes
- Use cache-busting in production
- Verify bundle hash changes after rebuild

---

### 3. Dependency Version Conflicts

**Symptom**: Build works locally but fails in Docker.

**Cause**: Different Node/npm versions or dependency resolution.

**Solution**:
```dockerfile
# Pin exact versions in Dockerfile
FROM node:20-alpine

# Use package-lock.json
COPY package.json package-lock.json* ./
RUN npm ci  # Exact install from lock file
```

**Prevention**:
- Always commit `package-lock.json`
- Use `npm ci` in CI/CD
- Test builds in Docker locally

---

## Diagnostic Commands

### Quick Health Check

```bash
#!/bin/bash
# save as: check_health.sh

cd /home/kali_linux/Pipeline/Agent

echo "=== Container Status ==="
docker compose ps

echo -e "\n=== Network Connectivity ==="
docker compose exec -T backend ping -c 2 postgres || echo "Postgres unreachable"
docker compose exec -T backend ping -c 2 redis || echo "Redis unreachable"

echo -e "\n=== Service Health ==="
curl -s http://localhost:8000/api/v1/projects -H "X-API-Key: YOUR_KEY" | head -c 200
echo ""
curl -s -o /dev/null -w "Frontend: %{http_code}\n" http://localhost:5173
curl -s -o /dev/null -w "Backend: %{http_code}\n" http://localhost:8000/api/v1/health
curl -s -o /dev/null -w "Jenkins: %{http_code}\n" http://192.168.1.101:8080

echo -e "\n=== Recent Errors ==="
docker compose logs --tail=50 backend | grep -i error | tail -10
```

### Log Analysis

```bash
# Backend errors
docker compose logs backend | grep -E "ERROR|Traceback|Exception" | tail -20

# Frontend errors (nginx)
docker compose logs frontend | grep -E "error|Error|404|500" | tail -20

# Celery task failures
docker compose logs celery_worker | grep -E "ERROR|failed|Failed" | tail -20

# Database issues
docker compose logs postgres | grep -E "error|FATAL" | tail -20
```

### Network Debugging

```bash
# Check port bindings
netstat -tlnp | grep -E "8000|5173|5432|6379"

# Test from inside container
docker compose exec backend curl http://postgres:5432
docker compose exec backend curl http://redis:6379

# Check DNS resolution
docker compose exec backend nslookup postgres
docker compose exec backend nslookup redis
```

---

## Prevention Checklist

### Before Deployment

- [ ] All containers running: `docker compose ps`
- [ ] Database healthy: `docker compose exec postgres pg_isready`
- [ ] Backend responding: `curl http://localhost:8000/api/v1/health`
- [ ] Frontend serving: `curl http://localhost:5173`
- [ ] Jenkins accessible: `curl http://192.168.1.101:8080`
- [ ] API authentication working: `curl -H "X-API-Key: ..." http://localhost:8000/api/v1/projects`
- [ ] No errors in logs: `docker compose logs --tail=100`

### After Code Changes

- [ ] Frontend rebuilt: `npm run build`
- [ ] Frontend restarted: `docker compose restart frontend`
- [ ] New bundle served: `curl http://localhost:5173 | grep "index-"`
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] Tests passing: `npm run test` (if available)

### After Infrastructure Changes

- [ ] All volumes mounted correctly
- [ ] Network connectivity verified
- [ ] Environment variables set
- [ ] Secrets/keys configured
- [ ] Health checks passing
- [ ] Monitoring/alerting configured

---

## Contact & Resources

- **Project Documentation**: `/docs/` folder
- **API Documentation**: http://localhost:8000/docs
- **Jenkins**: http://192.168.1.101:8080
- **QWEN.md**: Project context and architecture guide

---

*Last Updated: 2026-03-02*
*Document Version: 1.0*
