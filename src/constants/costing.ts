// Shared costing constants — single source of truth for the currencies the
// should-cost engine supports and the cost-component palette, so the
// Should-Cost and Idea Studio views can never drift apart.

// GBP first — the app's default display currency (values FX-convert from the
// engine's EUR base). EUR/USD/CNY remain selectable for multi-region quoting.
export const CURRENCIES = ['GBP', 'EUR', 'USD', 'CNY'] as const;
export type Currency = typeof CURRENCIES[number];

export const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€', GBP: '£', USD: '$', CNY: '¥',
  CZK: 'Kč', MXN: 'MX$', INR: '₹', KRW: '₩', PLN: 'zł', RON: 'lei',
  TRY: '₺', MAD: 'DH', VND: '₫', THB: '฿', JPY: '¥', BRL: 'R$',
};
/** Every currency a supplier QUOTE may be in — mirrors FX_CURRENCIES in
 *  fx-rates.mjs (a test keeps the two in step). Display stays on CURRENCIES. */
export const QUOTE_CURRENCIES = ['EUR', 'GBP', 'USD', 'CNY', 'CZK', 'MXN', 'INR', 'KRW', 'PLN', 'RON', 'TRY', 'MAD', 'VND', 'THB', 'JPY', 'BRL'] as const;

// Keys mirror the deterministic engine's breakdown (costing-engine.mjs). `hex`
// drives recharts fills; `text`/`bar` are Tailwind classes for the bar view.
export interface CostComponentMeta {
  key: string;
  label: string;
  /** Fixed categorical slot (0-7) in lib/chart-theme, so an element keeps its
   *  colour whichever others are zero. null = the neutral "remainder" grey. */
  slot: number | null;
}

// Fallback catalogues used only until /api/should-cost/catalogue loads (which is
// derived from the engine). Kept here as the single client-side copy — mirror the
// engine's MATERIALS/PROCESSES/REGIONS when those change.
//
// FALLBACK_MATERIALS IS NOW EMPTY ON PURPOSE. It was a hand-typed copy of the
// engine's list and it had already drifted four materials behind before anyone
// noticed — Copper, Electrical Steel, EPDM and Glass were unreachable from any
// page that fell back to it. A short stale list is worse than none: it looks
// authoritative and silently hides materials the engine costs perfectly well.
// Callers now render nothing until the real list arrives, which is visible.
export const FALLBACK_MATERIALS: string[] = [];
export const FALLBACK_PROCESSES = ['Stamping / Deep Drawing', 'Roll Forming', 'Hydroforming', 'Laser Cutting + Bending', 'Die Casting (Aluminium)', 'Die Casting (Zinc)', 'Sand Casting', 'Investment Casting', 'Gravity Die Casting', 'Injection Moulding', 'Composite Layup (RTM)', 'Forging (Hot)', 'Forging (Cold)', 'Machining (CNC)', 'Extrusion', 'MIG Welding Assembly', 'Resistance Spot Welding'];
export const FALLBACK_REGIONS = ['Germany', 'UK', 'Czech Republic', 'Spain', 'Mexico', 'USA', 'China', 'India', 'Korea'];

export const COST_COMPONENTS: CostComponentMeta[] = [
  // Nine elements, eight validated hues: the ninth (SG&A / Profit, the
  // non-manufacturing remainder) is the neutral grey rather than a generated
  // hue (DECISIONS 123).
  { key: 'material',   label: 'Material',            slot: 0 },
  { key: 'machine',    label: 'Machine',             slot: 1 },
  { key: 'labour',     label: 'Labour',              slot: 2 },
  { key: 'setup',      label: 'Setup',               slot: 3 },
  { key: 'finishing',  label: 'Finishing / 2nd ops', slot: 4 },
  { key: 'tooling',    label: 'Tooling (amort.)',    slot: 5 },
  { key: 'overhead',   label: 'Overhead',            slot: 6 },
  { key: 'commercial', label: 'Packaging / freight', slot: 7 },
  { key: 'sgaProfit',  label: 'SG&A / Profit',       slot: null },
];
