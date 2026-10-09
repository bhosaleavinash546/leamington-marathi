// Signed Prism evidence (Prism review PR-32).
//
// /api/analyze receives the dossier's lens blocks back from the browser and
// tells the model they are engine evidence. Unsigned, that text could be edited
// or hand-written and still be presented — and badged — as engine-computed.
// The dossier routes sign each block with an HMAC over (user, lens, text); the
// analyze handler verifies it before the block is used. The key is derived from
// the server's own secret, so a client cannot mint one.
import crypto from 'node:crypto';

const key = () => crypto.createHash('sha256')
  .update(`prism-evidence:${process.env.JWT_SECRET || 'autocost-ai-dev-secret-2025'}`).digest();

export function signEvidence(userId, lensId, text) {
  return crypto.createHmac('sha256', key()).update(`${userId}\u0000${lensId}\u0000${text}`).digest('base64url');
}

export function verifyEvidence(userId, lensId, text, sig) {
  if (typeof sig !== 'string' || !sig) return false;
  const want = Buffer.from(signEvidence(userId, lensId, text));
  const got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
