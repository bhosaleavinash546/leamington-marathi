// ─────────────────────────────────────────────────────────────────────────────
// BrainSpark Horizon — the knowledge flywheel.
//
// The curated register is 169 hand-written entries; a vehicle is 20,000 parts.
// Static curation loses that race by construction (2026 root-cause audit: 41%
// of BOM leaves returned thin landscapes, and every forward-research result
// was discarded after the response — the tool could not learn from use).
//
// This module closes the loop with an explicit HONESTY LADDER — every rung is
// labelled, and nothing climbs a rung without a named actor:
//
//   AI-researched   ephemeral, estimated inputs, cite-or-drop     (machine)
//   → cached        same result reused, age shown                 (machine)
//   → promoted      a HUMAN reviewed evidence and approved it;    (curator)
//                   enters live lanes with a PROMOTED provenance
//                   badge and its source URL attached
//   → curated       written into the shipped register at the      (curator)
//                   next re-curation, subject to the full audit
//
// Promotion is deliberately a human act (DECISIONS.md #18) — the AI proposes,
// the curator promotes, the register audits. Promoted entries face the same
// structural validation as shipped entries and are stamped `origin: 'promoted'`
// so every surface can show what they are.
//
// DB-backed but dependency-injected (better-sqlite3 handle) so tests run on
// in-memory databases; no Express imports (engine-module discipline).
// ─────────────────────────────────────────────────────────────────────────────
import { randomUUID } from 'node:crypto';
import { FORESIGHT_REGISTER } from './src/data/tech-foresight-register.mjs';
import { COMMODITY_KEYS, inferCommodityKey } from './src/data/commodity-classify.mjs';
import { TECH_KINDS } from './src/data/tech-foresight-register.mjs';
import { resolveParts } from './foresight.mjs';
import { safeUrl } from './foresight-research.mjs';

export const RESEARCH_CACHE_DAYS = 30;

export function initKnowledge(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS foresight_research_cache (
    queryNorm TEXT PRIMARY KEY,
    createdAt TEXT NOT NULL,
    payload TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS foresight_promoted (
    id TEXT PRIMARY KEY,
    createdAt TEXT NOT NULL,
    promotedBy TEXT NOT NULL,
    sourceUrl TEXT,
    tech TEXT NOT NULL
  )`);
}

const normQuery = (q) => String(q ?? '').toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 200);

// ── Research cache: the same question is never paid for twice ────────────────

export function getCachedResearch(db, query, { now = Date.now() } = {}) {
  const row = db.prepare('SELECT createdAt, payload FROM foresight_research_cache WHERE queryNorm = ?').get(normQuery(query));
  if (!row) return null;
  const ageDays = (now - Date.parse(row.createdAt)) / 86_400_000;
  if (ageDays > RESEARCH_CACHE_DAYS) return null;
  try {
    return { ...JSON.parse(row.payload), cachedAt: row.createdAt, cacheAgeDays: Math.round(ageDays * 10) / 10 };
  } catch { return null; }
}

export function saveResearch(db, query, payload, { now = Date.now() } = {}) {
  // Only cache results that contain something — an empty result usually means
  // search was unavailable, and caching it would pin the failure for 30 days.
  if (!payload?.candidates?.length) return false;
  db.prepare('INSERT OR REPLACE INTO foresight_research_cache (queryNorm, createdAt, payload) VALUES (?,?,?)')
    .run(normQuery(query), new Date(now).toISOString(), JSON.stringify(payload));
  return true;
}

// ── Promotion: candidate → live register entry, validated like the register ──

const POWERTRAINS = new Set(['ICE', 'MHEV', 'PHEV', 'BEV']);
const TRENDS = new Set(['falling-fast', 'falling', 'flat', 'rising']);
const DRIVERS = new Set(['cost', 'regulation', 'performance', 'weight', 'software', 'sustainability']);

/**
 * Same structural rules the shipped register's integrity test enforces —
 * a promoted entry must not be a second-class citizen. Returns { ok, errors }.
 */
export function validatePromotion(t) {
  const errors = [];
  if (!t || typeof t !== 'object') return { ok: false, errors: ['no entry supplied'] };
  if (!t.name || String(t.name).length < 4) errors.push('name too short');
  if (!COMMODITY_KEYS.includes(t.commodity)) errors.push(`commodity must be one of ${COMMODITY_KEYS.join('/')}`);
  if (!Number.isInteger(t.trl) || t.trl < 1 || t.trl > 9) errors.push('trl must be an integer 1-9');
  if (!(t.adoptionPct >= 0 && t.adoptionPct <= 100)) errors.push('adoptionPct must be 0-100');
  if (!Array.isArray(t.powertrains) || !t.powertrains.length || !t.powertrains.every((p) => POWERTRAINS.has(p))) errors.push('powertrains invalid');
  if (!TRENDS.has(t.costTrend)) errors.push('costTrend invalid');
  if (!Array.isArray(t.drivers) || !t.drivers.length || !t.drivers.every((d) => DRIVERS.has(d))) errors.push('drivers invalid');
  if (!Array.isArray(t.matchTerms) || !t.matchTerms.length || !t.matchTerms.every((m) => typeof m === 'string' && m === m.toLowerCase() && m.length >= 2)) errors.push('matchTerms must be lowercase strings');
  if (!Array.isArray(t.players) || !t.players.length) errors.push('players required');
  if (!t.replaces) errors.push('replaces required');
  if (!t.note || String(t.note).length < 90) errors.push('note must be at least 90 chars (register short-note rule)');
  if (t.kind !== undefined && !TECH_KINDS.includes(t.kind)) errors.push(`kind must be one of ${TECH_KINDS.join('/')}`);
  if (t.ceiling !== undefined && !(t.ceiling >= 1 && t.ceiling <= 90)) errors.push('ceiling must be 1-90');
  if (t.adoptionPct > (t.ceiling ?? 90)) errors.push('adoption above its own ceiling');
  return { ok: errors.length === 0, errors };
}

/**
 * Map an AI-researched candidate to a register-shaped entry. Estimated inputs
 * stay estimates: no firstProduction is fabricated (confidenceTier will read
 * the entry as probable/speculative, which is the honest tier for something
 * without a named production programme the curator has verified).
 */
export function candidateToEntry(candidate, { query = '', commodity = null } = {}) {
  const c = candidate ?? {};
  const name = String(c.name ?? '').slice(0, 120);
  // Commodity resolution ladder: explicit override → classifier net → the
  // register's own resolution of the query/name (deterministic, same engine
  // the landscape used — if "cylinder head" resolved to Powertrain techs, a
  // candidate promoted from that landscape is Powertrain).
  const dom = (commodity && COMMODITY_KEYS.includes(commodity) && commodity)
    || inferCommodityKey(`${name} ${c.whatItIs ?? ''} ${query}`)
    || resolveParts(query)[0]?.tech.commodity
    || resolveParts(name)[0]?.tech.commodity
    || null;
  const terms = new Set();
  const qn = normQuery(query);
  if (qn) terms.add(qn);
  for (const w of name.toLowerCase().split(/[^a-z0-9]+/)) if (w.length >= 4) terms.add(w);
  return {
    name,
    commodity: dom,
    powertrains: ['BEV', 'PHEV', 'MHEV', 'ICE'],
    replaces: String(c.replaces ?? '').slice(0, 160),
    trl: Math.min(9, Math.max(1, Math.round(Number(c.trl ?? c.trlEstimate) || 4))),
    adoptionPct: Math.min(40, Math.max(0, Number(c.adoptionPct ?? c.adoptionEstimatePct) || 0)),
    drivers: ['performance'],
    kind: TECH_KINDS.includes(c.kind) ? c.kind : 'substitution',
    costTrend: 'falling',
    players: (Array.isArray(c.players) ? c.players : []).slice(0, 6).map((p) => String(p).slice(0, 60)),
    note: [c.whatItIs, c.whyItMatters].filter(Boolean).map(String).join(' ').slice(0, 700),
    matchTerms: [...terms].slice(0, 8),
    ceiling: Math.min(90, Math.max(1, Number(c.ceiling ?? c.ceilingEstimatePct) || 30)),
  };
}

export function promoteCandidate(db, { entry, sourceUrl = '', promotedBy }) {
  const check = validatePromotion(entry);
  if (!check.ok) return { ok: false, errors: check.errors };
  const url = safeUrl(sourceUrl);
  const id = `prm-${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}-${randomUUID().slice(0, 4)}`;
  db.prepare('INSERT INTO foresight_promoted (id, createdAt, promotedBy, sourceUrl, tech) VALUES (?,?,?,?,?)')
    .run(id, new Date().toISOString(), String(promotedBy ?? 'unknown'), url, JSON.stringify(entry));
  return { ok: true, id };
}

export function demoteEntry(db, id) {
  return db.prepare('DELETE FROM foresight_promoted WHERE id = ?').run(String(id)).changes > 0;
}

export function promotedEntries(db) {
  const rows = db.prepare('SELECT id, createdAt, promotedBy, sourceUrl, tech FROM foresight_promoted ORDER BY createdAt DESC').all();
  const out = [];
  for (const r of rows) {
    try {
      const t = JSON.parse(r.tech);
      out.push({ ...t, id: r.id, origin: 'promoted', promotedAt: r.createdAt, promotedBy: r.promotedBy, sourceUrl: r.sourceUrl || undefined });
    } catch { /* a corrupt row must not break the register */ }
  }
  return out;
}

/** The live register: shipped entries + curator-promoted ones (id-safe). */
export function mergedRegister(db) {
  const promoted = promotedEntries(db);
  if (!promoted.length) return FORESIGHT_REGISTER;
  const shipped = new Set(FORESIGHT_REGISTER.map((t) => t.id));
  return [...FORESIGHT_REGISTER, ...promoted.filter((t) => !shipped.has(t.id))];
}
