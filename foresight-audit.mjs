// ─────────────────────────────────────────────────────────────────────────────
// BrainSpark Horizon — register self-audit.
//
// Lesson learned the hard way (July 2026, EDU-expert probes): gaps and
// regional bias were found by USERS, not by the tool. A 360° foresight tool
// must find its own weak spots. This pure module grades every register entry
// against the curation disciplines that those probes taught us:
//
//   evidence      — production/regulatory proof behind the positioning
//   player depth  — ≥3 named players (a one-player "trend" is a press release)
//   global lens   — the Chinese production frontier is checked, not ignored
//                   (the lamination entry shipped Western-anchored; never again)
//   freshness     — evidence younger than (vintage − 3); old proof goes stale
//   findability   — ≥4 matchTerms so real part names reach the entry
//   note depth    — enough substance to brief a cost engineer
//
// Advisory by design: it produces a CURATION INBOX (worst-first), and the
// tests hold regression gates so the register can only get healthier.
// Pure module — no Express, no DB, no network.
// ─────────────────────────────────────────────────────────────────────────────
import { FORESIGHT_REGISTER, REG_ANCHORS } from './src/data/tech-foresight-register.mjs';
import { inferCommodityKey } from './src/data/commodity-classify.mjs';
import { REGISTER_VINTAGE, resolveParts } from './foresight.mjs';

// Recognisable China-based players/programmes (lowercase substring match).
// Used as a heuristic for "was the Chinese frontier considered?" — entries
// where China genuinely has no presence can carry `globalNote` in future.
const CHINA_MARKERS = [
  'byd', 'catl', 'xiaomi', 'huawei', 'nio', 'xpeng', 'li auto', 'geely', 'baowu', 'baosteel',
  'gotion', 'hesai', 'robosense', 'seyond', 'boe', 'sanhua', 'yangwang', 'aito', 'zeekr',
  'baolong', 'hina', 'fuyao', 'seres', 'leapmotor', 'aulton', 'wanxiang', 'highly', 'dongfeng',
  'gac', 'chery', 'great wall', 'wel ion', 'welion', 'brunp', 'evogo', 'm-hero', 'mengshi',
  'chinese', 'china', 'horizon robotics', 'momenta', 'baidu', 'jac', 'jmev', 'eve', 'millison',
];

const yearRe = /(20[12]\d)/g;

function maxYearIn(...texts) {
  let max = 0;
  for (const t of texts) {
    for (const m of String(t ?? '').matchAll(yearRe)) max = Math.max(max, Number(m[1]));
  }
  return max || null;
}

export function auditEntry(tech, { now = REGISTER_VINTAGE } = {}) {
  const flags = [];
  const hasEvidence = Boolean(tech.firstProduction || tech.regAnchor);
  // Early-stage techs (TRL ≤ 6, ~0 adoption) legitimately lack production proof.
  if (!hasEvidence && !(tech.trl <= 6 && tech.adoptionPct <= 1)) flags.push('no-evidence');
  if ((tech.players?.length ?? 0) < 3) flags.push('few-players');
  const playerBlob = [...(tech.players ?? []), tech.note ?? '', tech.firstProduction ?? ''].join(' ').toLowerCase();
  if (!CHINA_MARKERS.some((m) => playerBlob.includes(m))) flags.push('no-china-frontier');
  const latest = maxYearIn(tech.firstProduction, tech.note);
  if (latest !== null && latest <= now - 3) flags.push('stale-evidence');
  if ((tech.matchTerms?.length ?? 0) < 4) flags.push('thin-matchterms');
  if ((tech.note?.length ?? 0) < 90) flags.push('short-note');
  return { id: tech.id, name: tech.name, commodity: tech.commodity, flags, latestEvidenceYear: latest };
}

export function auditRegister({ register = FORESIGHT_REGISTER, now = REGISTER_VINTAGE } = {}) {
  const entries = register.map((t) => auditEntry(t, { now }));
  const flagged = entries.filter((e) => e.flags.length > 0);
  const byFlag = {};
  for (const e of flagged) for (const f of e.flags) byFlag[f] = (byFlag[f] ?? 0) + 1;
  const chinaCoveragePct = Math.round(((entries.length - (byFlag['no-china-frontier'] ?? 0)) / entries.length) * 1000) / 10;
  return {
    total: entries.length,
    flaggedCount: flagged.length,
    byFlag,
    chinaCoveragePct,
    // worst-first inbox: most flags, then id for determinism
    inbox: [...flagged].sort((a, b) => b.flags.length - a.flags.length || a.id.localeCompare(b.id)),
  };
}

/**
 * Query-precision audit: for each query, was the top hit an ACTUAL term match
 * (score ≥ 3: a specific term, or several) or generic-word noise (score ≤ 2)?
 * Weak queries are where a user gets a technically-nonempty but imprecise
 * answer — exactly how the "48V MHEV battery" gap hid.
 */
export function auditQueryPrecision(queries, { register = FORESIGHT_REGISTER } = {}) {
  const weak = [];
  for (const q of queries) {
    const matches = resolveParts(q, register);
    if (!matches.length) {
      // Classifier resolution (commodity-level answer) is by-design valid;
      // only a total dead-end counts as weak.
      if (!inferCommodityKey(q)) weak.push({ query: q, reason: 'no-match', topScore: 0, top: null });
      continue;
    }
    const top = matches[0];
    const tied = matches.filter((m) => m.score === top.score).length;
    // A single exact-term hit (score 2, few ties) is precise. True noise is a
    // GENERIC term where many entries tie at the top — the query "wins" but
    // the user gets an unranked pile (how the 48V-battery gap hid).
    if (top.score <= 2 && tied >= 5) weak.push({ query: q, reason: 'generic-tie', topScore: top.score, tied, top: top.tech.id });
  }
  return { checked: queries.length, weak };
}
