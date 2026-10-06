/**
 * ONE CHART THEME FOR THE WHOLE PRODUCT.
 *
 * The charts used to pick their own colours: ~15 Tailwind pastels across four
 * files, a different hue for every bar of a single series (so colour implied a
 * meaning it did not carry), dashed grids, and figures printed in the series
 * colour. This is the house data-viz palette, validated rather than eyeballed
 * (dataviz skill, scripts/validate_palette.js) against OUR card surfaces —
 * navy-900 #111827 in dark, #FFFFFF in light:
 *
 *   light: lightness band, chroma, CVD (worst adjacent ΔE 9.1), normal-vision
 *          (19.6) all PASS; three hues sit below 3:1 on white, so every chart
 *          that uses them carries visible value labels or a valued legend.
 *   dark:  all checks PASS, every hue >= 3:1 on #111827.
 *
 * Rules the components keep:
 *   - a single series is ONE colour (`accent`); the category is on the axis;
 *   - categorical slots are assigned in this fixed order, never cycled — a
 *     ninth category folds into "Other";
 *   - text never wears a series colour: ink / ink2 / muted only;
 *   - status colours are for state (break-even, loss), never for a series.
 */
export const CATEGORICAL = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark:  ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
} as const;

export const STATUS = { good: '#0ca30c', warning: '#fab219', critical: '#d03b3b' } as const;

export interface ChartTheme {
  isDark: boolean;
  series: readonly string[];
  /** The one colour of a single-series chart (categorical slot 1). */
  accent: string;
  /** The area wash under a line: the accent at ~10%. */
  wash: string;
  surface: string;
  grid: string;
  baseline: string;
  ink: string;
  ink2: string;
  muted: string;
  tooltipBg: string;
  tooltipBorder: string;
  /** Recharts hover band behind a bar. */
  cursor: string;
  font: string;
}

export function chartTheme(isDark: boolean): ChartTheme {
  return isDark ? {
    isDark, series: CATEGORICAL.dark, accent: CATEGORICAL.dark[0], wash: 'rgba(57,135,229,0.12)',
    surface: '#111827', grid: '#1f2937', baseline: '#374151',
    ink: '#f9fafb', ink2: '#cbd5e1', muted: '#8b95a7',
    tooltipBg: '#1a2235', tooltipBorder: 'rgba(255,255,255,0.10)', cursor: 'rgba(255,255,255,0.04)',
    font: 'IBM Plex Sans, system-ui, sans-serif',
  } : {
    isDark, series: CATEGORICAL.light, accent: CATEGORICAL.light[0], wash: 'rgba(42,120,214,0.10)',
    surface: '#ffffff', grid: '#e8eaee', baseline: '#c9ced6',
    ink: '#111827', ink2: '#4b5563', muted: '#6b7280',
    tooltipBg: '#ffffff', tooltipBorder: 'rgba(17,24,39,0.12)', cursor: 'rgba(17,24,39,0.04)',
    font: 'IBM Plex Sans, system-ui, sans-serif',
  };
}


/** The colour of a fixed slot; null → the neutral remainder grey. */
export function slotColor(slot: number | null, t: ChartTheme): string {
  return slot === null ? (t.isDark ? '#6b7280' : '#9ca3af') : t.series[slot % t.series.length];
}

/** Categorical colours for N categories in fixed order; past 8 the caller folds into "Other". */
export function categoricalFor(n: number, t: ChartTheme): string[] {
  return t.series.slice(0, Math.min(n, t.series.length));
}

/** Keep the top `max - 1` items and fold the rest into "Other" (summed). */
export function foldOther<T extends { name: string; value: number }>(items: T[], max: number): Array<{ name: string; value: number }> {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  if (sorted.length <= max) return sorted.map(({ name, value }) => ({ name, value }));
  const head = sorted.slice(0, max - 1).map(({ name, value }) => ({ name, value }));
  const rest = sorted.slice(max - 1).reduce((s, x) => s + x.value, 0);
  return [...head, { name: 'Other', value: rest }];
}

/**
 * Clean axis ticks: 0 to a "nice" max in steps of 1, 2, 2.5 or 5 × 10^n, so an
 * axis reads £0 / £500k / £1.0M / £1.5M rather than £350k / £700k / £1.1M.
 */
export function niceTicks(max: number, intervals = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / intervals;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? 10 * mag;
  const n = Math.ceil(max / step);
  return Array.from({ length: n + 1 }, (_, i) => +(i * step).toPrecision(12));
}
