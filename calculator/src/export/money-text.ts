/**
 * Money inside the TEXT of a report — rule bases, rate sources, consumable lines, notes — in the report's currency.
 *
 * The costing is held in £ and the reports convert every number to the display currency, but the explanatory text
 * was printed "as recorded, GBP": a China report read "die £3,056", "blast machine £8.61/h + operator £3.57/h" and
 * "capex £22,394" beside ¥ totals (demo review 2026-10-10). In a non-£ report these convert every £ AMOUNT and every
 * £ UNIT (£/kg, £/hr) at the report's own FX. An FX quote written "¥8.88/£" is left alone, and a £ report is
 * returned unchanged.
 */

// A £ that is part of a currency symbol is not a pound: the Egyptian pound prints "E£", and an Egypt PDF converted its
// own "E£724.30" again ("EE£54,162.14", × 74.78) — the bucket rows a third time (world rate round live run, 30 Oct 2026).
import { DEFAULT_RATE_LIBRARY } from '../engine/rate-library.js';

const NOT_IN_SYMBOL = '(?<![A-Za-z])';
const AMOUNT = new RegExp(`${NOT_IN_SYMBOL}£(\\d[\\d,]*(?:\\.\\d+)?)(?:([–-])(\\d[\\d,]*(?:\\.\\d+)?))?`, 'g');

function fmtLike(src: string, value: number, single = false): string {
  const dp = (src.split('.')[1] ?? '').length;
  // keep the recorded precision, but never print a converted pence figure with fewer than 2 decimals. A whole-pound
  // SINGLE amount under 100 converts to 2 dp: "£5" → "zł25.48", not "zł25" (a Poland report printed "2D X-ray at
  // PLN 25 a part × 0.4957 = 12.64" — 25 × 0.4957 is 12.39). Ranges ("£2–8") keep whole units.
  const d = dp === 0 ? (single && Math.abs(value) < 100 ? 2 : 0) : Math.max(2, dp);
  return value.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A rate-book note as a report prints it (CAD2C five-part report audit, Oct 2026): the refresh bookkeeping
 * ("| Refresh 2026-09: …"), the previous figure ("Was £19.94/h"), a cross-reference to a pricing basis the report
 * does not carry and a module parameter that rode in the note ("coolFactor ~2.2 s/mm²") are dropped. The rate
 * database export keeps the note as written.
 *
 * President review (Nov 2026): every library id is printed by its name (machines of every kind — imm-, press-,
 * rotomould- … — labour grades, materials), a country book's machine-group key ("(imm-domestic: imm-200t ¥214,000")
 * is dropped, and the research bookkeeping is dropped: the research key and old → new figures of a page re-check
 * ("CORRECTED 30 Oct 2026 on a page re-check: ferrous.anchor.crc 3.239 → 3.195 (…)" → "corrected 30 Oct 2026 on a
 * page re-check (…)"), the superseded "Earlier note: …", "(machine added 2026-10-30)", the "Quoted from the search
 * engine's extract … verify against the live URL" provenance remark and a withdrawn-quote aside.
 */
/** Library ids (machines, labour grades, materials) by the NAME a reader knows them by — built once. */
let LIBRARY_NAMES: Map<string, string> | null = null;
let LIBRARY_ID_RE: RegExp | null = null;
let MACHINE_IDS: Set<string> | null = null;
function libraryNames(): Map<string, string> {
  if (!LIBRARY_NAMES) {
    LIBRARY_NAMES = new Map<string, string>();
    for (const m of DEFAULT_RATE_LIBRARY.machines) LIBRARY_NAMES.set(m.id, m.machineClass);
    for (const l of DEFAULT_RATE_LIBRARY.labour) LIBRARY_NAMES.set(l.id, `${l.skillLevel} labour`);
    for (const m of DEFAULT_RATE_LIBRARY.materials) LIBRARY_NAMES.set(m.id, m.grade);
    MACHINE_IDS = new Set(DEFAULT_RATE_LIBRARY.machines.map(m => m.id));
    // every machine id whatever its prefix (imm-400t, press-schuler-400t, rotomould-biaxial …), longest first so
    // "imm-200t-cn" is not read as "imm-200t" + "-cn"; mat- / lab- / mach- ids by their shape (an unknown one stays)
    const machineIds = [...MACHINE_IDS].filter(id => !id.startsWith('mach-')).sort((a, b) => b.length - a.length).map(esc);
    LIBRARY_ID_RE = new RegExp(`(?<![\\w-])(?:${machineIds.join('|')}|(?:mach|lab|mat)-[a-z0-9]+(?:-[a-z0-9]+)*)(?![\\w-])`, 'g');
  }
  return LIBRARY_NAMES;
}
function libraryName(id: string): string | undefined {
  return libraryNames().get(id);
}

export function reportNoteText(note: string | null | undefined): string {
  if (!note) return '';
  libraryNames();
  return note
    // a rate note that quotes another library entry by its internal id ("Capex = mach-haas-vf2 £53,204",
    // "(rate id mach-lathe-cnc)") prints that entry's name (7-country review, 3 Nov 2026)
    .replace(/\s*\(rate id [a-z0-9-]+\)/g, '')
    // a country book's machine-group key before the reference machine: "(cnc-vmc-domestic: mach-vmc3 ¥287,817"
    .replace(/\(([a-z0-9]+(?:-[a-z0-9]+)+): (?=([a-z0-9]+(?:-[a-z0-9]+)+)[\s,)])/g,
      (m, _key: string, ref: string) => (MACHINE_IDS!.has(ref) ? '(' : m))
    .replace(LIBRARY_ID_RE!, id => libraryName(id) ?? id)
    .replace(/\s*\|\s*Refresh \d{4}-\d{2}:.*$/s, '')
    // the superseded note the refresh appended ("… Earlier note: Index-anchored 2026-07 refresh. …") runs to the end
    .replace(/\s*Earlier note:.*$/s, '')
    .replace(/\s*\(machine added \d{4}-\d{2}-\d{2}\)/g, '')
    // a page re-check: the research key and the old → new figures go, the fact and its reason stay
    .replace(/CORRECTED (\d{1,2} [A-Z][a-z]{2} \d{4}) on a page re-check: [a-z]+(?:\.[A-Za-z0-9_-]+)+ \d[\d.]* (?:→|->) \d[\d.]*/g,
      'corrected $1 on a page re-check')
    .replace(/CORRECTED (\d{1,2} [A-Z][a-z]{2} \d{4}) on a page re-check \(was \d[\d.]*\):/g, 'corrected $1 on a page re-check:')
    // how a quotation was read (a search engine's extract of the page) is research provenance, not a source
    .replace(/\s*Quoted from the search engine['’]s extracts? of the (?:publisher['’]s |publishers['’] )?pages?(?: \([^)]*\))? [—–-]+ verify against the live URLs?\./g, '')
    .replace(/\s*Search-engine extract [—–-]+ verify against the live page\./g, '')
    .replace(/ via the search engine['’]s extract(?= [—–-])/g, '')
    .replace(/\s*\(An earlier [^()]*? could not be found and was withdrawn\.\)/g, '')
    .replace(/\s*Was £[\d.,]+\/[a-z²]+(?:\s*\([^)]*\))?\.?/g, '')
    .replace(/\s*\(see [A-Z ]+ PRICING BASIS\)/g, '')
    .replace(/\s*coolFactor ~[\d.]+ s\/mm²/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * What a DIRECT-COST material line is, as a report says it (live run, 3 Nov 2026 — reports printed "priced by the commodity
 * module", which tells a reader nothing): the sum of its itemised material lines, named, or a supplied figure.
 */
export function directMaterialNames(lines: ReadonlyArray<{ ref?: string; description?: string }> | null | undefined): string {
  // a PCBA carries hundreds of designators: past four names the lines are counted, not listed
  const names = [...new Set((lines ?? []).map(l => (l.ref || l.description || '').trim()).filter(Boolean))];
  return names.length > 4 ? `${names.length} itemised lines` : names.join(' + ');
}
export function directMaterialBasis(lines: ReadonlyArray<{ ref?: string; description?: string }> | null | undefined): string {
  const names = directMaterialNames(lines);
  return names ? `the sum of the material lines (${names}), not weight × price per kg` : 'a supplied figure, not weight × price per kg';
}

/** One £ amount in a text: where it is, its £ figure(s), and what the report prints for it. */
interface GbpToken {
  start: number; end: number;
  /** the £ figure as printed (a range keeps both ends) */
  a: string; dash?: string; b?: string;
  gbp: number;
  /** the converted figure: exact, and as printed */
  value: number; printed: string;
  /** printed after it: the costed figure where the arithmetic on the printed inputs differs (" → ¥18,204") */
  suffix?: string;
  /** the whole replacement, symbol included, where the figure is not converted (a stated conversion into £) */
  whole?: string;
}

const fmtDp = (v: number, dp: number) => v.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const dpOf = (s: string) => (s.replace(/[^\d.]/g, '').split('.')[1] ?? '').length;
const numOf = (s: string) => Number(s.replace(/[^\d.-]/g, ''));

/**
 * A converted equation must re-add at the figures it PRINTS (live run, 3 Nov 2026). Each £ figure was converted on its
 * own and rounded, so "UK £2,200 + £34/mm × 161.6 mm = £7,694.40" printed "¥19,536 + ¥302/mm × 161.6 mm = ¥68,326.27"
 * (re-adds to ¥68,339), and "£6,000 × 1 × 0.3416 = £2,050" printed "¥53,280 × 1 × 0.3416 = ¥18,204" (¥18,200). Every
 * "… = £x" whose £ arithmetic holds at its printed precision is re-checked in the report currency:
 *   1. its £ inputs are printed with more decimals (up to 4) until the converted equation holds ("¥301.92/mm");
 *   2. if it still does not — the £ result was itself rounded (£2,049.60 printed £2,050) — the result is printed as the
 *      arithmetic on the PRINTED inputs, followed by "→ ¥x", the costed figure (unless an arrow already follows, or the
 *      result is itself the "→ £x" of an arithmetic run: then the arithmetic replaces it);
 *   3. a stated conversion INTO £ ("US$1.57/kg × 0.7394 = £1.161/kg") keeps its GBP result, the report currency in
 *      brackets ("= GBP 1.161/kg (¥10.310/kg)") — converted, it stated "US$1.57 × 0.7394 = ¥10.310".
 * A rounding arrow "£A → £B" (B is A rounded) keeps its direction: B is printed exact when its rounded form is not the
 * rounding of A's converted figure ("¥42,040.50 → ¥42,038" read as rounding the wrong way; it prints ¥42,037.92).
 * The precision check is basis-check.py's: half the last printed digit of the result.
 */
const EQ_NUM = String.raw`£?-?\d[\d,]*(?:\.\d+)?%?`;
const EQ_TOK = new RegExp(String.raw`(${EQ_NUM})|(\s[×x*÷/+−-]\s|[×÷+−])`, 'g');

/** The trailing "number op number …" run of a left-hand side, as basis-check.py reads it: [kind, text, offset]. */
function trailingRun(left: string, offset: number): Array<{ kind: 'n' | 'o'; text: string; at: number }> | null {
  const toks: Array<{ kind: 'n' | 'o'; text: string; at: number }> = [];
  EQ_TOK.lastIndex = 0;
  for (let m = EQ_TOK.exec(left); m; m = EQ_TOK.exec(left)) {
    if (m[1]) toks.push({ kind: 'n', text: m[1], at: offset + m.index });
    else toks.push({ kind: 'o', text: m[2].trim(), at: offset + m.index });
  }
  const seq: typeof toks = [];
  for (let k = toks.length - 1; k >= 0; k--) {
    const t = toks[k];
    if (!seq.length) { if (t.kind === 'n') seq.push(t); continue; }
    if (seq[seq.length - 1].kind !== t.kind) seq.push(t); else break;
  }
  seq.reverse();
  if (seq.length && seq[0].kind === 'o') seq.shift();
  return seq.length >= 3 ? seq : null;
}

/** Evaluate a run with ×/÷ before +/−; `num` gives each number's value. Null on anything odd. */
function evalRun(seq: Array<{ kind: 'n' | 'o'; text: string; at: number }>, num: (t: { text: string; at: number }) => number): number | null {
  const vals: number[] = [], ops: string[] = [];
  for (const t of seq) {
    if (t.kind === 'n') { const v = num(t); if (!Number.isFinite(v)) return null; vals.push(v); }
    else ops.push(({ x: '*', '×': '*', '÷': '/', '−': '-' } as Record<string, string>)[t.text] ?? t.text);
  }
  if (vals.length !== ops.length + 1) return null;
  const terms: number[] = [vals[0]], signs: number[] = [1];
  for (let k = 0; k < ops.length; k++) {
    const o = ops[k], v = vals[k + 1];
    if (o === '*') terms[terms.length - 1] *= v;
    else if (o === '/') { if (v === 0) return null; terms[terms.length - 1] /= v; }
    else if (o === '+' || o === '-') { terms.push(v); signs.push(o === '-' ? -1 : 1); }
    else return null;
  }
  return terms.reduce((acc, t, k) => acc + signs[k] * t, 0);
}

const plainVal = (s: string) => { const pct = s.endsWith('%'); const v = numOf(s); return pct ? v / 100 : v; };
const holds = (got: number, shown: string) => Math.abs(got - plainVal(shown)) <= Math.max(0.5 * 10 ** -dpOf(shown) * 1.0001, Math.abs(plainVal(shown)) * 1e-6);

/** `text` with its £ amounts and £ units in the report currency (`fx` units per £, `sym` its symbol). */
export function localiseGbpText(text: string, fx: number, sym: string): string {
  if (!text || fx === 1 && sym === '£') return text;
  // a country book's note gives the local amount AND its £ ("zł196,420 (£38,544)"); converted, the bracket repeated
  // the same figure ("zł196,420 (zł196,420)") — in a report already in that currency the bracket is dropped
  const src = text.replace(new RegExp(`(${esc(sym)}\\s?\\d[\\d,]*(?:\\.\\d+)?) \\(£\\d[\\d,]*(?:\\.\\d+)?\\)`, 'g'), '$1');
  const toks: GbpToken[] = [];
  AMOUNT.lastIndex = 0;
  for (let m = AMOUNT.exec(src); m; m = AMOUNT.exec(src)) {
    const [, a, dash, b] = m;
    const gbp = Number(a.replace(/,/g, ''));
    const conv = (x: string) => fmtLike(x, Number(x.replace(/,/g, '')) * fx, !b);
    toks.push({ start: m.index, end: m.index + m[0].length, a, dash, b, gbp, value: gbp * fx,
      printed: `${conv(a)}${b ? `${dash}${conv(b)}` : ''}` });
  }
  if (toks.length) fixEquations(src, toks, sym);
  let out = '';
  let at = 0;
  for (const t of toks) { out += src.slice(at, t.start) + (t.whole ?? `${sym}${t.printed}${t.suffix ?? ''}`); at = t.end; }
  out += src.slice(at);
  return out
    .replace(new RegExp(`${NOT_IN_SYMBOL}£/`, 'g'), `${sym}/`)
    .replace(/\(£\)/g, `(${sym})`);
}

/** The printed figure is the converted figure itself (no decimals lost). */
const exact = (t: GbpToken) => Math.abs(numOf(t.printed) - t.value) <= 1e-9 * Math.max(1, Math.abs(t.value));

function fixEquations(src: string, toks: GbpToken[], sym: string): void {
  const byAt = new Map(toks.map(t => [t.start, t]));
  const single = (t: GbpToken | undefined) => (t && !t.b ? t : undefined);
  const shownVal = (t: GbpToken) => numOf(t.printed);
  // ── 1–2: every "… = £x" (and "… → £x" after arithmetic) ─────────────────────────────────────────────────────────
  for (const res of toks) {
    if (res.b) continue;
    const before = src.slice(0, res.start);
    const eq = /(=|→|->)\s*$/.exec(before);
    if (!eq) continue;
    const eqAt = eq.index;
    const arrowResult = eq[1] !== '=';
    // the left-hand side starts after the last clause mark, bracket or earlier = / → (basis-check.py's reading)
    const marks = [';', '|', ':', '(', '=', '→'].map(c => before.lastIndexOf(c, eqAt - 1));
    const ascii = before.lastIndexOf('->', eqAt - 1);
    const start = Math.max(...marks, ascii >= 0 ? ascii + 1 : -1) + 1;
    const left = src.slice(start, eqAt);
    const seq = trailingRun(left, start);
    if (!seq) continue;
    const moneyToks = seq.filter(t => t.kind === 'n' && t.text.startsWith('£'));
    const money = moneyToks.map(t => byAt.get(t.at));
    if (money.some(t => !single(t))) continue;
    // the £ arithmetic as printed must hold — anything else is not this converter's to mend
    const gbpVal = (t: { text: string; at: number }) => (byAt.has(t.at) ? byAt.get(t.at)!.gbp : plainVal(t.text));
    const gbpGot = evalRun(seq, gbpVal);
    if (gbpGot == null || !holds(gbpGot, res.a)) continue;
    if (!money.length) {
      // a stated conversion INTO £ ("US$1.57/kg × 0.7394 = £1.161") stays in GBP, the report currency beside it —
      // converted, it read "US$1.57/kg × 0.7394 = ¥10.310"
      if (!arrowResult && /US\$|[$€₹¥]\s?\d|\b(?:USD|EUR|CNY|INR|PLN|HUF|JPY)\b/.test(left)) {
        const unit = /^\/[A-Za-z²³]+/.exec(src.slice(res.end))?.[0] ?? '';
        res.whole = `GBP ${res.a}${unit} (${sym}${res.printed}${unit})`;
        res.end += unit.length;
      }
      continue;
    }
    const printedVal = (t: { text: string; at: number }) => (byAt.has(t.at) ? shownVal(byAt.get(t.at)!) : plainVal(t.text));
    let got = evalRun(seq, printedVal);
    if (got == null || holds(got, res.printed)) continue;
    // 1. the inputs printed with more decimals
    const ins = money as GbpToken[];
    const was = ins.map(t => t.printed);
    let fixed = false;
    for (const dp of [2, 3, 4]) {
      for (const t of ins) if (dpOf(t.printed) < dp && !exact(t)) t.printed = fmtDp(t.value, dp);
      got = evalRun(seq, printedVal);
      if (got != null && holds(got, res.printed)) { fixed = true; break; }
    }
    if (fixed) {
      // keep only the decimals the equation needs: an input that did not have to move goes back
      for (let k = 0; k < ins.length; k++) {
        const keep = ins[k].printed;
        ins[k].printed = was[k];
        const g = evalRun(seq, printedVal);
        if (g == null || !holds(g, res.printed)) ins[k].printed = keep;
      }
      continue;
    }
    // 2. the arithmetic on the printed inputs, then the costed figure. A whole-£ input that is not a whole number in
    //    the report currency keeps its decimals ("UK ¥1,598.40", not "¥1,598"); no input prints more than it had or 2.
    ins.forEach((t, k) => { t.printed = was[k]; if (!exact(t)) t.printed = fmtDp(t.value, Math.max(2, dpOf(was[k]))); });
    got = evalRun(seq, printedVal);
    if (got == null) { ins.forEach((t, k) => { t.printed = was[k]; }); continue; }
    const costed = res.printed;
    res.printed = fmtDp(got, dpOf(costed));
    res.value = got;
    // after "→" (the result is already the figure costed) or before one, the arithmetic replaces it; otherwise the
    // costed figure follows it
    const arrowFollows = /^\s*(?:→|->)/.test(src.slice(res.end));
    if (!arrowResult && !arrowFollows && res.printed !== costed) res.suffix = ` → ${sym}${costed}`;
  }
  // ── a rounding arrow "£A → £B" keeps its direction ──────────────────────────────────────────────────────────────
  for (const a of toks) {
    if (a.b || a.whole) continue;
    const m = /^\s*(?:→|->)\s*/.exec(src.slice(a.end + 0));
    const b = m && !a.suffix ? single(byAt.get(a.end + m[0].length)) : undefined;
    if (!b || b.whole) continue;
    // B is A rounded to B's printed precision (in £)
    if (Math.abs(a.gbp - b.gbp) > 0.5 * 10 ** -dpOf(b.a) * 1.0001) continue;
    if (Math.abs(shownVal(a) - shownVal(b)) <= 0.5 * 10 ** -dpOf(b.printed) * 1.0001) continue;
    b.printed = fmtDp(b.value, Math.max(2, dpOf(a.printed)));
  }
}

/** A rule-table row whose field is in £ ("Die Cost (£)", "Heat Treatment (£/kg)"): the value converted, the label relabelled. */
export function localiseRuleValue(label: string, value: string, fx: number, sym: string): { label: string; value: string } {
  if (fx === 1 && sym === '£' || !/\(£/.test(label)) return { label: localiseGbpText(label, fx, sym), value: localiseGbpText(value, fx, sym) };
  const n = Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(n) || String(value).trim() === '') return { label: localiseGbpText(label, fx, sym), value: localiseGbpText(value, fx, sym) };
  const v = n * fx;
  const a = Math.abs(v);
  const dp = a < 1 ? 4 : a < 100 ? 2 : 0;
  return { label: label.replace(/\(£/g, `(${sym}`), value: v.toLocaleString('en-GB', { minimumFractionDigits: dp === 4 ? 2 : dp, maximumFractionDigits: dp }) };
}

/**
 * Money in the TEXT of the software reports (PDF and Excel share this one function — review: the rules were copied into
 * both renderers). On top of `localiseGbpText`: a conversion the text itself states ("÷ 1.165 EUR per £ = £6,206") keeps its
 * GBP result instead of being converted back; "£ per …", "£ / …", "£M" / "£k" and "Nominal £ (no discounting)" follow the
 * report currency. A £ report is returned unchanged.
 */
export function localiseReportText(text: string, fx: number, sym: string): string {
  if (!text || fx === 1 && sym === '£') return text;
  // A stated conversion ("÷ 1.165 EUR per £ = £6,206 / £6,940") stays in GBP as a whole — both figures (review: the
  // second was converted, printing "GBP 6,206 / €8,085").
  return localiseGbpText(text.replace(/(per £ = )£(\d[\d,.]*)(?: \/ £(\d[\d,.]*))?/g, (_m, a: string, x: string, y?: string) => `${a}GBP ${x}${y ? ` / ${y}` : ''}`), fx, sym)
    .replace(new RegExp(`${NOT_IN_SYMBOL}£(?= \\(no discounting)`, 'g'), sym)
    .replace(new RegExp(`${NOT_IN_SYMBOL}£ (?=/|per |a |an )`, 'g'), `${sym} `)
    .replace(new RegExp(`${NOT_IN_SYMBOL}£(?=M\\b|k\\b)`, 'g'), sym);
}
