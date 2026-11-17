/**
 * Phase 2 · F-21 (polish): the opportunity card states its base — "x of y eligible records above should-cost" —
 * the same eligible count the weighted-gap card shows, so a reader sees how many records the sum is taken over.
 */
import { describe, it, expect } from 'vitest';
import { financialCardsHtml } from '../src/ui/kpi-dashboard/kpi-builders';
import type { DashboardSummary } from '../src/engine/kpi-dashboard';

const fin = (eligible: number, oppN: number) => ({
  financial: {
    eligible, sumCurrentGbp: 100, sumShouldGbp: 90, sumGapGbp: 10, weightedGapPct: 10,
    opportunity: { n: oppN, gbp: 12.5 }, unfavourable: { n: 0, gbp: 0 }, annualised: { n: 0, gbp: 0 },
    validatedSavings: { n: 0, gbp: 0 }, implementedSavings: { n: 0, gbp: 0 },
  },
}) as unknown as DashboardSummary;
const card = (html: string, id: string) => html.slice(html.indexOf(`data-card="${id}"`), html.indexOf('</article>', html.indexOf(`data-card="${id}"`)));
const sub = (html: string, id: string) => (card(html, id).match(/<div class="kd-card-s">([\s\S]*?)(<span class="kd-card-x"|<\/div>)/)?.[1] ?? '').trim();

describe('F-21: the opportunity card shows "x of y eligible"', () => {
  it('names the eligible base the gap card uses', () => {
    const html = financialCardsHtml(fin(5, 3));
    expect(sub(html, 'opportunity')).toBe('3 of 5 eligible records above should-cost · per piece, summed');
    expect(sub(html, 'gap-pct')).toContain('5 eligible records');
  });
  it('singular and zero cases read correctly', () => {
    expect(sub(financialCardsHtml(fin(1, 1)), 'opportunity')).toBe('1 of 1 eligible record above should-cost · per piece, summed');
    expect(sub(financialCardsHtml(fin(4, 0)), 'opportunity')).toBe('0 of 4 eligible records above should-cost · per piece, summed');
    expect(sub(financialCardsHtml(fin(0, 0)), 'opportunity')).toBe('0 of 0 eligible records above should-cost · per piece, summed');
  });
});
