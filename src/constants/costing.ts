// Shared costing constants — single source of truth for the currencies the
// should-cost engine supports and the cost-component palette, so the
// Should-Cost and Idea Studio views can never drift apart.

export const CURRENCIES = ['EUR', 'GBP', 'USD', 'CNY'] as const;
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

export const COST_COMPONENTS: CostComponentMeta[] = [
  { key: 'material',  label: 'Material',         hex: '#3b82f6', text: 'text-blue-400',    bar: 'bg-blue-500' },
  { key: 'machine',   label: 'Machine',          hex: '#a855f7', text: 'text-purple-400',  bar: 'bg-purple-500' },
  { key: 'labour',    label: 'Labour',           hex: '#ec4899', text: 'text-pink-400',    bar: 'bg-pink-500' },
  { key: 'setup',     label: 'Setup',            hex: '#06b6d4', text: 'text-cyan-400',    bar: 'bg-cyan-500' },
  { key: 'tooling',   label: 'Tooling (amort.)', hex: '#6366f1', text: 'text-indigo-400',  bar: 'bg-indigo-500' },
  { key: 'overhead',  label: 'Overhead',         hex: '#f59e0b', text: 'text-amber-400',   bar: 'bg-amber-500' },
  { key: 'sgaProfit', label: 'SG&A / Profit',    hex: '#10b981', text: 'text-emerald-400', bar: 'bg-emerald-500' },
];
