import { Request } from 'express';

// The organization every pre-multi-tenancy row was back-filled to
// (see schema_v10.sql). Used as the effective tenant for tokens issued
// before orgId was added to the JWT, so existing single-tenant sessions
// keep working during the migration window.
export const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

/**
 * The organization (tenant) id the current request is scoped to.
 *
 * Every tenant-scoped query MUST filter by this value. Falls back to the
 * default org so tokens minted before orgId existed (or the seeded demo
 * data) resolve to the single existing tenant rather than leaking across
 * tenants. Once every issued token carries orgId, the fallback is dead.
 */
export function orgId(req: Request): string {
  return req.user?.orgId ?? DEFAULT_ORG_ID;
}
