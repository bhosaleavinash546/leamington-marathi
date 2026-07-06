# Security

## Posture
- JWT auth (7-day tokens) with **persistent revocation** (DB-backed; survives restarts).
- Production refuses to boot on the dev JWT secret.
- Users, rate-limit counters, OTPs and background jobs live in SQLite — no
  credential files, no state lost on restart.
- User API keys are stored **AES-256-GCM encrypted** (`CREDENTIALS_SECRET`);
  the former key-in-header pattern is removed.
- helmet with a same-origin CSP; 1 MB default JSON body limit (12 MB only on CAD
  routes); zod shape validation on high-risk endpoints; per-IP+path rate limits.
- Uploaded spreadsheets are parsed with exceljs (xlsx retained on write paths only).
- LLM prompts treat all user data as untrusted (injection guards in system
  prompts); client-supplied chat history is sanitised to prevent forged
  tool-result injection.

## Reporting
Open a private issue or contact the repository owner. Please do not file public
issues for exploitable vulnerabilities.

## Key rotation
Rotate `JWT_SECRET` (invalidates all sessions) and `CREDENTIALS_SECRET`
(invalidates stored API keys — users re-enter them) by updating the environment
and restarting.
