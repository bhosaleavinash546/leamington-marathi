// ============================================================
// Centralized environment validation.
// Called once at startup (server.ts) BEFORE the app begins listening,
// so a misconfigured deployment fails loud and early instead of running
// with an insecure default.
// ============================================================

// Known insecure placeholder values that must never reach a real deployment.
const PLACEHOLDER_SECRETS = new Set([
  'change_me_for_production',
  'dev_secret_change_me',
  'changeme',
  'secret',
  '',
]);

const isProd = process.env.NODE_ENV === 'production';

/**
 * Resolve the JWT secret, enforcing that production never runs with a
 * missing or placeholder value. In non-production we allow a generated
 * fallback but warn loudly so it's obvious in logs.
 */
export function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET ?? '';

  if (PLACEHOLDER_SECRETS.has(secret) || secret.length < 16) {
    if (isProd) {
      throw new Error(
        '[env] JWT_SECRET is missing, a known placeholder, or too short (<16 chars). ' +
        'Set a strong, unique JWT_SECRET before starting in production.'
      );
    }
    // Non-production: allow but make it impossible to miss.
    console.warn(
      '\n[env] ⚠  JWT_SECRET is unset or a placeholder — using an insecure ' +
      'development secret. DO NOT run this configuration in production.\n'
    );
    return secret || 'dev_only_insecure_secret_change_me';
  }

  return secret;
}

/**
 * Validate all critical env at boot. Throws in production on any hard
 * misconfiguration; warns in development.
 */
export function validateEnv(): void {
  // JWT secret (throws in prod if invalid)
  resolveJwtSecret();

  if (isProd) {
    if (!process.env.DATABASE_URL) {
      throw new Error('[env] DATABASE_URL is required in production.');
    }
    if (process.env.ALLOW_DEV_OTP === 'true') {
      throw new Error(
        '[env] ALLOW_DEV_OTP must never be enabled in production — it exposes ' +
        'reset OTPs in API responses (account-takeover risk).'
      );
    }
  } else if (process.env.ALLOW_DEV_OTP === 'true') {
    console.warn(
      '[env] ⚠  ALLOW_DEV_OTP is enabled — OTP codes are returned in API ' +
      'responses. Local development only.'
    );
  }
}
