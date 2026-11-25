/**
 * Who may create an account (KPI dashboard audit A-01 / decision D-8, Nov 2026: a domain allowlist).
 *
 * Sign-up is CLOSED unless the address's domain is listed in CV_SIGNUP_DOMAINS (comma-separated, in the settings file),
 * or the address itself is in ADMIN_EMAILS — so a fresh install's administrator can always register first. Accounts
 * that already exist are not affected. Read at request time, so a change to the settings file applies on restart.
 */
export function signupDomains(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.CV_SIGNUP_DOMAINS ?? '').split(',').map(d => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
}

export function signupAllowed(email: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const e = email.trim().toLowerCase();
  const admins = (env.ADMIN_EMAILS ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
  if (admins.includes(e)) return true;
  const domain = e.split('@')[1] ?? '';
  return domain.length > 0 && signupDomains(env).includes(domain);
}

export const SIGNUP_CLOSED_MESSAGE = 'Sign-up is not open for this email address. Ask your CostVision administrator for access.';
