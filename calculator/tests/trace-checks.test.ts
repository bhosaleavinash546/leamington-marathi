/**
 * The live harness's predicates, each proven able to FAIL (country review, 30 Oct 2026: a crossover check compared a
 * money string with 0 and never ran). A predicate with no failing case here is not a check.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { money, samePenny, costedAlternatives, crossoverStated, near, marginTyped } from '../e2e/trace-checks.js';

describe('live-harness predicates', () => {
  it('money reads every display currency and nothing else', () => {
    expect(money('£1,234.56')).toBe('1,234.56');
    expect(money('Ft5,348.85 ± 15%')).toBe('5,348.85');
    // the world round's currencies (Czech Kč was read as nothing, failing 30 checks a country)
    expect(money('Kč374.31± 15%')).toBe('374.31');
    expect(money('lei56.14')).toBe('56.14');
    expect(money('JP¥2,178.96')).toBe('2,178.96');
    expect(money('R$21.86')).toBe('21.86');
    expect(money('₫60,509.17')).toBe('60,509.17');
    expect(money('kr445.26')).toBe('445.26');
    expect(money('Standard 12.30')).toBe('');   // no symbol, no amount
    expect(money('zł53.32')).toBe('53.32');
    expect(money('¥4.53')).toBe('4.53');
    expect(money('₹853.16')).toBe('853.16');
    expect(money('no money here 12')).toBe('');
  });
  it('samePenny passes the same costing and FAILS a different one — in £, whatever the display currency', () => {
    expect(samePenny('£1.29', '£1.29')).toBe(true);
    expect(samePenny('£1.29', '£1.30')).toBe(false);
    expect(samePenny('Ft5,348.87', 'Ft5,348.85', 437.75)).toBe(true);     // 2 fillér = £0.00005
    expect(samePenny('Ft5,348.85', 'Ft5,353.85', 437.75)).toBe(false);    // Ft5 = £0.011
    expect(samePenny('', '£1.29')).toBe(false);
  });
  it('the crossover check counts only real routes and FAILS when an alternative states none', () => {
    const buildUpOnly = '<table><tbody><tr><th>Material</th><td>£2.55</td></tr><tr><th>Process</th><td>£0.13</td></tr></tbody></table>';
    expect(costedAlternatives(buildUpOnly)).toBe(0);
    expect(crossoverStated(buildUpOnly)).toBe(true);
    const altNoCross = '<tr><th>Casting</th><td>£5.09</td></tr><button data-cost-route="casting">Cost this route</button>';
    expect(costedAlternatives(altNoCross)).toBe(1);
    expect(crossoverStated(altNoCross)).toBe(false);
    expect(crossoverStated(altNoCross + '<div class="cad-compare-cross">cheaper at every volume</div>')).toBe(true);
    // the comparison renderer still marks a costed alternative the way the predicate reads it
    expect(readFileSync('src/ui/cad-workspace.ts', 'utf8')).toMatch(/data-cost-route="\$\{esc\(r\.route\)\}"/);
    expect(readFileSync('src/ui/cad-workspace.ts', 'utf8')).toMatch(/class="cad-compare-cross"/);
  });
  it('near scales a £ tolerance to the display currency and FAILS beyond it', () => {
    expect(near(102.9689, 102.9810, 0.0006, 437.75)).toBe(true);
    expect(near(102.9689, 103.5, 0.0006, 437.75)).toBe(false);
    expect(near(0.2352, 0.2353)).toBe(true);
    expect(near(0.2352, 0.2362)).toBe(false);
  });
});

describe('marginTyped', () => {
  it('reads the typed margin at the end of the Basis row, past the "(% of subtotal)" in its name', () => {
    // the first fix stopped at that "%" ([^%]*10%) and never matched — SI / LT grommet read nothing
    expect(marginTyped('Typed Supplier margin (% of subtotal) 10%', 10)).toBe(true);
    expect(marginTyped('  Typed  Supplier margin (% of subtotal)\n 10% ', 10)).toBe(true);
    expect(marginTyped('Typed Supplier margin (% of subtotal) 8%', 10)).toBe(false);
    expect(marginTyped('Typed Supplier margin (% of subtotal) 110%', 10)).toBe(false);
    expect(marginTyped('Default Supplier margin (% of subtotal) 10%', 10)).toBe(false);
  });
});

