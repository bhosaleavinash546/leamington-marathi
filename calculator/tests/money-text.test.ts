/**
 * Demo review (10 Oct 2026): a China / India report printed the explanatory text in £ ("die £3,056", "blast machine
 * £8.61/h", "capex £22,394") beside ¥ / ₹ totals. The report text now follows the report's currency.
 */
import { describe, it, expect } from 'vitest';
import { localiseGbpText, localiseRuleValue } from '../src/export/money-text.js';

describe('money inside report text follows the report currency', () => {
  it('converts amounts, ranges and units; keeps an FX quote; leaves a £ report alone', () => {
    expect(localiseGbpText('blast machine £8.61/h + operator £3.57/h, min £0.10', 8.88, '¥'))
      .toBe('blast machine ¥76.46/h + operator ¥31.70/h, min ¥0.89');
    expect(localiseGbpText('a complex multi-core (£2–8)', 8.88, '¥')).toBe('a complex multi-core (¥18–71)');
    expect(localiseGbpText('capex £22,394 at £0.071/kWh, priced in £/kg', 8.88, '¥')).toBe('capex ¥198,859 at ¥0.630/kWh, priced in ¥/kg');
    expect(localiseGbpText('the grade premium in £/kg at ¥8.88/£', 8.88, '¥')).toBe('the grade premium in ¥/kg at ¥8.88/£');
    expect(localiseGbpText('die £3,056', 1, '£')).toBe('die £3,056');
  });
  it('Poland live review: a whole-£ amount keeps its pence; a book note\'s "(£…)" bracket is not repeated', () => {
    // "2D X-ray at £5 a part × 0.4957" printed "zł25 … = 12.64" — 25 × 0.4957 is 12.39; the figure is 25.48
    expect(localiseGbpText('2D X-ray at £5 a part', 5.096, 'zł')).toBe('2D X-ray at zł25.48 a part');
    expect(localiseGbpText('die £3,056', 5.096, 'zł')).toBe('die zł15,573');
    // the country book writes "zł196,420 (£38,544)"; converted it read "zł196,420 (zł196,420)"
    expect(localiseGbpText('capex zł196,420 (£38,544) and zł240.60 (£47.21)/m²/yr', 5.096, 'zł')).toBe('capex zł196,420 and zł240.60/m²/yr');
    // a £ report keeps both
    expect(localiseGbpText('capex zł196,420 (£38,544)', 1, '£')).toBe('capex zł196,420 (£38,544)');
  });
  it('a rule field in £ is converted and relabelled; other fields are untouched', () => {
    expect(localiseRuleValue('Die Cost (£)', '3056', 8.88, '¥')).toEqual({ label: 'Die Cost (¥)', value: '27,137' });
    expect(localiseRuleValue('Heat Treatment (£/kg) ⓘ', '0.144', 127.2, '₹')).toEqual({ label: 'Heat Treatment (₹/kg) ⓘ', value: '18.32' });
    expect(localiseRuleValue('Batch Size', '5000', 8.88, '¥')).toEqual({ label: 'Batch Size', value: '5000' });
    expect(localiseRuleValue('Die Cost (£)', '3056', 1, '£')).toEqual({ label: 'Die Cost (£)', value: '3056' });
  });
});
