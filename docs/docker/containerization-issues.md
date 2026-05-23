# Docker Containerization Issues & Proposed Fixes

Analysis of identified issues in the Docker configuration and recommended fixes.

---

## Issue Summary

| Priority | Issue | Impact | Status |
|----------|-------|--------|--------|
| 🔴 Critical | No health checks | Startup race conditions | ❌ Not fixed |
| 🔴 Critical | Nginx not wired | Not using production reverse proxy | ❌ Not fixed |
| 🟡 Medium | Frontend runs as root | Security vulnerability | ❌ Not fixed |
| 🟡 Medium | Staging serves dev server | Inefficient, not production-ready | ❌ Not fixed |
| 🟢 Low | Build context inefficiency | Slower Docker builds | ⚠️ Minor |
| 🟢 Low | Dead work in frontend build | Production bundle built but never served | ⚠️ Minor |

---

## Issue 1: No Health Checks 🔴

### Problem

None of the Docker Compose files define `healthcheck:` directives for any service. The current setup relies only on `depends_on:` which guarantees **container start order**, not **service readiness**.

### Current Configuration

```yaml
# docker/docker-compose.yml
services:
  backend:
    depends_on:
      postgres:
        condition: service_healthy  # ← But no healthcheck defined!
      redis:
        condition: service_healthy  # ← But no healthcheck defined!
```

### Impact

- Backend may start before PostgreSQL accepts connections
- Celery worker may start before Redis is ready
- Frontend may start before backend is serving API
- Results in connection errors on startup (usually resolves after retries)

### Proposed Fix

Add health checks to all critical services:

```yaml
# docker/docker-compose.yml

services:
  postgres:
    image: postgres:16-alpine
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  backend:
    build:
      context: ..
      dockerfile: docker/backend.Dockerfile
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  frontend:
    build:
      context: ..
      dockerfile: docker/frontend.Dockerfile
    depends_on:
      backend:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s
```

### Expected Behavior After Fix

1. PostgreSQL starts, healthcheck passes (~30s)
2. Redis starts, healthcheck passes (~10s)
3. Backend starts **after** PostgreSQL and Redis are healthy
4. Backend healthcheck passes (~40s for uvicorn + DB migration)
5. Frontend starts **after** backend is healthy
6. Frontend healthcheck passes (~20s)

**Total startup time**: ~60-90 seconds (vs current 2-3 minutes with retries)

---

## Issue 2: Nginx Not Wired 🔴

### Problem

`docker/nginx.conf` exists but is **NOT referenced** in any Docker Compose file. The staging environment serves the frontend directly from Vite's dev server on port 80, not through Nginx.

### Current Configuration

```yaml
# docker/docker-compose.staging.yml
frontend:
  ports:
    - "80:80"
  # No volume mount for nginx.conf
  # CMD serves from Vite dev server (npm run dev)
```

### Impact

- Not using production-ready reverse proxy
- Missing features: gzip compression, caching, rate limiting, SSL termination
- Vite dev server not optimized for production serving
- Potential security issues (dev server exposes more than needed)

### Current nginx.conf

```nginx
# docker/nginx.conf (exists but unused)
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Proposed Fix

**Option A: Nginx for Frontend Only (Recommended)**

```yaml
# docker/docker-compose.staging.yml
frontend:
  build:
    context: ..
    dockerfile: docker/frontend.Dockerfile
  ports:
    - "80:80"
  volumes:
    - ../docker/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    - ../dist:/usr/share/nginx/html:ro
  restart: unless-stopped
  depends_on:
    backend:
      condition: service_healthy
```

**Changes needed to frontend.Dockerfile:**
```dockerfile
# docker/frontend.Dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# Multi-stage: production with Nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Benefits:**
- Uses production Nginx + built SPA bundle
- Proper SPA routing (try_files)
- Reverse proxy to backend at `/api/`
- WebSocket proxy at `/ws/`

### Files to Modify

1. `docker/docker-compose.staging.yml` - Add volume mounts
2. `docker/frontend.Dockerfile` - Multi-stage build with Nginx
3. `docker/nginx.conf` - Verify configuration is correct

---

## Issue 3: Frontend Runs as Root 🟡

### Problem

The frontend Dockerfile lacks a `USER` directive, so the container runs as root. This is a security vulnerability.

### Current Configuration

```dockerfile
# docker/frontend.Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 80
CMD ["npx", "serve", "-s", "dist", "-l", "80"]
# No USER directive → runs as root!
```

### Impact

- If container is compromised, attacker has root access
- Violates principle of least privilege
- Security scanning tools will flag this

### Proposed Fix

```dockerfile
# docker/frontend.Dockerfile (multi-stage)
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

USER nextjs

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Note:** Nginx needs to bind to port 80, which typically requires root. Solutions:
1. Use port 8080 instead (>1024, no root needed)
2. Keep Nginx master process as root, worker processes as non-root (default Nginx behavior)

**Recommended:** Use default Nginx behavior (master as root, workers as non-root via `user nginx;` in nginx.conf).

---

## Issue 4: Staging Serves Dev Server 🟡

### Problem

The staging Docker Compose overrides the CMD to run `npm run dev` instead of serving the production build.

### Current Configuration

```yaml
# docker/docker-compose.staging.yml
frontend:
  # Build produces production bundle...
  # But CMD is overridden to run dev server!
  command: ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "80"]
```

### Impact

- Production bundle (`dist/`) is built but **never served** (dead work)
- Vite dev server has:
  - Hot Module Replacement (unnecessary in staging)
  - Source maps (exposes source code)
  - Development logging (verbose)
  - Slower performance than static file serving

### Proposed Fix

**With multi-stage build (Issue 2 fix):**
- Nginx serves the built `dist/` folder
- No dev server in staging

**Without multi-stage (quick fix):**
```yaml
# docker/docker-compose.staging.yml
frontend:
  command: ["npx", "serve", "-s", "dist", "-l", "80"]
```

---

## Issue 5: Build Context Inefficiency 🟢

### Problem

Docker build context is the entire repository, but only subdirectories are used.

### Current Configuration

```yaml
# docker/docker-compose.yml
backend:
  build:
    context: .  # Sends entire repo to Docker daemon
    dockerfile: docker/backend.Dockerfile

frontend:
  build:
    context: ..  # Sends entire repo to Docker daemon
    dockerfile: docker/frontend.Dockerfile
```

### Impact

- Slower builds (Docker daemon processes entire repo)
- Unnecessary data transfer
- `.dockerignore` not utilized

### Proposed Fix

**Option A: Use `.dockerignore`**

```dockerignore
# .dockerignore
node_modules/
dist/
.git/
.ruff_cache/
storage/
docs/
graphify-out/
plans/
verification/
tests/
*.md
*.py
!backend/
!src/
!docker/
!package.json
!package-lock.json
!vite.config.ts
!tsconfig.json
!index.html
```

**Option B: Narrow build context**

```yaml
# docker/docker-compose.yml
backend:
  build:
    context: ./backend  # Only backend directory
    dockerfile: ../docker/backend.Dockerfile
```

**Recommended:** Option A (`.dockerignore`) - less disruptive to existing structure.

---

## Issue 6: Dead Work in Frontend Build 🟢

### Problem

Frontend Dockerfile builds production bundle, but staging serves from Vite dev server.

### Current Flow

```
1. npm install
2. npm run build  ← Creates dist/ (production bundle)
3. npm run dev -- --port 80  ← Ignores dist/, serves from src/
```

### Impact

- Wasted build time (~30-60 seconds)
- Larger Docker image (contains both `dist/` and `src/`)
- Confusing (why build if not used?)

### Proposed Fix

**Fixed by Issue 2 & 4 fixes:**
- Multi-stage build: Stage 1 builds `dist/`, Stage 2 serves it via Nginx
- No dev server in staging

---

## Fix Priority & Implementation Order

### Phase 1: Critical Fixes

1. **Add health checks** (Issue 1)
   - Files: `docker/docker-compose.yml`
   - Risk: Low
   - Impact: High (prevents startup race conditions)
   - Time: 30 minutes

2. **Wire Nginx** (Issue 2)
   - Files: `docker/docker-compose.staging.yml`, `docker/frontend.Dockerfile`
   - Risk: Medium
   - Impact: High (production-ready serving)
   - Time: 1-2 hours

### Phase 2: Security & Efficiency

3. **Non-root user** (Issue 3)
   - Files: `docker/frontend.Dockerfile`
   - Risk: Low
   - Impact: Medium (security best practice)
   - Time: 30 minutes

4. **Remove dev server from staging** (Issue 4)
   - Files: `docker/docker-compose.staging.yml`
   - Risk: Low
   - Impact: Medium (performance)
   - Time: 15 minutes

### Phase 3: Optimization

5. **Add `.dockerignore`** (Issue 5)
   - Files: `.dockerignore`
   - Risk: Low
   - Impact: Low-Medium (faster builds)
   - Time: 30 minutes

6. **Clean up dead work** (Issue 6)
   - Fixed by Phase 1 & 2 changes
   - Time: 0 (automatic)

---

## Testing Plan

### After Each Fix

1. **Build test:**
   ```bash
   cd Agent
   python run.py down
   python run.py staging
   docker compose ps  # Verify all containers healthy
   ```

2. **Health check test:**
   ```bash
   docker inspect --format='{{.State.Health.Status}}' <container_name>
   ```

3. **Frontend test:**
   - Open http://localhost:80
   - Verify SPA loads
   - Verify API calls work (login, list projects)
   - Verify WebSocket connects

4. **Nginx test:**
   ```bash
   docker exec <frontend_container> nginx -t
   curl -I http://localhost:80/api/v1/projects  # Should proxy to backend
   ```

---

## Key Files

| File | Purpose |
|------|---------|
| `docker/docker-compose.yml` | Base service topology |
| `docker/docker-compose.staging.yml` | Staging overlay |
| `docker/docker-compose.dev.yml` | Development overlay |
| `docker/backend.Dockerfile` | FastAPI container |
| `docker/frontend.Dockerfile` | React container |
| `docker/nginx.conf` | Nginx configuration (currently unused) |
| `.dockerignore` | Docker build context exclusions (doesn't exist yet) |

---

*Generated: 2026-04-13 | Based on Docker compose files and Dockerfiles analysis*
