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
//   partial      the priced part falls SHORT, and the basis names terms this
//                parser could not price; the computed figure is a floor, and
//                the shortfall is the reader's gap, not the model's error
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
// A cost BUCKET named before a figure ("Material €0.10/part", "Setup €0.05 +
// tooling €0.01") is the cost being attacked, not the saving — unless the
// clause also names a saving.
const CONTEXT_RE = /baseline|should-?cost|\bquote\b|\bcurrent\b|total part cost|\bpart cost\b|\bpiece price\b|\bunit price\b|\bblock\b|\bline\b|\bgap\b|\bcontent\b|^\s*(?:material|machine|setup|tooling|labour|labor|overhead|logistics|finishing|conversion|scrap)\s+[€£$]/i;
const SAVING_RE = /\bsav|release|delta|delet|captur|recover|avoid|premium|reduc|\bcut\b|halv|\bnet\b|\bdrop/i;
const CONTEXT_LEAD_RE = /(?:most|share|portion|fraction|part|half|third)\s+of\s*~?$|of\s+the\s*~?$|\bon\s*~?$|\bof\s*~?$|\bvs\.?\s+\S*\s*$|\bversus\s+\S*\s*$/i;
const REFUSE_RE = /programme|program\b|lifetime|\bover\s\d|per\s(?:programme|program)/i;
// "saving of" was listed but bare "saving" was not, so "…cuts tooling €/part to
// ~€0.26–0.35, saving ~€0.30/part × 60,000" never reached the result rule and
// the product chain multiplied the ratio "2.5x" instead. The marker must be
// IMMEDIATELY followed by money, which is what keeps the broader word safe.
const RESULT_RE = /(?:≈|=|\bgives\b|\byields\b|\bsaves?\b|\bsaving(?:\s+of)?\b|\bnets?\b|\bcaptures?\b)\s*~?\s*(?=[€£$]|\d+(?:\.\d+)?\s?(?:EUR|GBP|USD))/i;
const REDUCE_RE = /\bless\b|\bminus\b|\bnet of\b|\bafter\b|\bdiscount/i;
const CAPTURE_RE = /\bcapture(?:d|s|\srate)?\b|\bretained?\b|\brealis(?:ed|ation)\b|\byield(?:ed)?\s+to\b/i;
const APPLY_RE = /reduction|\bof (?:these|this|that|it)\b|\bon these\b|\bsaving\b|\bcapture\b/i;
// A percentage multiplies a money figure only when the text LINKS them
// ("20% of €47", "€214 × 20%", "7% net on €0.29"); "…~€0.025/part, plus 2%
// gain" is two separate claims and the percentage has no base to act on.
const linked = (c, pctIdx, moneyIdx) => {
  const between = pctIdx < moneyIdx ? c.slice(pctIdx, moneyIdx) : c.slice(moneyIdx, pctIdx);
  return between.length < 60 && /(?:\bof\b|\bon\b|×|\bx\b|\*|\bnet on\b|\bavg\b|\bfrom\b)/i.test(between.replace(/^\d+(?:\.\d+)?\s?(?:[-–]\s?\d+(?:\.\d+)?\s?)?%/, ''));
};

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
    const pi = PCT_RE.exec(t)?.index ?? -1;
    const applyPct = pct != null && pi !== -1 && linked(t, pi, money[0].index);
    const perKg = /^\s*\/\s?kg/.test(t.slice(money[0].index + money[0].raw.length));
    const v = money[0].value * (applyPct ? pct / 100 : 1);
    return { value: v, isVolume: false, perKg, label: applyPct ? `${pct}% × ${money[0].raw}` : money[0].raw, big: money[0].value >= 1000 && !PER_YEAR_RE.test(t) };
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
// A LABOUR RATE is not a multiplicand (Sept 2026 false-positive review).
// "DFA labour saving on ~8 fasteners/1 gasket at £38-47/hr × 200,000" made the
// parser multiply the hourly rate into the product chain and report
// €81,039,000 against a stated €1.7M–€2.7M — a 2901% "mismatch" that was
// entirely the reader's error. A rate is the price of an input, and the term it
// belongs to (seconds of labour) is not in the basis text at all. Two such
// clauses were among the worst mismatches on the corpus.
const RATE_MONEY_RE = /(?:~?\s?[€£$]\s?\d[\d,.]*\s?(?:[-–—]\s?[€£$]?\s?\d[\d,.]*\s?)?)\/\s?(?:hr|h\b|hour|min|minute|sec|second|shift)/gi;

function clauseTerm(clause) {
  const c0 = clause.trim();
  // Blank the rate out rather than deleting it, so every later index stays put.
  const c = c0.replace(RATE_MONEY_RE, (m) => ' '.repeat(m.length));
  if (!c.trim()) return null;
  if (REFUSE_RE.test(c)) return { refused: c.slice(0, 60) };
  const money = findMoney(c);
  const pct = pctOf(c);
  const perYear = PER_YEAR_RE.test(c);
  const halved = /\bhalv/i.test(c) ? 0.5 : 1;
  if (money.some(m => m.value >= 1000) && /\bNRE\b|capex|investment/i.test(c)) return { refused: `${money.find(m => m.value >= 1000).raw} is an investment, not an annual saving` };

  if (!money.length && pct != null) {
    // A CAPTURE / RETENTION rate multiplies; it does not subtract. "€101K
    // ceiling; net after freight/duty typically 50-70% capture" means keep
    // 50-70%, and reading it as "lose 60%" put the total 19% under the stated
    // range. REDUCE_RE fires on the "after" in the same clause, so capture has
    // to be tested first.
    if (CAPTURE_RE.test(c)) return { apply: pct / 100 };
    if (REDUCE_RE.test(c)) return { reduce: pct / 100 };     // "less 30-60% logistics"
    if (APPLY_RE.test(c)) return { apply: pct / 100 };   // "25% reduction x 10M" — of the build-up before it
    return null;
  }

  // from → to
  const arrow = /([€£$]\s?\d[\d,.]*\s?[KkMm]?)\s?(?:→|->)\s?~?\s?([€£$]\s?\d[\d,.]*\s?[KkMm]?)/.exec(c);
  if (arrow) {
    const a = parseMoneyRange(arrow[1]), b = parseMoneyRange(arrow[2]);
    if (a && b && a.mid > b.mid) return { value: a.mid - b.mid, perYear: perYear && a.mid >= 1000, how: `${arrow[1].trim()} → ${arrow[2].trim()}` };
    // "€1.45 → €3.40/kg": a cost that goes UP is context for a net figure
    // elsewhere, never a saving to multiply out.
    if (a && b && a.mid <= b.mid) return null;
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
      //
      // And a result clause that names the VOLUME ("net process/complexity
      // saving ~€0.15–0.25/part × 60,000") is the model's own product, exactly
      // as in the product-chain branch below — the figures before it are its
      // working. Widening RESULT_RE to bare "saving" made this branch catch
      // clauses the chain branch used to, so the flag has to travel here too or
      // the fix for one shape re-breaks the other.
      return {
        value: r.value * halved, perYear: big, how: `result ${r.raw}`,
        net: /\bnet\b/i.test(c.slice(rm.index)),
        summary: parseVolume(c) != null || VOLUME_BARE_RE.test(c),
      };
    }
  }

  // Product chain
  const tokens = c.split(/\s*×\s*|\s[x*]\s/i).map(t => t.trim()).filter(Boolean);
  if (tokens.length >= 2 && money.length) {
    const chainHasPerKg = /\/\s?kg/i.test(c);
    let product = 1, hasVolume = false, labels = [], usable = 0, sawMass = false;
    for (const tok of tokens) {
      const ct = chainToken(tok, chainHasPerKg);
      if (!ct) continue;
      if (ct.big) return { refused: `${ct.label} is not a per-unit figure` };
      if (/\bkg\b/.test(ct.label)) sawMass = true;
      product *= ct.value; labels.push(ct.label); usable++;
      if (ct.isVolume) hasVolume = true;
    }
    // A €/kg price with no mass to multiply it by is not a per-part figure.
    if (chainHasPerKg && !sawMass) return { refused: 'a €/kg price with no mass stated' };
    if (usable >= 2) return { value: product * halved, perYear: hasVolume || (perYear && product >= 1000), how: labels.join(' × '), summary: hasVolume };
  }

  // Percentage of a money figure: "20% of €47.67" — only when the text links them.
  if (pct != null && money.length) {
    const pi = PCT_RE.exec(c).index;
    const base = money.reduce((a, b) => (b.value > a.value ? b : a));
    if (linked(c, pi, base.index)) {
      if (/^\s*\/\s?kg/.test(c.slice(base.index + base.raw.length))) return { refused: 'a €/kg price with no mass stated' };
      if (base.value >= 1000 && !perYear) return { refused: `${base.raw} has no stated period` };
      return { value: base.value * pct / 100 * halved, perYear: base.value >= 1000, how: `${pct}% × ${base.raw}` };
    }
    // Unlinked: fall through — the money figure stands on its own.
  }

  // A lone money figure. When several are present, prefer the one carrying a
  // per-unit marker AND a saving word nearby ("Setup €0.05 + tooling €0.01
  // amortised … (~€0.02-0.03/part released)") over the first one seen.
  if (money.length) {
    const scored = money.map(x => {
      const after = c.slice(x.index + x.raw.length, x.index + x.raw.length + 24);
      const around = c.slice(Math.max(0, x.index - 40), x.index + x.raw.length + 40);
      return { x, perUnit: PER_UNIT_RE.test(after), saving: SAVING_RE.test(around) };
    });
    const bucketLead = (x) => /(?:material|machine|setup|tooling|labour|labor|overhead|logistics|finishing|conversion|scrap|coating)\s*(?:line|bucket)?\s*~?$/i.test(c.slice(Math.max(0, x.index - 16), x.index));
    // "(E12 tooling €0.01/part)" is the bucket, not the saving — a per-unit
    // figure led by a bucket word only counts when a saving word sits by it.
    const usable = scored.filter(s => !(bucketLead(s.x) && !s.saving));
    const best = usable.find(s => s.perUnit && s.saving) || usable.find(s => s.perUnit) || usable[0];
    if (!best) return { context: scored[0].x.value };
    const m = best.x;
    if (/^\s*\/\s?kg/.test(c.slice(m.index + m.raw.length))) return { refused: 'a €/kg price with no mass stated' };
    const lead = c.slice(Math.max(0, m.index - 14), m.index);
    const perUnit = PER_UNIT_RE.test(c);
    const isContext = CONTEXT_LEAD_RE.test(lead) || (CONTEXT_RE.test(c) && !(best.perUnit && best.saving) && !SAVING_RE.test(c));
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

  // "minus ~€0.12/kg coating premium × 0.073 kg" is a subtractive TERM (a
  // money figure follows); "less 30-60% logistics" stays a percentage
  // reduction of the running total. Mark the subtractive ones with a sign.
  const marked = b.replace(/\b(?:minus|less)\s+(?=~?[€£$]|~?\d+(?:\.\d+)?\s?(?:EUR|GBP|USD))/gi, ';NEG ');
  const clauses = marked.split(/;|\bplus\b/i).map(s => s.trim()).filter(Boolean);
  const terms = [], refused = [], reductions = [], unpriced = [];
  let perPart = 0, perYear = 0, anyPerPart = false, anyPerYear = false, context = null, pendingApply = null;
  for (const raw of clauses) {
    const neg = /^NEG\s/.test(raw);
    const c = neg ? raw.replace(/^NEG\s/, '') : raw;
    const t0 = clauseTerm(c);
    const t = t0 && neg && typeof t0.value === 'number' ? { ...t0, value: -t0.value, how: `− ${t0.how}` } : t0;
    if (!t) {
      // A clause that NAMES a saving but carries no figure this parser can
      // price ("plus cross-variant NRE avoidance", "plus copper slot-fill
      // gain") means the computed total is a FLOOR, not the whole claim.
      // Reporting it as a mismatch blamed the model for the parser's blind
      // spot — see the asymmetric verdict in checkArithmetic.
      if (SAVING_RE.test(c) || /\bgain\b|\buplift\b|\bbenefit\b|\bcredit\b/i.test(c)) unpriced.push(c.slice(0, 70));
      continue;
    }
    // A REFUSED clause is an unpriced term too. "…= €319k prime value;
    // scrap-value uplift + nesting recovery €0.7–1.8M" refuses the second
    // clause for having no stated period, then reported the €319k floor as a
    // 68% shortfall — blaming the model for a figure the parser declined to
    // read. Refusal and non-parse are the same fact about the READER.
    if (t.refused) { refused.push(t.refused); unpriced.push(c.slice(0, 70)); continue; }
    if (t.reduce != null) { reductions.push(t.reduce); continue; }
    if (t.context != null) {
      context = t.context;
      if (pendingApply != null) { perPart += context * pendingApply; anyPerPart = true; terms.push({ clause: c.slice(0, 80), value: context * pendingApply, perYear: false, how: `${Math.round(pendingApply * 100)}% × €${context}` }); pendingApply = null; }
      continue;
    }
    if (t.apply != null) {
      if (anyPerPart && perPart > 0) { perPart *= t.apply; terms.push({ clause: c.slice(0, 80), value: null, perYear: false, how: `× ${Math.round(t.apply * 100)}%` }); }
      // A percentage can act on an ANNUAL running total too — "…× 60,000 =
      // €101K ceiling; net after freight/duty typically 50-70% capture" has no
      // per-part term at all, so the capture rate was parked in pendingApply and
      // silently never applied, leaving the ceiling as the answer.
      else if (anyPerYear && perYear > 0) { perYear *= t.apply; terms.push({ clause: c.slice(0, 80), value: null, perYear: true, how: `× ${Math.round(t.apply * 100)}%` }); }
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
    // THE WORKING IS NOT AN EXTRA TERM (Sept 2026 false-positive review).
    //
    // "Removes bracket cost €1.32 less the marginal cost of rail feature
    // (~€0.35); ~€0.60–€0.90/part × 60,000" is ONE claim written twice: the
    // components, then the model's own product. The parser added them and
    // reported €124,200 against a stated €35K–€55K. Five of the sixteen
    // mismatches on the live corpus were this shape, and on all five the
    // explicit product was the correct reading.
    //
    // So a clause whose product chain names the VOLUME is the model's answer,
    // and the volume-less per-part terms before it are its working.
    //
    // The limitation, stated because it is real: a basis that genuinely adds
    // two separately-multiplied annual terms ("A × 60,000; plus B × 60,000")
    // reads as supersession too, and would under-count. No such basis appeared
    // in the corpus; tests/idea-arith.test.mjs pins the behaviour either way so
    // it is visible rather than surprising.
    if (t.summary && anyPerPart && !anyPerYear && terms.some(x => x.value != null && !x.perYear)) {
      // Honour the term's OWN scope. The product-chain branch folds the volume
      // into `value` and reports perYear; the result-marker branch returns the
      // per-part figure and leaves the multiplication to us. Forcing perYear
      // here turned "€0.20/part × 60,000" into a €0.20 annual total.
      terms.splice(0, terms.length, { clause: c.slice(0, 80), value: t.value, perYear: !!t.perYear, how: `${t.how} (the model's own product — the per-part figures above are its working)` });
      perPart = t.perYear ? 0 : t.value; perYear = t.perYear ? t.value : 0;
      anyPerPart = !t.perYear; anyPerYear = !!t.perYear;
      continue;
    }
    terms.push({ clause: c.slice(0, 80), value: t.value, perYear: t.perYear, how: t.how });
    if (t.perYear) { perYear += t.value; anyPerYear = true; } else { perPart += t.value; anyPerPart = true; }
  }
  if (!anyPerPart && !anyPerYear) return refused.length ? { computedEur: null, refused, terms, unpriced, form: `refused: ${refused[0]}` } : null;
  if (anyPerPart && volume == null) return { computedEur: null, refused, terms, unpriced, form: 'unit saving without a volume' };
  let computedEur = (anyPerPart ? perPart * volume : 0) + perYear;
  for (const r of reductions) computedEur *= (1 - r);
  const form = anyPerPart && anyPerYear ? 'unit × volume + annual total' : anyPerPart ? 'unit × volume' : 'annual total';
  return { computedEur, volume, volumeSource, terms, refused, reductions, unpriced, form };
}

/**
 * Check one idea. Stamp shape:
 *   { status, statedEur: {lo,hi,mid}|null, computedEur, deltaPct, basis, note }
 * deltaPct is signed against the NEAREST bound of the stated range (0 inside).
 */
/** Ratio window inside which two independently-written statements count as agreeing. */
export const CORROBORATION_TOLERANCE = 1.43;

/**
 * Does the idea's COST BRIDGE independently reach the same figure as its
 * calculation basis?
 *
 * Every idea states its saving arithmetic twice — `calculationBasis` and
 * `engineering.costBridge` — and until Sept 2026 (review P-3) nothing compared
 * them. It is a genuinely useful second opinion, but it has to be read
 * asymmetrically, and the reason is measured rather than assumed.
 *
 * Across 69 ideas where both fields parse, the bridge reading runs a median of
 * 0.30x the basis reading, with a dense cluster between 0.02x and 0.17x. That
 * is not 64% of ideas contradicting themselves; it is one parser reading a
 * field it was not built for. The bridge is written as a per-part walk ending
 * "then x volume" in words, so the volume is frequently absent from the text
 * and the per-part figure is read as though it were the annual total.
 *
 * So: AGREEMENT is evidence and DISAGREEMENT is not. Two independently written
 * statements landing on the same number is hard to do by accident, and worth
 * saying. Two statements differing, when one of them is being read by a parser
 * with a known systematic bias, is worth nothing — and reporting it as a defect
 * would repeat exactly the false-positive failure this module was just fixed
 * for. The permanent fix is to generate both from one structured saving model
 * so they cannot disagree; this is the honest interim.
 */
export function checkCorroboration(idea, { annualVolume = null } = {}) {
  const bridge = idea?.engineering?.costBridge;
  if (!bridge || typeof bridge !== 'string' || !bridge.trim()) {
    return { status: 'absent', note: 'the idea states no cost bridge to cross-check against' };
  }
  const csp = idea?.costSavingPotential || {};
  const annualValueText = String(csp.annualValue ?? '');
  const a = parseBasis(csp.calculationBasis, { annualVolume, annualValueText });
  const b = parseBasis(bridge, { annualVolume, annualValueText });
  if (!a?.computedEur || !b?.computedEur) {
    return { status: 'unreadable', note: 'the cost bridge could not be read as arithmetic — no second opinion available, which is NOT a finding about the idea' };
  }
  const ratio = b.computedEur / a.computedEur;
  const agrees = ratio >= 1 / CORROBORATION_TOLERANCE && ratio <= CORROBORATION_TOLERANCE;
  const fmt = (n) => `€${Math.round(n).toLocaleString('en-GB')}`;
  return agrees
    ? { status: 'corroborated', bridgeEur: Math.round(b.computedEur), ratio: Number(ratio.toFixed(2)),
        note: `the cost bridge independently multiplies out to ${fmt(b.computedEur)}, agreeing with the calculation basis` }
    : { status: 'not-corroborated', bridgeEur: Math.round(b.computedEur), ratio: Number(ratio.toFixed(2)),
        note: `the cost bridge reads as ${fmt(b.computedEur)} against the basis's ${fmt(a.computedEur)} — NOT a contradiction: this parser reads prose bridges with a known low bias (median 0.30x on the measured corpus), so the two simply do not corroborate` };
}

export function checkArithmetic(idea, { annualVolume = null } = {}) {
  const csp = idea?.costSavingPotential || {};
  const annualValueText = String(csp.annualValue ?? '');
  const stated = parseMoneyRange(annualValueText);
  const parsed = parseBasis(csp.calculationBasis, { annualVolume, annualValueText });
  const unparsed = (note) => ({ status: 'unparsed', statedEur: stated, computedEur: null, deltaPct: null, basis: parsed?.form ?? null, note });
  if (!stated) return unparsed('no annual value figure to check');
  // A CLAIM OF COST-NEUTRALITY IS NOT A SAVING CLAIM. "Approx. cost-neutral at
  // part level (~€0 to -€0.3M at 10M/yr)" parsed to lo = hi = 0, and dividing
  // by it produced deltaPct: null with the literal words "Infinity% above the
  // stated maximum" in a user-facing note. There is nothing here to check
  // against, and saying so is the answer.
  if (!(stated.hi > 0)) return unparsed('the stated value is not a positive saving range — nothing to multiply the basis against');
  if (!parsed) return unparsed('calculation basis has no readable saving figure');
  if (parsed.computedEur == null) return unparsed(parsed.form);
  const c = parsed.computedEur;
  const lo = stated.lo * (1 - ARITH_TOLERANCE_PCT / 100), hi = stated.hi * (1 + ARITH_TOLERANCE_PCT / 100);
  let deltaPct = 0;
  if (c < lo) deltaPct = -Math.round((1 - c / stated.lo) * 100);
  else if (c > hi) deltaPct = Math.round((c / stated.hi - 1) * 100);
  // AN INCOMPLETE READING IS A FLOOR, NOT A VERDICT (Sept 2026).
  //
  // When the basis names a saving this parser could not price — "plus
  // cross-variant NRE avoidance", "plus copper slot-fill gain" — the computed
  // figure is a LOWER BOUND on the claim. Calling that a mismatch blames the
  // model for the reader's blind spot, and three of the sixteen mismatches on
  // the live corpus were exactly this.
  //
  // The asymmetry is the honest part: unpriced terms can only push a total UP,
  // so a computed figure BELOW the stated range is explained by them and
  // reported as `partial`. A computed figure ABOVE the range is not — no
  // missing positive term explains an overshoot — so it stays a mismatch.
  let status = deltaPct === 0 ? 'consistent' : 'mismatch';
  const unpriced = parsed.unpriced ?? [];
  if (status === 'mismatch' && deltaPct < 0 && unpriced.length) status = 'partial';
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
    ...(unpriced.length ? { unpricedTerms: unpriced } : {}),
    note: status === 'consistent'
      ? `basis multiplies out to ${fmt(c)}, inside the stated range`
      : status === 'partial'
        ? `the priced part of the basis multiplies out to ${fmt(c)}, a FLOOR — ${unpriced.length} term${unpriced.length === 1 ? '' : 's'} named but not priced here (${unpriced.join('; ')}), which is enough to explain the ${Math.abs(deltaPct)}% gap to the stated ${fmt(stated.lo)}${stated.hi !== stated.lo ? `–${fmt(stated.hi)}` : ''}`
        : `basis multiplies out to ${fmt(c)}, ${Math.abs(deltaPct)}% ${deltaPct < 0 ? 'below the stated minimum' : 'above the stated maximum'} (${fmt(stated.lo)}${stated.hi !== stated.lo ? `–${fmt(stated.hi)}` : ''})`,
  };
}

/** Mutates ideas: stamps idea.arithmetic and adds a validation flag on mismatch. Returns counts. */
export function runArithmeticChecks(ideas, opts = {}) {
  const summary = { consistent: 0, mismatch: 0, partial: 0, unparsed: 0, corroboration: { corroborated: 0, 'not-corroborated': 0, unreadable: 0, absent: 0 } };
  for (const idea of Array.isArray(ideas) ? ideas : []) {
    if (!idea || typeof idea !== 'object') continue;
    const a = checkArithmetic(idea, opts);
    try { a.corroboration = checkCorroboration(idea, opts); } catch { /* second opinion is best-effort */ }
    idea.arithmetic = a;
    summary[a.status]++;
    const cs = a.corroboration?.status;
    if (cs) summary.corroboration[cs] = (summary.corroboration[cs] || 0) + 1;
    if (a.status === 'mismatch') {
      idea.validationFlags = [...new Set([...(idea.validationFlags || []), `arithmetic-mismatch(${a.deltaPct > 0 ? '+' : ''}${a.deltaPct}%)`])];
    }
  }
  return summary;
}
