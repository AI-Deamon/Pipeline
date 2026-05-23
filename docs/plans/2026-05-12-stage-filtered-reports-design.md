# Stage-Filtered Report Fetching

## Problem
Manual scans with selected stages show ALL tool reports instead of only the tools that ran.

## Design

### Fetcher-level filtering
Only fetch/parse reports for stages that actually ran (PASS/FAIL). SKIPPED stages produce no reports.

### Flow
```
Jenkins callback → stage_results stored on ScanDB
   → Celery task loads stage_results + selected_stages + scan_mode
   → Fetcher filters tool list by stage status
   → Only PASS/FAIL stages get artifact fetches
   → DB naturally only has relevant reports
   → API/frontend unchanged - just show what's in DB
```

### Stage → Tool mapping
| Stage | Tool | File |
|-------|------|------|
| `nmap_scan` | `nmap` | `nmap_findings.json` |
| `zap_scan` | `zap` | `zap.json` |
| `trivy_fs_scan` | `trivy_fs` | `trivy-fs.json` |
| `trivy_image_scan` | `trivy_image` | `trivy-image.json` |
| `dependency_check` | `dependency_check` | `dependency-check-report.json` |
| `sonar_scanner` | `sonar` | (API-based, via sonar_key) |

### Changes
- **report_tasks.py**: Load stage context, pass to fetcher
- **fetcher.py**: Accept stage_results/selected_stages/scan_mode, filter by PASS/FAIL stages
- No changes to API or frontend

### Edge cases
- Automated scan (no selected_stages): filter by PASS/FAIL from stage_results
- Manual scan with selections: intersect PASS/FAIL with selected_stages
- All stages SKIPPED or FAILED: no reports fetched
- Sonar: only fetch if sonar_scanner stage passed/failed
