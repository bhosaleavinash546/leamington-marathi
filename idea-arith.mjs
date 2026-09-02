// ─────────────────────────────────────────────────────────────────────────────
// Arithmetic re-check of the model's own annual-value claim.
//
// Every idea states a calculationBasis ("€0.42/part × 60,000/yr") and an
// annualValue ("€20K–€30K at 60,000 units/yr"). Until now nothing multiplied
// the basis out and compared. The ranking is built on the annual value, so a
// wrong number with a confident basis line bought a top slot.
//
// This is deliberately a bounded, honest parser:
//   consistent   the basis multiplies out to within the stated range (±15%)
//   mismatch     it does not — deltaPct says by how much
//   unparsed     the basis could not be read — NOT a verdict, and shown as such
//
// How a basis is read (stated so a wrong reading is diagnosable):
//   • volume: stated in the basis, else in the annualValue ("at 60,000
//     units/yr"), else the run's annualVolume — the source is recorded
//   • clauses split on ';' and 'plus'; each contributes one term
//   • "€a → €b" contributes the difference
//   • a result marker (≈ = gives yields saves) IMMEDIATELY followed by a money
//     figure contributes that figure
//   • a cost build-up ("€a + €b = €c/part") is context, remembered for a
//     following "N% reduction" clause
//   • otherwise a product chain "a × b × c" is multiplied: money, percentage
//     (÷100), a mass when a €/kg price is in the chain; a plain figure ≥ 1,000
//     is the volume
//   • "less / net of N%" scales the running total; "halved" is ×0.5
//   • money tagged baseline/current/total/gap/block/line is context unless the
//     clause also names a saving
//   • programme-life, lifetime and NRE totals are refused (unparsed), never
//     multiplied by an annual volume
// Pure, dependency-free, fixture-tested against live Prism output. Read the
// tests before extending a rule — every rule exists because a real idea broke
// the one before it.
// ─────────────────────────────────────────────────────────────────────────────

export const ARITH_TOLERANCE_PCT = 15;

const MONEY_RE = /(?:(?:[€£$])\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?([KkMm](?![a-zA-Z]))?(?:\s?[-–—]\s?(?:[€£$])?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?([KkMm](?![a-zA-Z]))?)?)|(?:(\d+(?:\.\d+)?)\s?(?:EUR|GBP|USD)\b)/g;
const PCT_RE = /(\d+(?:\.\d+)?)\s?(?:[-–]\s?(\d+(?:\.\d+)?)\s?)?%/;
const UNIT_WORDS = '(?:units?|parts?|pcs|pieces?|lam(?:ination)?s?|motors?|sets?|veh(?:icles?)?|assemblies|cars?|corners?)';
const VOLUME_RE = new RegExp(`(?<![€£$]\\s?)(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)\\s?([kKM])?\\s?${UNIT_WORDS}?\\s?(?:\\/\\s?(?:yr|year|a|annum)\\b|per\\s(?:year|annum|yr)|annually|p\\.a\\.)`);
const VOLUME_BARE_RE = new RegExp(`[×x*]\\s?(?![€£$])(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)\\s?([kKM])?\\s?${UNIT_WORDS}?\\b`);
const PER_YEAR_RE = /\/\s?(?:yr|year|a)\b|per\s(?:year|annum|yr)|annual|p\.a\./i;
const PER_UNIT_RE = /\/\s?(?:part|unit|pc|piece|lam|veh|set|motor|corner)|\bper\s(?:part|unit|piece|set|motor|vehicle|corner)/i;
const CONTEXT_RE = /baseline|should-?cost|\bquote\b|\bcurrent\b|total part cost|\bpart cost\b|\bpiece price\b|\bunit price\b|\bblock\b|\bline\b|\bgap\b|\bcontent\b/i;
const SAVING_RE = /\bsav|release|delta|delet|captur|recover|avoid|premium|reduc|\bcut\b|halv|\bnet\b|\bdrop/i;
const CONTEXT_LEAD_RE = /(?:most|share|portion|fraction|part|half|third)\s+of\s*~?$|of\s+the\s*~?$|\bon\s*~?$|\bof\s*~?$|\bvs\.?\s+\S*\s*$|\bversus\s+\S*\s*$/i;
const REFUSE_RE = /programme|program\b|lifetime|\bover\s\d|per\s(?:programme|program)/i;
const RESULT_RE = /(?:≈|=|\bgives\b|\byields\b|\bsaves?\b|\bsaving of\b|\bnets?\b|\bcaptures?\b)\s*~?\s*(?=[€£$]|\d+(?:\.\d+)?\s?(?:EUR|GBP|USD))/i;
const REDUCE_RE = /\bless\b|\bminus\b|\bnet of\b|\bafter\b|\bdiscount/i;
const APPLY_RE = /reduction|\bof (?:these|this|that|it)\b|\bon these\b|\bsaving\b|\bcapture\b/i;

const scale = (s) => (!s ? 1 : /k/i.test(s) ? 1e3 : 1e6);
const num = (s) => { const n = parseFloat(String(s).replace(/,/g, '')); return Number.isFinite(n) ? n : null; };

/** All money figures in a string: { value (range mid), lo, hi, index, raw }. */
export function findMoney(s) {
  const out = [];
  const t = String(s ?? '');
  MONEY_RE.lastIndex = 0;
  let m;
  while ((m = MONEY_RE.exec(t))) {
    let lo, hi;
    if (m[5] != null) { lo = hi = num(m[5]); }
    else {
      lo = num(m[1]); if (lo == null) continue;
      const sufA = m[2] || (m[4] && !m[2] ? m[4] : null);   // "€3-5M": suffix applies to both
      lo *= scale(sufA);
      hi = m[3] != null ? num(m[3]) * scale(m[4] || m[2]) : lo;
      if (hi < lo) hi = lo;
    }
    out.push({ value: Number(((lo + hi) / 2).toFixed(6)), lo, hi, index: m.index, raw: m[0].trim() });
  }
  return out;
}

/** Range of the FIRST money figure in a string (lo/hi/mid), or null. */
export function parseMoneyRange(s) {
  const f = findMoney(s);
  return f.length ? { lo: f[0].lo, hi: f[0].hi, mid: f[0].value } : null;
}

/** Annual volume stated in a text, or null. */
export function parseVolume(s) {
  const t = String(s ?? '');
  const m = VOLUME_RE.exec(t) || VOLUME_BARE_RE.exec(t);
  if (!m) return null;
  const n = num(m[1]);
  if (n == null) return null;
  const v = n * scale(m[2]);
  return v >= 1000 && v <= 5e7 ? v : null;
}

const pctOf = (c) => { const p = PCT_RE.exec(c); return p ? (p[2] ? (parseFloat(p[1]) + parseFloat(p[2])) / 2 : parseFloat(p[1])) : null; };
const massBeforeKg = (tok) => { const m = /(\d+(?:\.\d+)?)\s?kg\b/i.exec(tok); return m ? parseFloat(m[1]) : null; };

// One token of a product chain → { value, isVolume } or null.
function chainToken(tok, chainHasPerKg) {
  let t = tok;
  const rm = /(?:≈|=|\bgives\b|\byields\b|\bsaves?\b)\s*~?\s*/i.exec(t);
  if (rm) t = t.slice(rm.index + rm[0].length);          // "… ≈ 0.08kg" → the figure after the marker
  else if (t.includes(':')) t = t.slice(t.lastIndexOf(':') + 1);
  const money = findMoney(t);
  const pct = pctOf(t);
  if (money.length) {
    const v = money[0].value * (pct != null && money[0].index > (PCT_RE.exec(t)?.index ?? -1) ? pct / 100 : 1);
    return { value: v, isVolume: false, label: pct != null && money[0].index > (PCT_RE.exec(t)?.index ?? -1) ? `${pct}% × ${money[0].raw}` : money[0].raw, big: money[0].value >= 1000 && !PER_YEAR_RE.test(t) };
  }
  if (chainHasPerKg) {
    // "0.21→~0.18kg" is a mass DIFFERENCE, not a mass.
    const ar = /(\d+(?:\.\d+)?)\s?(?:kg)?\s?(?:→|->)\s?~?\s?(\d+(?:\.\d+)?)\s?kg\b/i.exec(t);
    if (ar && parseFloat(ar[1]) > parseFloat(ar[2])) { const d = Number((parseFloat(ar[1]) - parseFloat(ar[2])).toFixed(4)); return { value: d, isVolume: false, label: `${ar[1]}→${ar[2]} kg (Δ ${d} kg)` }; }
    const kg = massBeforeKg(t); if (kg != null) return { value: kg, isVolume: false, label: `${kg} kg` };
  }
  if (pct != null) return { value: pct / 100, isVolume: false, label: `${pct}%` };
  const n = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?([kKM])?\b/.exec(t);
  if (!n) return null;
  const v = num(n[1]) * scale(n[2]);
  if (v >= 1000) return { value: v, isVolume: true, label: `${n[0].trim()} (volume)` };
  if (/\b(?:kg|g|mm|cm|m)\b/i.test(t)) return null;          // a mass or length with no price to pair it with
  return { value: v, isVolume: false, label: n[0].trim() };
}

// One term from one clause.
//   { value, perYear, how } | { reduce } | { apply } | { context } | { refused } | null
function clauseTerm(clause) {
  const c = clause.trim();
  if (!c) return null;
  if (REFUSE_RE.test(c)) return { refused: c.slice(0, 60) };
  const money = findMoney(c);
  const pct = pctOf(c);
  const perYear = PER_YEAR_RE.test(c);
  const halved = /\bhalv/i.test(c) ? 0.5 : 1;
  if (money.some(m => m.value >= 1000) && /\bNRE\b|capex|investment/i.test(c)) return { refused: `${money.find(m => m.value >= 1000).raw} is an investment, not an annual saving` };

  if (!money.length && pct != null) {
    if (REDUCE_RE.test(c)) return { reduce: pct / 100 };     // "less 30-60% logistics"
    if (APPLY_RE.test(c) || /\bx\b|×/.test(c)) return { apply: pct / 100 };   // "25% reduction x 10M" — of the build-up before it
    return null;
  }

  // from → to
  const arrow = /([€£$]\s?\d[\d,.]*\s?[KkMm]?)\s?(?:→|->)\s?~?\s?([€£$]\s?\d[\d,.]*\s?[KkMm]?)/.exec(c);
  if (arrow) {
    const a = parseMoneyRange(arrow[1]), b = parseMoneyRange(arrow[2]);
    if (a && b && a.mid > b.mid) return { value: a.mid - b.mid, perYear: perYear && a.mid >= 1000, how: `${arrow[1].trim()} → ${arrow[2].trim()}` };
  }

  // Cost build-up: "€a + €b = €c/part" — context for the next clause.
  const buildUp = /[€£$][\d.,]+\s?\+.*=\s?~?[€£$]/.test(c) && !SAVING_RE.test(c.slice(c.indexOf('=')));
  const rm = RESULT_RE.exec(c);
  if (rm && money.length) {
    const after = money.filter(x => x.index >= rm.index);
    if (after.length) {
      const r = after[0];
      if (buildUp) return { context: r.value };
      const big = r.value >= 1000;
      if (big && !perYear && parseVolume(c) == null) return { refused: `${r.raw} has no stated period` };
      // "… captures ~€0.06 net": a NET result supersedes the gross terms before it.
      return { value: r.value * halved, perYear: big, how: `result ${r.raw}`, net: /\bnet\b/i.test(c.slice(rm.index)) };
    }
  }

  // Product chain
  const tokens = c.split(/\s*×\s*|\s[x*]\s/i).map(t => t.trim()).filter(Boolean);
  if (tokens.length >= 2 && money.length) {
    const chainHasPerKg = /\/\s?kg/i.test(c);
    let product = 1, hasVolume = false, labels = [], usable = 0;
    for (const tok of tokens) {
      const ct = chainToken(tok, chainHasPerKg);
      if (!ct) continue;
      if (ct.big) return { refused: `${ct.label} is not a per-unit figure` };
      product *= ct.value; labels.push(ct.label); usable++;
      if (ct.isVolume) hasVolume = true;
    }
    if (usable >= 2) return { value: product * halved, perYear: hasVolume || (perYear && product >= 1000), how: labels.join(' × ') };
  }

  // Percentage of a money figure: "20% of €47.67"
  if (pct != null && money.length) {
    const base = money.reduce((a, b) => (b.value > a.value ? b : a));
    if (base.value >= 1000 && !perYear) return { refused: `${base.raw} has no stated period` };
    return { value: base.value * pct / 100 * halved, perYear: base.value >= 1000, how: `${pct}% × ${base.raw}` };
  }

  // A lone money figure
  if (money.length) {
    const m = money[0];
    const lead = c.slice(Math.max(0, m.index - 14), m.index);
    const perUnit = PER_UNIT_RE.test(c);
    const isContext = CONTEXT_LEAD_RE.test(lead) || (CONTEXT_RE.test(c) && !SAVING_RE.test(c));
    if (isContext) return { context: m.value };
    if (m.value >= 1000) return perYear ? { value: m.value * halved, perYear: true, how: m.raw } : { refused: `${m.raw} has no stated period` };
    return { value: m.value * halved, perYear: false, how: m.raw + (perUnit ? '' : ' (read as per unit)') };
  }
  return null;
}

/**
 * Parse a calculationBasis into a computed annual figure.
 * Returns { computedEur, volume, volumeSource, terms, refused, reductions, form } or null.
 */
export function parseBasis(basis, { annualVolume = null, annualValueText = '' } = {}) {
  const b = String(basis ?? '').trim();
  if (!b) return null;
  let volume = parseVolume(b), volumeSource = 'basis';
  if (volume == null) { volume = parseVolume(annualValueText); volumeSource = volume != null ? 'annual value' : null; }
  if (volume == null && Number(annualVolume) > 0) { volume = Number(annualVolume); volumeSource = 'run'; }

  const clauses = b.split(/;|\bplus\b/i).map(s => s.trim()).filter(Boolean);
  const terms = [], refused = [], reductions = [];
  let perPart = 0, perYear = 0, anyPerPart = false, anyPerYear = false, context = null, pendingApply = null;
  for (const c of clauses) {
    const t = clauseTerm(c);
    if (!t) continue;
    if (t.refused) { refused.push(t.refused); continue; }
    if (t.reduce != null) { reductions.push(t.reduce); continue; }
    if (t.context != null) {
      context = t.context;
      if (pendingApply != null) { perPart += context * pendingApply; anyPerPart = true; terms.push({ clause: c.slice(0, 80), value: context * pendingApply, perYear: false, how: `${Math.round(pendingApply * 100)}% × €${context}` }); pendingApply = null; }
      continue;
    }
    if (t.apply != null) {
      if (anyPerPart && perPart > 0) { perPart *= t.apply; terms.push({ clause: c.slice(0, 80), value: null, perYear: false, how: `× ${Math.round(t.apply * 100)}%` }); }
      else if (context != null) { perPart += context * t.apply; anyPerPart = true; terms.push({ clause: c.slice(0, 80), value: context * t.apply, perYear: false, how: `${Math.round(t.apply * 100)}% × €${context}` }); }
      else pendingApply = t.apply;
      continue;
    }
    if (t.net && (anyPerPart || anyPerYear)) {
      // The gross terms before a "net" result are superseded by it.
      terms.splice(0, terms.length, { clause: c.slice(0, 80), value: t.value, perYear: t.perYear, how: `${t.how} (net, supersedes gross)` });
      perPart = t.perYear ? 0 : t.value; perYear = t.perYear ? t.value : 0;
      anyPerPart = !t.perYear; anyPerYear = !!t.perYear;
      continue;
    }
    terms.push({ clause: c.slice(0, 80), value: t.value, perYear: t.perYear, how: t.how });
    if (t.perYear) { perYear += t.value; anyPerYear = true; } else { perPart += t.value; anyPerPart = true; }
  }
  if (!anyPerPart && !anyPerYear) return refused.length ? { computedEur: null, refused, terms, form: `refused: ${refused[0]}` } : null;
  if (anyPerPart && volume == null) return { computedEur: null, refused, terms, form: 'unit saving without a volume' };
  let computedEur = (anyPerPart ? perPart * volume : 0) + perYear;
  for (const r of reductions) computedEur *= (1 - r);
  const form = anyPerPart && anyPerYear ? 'unit × volume + annual total' : anyPerPart ? 'unit × volume' : 'annual total';
  return { computedEur, volume, volumeSource, terms, refused, reductions, form };
}

/**
 * Check one idea. Stamp shape:
 *   { status, statedEur: {lo,hi,mid}|null, computedEur, deltaPct, basis, note }
 * deltaPct is signed against the NEAREST bound of the stated range (0 inside).
 */
export function checkArithmetic(idea, { annualVolume = null } = {}) {
  const csp = idea?.costSavingPotential || {};
  const annualValueText = String(csp.annualValue ?? '');
  const stated = parseMoneyRange(annualValueText);
  const parsed = parseBasis(csp.calculationBasis, { annualVolume, annualValueText });
  const unparsed = (note) => ({ status: 'unparsed', statedEur: stated, computedEur: null, deltaPct: null, basis: parsed?.form ?? null, note });
  if (!stated) return unparsed('no annual value figure to check');
  if (!parsed) return unparsed('calculation basis has no readable saving figure');
  if (parsed.computedEur == null) return unparsed(parsed.form);
  const c = parsed.computedEur;
  const lo = stated.lo * (1 - ARITH_TOLERANCE_PCT / 100), hi = stated.hi * (1 + ARITH_TOLERANCE_PCT / 100);
  let deltaPct = 0;
  if (c < lo) deltaPct = -Math.round((1 - c / stated.lo) * 100);
  else if (c > hi) deltaPct = Math.round((c / stated.hi - 1) * 100);
  const status = deltaPct === 0 ? 'consistent' : 'mismatch';
  const volTxt = parsed.volume != null ? `${parsed.volume.toLocaleString('en-GB')}/yr` : '';
  const how = parsed.terms
    .map(x => (x.value == null ? x.how : x.perYear ? x.how : `${x.how} × ${volTxt}`))
    .join(' + ').replace(/\+ ×/g, '×');
  const red = parsed.reductions?.length ? ` × (1 − ${parsed.reductions.map(r => `${Math.round(r * 100)}%`).join(')(1 − ')})` : '';
  const vol = parsed.terms.some(t => !t.perYear && t.value != null) ? ` (volume from ${parsed.volumeSource})` : '';
  const fmt = (n) => `€${Math.round(n).toLocaleString('en-GB')}`;
  return {
    status, statedEur: stated, computedEur: Math.round(c), deltaPct,
    basis: `${parsed.form}: ${how}${red}${vol}`,
    note: status === 'consistent'
      ? `basis multiplies out to ${fmt(c)}, inside the stated range`
      : `basis multiplies out to ${fmt(c)}, ${Math.abs(deltaPct)}% ${deltaPct < 0 ? 'below the stated minimum' : 'above the stated maximum'} (${fmt(stated.lo)}${stated.hi !== stated.lo ? `–${fmt(stated.hi)}` : ''})`,
  };
}

/** Mutates ideas: stamps idea.arithmetic and adds a validation flag on mismatch. Returns counts. */
export function runArithmeticChecks(ideas, opts = {}) {
  const summary = { consistent: 0, mismatch: 0, unparsed: 0 };
  for (const idea of Array.isArray(ideas) ? ideas : []) {
    if (!idea || typeof idea !== 'object') continue;
    const a = checkArithmetic(idea, opts);
    idea.arithmetic = a;
    summary[a.status]++;
    if (a.status === 'mismatch') {
      idea.validationFlags = [...new Set([...(idea.validationFlags || []), `arithmetic-mismatch(${a.deltaPct > 0 ? '+' : ''}${a.deltaPct}%)`])];
    }
  }
  return summary;
}
