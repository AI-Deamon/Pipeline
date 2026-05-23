# Research: Deep Code Audit Fixes

**Date**: 2026-05-22
**Branch**: `001-deep-code-audit`

## Research Tasks

### R1: JWT Secret Separation (S2)

**Decision**: Add `JWT_SECRET_KEY` to `config.py` with fallback to `API_KEY` + startup warning.

**Rationale**: The current code (`SECRET_KEY = settings.API_KEY`) reuses the API key as the JWT signing secret. A leaked API key allows forging JWTs. Separating them limits blast radius.

**Alternatives considered**:
- Generate random secret on each startup: Rejected — invalidates all tokens on restart
- Use environment variable only (no fallback): Rejected — breaks backward compatibility for existing deployments
- Use RS256 asymmetric keys: Rejected — over-engineered for current scale; HS256 with separate secret is sufficient

### R2: Focus Trap Implementation (U1)

**Decision**: Create a shared `useFocusTrap` hook that manages Tab/Shift+Tab cycling, Escape key handling, and `aria-modal` attributes. Apply to all 6 modals.

**Rationale**: 6 modals need identical behavior. A shared hook eliminates duplication and ensures consistency.

**Alternatives considered**:
- Use `@headlessui/Dialog`: Rejected — adds a dependency for a simple pattern
- Use `react-focus-lock` library: Rejected — unnecessary dependency; the pattern is ~30 lines
- Per-modal inline implementation: Rejected — duplicates code 6 times, risk of inconsistency

### R3: User-Level Data Isolation (S1)

**Decision**: Add `user_id` foreign key to `ProjectDB`. Filter all project/scan/report queries by `current_user.id`. API-key bypass users see all data (service account pattern).

**Rationale**: Currently any authenticated user can access any project. Adding ownership at the project level cascades to scans and reports via the existing `project_id` relationships.

**Alternatives considered**:
- Row-level security in PostgreSQL: Rejected — adds DB complexity; application-level filtering is standard for this scale
- Permission-based ACL system: Rejected — over-engineered; the system currently has no role concept
- Filter at the API gateway level: Rejected — no API gateway exists; application-level is the right place

### R4: Modal Replacement Strategy (U2)

**Decision**: Replace `confirm()`/`alert()` in `ScanStatusPage` and `ProjectGroupsPage` with the existing `ConfirmModal` component + `useToast` for success feedback.

**Rationale**: The app already has `ConfirmModal` and `Toast` components. Using them maintains design system consistency.

**Alternatives considered**:
- Create a new `useConfirm` hook: Rejected — `ConfirmModal` already exists and works
- Keep native dialogs for destructive actions: Rejected — inconsistent with rest of app

### R5: Cache Invalidation Key Fix (A6)

**Decision**: Change `useScanReset` and `useScanCancel` to invalidate `['scan', data.scan_id]` (singular) to match `ScanStatusPage`'s query key. Also add invalidation for `['scan-history']` and `['projects']`.

**Rationale**: The current code invalidates `['scans', id]` (plural) but the scan status page uses `['scan', id]` (singular). These are different React Query keys, so cache invalidation is completely broken.

**Alternatives considered**:
- Change `ScanStatusPage` to use `['scans', id]`: Rejected — would require changing the page that works correctly; the mutation should match the page
- Use a query key factory: Considered for future — not needed for this fix

### R6: QueryClient Defaults (T4)

**Decision**: Add `staleTime: 30_000` (30 seconds) and `refetchOnWindowFocus: false` to the `QueryClient` defaults.

**Rationale**: The current defaults (`staleTime: 0`) cause every query to refetch on every mount, focus, and tab switch. With 3-second polling already in place, this creates redundant API traffic. 30-second stale time is a reasonable default for a dashboard application.

**Alternatives considered**:
- `staleTime: 60_000`: Considered — 30s is more responsive for a security dashboard
- Per-query staleTime: Rejected — would require changing every `useQuery` call; a sensible default is better
- Keep `staleTime: 0`: Rejected — causes burst refetches on tab switch

### R7: Error Boundary Pattern (T5)

**Decision**: Create a simple `ErrorBoundary` class component that catches render errors and chunk-loading failures. Wrap the `Suspense` boundary in `App.tsx`.

**Rationale**: Without an error boundary, a single component crash or failed chunk load takes down the entire app with a white screen.

**Alternatives considered**:
- `react-error-boundary` library: Rejected — a class component is ~40 lines and avoids a dependency
- Per-route error boundaries: Rejected — one top-level boundary is sufficient; per-route can be added later

### R8: Callback Token Timing Safety (S9)

**Decision**: Replace `callback_token != expected` with `hmac.compare_digest(callback_token, expected)`.

**Rationale**: Python's `!=` short-circuits on first differing byte, enabling timing attacks. `hmac.compare_digest` is constant-time.

**Alternatives considered**:
- Custom constant-time comparison: Rejected — `hmac.compare_digest` is the standard library solution
- Rate-limiting the callback endpoint: Considered as complementary — does not fix the timing leak itself
