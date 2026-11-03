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

/** `text` with its £ amounts and £ units in the report currency (`fx` units per £, `sym` its symbol). */
export function localiseGbpText(text: string, fx: number, sym: string): string {
  if (!text || fx === 1 && sym === '£') return text;
  return text
    // a country book's note gives the local amount AND its £ ("zł196,420 (£38,544)"); converted, the bracket repeated
    // the same figure ("zł196,420 (zł196,420)") — in a report already in that currency the bracket is dropped
    .replace(new RegExp(`(${esc(sym)}\\s?\\d[\\d,]*(?:\\.\\d+)?) \\(£\\d[\\d,]*(?:\\.\\d+)?\\)`, 'g'), '$1')
    .replace(AMOUNT, (_m, a: string, dash?: string, b?: string) => {
      const conv = (s: string) => fmtLike(s, Number(s.replace(/,/g, '')) * fx, !b);
      return `${sym}${conv(a)}${b ? `${dash}${conv(b)}` : ''}`;
    })
    .replace(new RegExp(`${NOT_IN_SYMBOL}£/`, 'g'), `${sym}/`)
    .replace(/\(£\)/g, `(${sym})`);
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
