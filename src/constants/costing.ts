// Shared costing constants — single source of truth for the currencies the
// should-cost engine supports and the cost-component palette, so the
// Should-Cost and Idea Studio views can never drift apart.

// GBP first — the app's default display currency (values FX-convert from the
// engine's EUR base). EUR/USD/CNY remain selectable for multi-region quoting.
export const CURRENCIES = ['GBP', 'EUR', 'USD', 'CNY'] as const;
export type Currency = typeof CURRENCIES[number];

export const CURRENCY_SYMBOLS: Record<string, string> = { EUR: '€', GBP: '£', USD: '$', CNY: '¥' };

// Keys mirror the deterministic engine's breakdown (costing-engine.mjs). `hex`
// drives recharts fills; `text`/`bar` are Tailwind classes for the bar view.
export interface CostComponentMeta {
  key: string;
  label: string;
  hex: string;
  text: string;
  bar: string;
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
  { key: 'material',   label: 'Material',         hex: '#3b82f6', text: 'text-blue-400',    bar: 'bg-blue-500' },
  { key: 'machine',    label: 'Machine',          hex: '#a855f7', text: 'text-purple-400',  bar: 'bg-purple-500' },
  { key: 'labour',     label: 'Labour',           hex: '#ec4899', text: 'text-pink-400',    bar: 'bg-pink-500' },
  { key: 'setup',      label: 'Setup',            hex: '#06b6d4', text: 'text-cyan-400',    bar: 'bg-cyan-500' },
  { key: 'finishing',  label: 'Finishing / 2nd ops', hex: '#14b8a6', text: 'text-teal-400', bar: 'bg-teal-500' },
  { key: 'tooling',    label: 'Tooling (amort.)', hex: '#6366f1', text: 'text-indigo-400',  bar: 'bg-indigo-500' },
  { key: 'overhead',   label: 'Overhead',         hex: '#f59e0b', text: 'text-amber-400',   bar: 'bg-amber-500' },
  { key: 'commercial', label: 'Packaging / freight', hex: '#f97316', text: 'text-orange-400', bar: 'bg-orange-500' },
  { key: 'sgaProfit',  label: 'SG&A / Profit',    hex: '#10b981', text: 'text-emerald-400', bar: 'bg-emerald-500' },
];
