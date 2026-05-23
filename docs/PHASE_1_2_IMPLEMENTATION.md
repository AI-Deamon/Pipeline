# Phase 1 & 2 Implementation Status

## ✅ Completed (Backend)

### 1. Database Models Updated
**File**: `backend/app/models/db_models.py`

Added fields to `ScanDB`:
- `error_message` - Store error details
- `error_type` - Categorize errors (PIPELINE_ERROR, TIMEOUT, etc.)
- `jenkins_console_url` - Direct link to Jenkins logs
- `retry_count` - Track number of retries

### 2. API Schemas Updated
**File**: `backend/app/schemas/scan.py`

New schemas:
- `ScanError` - Error details structure
- `ScanResetResponse` - Reset endpoint response
- `ScanCancelResponse` - Cancel endpoint response
- `ScanHistoryResponse` - History list item

Updated `ScanResponse`:
- Added `error` field (optional)
- Added `retry_count` field

### 3. New API Endpoints
**File**: `backend/app/api/scans.py`

#### Reset Scan Endpoint
```
POST /api/v1/scans/{scan_id}/reset
Headers: X-API-Key: ...
Response: ScanResponse
```
- Resets scan state to CREATED
- Clears error messages
- Updates project last_scan_state
- Allows re-running failed scans

#### Cancel Scan Endpoint
```
POST /api/v1/scans/{scan_id}/cancel
Headers: X-API-Key: ...
Response: ScanCancelResponse
```
- Marks scan as CANCELLED
- Updates project state
- Returns success message

#### Scan History Endpoint
```
GET /api/v1/projects/{project_id}/scans?limit=20&offset=0
Headers: X-API-Key: ...
Response: List[ScanHistoryResponse]
```
- Returns all scans for project
- Includes error details
- Supports pagination

### 4. Auto-Recovery Service
**File**: `backend/app/services/scan_recovery.py`

Features:
- `recover_stuck_scans()` - Background task to find & recover stuck scans
- `recover_single_scan(scan_id)` - Manual recovery for specific scan
- `run_recovery_task()` - Run every 5 minutes automatically

To enable auto-recovery, add to backend startup:
```python
from app.services.scan_recovery import run_recovery_task
import threading

# Start background recovery thread
threading.Thread(target=run_recovery_task, daemon=True).start()
```

### 5. Helper Function Updated
**File**: `backend/app/api/scans.py`

Updated `_scan_to_response()` to include:
- Error details
- Retry count

---

## ✅ Completed (Frontend)

### 1. API Client Updated
**File**: `src/services/api.ts`

New methods:
```typescript
api.scans.reset(id)
api.scans.cancel(id)
api.scans.getHistory(projectId)
api.projects.getScanHistory(projectId)
```

### 2. React Query Hooks Created
**File**: `src/hooks/useScanReset.ts`

New hooks:
- `useScanReset()` - Reset stuck scans
- `useScanCancel()` - Cancel running scans
- `useScanHistory(projectId)` - Get scan history

### 3. Error Modal Component Created
**File**: `src/components/ScanErrorModal.tsx`

Features:
- Displays error message with formatting
- Shows Jenkins console link
- Copy to clipboard button
- Suggested fixes based on error type
- Responsive design

---

## 📋 TODO (Frontend - To Complete)

### Update ScanStatusPage
**File**: `src/pages/ScanStatusPage.tsx`

Add these imports:
```typescript
import { useScanReset, useScanCancel } from '../hooks/useScanReset';
import { ScanErrorModal } from '../components/ScanErrorModal';
import { AlertCircle, RefreshCw, XCircle } from 'lucide-react';
```

Add state:
```typescript
const [showErrorModal, setShowErrorModal] = useState(false);
const resetMutation = useScanReset();
const cancelMutation = useScanCancel();
```

Add reset button (after status cards):
```typescript
{scan && scan.state === 'FAILED' && (
  <div className="mt-6 flex gap-4">
    <button
      onClick={() => {
        if (confirm('Reset this scan and allow retry?')) {
          resetMutation.mutate(scan.scan_id, {
            onSuccess: () => {
              alert('Scan reset successfully! You can now trigger a new scan.');
              fetchScanData();
            },
            onError: (err) => {
              alert(`Failed to reset: ${err.message}`);
            }
          });
        }
      }}
      disabled={resetMutation.isPending}
      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
    >
      <RefreshCw className={`w-4 h-4 ${resetMutation.isPending ? 'animate-spin' : ''}`} />
      {resetMutation.isPending ? 'Resetting...' : 'Reset & Retry'}
    </button>
    
    {scan.state === 'RUNNING' && (
      <button
        onClick={() => {
          if (confirm('Cancel this running scan?')) {
            cancelMutation.mutate(scan.scan_id, {
              onSuccess: () => {
                alert('Scan cancelled');
                fetchScanData();
              }
            });
          }
        }}
        disabled={cancelMutation.isPending}
        className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
      >
        <XCircle className="w-4 h-4" />
        Cancel Scan
      </button>
    )}
  </div>
)}
```

Add error display button:
```typescript
{scan?.error && (
  <div className="mt-6">
    <button
      onClick={() => setShowErrorModal(true)}
      className="flex items-center gap-2 text-red-600 hover:text-red-700 font-medium"
    >
      <AlertCircle className="w-5 h-5" />
      View Error Details
    </button>
  </div>
)}

{/* Error Modal */}
<ScanErrorModal
  isOpen={showErrorModal}
  onClose={() => setShowErrorModal(false)}
  error={scan?.error || null}
/>
```

### Create ScanHistoryPage
**File**: `src/pages/ScanHistoryPage.tsx` (Create new)

```typescript
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { ArrowLeft, Clock, CheckCircle, AlertCircle, XCircle } from 'lucide-react';

export default function ScanHistoryPage() {
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['scan-history', projectId],
    queryFn: () => api.projects.getScanHistory(projectId!),
    refetchInterval: 10000,
  });

  const getStatusIcon = (state: string) => {
    switch (state) {
      case 'COMPLETED': return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'FAILED': return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'CANCELLED': return <XCircle className="w-5 h-5 text-blue-600" />;
      default: return <Clock className="w-5 h-5 text-yellow-600" />;
    }
  };

  if (isLoading) return <div>Loading history...</div>;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <button
        onClick={() => navigate(`/projects/${projectId}`)}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Project
      </button>

      <h1 className="text-2xl font-bold text-slate-900 mb-6">Scan History</h1>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500">Status</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500">Scan ID</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500">Started</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500">Duration</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500">Retries</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {history.map(scan => (
              <tr key={scan.scan_id} className="hover:bg-slate-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(scan.state)}
                    <span className="text-sm font-medium">{scan.state}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600 font-mono">
                  {scan.scan_id.slice(0, 8)}...
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">
                  {new Date(scan.created_at).toLocaleString()}
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">
                  {scan.finished_at 
                    ? Math.round((new Date(scan.finished_at).getTime() - new Date(scan.created_at).getTime()) / 1000 / 60) + 'm'
                    : 'In progress'
                  }
                </td>
                <td className="px-6 py-4">
                  {scan.retry_count > 0 ? (
                    <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
                      {scan.retry_count} retries
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {history.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            No scan history yet
          </div>
        )}
      </div>
    </div>
  );
}
```

### Add Route to App.tsx
```typescript
// Add import
import ScanHistoryPage from './pages/ScanHistoryPage';

// Add route
<Route path="/projects/:id/history" element={<ScanHistoryPage />} />
```

### Add History Link to ProjectControlPage
Add button/link to navigate to history page.

---

## 🧪 Testing

### Test Backend Endpoints

```bash
# Test reset endpoint
curl -X POST http://localhost:8000/api/v1/scans/{SCAN_ID}/reset \
  -H "X-API-Key: z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4"

# Test cancel endpoint
curl -X POST http://localhost:8000/api/v1/scans/{SCAN_ID}/cancel \
  -H "X-API-Key: z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4"

# Test history endpoint
curl http://localhost:8000/api/v1/projects/{PROJECT_ID}/scans \
  -H "X-API-Key: z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4"
```

### Test Frontend

1. Build frontend: `npm run build`
2. Restart: `docker compose restart frontend`
3. Navigate to a failed scan
4. Click "Reset & Retry" button
5. Verify scan can be re-triggered

---

## 📊 Features Delivered

| Feature | Status | Files Modified |
|---------|--------|---------------|
| Reset Scan API | ✅ | `scans.py`, `db_models.py`, `schemas/scan.py` |
| Cancel Scan API | ✅ | `scans.py` |
| Scan History API | ✅ | `scans.py` |
| Error Details Storage | ✅ | `db_models.py`, `schemas/scan.py` |
| Auto-Recovery Service | ✅ | `scan_recovery.py` |
| Frontend Reset Hook | ✅ | `useScanReset.ts` |
| API Client Methods | ✅ | `api.ts` |
| Error Modal Component | ✅ | `ScanErrorModal.tsx` |
| ScanStatusPage Updates | 📋 | To be completed |
| ScanHistoryPage | 📋 | To be created |
| Route Updates | 📋 | To be completed |

---

## 🚀 Next Steps

1. **Complete Frontend Implementation** (2-3 hours)
   - Update ScanStatusPage with reset button
   - Create ScanHistoryPage
   - Add routes

2. **Enable Auto-Recovery** (30 minutes)
   - Import and start recovery task in backend main.py
   - Test with stuck scans

3. **Test End-to-End** (1 hour)
   - Trigger scan and let it fail
   - Test reset functionality
   - Test cancel functionality
   - Verify history page

4. **Documentation** (30 minutes)
   - Update user guide
   - Document new API endpoints

---

*Implementation Date: 2026-03-02*  
*Phase: 1 & 2 (Critical + High Priority)*  
*Status: Backend Complete, Frontend 60% Complete*
