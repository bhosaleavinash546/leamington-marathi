/**
 * Phase 2 · F-25 (polish): the record panel's "Original costing analysis" heading shows only when there is an
 * analysis to show (an eight-bucket breakdown or operations). A costing saved without one gets one line instead of
 * an empty heading. The commodity is printed by its display name (the same COMMODITY_REPORT_LABELS the record's own
 * Commodity field uses — "Pressed sheet metal"), never the raw id "sheet_metal". Imported records keep their
 * "Original costing" note (it names the source tool and record).
 */
import { describe, it, expect } from 'vitest';
import { costingAnalysisHtml } from '../src/ui/kpi-dashboard/kpi-view';

const api = { sourceTool: 'CostVision', sourceRef: 'sc-a4' };
const imp = { sourceTool: 'CSS System', sourceRef: 'CSS-100' };

describe('F-25: record panel — original costing analysis', () => {
  it('a costing saved with a total only: no empty heading, one line, the display name', () => {
    const html = costingAnalysisHtml({ commodity: 'sheet_metal', region: 'UK', result: { total: 6.1 } }, api);
    expect(html).not.toContain('Original costing analysis');
    expect(html).not.toContain('<h3');
    expect(html).toContain('No cost breakdown was saved with this costing');
    expect(html).toContain('Pressed sheet metal, UK');
    expect(html).not.toContain('sheet_metal');
  });
  it('a costing with a breakdown keeps the heading and the table, with the display name', () => {
    const html = costingAnalysisHtml({ commodity: 'injection_moulding', region: 'CN', result: { total: 10, breakdown: { rawMaterial: 4, process: 2, labour: 1, tooling: 0.5, packaging: 0.25, logistics: 0.25, overhead: 1, margin: 1 } } }, api);
    expect(html).toContain('<h3>Original costing analysis</h3>');
    expect(html).toContain('(Injection moulding, CN)');
    expect(html).not.toContain('injection_moulding');
    expect(html).toContain('<th scope="row">Material</th><td class="num">£4.00</td>');
    expect(html).toContain('<th scope="row">Should-cost</th><td class="num">£10.00</td>');
  });
  it('operations alone are an analysis too', () => {
    const html = costingAnalysisHtml({ commodity: 'machining', region: 'UK', result: { total: 3, operationDetails: [{ name: 'Mill', cost: 3 }] } }, api);
    expect(html).toContain('<h3>Original costing analysis</h3>');
    expect(html).toContain('(Machining, UK)');
    expect(html).toContain('Operations (1)');
  });
  it('an unknown commodity id is printed as it is, escaped', () => {
    const html = costingAnalysisHtml({ commodity: '<b>x</b>', region: 'UK', result: { total: 1 } }, api);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;, UK');
  });
  it('an imported record keeps its source note; a CostVision record with no costing shows nothing', () => {
    const html = costingAnalysisHtml(null, imp);
    expect(html).toContain('<h3>Original costing</h3>');
    expect(html).toContain('imported from <strong>CSS System</strong>');
    expect(costingAnalysisHtml(null, api)).toBe('');
  });
});
