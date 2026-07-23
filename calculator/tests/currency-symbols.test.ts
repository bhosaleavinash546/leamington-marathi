import { describe, it, expect } from 'vitest';
import { CURRENCY_SYMBOL, currencySymbol, FX_TO_GBP } from '../src/engine/insights.js';

describe('currency symbol map (single source of truth for UI + exports)', () => {
  it('has a display symbol for EVERY convertible currency (no bare-code fallback in reports)', () => {
    // The export layer previously carried partial 5-entry copies, so 7 selectable
    // currencies rendered as a raw code ("THB80.13"). Guard that the canonical map
    // covers every FX rate the currency selector can pick.
    for (const code of Object.keys(FX_TO_GBP)) {
      expect(CURRENCY_SYMBOL[code], `missing symbol for ${code}`).toBeTruthy();
      expect(CURRENCY_SYMBOL[code]).not.toBe(code); // a real symbol, not the code itself
    }
  });

  it('currencySymbol() returns the mapped symbol, and a spaced code only for unknowns', () => {
    expect(currencySymbol('CNY')).toBe('¥');
    expect(currencySymbol('THB')).toBe('฿');
    expect(currencySymbol('BRL')).toBe('R$');
    expect(currencySymbol('ZZZ')).toBe('ZZZ '); // unknown → code + space, never a wrong symbol
  });
});
