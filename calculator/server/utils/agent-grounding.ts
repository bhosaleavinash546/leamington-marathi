/**
 * The costing agent may cost only numbers the USER gave.
 *
 * The agent's `calculate_cost` tool takes a `params` object the model writes. Every number in it went straight into
 * the engine, so a cycle time, a weight or a die cost the model made up became a "should-cost" (AI-path audit, Oct
 * 2026). The rule now: each number the model passes must appear in what the user supplied — their messages, or the
 * costing they shared — in some common unit; anything else is sent back to the model to ask for. Overhead, margin,
 * packaging and logistics the user did not state are dropped so the country's own defaults apply.
 *
 * Unit slack: a user's "45 s" may arrive as 0.0125 h, "2.5 kg" as 2500 g, "12 %" as 0.12, "1 in" as 25.4 mm.
 */

/** Factors between a number as the user wrote it and as the engine takes it. */
const UNIT_FACTORS = [1, 60, 1 / 60, 3600, 1 / 3600, 1000, 1 / 1000, 100, 1 / 100, 1e6, 1e-6, 25.4, 1 / 25.4];
/** Values that carry no information of their own (a count of one, a switch). */
const NEUTRAL = new Set([0, 1]);
/** Shop-level fields: dropped (country default) rather than refused when the user did not state them. */
export const SHOP_FIELDS = ['overheadPct', 'marginPct', 'packagingPerPart', 'logisticsPerPart'] as const;

/** Every number written in the texts: "1,200", "0.85", "200k" (= 200,000), "12%" (12 — the factors give 0.12). */
export function numbersIn(texts: string[]): number[] {
  const out: number[] = [];
  for (const t of texts) {
    for (const m of t.matchAll(/(\d[\d,]*(?:\.\d+)?|\.\d+)\s*([kK])?(?![\w])/g)) {
      const v = parseFloat(m[1].replace(/,/g, ''));
      if (!Number.isFinite(v)) continue;
      out.push(m[2] ? v * 1000 : v);
    }
  }
  return out;
}

export function isGrounded(v: number, given: number[]): boolean {
  if (NEUTRAL.has(v)) return true;
  const a = Math.abs(v);
  return given.some(g => UNIT_FACTORS.some(f => {
    const w = Math.abs(g * f);
    return Math.abs(w - a) <= Math.max(1e-9, 0.005 * Math.max(w, a));
  }));
}

/**
 * The unit factors a field may plausibly have been converted through, read off its name. `isGrounded` accepts any of
 * thirteen factors for any field, so a cycle time of 50 s was "grounded" by "50,000 parts a year" ÷ 1000 and a £0.40
 * tool-wear figure by "400 mm" ÷ 1000 (AI-number leak audit, Oct 2026). A field now takes only its own unit family;
 * a name that says nothing takes the number as written.
 */
export function unitFactorsFor(path: string): number[] {
  const key = path.replace(/\[\d+\]/g, '').split('.').pop() ?? '';
  if (/(Hr|Hours?)$/i.test(key)) return [1, 1 / 60, 1 / 3600];
  if (/(Sec|Seconds?)$/.test(key)) return [1, 60, 3600];
  if (/Min(utes?)?$/.test(key)) return [1, 60, 1 / 60];
  if (/Kg$/i.test(key)) return [1, 1 / 1000, 1000];
  if (/(Pct|Percent|Fraction|Efficiency|Yield|Utili[sz]ation|RejectRate|ScrapRate)$|^(oee|rejectRate|scrapRate|yield)$/i.test(key)) return [1, 1 / 100, 100];
  if (/Mm$/.test(key)) return [1, 25.4, 10];
  if (/(LengthM|Metres|Meters|PerM)$/.test(key)) return [1, 1 / 1000, 1 / 100];
  if (/(Cm3|Cm2)$/.test(key)) return [1, 1000, 1 / 1000];
  return [1];
}

/** `isGrounded` with only the unit factors the field's name allows. */
export function isGroundedFor(path: string, v: number, given: number[]): boolean {
  if (NEUTRAL.has(v)) return true;
  const a = Math.abs(v);
  return given.some(g => unitFactorsFor(path).some(f => {
    const w = Math.abs(g * f);
    return Math.abs(w - a) <= Math.max(1e-9, 0.005 * Math.max(w, a));
  }));
}

/** Every numeric leaf under `obj`, by dotted path. */
function numericLeaves(obj: unknown, path: string, out: Array<{ path: string; value: number }>): void {
  if (typeof obj === 'number') { out.push({ path, value: obj }); return; }
  if (Array.isArray(obj)) { obj.forEach((v, i) => numericLeaves(v, `${path}[${i}]`, out)); return; }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) numericLeaves(v, path ? `${path}.${k}` : k, out);
  }
}

export interface GroundedToolInput<T> {
  /** The input with ungrounded shop fields removed (the country's defaults then apply). */
  input: T;
  /** `params` numbers the user did not give — the call must not be costed while any remain. */
  ungrounded: Array<{ path: string; value: number }>;
  /** Shop fields dropped to the country default. */
  defaulted: string[];
}

export function groundToolInput<T extends { params?: unknown }>(input: T, userTexts: string[]): GroundedToolInput<T> {
  const given = numbersIn(userTexts);
  const leaves: Array<{ path: string; value: number }> = [];
  numericLeaves(input.params, 'params', leaves);
  const ungrounded = leaves.filter(l => !isGroundedFor(l.path, l.value, given));
  const cleaned = { ...input } as Record<string, unknown>;
  const defaulted: string[] = [];
  for (const f of SHOP_FIELDS) {
    const v = cleaned[f];
    if (typeof v === 'number' && !isGroundedFor(f, v, given)) { delete cleaned[f]; defaulted.push(f); }
  }
  return { input: cleaned as T, ungrounded, defaulted };
}

/** The tool result the model gets instead of a cost when it passed numbers the user never gave. */
export function ungroundedRefusal(ungrounded: Array<{ path: string; value: number }>): Record<string, unknown> {
  return {
    success: false,
    error: 'Not costed: these numbers were not given by the user — '
      + ungrounded.map(u => `${u.path} = ${u.value}`).join(', ')
      + '. The engine costs only numbers the user supplied (any unit). Ask the user for them, or leave an optional '
      + 'one out so the engine uses its own default. Do not estimate them yourself.',
  };
}

/**
 * Money and percentages in a model's PROSE that nobody gave it.
 *
 * A chat reply, a cost commentary or a DFM commentary is the model's text, and its prompt tells it to quote only the
 * figures it was handed. That is a request; this is the check (AI-number leak audit, Oct 2026): every £ / $ / € amount
 * and every percentage in the text must be one of the figures supplied (the user's words, the costing, the tool's
 * results, the rate book — in any common unit, `isGrounded`). The text is not rewritten — it is conversation — but the
 * figures that were not supplied are listed under it as the model's, so none of them reads as a tool figure.
 */
const PROSE_FIGURE_RE = /(?:[£$€₹¥]\s?(\d[\d,]*(?:\.\d+)?)\s*(k|m|bn)?\b)|(?:\b(\d[\d,]*(?:\.\d+)?)\s?%)/gi;

/**
 * A prose figure is grounded when it IS a supplied figure as written to its own precision ("£11" for £10.79, "42%"
 * for 41.7 %) — not through the unit factors `isGrounded` allows a form value, which let "£0.40" pass as "400 words"
 * ÷ 1000. A percentage may also be a supplied fraction × 100 (a margin of 0.08 quoted as "8%").
 */
function proseGrounded(v: number, decimals: number, given: number[], pct: boolean): boolean {
  if (v === 0) return true;
  const step = Math.pow(10, -decimals);
  return given.some(g => [g, ...(pct ? [g * 100] : [])].some(c =>
    Math.abs(Math.round(c / step) * step - v) <= 1e-9 * Math.max(1, v) || Math.abs(c - v) <= 0.005 * Math.max(c, v)));
}

export function ungroundedProseFigures(text: string, given: number[]): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PROSE_FIGURE_RE)) {
    const raw = (m[1] ?? m[3] ?? '').replace(/,/g, '');
    let v = parseFloat(raw);
    if (!Number.isFinite(v)) continue;
    let decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
    const mult = (m[2] ?? '').toLowerCase();
    const k = mult === 'k' ? 3 : mult === 'm' ? 6 : mult === 'bn' ? 9 : 0;
    v *= Math.pow(10, k); decimals -= k;
    if (proseGrounded(v, decimals, given, m[3] !== undefined)) continue;
    const tok = m[0].trim();
    if (!out.includes(tok)) out.push(tok);
  }
  return out;
}

/** The label appended under model prose that carries figures nobody supplied. */
export function modelFiguresNote(figures: string[]): string {
  return `[Model text — not a CostVision figure: ${figures.join(', ')} ${figures.length === 1 ? 'was' : 'were'} not in the `
    + 'costing, the rate book or what you supplied. AI never sets a price.]';
}

/** Append the label when the text carries unsupplied figures; returns the text and the figures. */
export function labelModelFigures(text: string, givenTexts: string[]): { text: string; ungrounded: string[] } {
  const ungrounded = ungroundedProseFigures(text, numbersIn(givenTexts));
  return { text: ungrounded.length ? `${text}\n\n${modelFiguresNote(ungrounded)}` : text, ungrounded };
}

/** A number written as a string ("0.45", "1,200") — the form fills it like a number, so it is grounded like one. */
export function numericString(v: unknown): number | null {
  if (typeof v !== 'string' || !/^\s*[-+]?(\d[\d,]*(\.\d+)?|\.\d+)\s*$/.test(v)) return null;
  const n = parseFloat(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Every number under a value — numbers and numeric strings — by path. */
export function numbersUnder(v: unknown, path: string, out: Array<{ path: string; value: number }> = []): Array<{ path: string; value: number }> {
  const s = numericString(v);
  if (typeof v === 'number') out.push({ path, value: v });
  else if (s !== null) out.push({ path, value: s });
  else if (Array.isArray(v)) v.forEach((x, i) => numbersUnder(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) numbersUnder(x, `${path}.${k}`, out);
  return out;
}
