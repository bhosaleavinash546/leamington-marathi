/**
 * Delivery terms (country review, Oct 2026): an ex-works (EXW) price is the price at the supplier's gate — packaging
 * in, freight out. The screen, headless costing and the route comparison read the same shop defaults, so EXW must
 * give logistics 0 on every path, and the reports must say which terms the price is on.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { regionalShopDefaults, shopDefaultsBasis, deliveryTermsLine } from '../src/engine/regional-rates.js';
import { notIncludedFor } from '../src/ui/cad-workspace.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';

const UK = recomputeMachineRates(DEFAULT_RATE_LIBRARY);

describe('delivery terms', () => {
  it('EXW: logistics 0, packaging and overhead unchanged; DAP is the default', () => {
    for (const r of ['UK', 'CN', 'IN', 'PL', 'HU'] as const) {
      const dap = regionalShopDefaults(r, { packagingPerPart: 0.4, logisticsPerPart: 0.6 });
      const exw = regionalShopDefaults(r, { packagingPerPart: 0.4, logisticsPerPart: 0.6 }, 'EXW');
      expect(dap.logisticsPerPart).toBeGreaterThan(0);
      expect(exw.logisticsPerPart).toBe(0);
      expect(exw.packagingPerPart).toBe(dap.packagingPerPart);
      expect(exw.overheadPct).toBe(dap.overheadPct);
    }
  });

  it('the basis and terms lines say what the price carries', () => {
    expect(deliveryTermsLine('EXW')).toMatch(/Ex-works .*freight to your plant NOT included/);
    expect(deliveryTermsLine(undefined)).toMatch(/Delivered to your plant/);
    expect(shopDefaultsBasis('HU', 'EXW')).toMatch(/Ex-works: no freight in the price/);
    expect(shopDefaultsBasis('HU', 'EXW')).not.toMatch(/delivery to the UK/);
    expect(shopDefaultsBasis('HU')).toMatch(/delivery to the UK/);
    expect(notIncludedFor('casting', null, 'EXW').join(' ')).toMatch(/ex-works \(EXW\)/);
  });

  it('headless: a real part ex-works carries no logistics and costs less by exactly the freight it dropped', async () => {
    const baseline = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as
      { part: string; answers: Record<string, string>; geometry: never; outcome: { commodity?: string } }[];
    const p = baseline.find(x => x.part === 'BIW_Inner_Panel.stp')!;
    const run = (terms?: 'EXW') => costMeasuredPart(p.geometry, p.part, { partNumber: p.part, file: p.part, annualVolume: 50_000,
      ...(p.outcome.commodity ? { commodity: p.outcome.commodity } : {}) },
    p.answers, 'HU', { annualVolume: 50_000, ...(terms ? { deliveryTerms: terms } : {}) }, UK, { partNumber: p.part, file: p.part, status: 'error' });
    const dap = await run(), exw = await run('EXW');
    expect(dap.status).toBe('costed');
    expect(exw.status).toBe('costed');
    expect(exw.breakdown!.logistics).toBe(0);
    expect(dap.breakdown!.logistics).toBeGreaterThan(0);
    for (const k of ['rawMaterial', 'process', 'labour', 'tooling', 'packaging', 'overhead'] as const) {
      expect(exw.breakdown![k], k).toBeCloseTo(dap.breakdown![k], 9);
    }
    // the margin is on the subtotal, so the total drops by the freight plus its margin — never more
    expect(exw.total!).toBeLessThan(dap.total!);
    expect(dap.total! - exw.total!).toBeGreaterThanOrEqual(dap.breakdown!.logistics - 1e-9);
    // the stack rounds each bucket to 4 dp, so the two totals agree to £0.0002
    expect(dap.total! - exw.total!).toBeCloseTo(dap.breakdown!.logistics + (dap.breakdown!.margin - exw.breakdown!.margin), 3);
  });

  it('the screen reads the terms in ONE place and the route comparison and reports carry them', () => {
    const main = readFileSync('src/ui/main.ts', 'utf8');
    expect(main).toMatch(/logisticsPerPart: exw \? 0 : num\('logistics'\)/);
    expect(main).toMatch(/body\['deliveryTerms'\] = 'EXW'/);
    expect(readFileSync('server/routes/cad.ts', 'utf8')).toMatch(/req\.body\?\.deliveryTerms === 'EXW'/);
    expect(readFileSync('src/export/pdf.ts', 'utf8')).toMatch(/'Delivery terms', \{ content: deliveryTermsLine\(input\.deliveryTerms\)/);
    expect(readFileSync('src/export/excel.ts', 'utf8')).toMatch(/\['Delivery terms', deliveryTermsLine\(input\.deliveryTerms\)\]/);
    expect(readFileSync('index.html', 'utf8')).toMatch(/id="delivery-terms"/);
  });
});
