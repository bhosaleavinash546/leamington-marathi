/**
 * The 360° camera board's live report (6 Oct 2026, £15.68, China, 250k, delivered UK) — every
 * gap it showed, pinned:
 *  - the classifier's ASIL-C with a RADAR rationale on a camera parts list was printed and costed
 *    (burn-in in the headline) → the ASIL guard (pcb-asil-guard.ts);
 *  - the report body was the machined-part one (weight 0 kg, "Virtual / Pass-through", empty
 *    operations and machine rates, China £1.79 in a rescaled regional table, carbon 0, metal
 *    indexation) → the PCBA report (pcba-report-data.ts).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { runStage4 } from '../server/routes/pcb.js';
import { guardAsil, boardFunctionFromBom } from '../server/utils/pcb-asil-guard.js';
import { cleanBomImageRows } from '../server/utils/pcb-bom-image.js';
import { buildPcbaReport, priceSourceLabel } from '../src/export/pcba-report-data.js';

const CAM = JSON.parse(readFileSync('e2e/fixtures/pcb-camera-replies.json', 'utf8'));
const RADAR = JSON.parse(readFileSync('e2e/fixtures/pcb-radar-replies.json', 'utf8'));
/** What the classifier said about the camera board on the live run (from the user's report). */
const LIVE_RATIONALE = 'Automotive radar transceiver module with RF signal processing and power conditioning. 8-layer FR4 PCB with shielded inductor, ferrite transformer, and central QFN/BGA IC indicate high-frequency RF front-end for ADAS. RF signal integrity and electromagnetic compatibility critical for radar object detection and collision avoidance.';
const LIVE_FUNCTIONS = ['Radar target detection and range measurement', 'Velocity estimation via Doppler processing', 'Object classification and tracking'];

const ocr = (R: { ocr: Record<string, unknown> }) => ({ ...R.ocr, refDesGroups: [], connectors: [], boardText: [] }) as never;

async function camera(asil: 'ASIL-B' | 'ASIL-C', domain = 'automotive_adas') {
  const a = JSON.parse(JSON.stringify(CAM.analysis));
  const parsedBOM = cleanBomImageRows(CAM.bomImage.rows).lines;
  const s4 = await runStage4({ analysis: a, domain, asilLevel: asil, asilRationale: LIVE_RATIONALE, asilSafetyFunctions: LIVE_FUNCTIONS,
    ocrResult: ocr(CAM), country: 'cn', orderQty: 250_000, parsedBOM, tag: '/test' });
  return { a, s4 };
}

describe('ASIL guard — the classifier against the parts list', () => {
  it('reads the board function from the BOM', () => {
    expect(boardFunctionFromBom([{ description: 'Image sensor' }, { partNumber: 'DS90UB935TRHBRQ1', description: 'FPD-Link III Serializer' }])).toBe('camera');
    expect(boardFunctionFromBom(RADAR.analysis.bom)).toBe('radar');
    expect(boardFunctionFromBom([{ description: 'Ceramic capacitor' }])).toBe('unknown');
  });

  it('camera parts list + ASIL-C + a radar rationale: costed ASIL-B, rationale withheld, both stated', () => {
    const g = guardAsil({ asil: 'ASIL-C', rationale: LIVE_RATIONALE, safetyFunctions: LIVE_FUNCTIONS,
      bom: [{ description: 'Image sensor' }, { description: 'FPD-Link III Serializer With CSI-2 Interface', partNumber: 'DS90UB935-Q1' }, { description: 'LDO', partNumber: 'TLV70233-Q1' }] });
    expect(g.claimed).toBe('ASIL-C');
    expect(g.costed).toBe('ASIL-B');
    expect(g.rationale).toBe('');
    expect(g.safetyFunctions).toEqual([]);
    expect(g.notes.join(' ')).toMatch(/radar module.*camera board/);
    expect(g.notes.join(' ')).toMatch(/no safety PMIC/);
  });

  it('keeps ASIL-C where the hardware is there (radar: S32R + safety supervisor)', () => {
    const g = guardAsil({ asil: 'ASIL-C', rationale: 'Radar MCU with safety PMIC', bom: RADAR.analysis.bom });
    expect(g.costed).toBe('ASIL-C');
    expect(g.safetyHardware.length).toBeGreaterThan(0);
    expect(g.rationale).toMatch(/Radar/);
    expect(g.notes).toEqual([]);
  });

  it('a camera with a safety PMIC keeps its ASIL-C; ASIL-B and QM are never changed', () => {
    expect(guardAsil({ asil: 'ASIL-C', bom: [{ description: 'Image sensor' }, { partNumber: 'TLF35584QVVS2' }] }).costed).toBe('ASIL-C');
    expect(guardAsil({ asil: 'ASIL-B', bom: [{ description: 'Image sensor' }] }).costed).toBe('ASIL-B');
    expect(guardAsil({ asil: 'QM', bom: [{ description: 'Image sensor' }] }).costed).toBe('QM');
  });

  it('a consistent rationale is kept', () => {
    const g = guardAsil({ asil: 'ASIL-B', rationale: 'Surround-view camera module; image sensor and serializer', bom: [{ description: 'Image sensor' }] });
    expect(g.rationale).toMatch(/Surround-view/);
  });
});

describe('camera board, China, 250k — the live run through Stage 4', () => {
  let c: Awaited<ReturnType<typeof camera>>, b: Awaited<ReturnType<typeof camera>>;
  beforeAll(async () => { c = await camera('ASIL-C'); b = await camera('ASIL-B'); });

  it('the classifier\'s ASIL-C is costed as ASIL-B (no burn-in) and the response says why', () => {
    expect(c.s4.failed).toBe(false);
    expect(c.s4.asil?.claimed).toBe('ASIL-C');
    expect(c.s4.asil?.costed).toBe('ASIL-B');
    expect(c.s4.sanityWarnings.some(w => w.code === 'ASIL_CHECKED_AGAINST_BOM')).toBe(true);
    expect(c.s4.selectedCountryBreakdown!.automotiveGrade?.asil).toBe('ASIL-B');
    expect(c.s4.automotiveAssemblyCost?.burnInGBP ?? 0).toBe(0);
    // Identical to a run the classifier called ASIL-B in the first place.
    expect(c.s4.selectedCountryBreakdown!.totalPerBoard).toBeCloseTo(b.s4.selectedCountryBreakdown!.totalPerBoard, 2);
  });

  it('a "general" classifier still costs it automotive from the -Q1 parts', async () => {
    const g = await camera('ASIL-B', 'consumer_iot');
    expect(g.s4.domain).toBe('automotive_adas');
    expect(g.s4.sanityWarnings.some(w => w.code === 'AUTOMOTIVE_FROM_BOM')).toBe(true);
  });

  describe('the report built from it', () => {
    const analysis = () => ({
      ...c.a, _selectedCountryBreakdown: c.s4.selectedCountryBreakdown!, _countryComparison: c.s4.countryComparison,
      _confidenceBand: c.s4.confidenceBand ?? undefined, _sanityWarnings: c.s4.sanityWarnings,
      _asilLevel: c.s4.asil!.costed, _asilClaimed: c.s4.asil!.claimed, _asilNotes: c.s4.asil!.notes, _asilRationale: c.s4.asil!.rationale,
      _asilSafetyFunctions: c.s4.asil!.safetyFunctions, _boardFunction: c.s4.asil!.boardFunction, _automotiveNRE: c.s4.automotiveNRE ?? undefined,
      _orderQty: 250_000, stage1Classification: { domain: c.s4.domain },
    }) as never;

    it('the cost stack sums to the headline, which is the China row', () => {
      const rep = buildPcbaReport(analysis(), { annualVolume: 250_000 });
      const total = rep.stack.find(s => s.kind === 'total')!.amount;
      const sum = rep.stack.filter(s => !s.kind).reduce((t, s) => t + s.amount, 0);
      expect(sum).toBeCloseTo(total, 2);
      // Ex-works = everything above the subtotal; delivered = ex-works + freight + UK duty.
      const bd = c.s4.selectedCountryBreakdown!;
      const sub = rep.stack.findIndex(s => s.kind === 'sub');
      expect(rep.stack[sub].amount).toBe(rep.exWorks);
      expect(rep.exWorks).toBeCloseTo(bd.totalPerBoard - bd.logisticsPerBoard, 2);
      expect(rep.stack.slice(0, sub).reduce((t, s) => t + s.amount, 0)).toBeCloseTo(rep.exWorks, 2);
      expect(rep.stack.slice(sub + 1, -1).reduce((t, s) => t + s.amount, 0)).toBeCloseTo(bd.logisticsPerBoard, 2);
      for (const r of rep.countries) expect(r.exWorks + r.logistics).toBeCloseTo(r.total, 2);
      expect(total).toBe(c.s4.selectedCountryBreakdown!.totalPerBoard);
      expect(rep.countries.find(r => r.selected)!.total).toBe(total);
      expect(rep.country).toMatch(/China/);
      expect(rep.basis).toMatch(/delivered to the UK, import duty paid/);
    });

    it('the BOM is the components only (no PCB / ASM pseudo-lines) and reconciles to the components row', () => {
      const rep = buildPcbaReport(analysis(), { annualVolume: 250_000 });
      expect(rep.bom.length).toBe(c.a.bom.length);
      expect(rep.bom.some(l => /^(PCB|ASM)$/.test(l.ref))).toBe(false);
      expect(rep.bomPieces).toBe(c.a.bom.reduce((t: number, l: { qty: number }) => t + l.qty, 0));
      expect(rep.bomTotal).toBeCloseTo(rep.componentsAtCost, 2);
      expect(rep.bomReconciliation).toMatch(/the components row of §1/);
      // No line of this BOM has a designator; the ref column is blank, not a dash per line.
      expect(rep.bom.every(l => l.ref === '')).toBe(true);
      for (const l of rep.bom) expect(l.source).not.toBe('estimate');
    });

    it('states the ASIL as costed, the claim, and withholds the radar text', () => {
      const rep = buildPcbaReport(analysis(), { annualVolume: 250_000 });
      expect(rep.safety!.costed).toBe('ASIL-B');
      expect(rep.safety!.claimed).toBe('ASIL-C');
      expect(rep.safety!.rationale).toBe('');
      expect(JSON.stringify(rep)).not.toMatch(/Doppler|radar target/i);
      expect(rep.domainLabel).toBe('Automotive camera board');
    });

    it('nothing machined-part shaped: no weight, operations, tooling spread, metal indexation; duty and freight are IN', () => {
      const s = JSON.stringify(buildPcbaReport(analysis(), { annualVolume: 250_000 }));
      expect(s).not.toMatch(/Pass-through|mat-virtual|Net weight|traced operations|indexation|resin|tooling amortisation carries/i);
      expect(s).not.toMatch(/excludes? import duty/i);
      expect(s).toMatch(/UK import duty/);
    });

    it('the country table is the board costed in each country, sorted, with the costed one marked', () => {
      const rep = buildPcbaReport(analysis(), { annualVolume: 250_000 });
      expect(rep.countries.length).toBeGreaterThan(3);
      for (let i = 1; i < rep.countries.length; i++) expect(rep.countries[i].total).toBeGreaterThanOrEqual(rep.countries[i - 1].total);
      expect(rep.countries.filter(r => r.selected).length).toBe(1);
      for (const r of rep.countries) expect(r.components + r.fab + r.assembly + r.other + r.logistics).toBeCloseTo(r.total, 1);
    });

    it('a supplied parts list drops the photo reader\'s "ICs may be double counted" caveat', () => {
      const rep = buildPcbaReport({ ...(analysis() as object), analysisLimitations: [
        'OCR quality was low, so up to two ICs may be double counted.', 'Via count is estimated; inner layers are not visible.'] } as never, {});
      expect(rep.limitations).toEqual(['Via count is estimated; inner layers are not visible.']);
    });

    it('money follows the display currency', () => {
      const rep = buildPcbaReport(analysis(), { annualVolume: 250_000, fmt: n => `€${(n * 1.2).toFixed(2)}` });
      expect(rep.drivers.join(' ')).toMatch(/€/);
      expect(rep.drivers.join(' ')).not.toMatch(/£/);
    });
  });
});

describe('price source labels', () => {
  it('names what priced the line', () => {
    expect(priceSourceLabel({ priceSource: 'catalogue', catalogueConfidence: 'distributor' })).toBe('catalogue (distributor)');
    expect(priceSourceLabel({ priceSource: 'catalogue', catalogueConfidence: 'estimate' })).toBe('catalogue (estimate)');
    expect(priceSourceLabel({ priceSource: 'class-range' })).toBe('class range');
    expect(priceSourceLabel({ livePriced: true, priceSource: 'catalogue' })).toBe('distributor (live)');
  });
});
