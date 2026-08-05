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
//   global lens   — the frontier is looked for in more than ONE region
//                   (the lamination entry shipped Western-anchored; the first
//                   fix over-corrected into a China-only check, which is the
//                   same blindness pointing the other way — now region-neutral)
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

// ── Regional frontier markers ────────────────────────────────────────────────
// The 2026 lamination lesson was "you only looked West". The first fix asked
// "is China named?", which quietly became "you must look East" — the same
// single-region blindness pointing the other way, and it would have flagged a
// genuinely Korea-led or Japan-led technology as deficient.
//
// The honest question is neither. It is: HAVE YOU LOOKED IN MORE THAN ONE
// PLACE? An entry naming only German suppliers and one naming only Chinese
// suppliers are equally un-checked. Markers are named entities only — vague
// "Chinese suppliers…" phrasing was exactly how the original gate got gamed
// (audit #2), and that rule now applies to every region.
export const REGION_MARKERS = {
  china: [
    'byd', 'catl', 'xiaomi', 'huawei', 'nio', 'xpeng', 'li auto', 'geely', 'baowu', 'baosteel',
    'gotion', 'hesai', 'robosense', 'seyond', 'boe', 'sanhua', 'yangwang', 'aito', 'zeekr',
    'baolong', 'hina', 'fuyao', 'seres', 'leapmotor', 'aulton', 'wanxiang', 'highly', 'dongfeng',
    'gac', 'chery', 'great wall', 'welion', 'brunp', 'evogo', 'm-hero', 'mengshi',
    'horizon robotics', 'momenta', 'baidu', 'jac', 'jmev', 'eve', 'millison',
    'bwi', 'joyson', 'citic', 'dicastal', 'iray', 'raytron', 'linglong', 'sailun', 'naas',
    'aiways', 'changan', 'arcfox', 'baic', 'freevoy', 'naxtra', 'shenxing', 'weifu',
    'zhongding', 'state grid', 'kh automotive', 'tuopu', 'sinotruk',
  ],
  korea: [
    'hyundai', 'kia', 'mobis', 'lg ', 'lg energy', 'lg innotek', 'samsung sdi', 'sk on',
    'sk innovation', 'hanon', 'hankook', 'posco', 'doosan', 'genesis',
  ],
  japan: [
    'toyota', 'honda', 'nissan', 'mazda', 'subaru', 'suzuki', 'denso', 'aisin', 'panasonic',
    'yazaki', 'sumitomo', 'bridgestone', 'ngk', 'nsk', 'jtekt', 'nidec', 'murata', 'tdk',
    'sony', 'mitsubishi', 'lexus', 'toyoda', 'koito', 'calsonic',
  ],
  europe: [
    'bosch', 'zf', 'continental', 'schaeffler', 'mahle', 'valeo', 'forvia', 'faurecia',
    'bmw', 'mercedes', 'volkswagen', 'audi', 'porsche', 'stellantis', 'renault', 'volvo',
    'vitesco', 'brembo', 'marelli', 'infineon', 'stmicro', 'nxp', 'hella', 'webasto',
    'rheinmetall', 'vibracoustic', 'mubea', 'ssab', 'salzgitter', 'northvolt', 'jlr',
    'bentley', 'rolls-royce', 'skoda', 'amk', 'kongsberg', 'autoliv', 'plastic omnium',
    'gestamp', 'benteler', 'thyssenkrupp', 'michelin', 'pirelli', 'tenneco', 'stegra',
    'h2gs', 'johnson matthey', 'twaice', 'eatron', 'sensata', 'antolin',
  ],
  'north-america': [
    'tesla', 'ford', 'general motors', 'gm ', 'rivian', 'lucid', 'aptiv', 'borgwarner',
    'lear', 'magna', 'dana', 'eaton', 'cummins', 'texas instruments', 'navitas', 'qualcomm',
    'nvidia', 'mobileye', 'luminar', 'clearmotion', 'ree', 'hendrickson', 'rassini',
    'multimatic', 'wabco', 'quantumscape', 'sila', 'corning', 'garrett', 'tula', 'witricity',
    'voxeljet', 'arbe', 'prophesee', 'inivation', 'wallbox',
  ],
  india: [
    'tata', 'mahindra', 'bharat forge', 'motherson', 'samvardhana', 'sona comstar',
    'minda', 'amara raja', 'exide', 'ola electric', 'ather', 'tvs',
  ],
};

/** Which regions does this entry actually NAME? (named entities only.) */
export function regionsNamed(tech) {
  const blob = [...(tech.players ?? []), tech.note ?? '', tech.firstProduction ?? ''].join(' ').toLowerCase();
  return Object.entries(REGION_MARKERS)
    .filter(([, markers]) => markers.some((m) => blob.includes(m)))
    .map(([region]) => region);
}

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
  // Region-neutral frontier check: looking in exactly one place is the
  // blindness, whichever place it is.
  const regions = regionsNamed(tech);
  if (regions.length <= 1) flags.push('single-region-view');
  const latest = maxYearIn(tech.firstProduction, tech.note);
  if (latest !== null && latest <= now - 3) flags.push('stale-evidence');
  if ((tech.matchTerms?.length ?? 0) < 4) flags.push('thin-matchterms');
  if ((tech.note?.length ?? 0) < 90) flags.push('short-note');
  return { id: tech.id, name: tech.name, commodity: tech.commodity, kind: tech.kind ?? 'substitution', regions, flags, latestEvidenceYear: latest };
}

export function auditRegister({ register = FORESIGHT_REGISTER, now = REGISTER_VINTAGE } = {}) {
  const entries = register.map((t) => auditEntry(t, { now }));
  const flagged = entries.filter((e) => e.flags.length > 0);
  const byFlag = {};
  for (const e of flagged) for (const f of e.flags) byFlag[f] = (byFlag[f] ?? 0) + 1;
  // Region coverage: how often each region appears anywhere in the register,
  // and how many entries looked in more than one place. Replaces the old
  // single-country percentage, which measured East-looking rather than
  // global-looking.
  const byRegion = {};
  for (const e of entries) for (const r of e.regions) byRegion[r] = (byRegion[r] ?? 0) + 1;
  const multiRegionPct = Math.round(((entries.length - (byFlag['single-region-view'] ?? 0)) / entries.length) * 1000) / 10;
  // Ontology coverage (2026 internet-benchmark audit): a register made only of
  // part swaps is structurally blind to function shifts, software orchestration
  // and lifecycle change — the three things live research found and the tool
  // had missed. Track the mix so the blindness cannot return silently.
  const byKind = {};
  for (const e of entries) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
  const nonSubstitutionPct = Math.round(((entries.length - (byKind.substitution ?? 0)) / entries.length) * 1000) / 10;
  // Per-commodity ontology blindness. Fixing the air-suspension blind spot made
  // Chassis kind-diverse and left eight commodities still 100% part swaps — a
  // register-wide percentage would have hidden that. This is the curator's
  // worst-first list for the ontology, the way `inbox` is for evidence.
  const perCommodity = {};
  for (const e of entries) {
    perCommodity[e.commodity] ??= { total: 0, substitution: 0, nonSubstitution: 0 };
    perCommodity[e.commodity].total++;
    if (e.kind === 'substitution') perCommodity[e.commodity].substitution++;
    else perCommodity[e.commodity].nonSubstitution++;
  }
  const ontologyBlindCommodities = Object.entries(perCommodity)
    .filter(([, v]) => v.nonSubstitution === 0)
    .map(([c, v]) => ({ commodity: c, entries: v.total }))
    .sort((a, b) => b.entries - a.entries);
  return {
    total: entries.length,
    flaggedCount: flagged.length,
    byFlag,
    byKind,
    nonSubstitutionPct,
    perCommodity,
    ontologyBlindCommodities,
    byRegion,
    multiRegionPct,
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
