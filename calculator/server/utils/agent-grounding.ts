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
  const ungrounded = leaves.filter(l => !isGrounded(l.value, given));
  const cleaned = { ...input } as Record<string, unknown>;
  const defaulted: string[] = [];
  for (const f of SHOP_FIELDS) {
    const v = cleaned[f];
    if (typeof v === 'number' && !isGrounded(v, given)) { delete cleaned[f]; defaulted.push(f); }
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
