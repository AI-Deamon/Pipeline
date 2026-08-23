// Cookie-based auth (httpOnly) replaced sessionStorage token storage on 2026-07-13.
// This grace period lets users who were already logged in via the old sessionStorage
// path keep working without being forced to re-authenticate immediately after deploy.
// It expires automatically — no manual cleanup step needed once the window passes,
// and the legacy path (a stored-XSS-exploitable read/write of the auth token) stops
// being honored the moment the deadline is reached.
const MIGRATION_DEPLOYED_AT = new Date('2026-07-13T00:00:00Z').getTime();
const GRACE_PERIOD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days (extended for HTTP cookie compatibility)

export function isLegacyAuthGracePeriodActive(): boolean {
  return Date.now() < MIGRATION_DEPLOYED_AT + GRACE_PERIOD_MS;
}
