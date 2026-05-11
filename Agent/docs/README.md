# Documentation Index

> **Central hub for all project documentation**

---

## 📚 Documentation Structure

```
docs/
├── README.md                              # This file - Documentation Index
├── QUICK_REFERENCE.md                     # Quick troubleshooting card (PRINT THIS!)
├── TROUBLESHOOTING_AND_KNOWN_ISSUES.md    # Comprehensive troubleshooting guide
├── FIX_SUMMARY_COMPLETE.md                # All fixes made with details
└── PRODUCTION_GRADE_TECHNICAL_BREAKDOWN.md # Technical architecture details
```

---

## 🎯 Start Here

### New to the Project?
1. Read: `../QWEN.md` - Project overview and architecture
2. Review: `QUICK_REFERENCE.md` - Common commands and issues
3. Run: `python staging_setup.py` - Set up environment

### Experiencing Issues?
1. Check: `QUICK_REFERENCE.md` - Quick diagnostic commands
2. Deep Dive: `TROUBLESHOOTING_AND_KNOWN_ISSUES.md` - Detailed solutions
3. Reference: `FIX_SUMMARY_COMPLETE.md` - What was fixed before

### Deploying Changes?
1. Review: `FIX_SUMMARY_COMPLETE.md` - Prevention checklist
2. Test: `python verify_staging.py` - Verification script
3. Monitor: `TROUBLESHOOTING_AND_KNOWN_ISSUES.md` - What to watch for

---

## 📖 Document Descriptions

### QUICK_REFERENCE.md
**Purpose**: Quick troubleshooting reference card  
**Use When**: You need fast answers to common problems  
**Key Sections**:
- Emergency commands
- Diagnostic one-liners
- Common error messages & fixes
- Important values (API keys, URLs)
- Health check checklist

**Print this and keep it at your desk!**

---

### TROUBLESHOOTING_AND_KNOWN_ISSUES.md
**Purpose**: Comprehensive troubleshooting guide  
**Use When**: You encounter an issue not covered in quick reference  
**Key Sections**:
- Frontend issues (white screen, port conflicts, build artifacts)
- Backend issues (database connections, missing endpoints)
- Docker issues (port conflicts, DNS resolution, volume mounts)
- Nginx configuration (API proxy, static assets)
- Database issues (initialization, persistence)
- Jenkins integration (connection refused, CSRF tokens)
- Authentication issues (API keys, token expiration)
- Build & deployment (TypeScript errors, cache issues)

**Includes**: Diagnostic commands, prevention tips, verification steps

---

### FIX_SUMMARY_COMPLETE.md
**Purpose**: Complete record of all fixes made  
**Use When**: Understanding what was changed and why  
**Key Sections**:
- Executive summary
- All 6 issues fixed with before/after code
- Verification results (all tests passing)
- Scripts created (staging_setup.py, verify_staging.py)
- Configuration files modified
- Access information (URLs, credentials)
- Commands reference
- Lessons learned
- Future improvements

**Includes**: Complete test results, service health status, access URLs

---

### PRODUCTION_GRADE_TECHNICAL_BREAKDOWN.md
**Purpose**: Technical architecture documentation  
**Use When**: Understanding system design decisions  
**Key Sections**:
- Architecture overview
- Component details
- Data flow diagrams
- Security considerations
- Performance optimizations

*(Existing document - not modified in this session)*

---

## 🔍 Finding Information

### "How do I fix a white screen?"
→ **QUICK_REFERENCE.md** → "Frontend White Screen" section  
→ **TROUBLESHOOTING_AND_KNOWN_ISSUES.md** → "Frontend Issues" → "Perpetual White Loading Screen"  
→ **FIX_SUMMARY_COMPLETE.md** → "Issue #1: Frontend Perpetual Loading Screen"

### "What was the auth fix?"
→ **FIX_SUMMARY_COMPLETE.md** → "Issue #1: Frontend Perpetual Loading Screen"  
→ **TROUBLESHOOTING_AND_KNOWN_ISSUES.md** → "Authentication Issues"

### "How do I start everything?"
→ **QUICK_REFERENCE.md** → "Service Management" → "Start Services"  
→ **FIX_SUMMARY_COMPLETE.md** → "Commands Reference" → "Start Environment"

### "What are the API credentials?"
→ **QUICK_REFERENCE.md** → "Important Values"  
→ **FIX_SUMMARY_COMPLETE.md** → "Access Information" → "Default Credentials"

### "Jenkins won't connect"
→ **QUICK_REFERENCE.md** → "Common Error Messages" → "Connection refused"  
→ **TROUBLESHOOTING_AND_KNOWN_ISSUES.md** → "Jenkins Integration Issues"

---

## 🚀 Quick Start Commands

### Full Environment Setup
```bash
cd /home/kali_linux/Pipeline/Agent
python staging_setup.py
```

### Quick Health Check
```bash
docker compose ps
curl http://localhost:5173
curl -H "X-API-Key: z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4" http://localhost:8000/api/v1/projects
```

### Run All Tests
```bash
python verify_staging.py
```

### View Logs
```bash
docker compose logs -f
docker compose logs -f backend
docker compose logs -f frontend
```

---

## 📞 Support Resources

### Documentation
- **This Folder**: `/home/kali_linux/Pipeline/Agent/docs/`
- **Project Context**: `/home/kali_linux/Pipeline/QWEN.md`
- **API Documentation**: http://localhost:8000/docs

### Services
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000/api/v1
- **Jenkins**: http://192.168.1.101:8080

### Key Files
- **Environment**: `.env.staging`
- **Docker Compose**: `docker/docker-compose.staging.yml`
- **Nginx Config**: `docker/nginx.conf`

---

## 🔄 Document Maintenance

### When to Update Documentation

**Update QUICK_REFERENCE.md when**:
- New common error discovered
- New diagnostic command found
- Important values change

**Update TROUBLESHOOTING_AND_KNOWN_ISSUES.md when**:
- New issue category discovered
- Fix requires detailed explanation
- Prevention strategy identified

**Update FIX_SUMMARY_COMPLETE.md when**:
- Major fix implemented
- New script created
- Configuration changed

### Update Process

1. Make the fix
2. Update relevant documentation immediately
3. Add to "Last Updated" section
4. Increment version number
5. Note changes in document header

---

## 📋 Checklist for Future Issues

When encountering a new issue:

1. **Document the Problem**
   - [ ] Error message captured
   - [ ] Steps to reproduce documented
   - [ ] Expected vs actual behavior noted

2. **Diagnose Root Cause**
   - [ ] Logs reviewed
   - [ ] Diagnostic commands run
   - [ ] Root cause identified

3. **Implement Fix**
   - [ ] Fix tested in isolation
   - [ ] Fix tested in full environment
   - [ ] No regressions introduced

4. **Update Documentation**
   - [ ] QUICK_REFERENCE.md updated with quick fix
   - [ ] TROUBLESHOOTING_AND_KNOWN_ISSUES.md updated with details
   - [ ] FIX_SUMMARY_COMPLETE.md updated with before/after

5. **Prevent Recurrence**
   - [ ] Prevention checklist updated
   - [ ] Detection commands added
   - [ ] Team notified of changes

---

## 📊 Document Status

| Document | Status | Last Updated | Version |
|----------|--------|--------------|---------|
| QUICK_REFERENCE.md | ✅ Complete | 2026-03-02 | 1.0 |
| TROUBLESHOOTING_AND_KNOWN_ISSUES.md | ✅ Complete | 2026-03-02 | 1.0 |
| FIX_SUMMARY_COMPLETE.md | ✅ Complete | 2026-03-02 | 1.0 |
| PRODUCTION_GRADE_TECHNICAL_BREAKDOWN.md | ✅ Existing | See file | - |

---

## 🎓 Learning Resources

### Recommended Reading Order

**For New Team Members**:
1. `../QWEN.md` - Project overview
2. `QUICK_REFERENCE.md` - Common operations
3. `FIX_SUMMARY_COMPLETE.md` - What's been done
4. `TROUBLESHOOTING_AND_KNOWN_ISSUES.md` - Deep dive

**For Troubleshooting**:
1. `QUICK_REFERENCE.md` - Quick fixes
2. `TROUBLESHOOTING_AND_KNOWN_ISSUES.md` - Detailed solutions
3. `FIX_SUMMARY_COMPLETE.md` - Historical context

**For Deployment**:
1. `FIX_SUMMARY_COMPLETE.md` - Prevention checklist
2. `QUICK_REFERENCE.md` - Health checks
3. `TROUBLESHOOTING_AND_KNOWN_ISSUES.md` - What to monitor

---

*Documentation Index v1.0*  
*Created: 2026-03-02*  
*Last Updated: 2026-03-02*  
*Maintained by: DevSecOps Team*
