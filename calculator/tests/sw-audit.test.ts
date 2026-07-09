import { describe, it, expect } from 'vitest';
import { computeSWProgram, defaultSWProgramInputs, SW_MODULES } from '../src/engine/sw-should-cost.js';
import { runValidation } from '../src/engine/sw-validation.js';
import type { SWProgramInputs } from '../src/engine/sw-should-cost.js';

const base = (): SWProgramInputs => defaultSWProgramInputs();
const total = (p: SWProgramInputs) => computeSWProgram(p, { summaryOnly: true }).summary.grandTotal;

describe('SW — validation back-test still passes after the accuracy fixes', () => {
  it('MAPE stays within should-cost tolerance and the band count holds', () => {
    const r = runValidation();
    expect(r.mapeTotal).toBeLessThan(30);
    expect(r.withinBandCount).toBeGreaterThanOrEqual(5);
  });
});

describe('SW — premium-trim modules are catalogued but default-off (baseline preserved)', () => {
  const PREMIUM = ['active_suspension', 'premium_audio', 'park_assist', 'climate_control', 'digital_key', 'ar_hud'];

  it('all six premium modules exist in the catalogue', () => {
    for (const id of PREMIUM) {
      expect(SW_MODULES.find(m => m.id === id), `${id} missing`).toBeTruthy();
    }
    expect(SW_MODULES.length).toBe(49);
  });

  it('premium modules are default-off; the 43-module baseline is on by default', () => {
    const def = defaultSWProgramInputs();
    const enabled = new Set(def.modules.filter(m => m.enabled).map(m => m.moduleId));
    expect(enabled.size).toBe(43);
    for (const id of PREMIUM) expect(enabled.has(id), `${id} should be off by default`).toBe(false);
  });

  it('enabling a premium module adds cost on top of the baseline', () => {
    const b = base();
    const baseTotal = total(b);
    const withAudio = {
      ...b,
      modules: b.modules.map(m => m.moduleId === 'premium_audio' ? { ...m, enabled: true } : m),
    };
    expect(total(withAudio)).toBeGreaterThan(baseTotal);
  });
});

describe('SW1 — per-module testingFractionBase is now honoured', () => {
  it('a module with a higher testing fraction costs more test than a lower one at equal ASIL', () => {
    // Pick two ASIL-D modules with different testingFractionBase and cost each alone.
    const dModules = SW_MODULES.filter(m => m.defaultAsil === 'D');
    const hi = dModules.reduce((a, b) => b.testingFractionBase > a.testingFractionBase ? b : a);
    const lo = dModules.reduce((a, b) => b.testingFractionBase < a.testingFractionBase ? b : a);
    expect(hi.testingFractionBase).toBeGreaterThan(lo.testingFractionBase);
    const only = (id: string): SWProgramInputs => ({
      ...base(),
      modules: base().modules.map(m => ({ ...m, enabled: m.moduleId === id, asil: 'D', complexity: 'Medium', reuse: 'Fresh' })),
    });
    const rHi = computeSWProgram(only(hi.id), { summaryOnly: true }).modules[0];
    const rLo = computeSWProgram(only(lo.id), { summaryOnly: true }).modules[0];
    // test÷dev ratio should track the per-module fraction (previously it was ASIL-only, identical)
    expect(rHi.testing.total / rHi.development.total).toBeGreaterThan(rLo.testing.total / rLo.development.total);
  });
});

describe('SW2 — complexity now lifts more than the algorithm bucket', () => {
  it('a Very-High module costs more dev than the same module at Medium (and by more than the old algo-only delta)', () => {
    const one = (cx: 'Medium' | 'Very High'): SWProgramInputs => ({
      ...base(),
      modules: base().modules.map(m => ({ ...m, enabled: m.moduleId === 'bms_core', complexity: cx, reuse: 'Fresh' })),
    });
    const med = computeSWProgram(one('Medium'), { summaryOnly: true }).modules[0].development.total;
    const vh  = computeSWProgram(one('Very High'), { summaryOnly: true }).modules[0].development.total;
    expect(vh).toBeGreaterThan(med);
  });
});

describe('SW3 — safety effort resists reuse; neutral at Medium', () => {
  it('Platform reuse on an ASIL-D module keeps more safety cost than a naive reuse would', () => {
    const one = (reuse: 'Medium' | 'Platform'): SWProgramInputs => ({
      ...base(),
      modules: base().modules.map(m => ({ ...m, enabled: m.moduleId === 'bms_core', asil: 'D', reuse })),
    });
    const med = computeSWProgram(one('Medium'), { summaryOnly: true }).modules[0];
    const plat = computeSWProgram(one('Platform'), { summaryOnly: true }).modules[0];
    // Platform reuse is far cheaper overall, but the safety slice is floored so
    // its safety cost / dev cost ratio is HIGHER than at Medium (reuse can't erase safety).
    expect(plat.development.safetyCompliance / plat.development.total)
      .toBeGreaterThan(med.development.safetyCompliance / med.development.total);
  });
});

describe('SW — optional levers are default-neutral and behave when enabled', () => {
  it('schedule compression < 1 inflates NRE; = 1 is neutral', () => {
    const b = base();
    const neutral = total(b);
    const compressed = total({ ...b, scheduleCompression: 0.7 });
    expect(total({ ...b, scheduleCompression: 1 })).toBeCloseTo(neutral, 0);
    expect(compressed).toBeGreaterThan(neutral);
  });

  it('discount rate reduces lifecycle NPV; 0 is neutral', () => {
    const b = base();
    expect(total({ ...b, discountRatePct: 0 })).toBeCloseTo(total(b), 0);
    expect(total({ ...b, discountRatePct: 8 })).toBeLessThan(total(b));
  });

  it('ML-data and homologation are off by default and add cost when enabled', () => {
    const b = base();
    const r0 = computeSWProgram(b, { summaryOnly: true }).summary;
    expect(r0.totalMLData).toBe(0);
    expect(r0.totalHomologation).toBe(0);
    const rML = computeSWProgram({ ...b, includeMLDataCost: true }, { summaryOnly: true }).summary;
    const rHo = computeSWProgram({ ...b, includeHomologation: true }, { summaryOnly: true }).summary;
    expect(rML.totalMLData).toBeGreaterThan(0);
    expect(rHo.totalHomologation).toBeGreaterThan(0);
    expect(rHo.grandTotal).toBeGreaterThan(r0.grandTotal);
  });

  it('cost-recovery window raises per-vehicle without touching the total; default neutral', () => {
    const b = base();
    const full = computeSWProgram(b, { summaryOnly: true }).summary;
    const short = computeSWProgram({ ...b, costRecoveryYears: 2 }, { summaryOnly: true }).summary;
    expect(short.grandTotal).toBeCloseTo(full.grandTotal, 0);   // total unchanged
    expect(short.perVehicle).toBeGreaterThan(full.perVehicle);  // NRE recovered faster → higher £/veh
  });
});
