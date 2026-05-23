# Pages

Page-level (route) components. Each corresponds to a route in `App.tsx`.

## Pages

| Page | Route | Lines | Status |
|------|-------|-------|--------|
| `DashboardPage.tsx` | `/` | ~200 | ✅ Good |
| `ProjectControlPage.tsx` | `/projects/:id` | 449 | ⚠️ Needs splitting |
| `ManualScanPage.tsx` | `/projects/:id/manual` | ~200 | ✅ Good |
| `ScanStatusPage.tsx` | `/scans/:id` | 651 | ⚠️ Hook extracted, still large |
| `ScanHistoryPage.tsx` | `/projects/:id/history` | ~150 | ✅ Good |
| `SettingsPage.tsx` | `/settings` | ~150 | ✅ Good |
| `LoginPage.tsx` | `/login` | ~100 | ✅ Good |
| `RegisterPage.tsx` | `/register` | ~100 | ✅ Good |
| `ProjectEditPage.tsx` | `/projects/:id/edit` | ~100 | ✅ Good |
| `UserManagementPage.tsx` | `/users` | ~200 | ✅ Good |

## Page Patterns
- **Default export** - Pages use `export default`
- **Data fetching** - Use @tanstack/react-query hooks
- **Loading states** - Show Skeleton components while loading
- **Error handling** - Display error UI on query failures
- **Auth** - Wrapped in `ProtectedRoute` (except login/register)

## Split Strategy
For pages over 300 lines:
1. Extract logic to custom hook (already done for ScanStatusPage)
2. Extract complex UI sections to sub-components
3. Keep page as layout coordinator

## Connection to Other Modules
- Import components from `src/components/`
- Import hooks from `src/hooks/`
- Import services from `src/services/api.ts`
- Import types from `src/types.ts`
- Registered as routes in `src/App.tsx`
