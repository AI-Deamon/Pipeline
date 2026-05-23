# Quick Reference Card - Common Issues & Solutions

> **Print this page for quick troubleshooting reference**

---

## 🚨 Emergency Commands

### Everything Broken - Start Fresh
```bash
cd /home/kali_linux/Pipeline/Agent
docker compose down --volumes --remove-orphans
python staging_setup.py
```

### Frontend White Screen
```bash
# Check if services are running
docker compose ps

# Rebuild frontend
npm run build
docker compose restart frontend

# Verify new bundle served
curl http://localhost:5173 | grep "index-"
```

### Backend 500 Errors
```bash
# Check database
docker compose ps postgres
docker compose restart postgres
sleep 10

# Restart backend
docker compose restart backend celery_worker

# Check logs
docker compose logs --tail=100 backend | grep -i error
```

---

## 🔍 Diagnostic One-Liners

```bash
# Quick health check
curl -s http://localhost:5173 && echo "✓ Frontend" || echo "✗ Frontend"
curl -s http://localhost:8000/api/v1/projects -H "X-API-Key: z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4" && echo "✓ Backend" || echo "✗ Backend"
docker compose exec -T postgres pg_isready && echo "✓ Database" || echo "✗ Database"

# Check all containers
docker compose ps | grep -E "NAME|Running|Exited"

# Find errors in logs
docker compose logs --tail=200 | grep -iE "error|exception|failed" | tail -20

# Check port conflicts
netstat -tlnp | grep -E "8000|5173|5432|6379"
```

---

## 📋 Common Error Messages & Fixes

| Error Message | Quick Fix |
|--------------|-----------|
| `could not translate host name "postgres"` | `docker compose up -d postgres && sleep 10` |
| `address already in use` | `docker compose down && docker compose up -d` |
| `not a directory` (mount error) | Check volume paths in docker-compose.yml |
| `Connection reset by peer` (frontend) | `docker compose restart frontend` |
| `401 Unauthorized` | Check API key: `z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4` |
| `404 Not Found` (API) | Verify endpoint path includes `/api/v1/` |
| `Loading...` forever | Check browser console, verify auth state |
| `Failed to fetch` (network) | Check container networking: `docker compose ps` |

---

## 🔑 Important Values

```
API Key:        z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4
Callback Token: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6

Frontend:  http://localhost:5173
Backend:   http://localhost:8000/api/v1
Jenkins:   http://192.168.1.101:8080

DB User:     devsecops
DB Password: staging-password
DB Name:     devsecops_staging
```

---

## 🛠️ Service Management

### Start Services
```bash
# All services
docker compose up -d

# Specific service
docker compose up -d backend

# With rebuild
docker compose up -d --build frontend
```

### Stop Services
```bash
# Graceful stop
docker compose down

# Force stop with volume cleanup
docker compose down --volumes --remove-orphans
```

### Restart Services
```bash
# All services
docker compose restart

# Specific service
docker compose restart backend celery_worker
```

### View Logs
```bash
# Follow logs
docker compose logs -f

# Last N lines
docker compose logs --tail=100

# Specific service
docker compose logs -f backend
```

---

## 🧪 Testing Commands

### Verify Frontend
```bash
curl http://localhost:5173
```

### Verify Backend
```bash
curl -H "X-API-Key: z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4" \
     http://localhost:8000/api/v1/projects
```

### Verify Database
```bash
docker compose exec postgres pg_isready -U devsecops -d devsecops_staging
```

### Verify Redis
```bash
docker compose exec redis redis-cli ping
```

### Verify Jenkins
```bash
curl -I http://192.168.1.101:8080
```

---

## 📁 Important File Locations

```
/home/kali_linux/Pipeline/Agent/
├── docker/
│   ├── docker-compose.yml           # Base configuration
│   ├── docker-compose.staging.yml   # Staging overlay
│   ├── nginx.conf                   # Nginx configuration
│   └── *.Dockerfile                 # Container definitions
├── src/
│   ├── hooks/
│   │   └── useAuth.tsx              # Authentication logic ⚠️
│   └── services/
│       └── api.ts                   # API client
├── docs/
│   ├── TROUBLESHOOTING_AND_KNOWN_ISSUES.md  # Full troubleshooting
│   ├── FIX_SUMMARY_COMPLETE.md              # All fixes made
│   └── QUICK_REFERENCE.md                   # This file
├── .env.staging                     # Environment variables
├── staging_setup.py                 # Setup script
└── verify_staging.py                # Verification script
```

---

## 🔧 Configuration Quick Reference

### Nginx Must Have
```nginx
server {
    listen 80;  # NOT 5173!
    root /usr/share/nginx/html;
    
    location /api/ {
        proxy_pass http://backend:8000/api/;
    }
}
```

### Docker Compose Must Have
```yaml
backend:
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy

frontend:
  ports:
    - "5173:80"  # Host:Container
  volumes:
    - ../dist:/usr/share/nginx/html:ro
```

### Auth Provider Must Have
```typescript
const [isLoading, setIsLoading] = useState<boolean>(true);

useEffect(() => {
  setIsLoading(false);
}, []);
```

---

## 🎯 Health Check Checklist

Run these in order:

```bash
# 1. Check all containers running
docker compose ps

# 2. Check database
docker compose exec postgres pg_isready

# 3. Check Redis
docker compose exec redis redis-cli ping

# 4. Check backend
curl http://localhost:8000/api/v1/projects -H "X-API-Key: z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4"

# 5. Check frontend
curl http://localhost:5173

# 6. Check Jenkins
curl http://192.168.1.101:8080
```

Expected output:
- ✓ All containers "Running"
- ✓ PostgreSQL "accepting connections"
- ✓ Redis "PONG"
- ✓ Backend returns JSON array
- ✓ Frontend returns HTML
- ✓ Jenkins returns 200 or 403

---

## 🚦 Status Codes Reference

| Code | Meaning | Action |
|------|---------|--------|
| 200 | OK | Success |
| 201 | Created | Resource created |
| 400 | Bad Request | Check request body |
| 401 | Unauthorized | Check API key/token |
| 403 | Forbidden | Check permissions |
| 404 | Not Found | Check URL path |
| 409 | Conflict | Resource already exists |
| 500 | Server Error | Check backend logs |
| 502 | Bad Gateway | Check proxy config |
| 503 | Unavailable | Service not ready |

---

## 📞 Escalation Path

1. **Check this document** - Common issues covered above
2. **Check troubleshooting guide** - `docs/TROUBLESHOOTING_AND_KNOWN_ISSUES.md`
3. **Check fix summary** - `docs/FIX_SUMMARY_COMPLETE.md`
4. **Run verification script** - `python verify_staging.py`
5. **Check API docs** - http://localhost:8000/docs
6. **Review project context** - `QWEN.md`

---

*Quick Reference Card v1.0*  
*Last Updated: 2026-03-02*  
*Print this page and keep at your desk!*
