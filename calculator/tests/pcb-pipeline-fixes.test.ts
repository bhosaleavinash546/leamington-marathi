/**
 * PCB photo → BOM → cost pipeline fixes (review of 9 Oct 2026, docs/pcb/pcb-pipeline-review-2026-10-09.md).
 * Every test runs the real Stage 4 (runStage4) on the committed radar fixture and changes ONE thing the model said:
 * the headline must not move unless evidence moved.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runStage4 } from '../server/routes/pcb.js';
import { gateIdentities } from '../server/utils/pcb-identity.js';

const R = JSON.parse(readFileSync(new URL('../e2e/fixtures/pcb-radar-replies.json', import.meta.url), 'utf8'));
const ocr = { ...R.ocr, refDesGroups: R.ocr.refDesGroups ?? [], connectors: R.ocr.connectors ?? [], boardText: R.ocr.boardText ?? [] };

async function radar(mut?: (a: any) => void, opts: { qty?: number; country?: string } = {}) {
  const a = JSON.parse(JSON.stringify(R.analysis));
  mut?.(a);
  const log = console.log, warn = console.warn; console.log = () => {}; console.warn = () => {};
  try {
    const s4 = await runStage4({ analysis: a, domain: 'automotive_adas', asilLevel: 'ASIL-C' as never, ocrResult: ocr,
      country: opts.country ?? 'cn', orderQty: opts.qty ?? 200_000, tag: '/test' });
    return { a, s4, total: s4.selectedCountryBreakdown!.totalPerBoard };
  } finally { console.log = log; console.warn = warn; }
}

describe('F1 — a part number counts only with evidence', () => {
  it('a part number the model invents is shown as a suggestion and never priced from the catalogue', async () => {
    const base = await radar();
    for (const ocrClaim of [false, true]) {
      const r = await radar(a => Object.assign(a.bom[1], { partNumber: 'TDA4VH', ocrExtracted: ocrClaim, lineConf: ocrClaim ? 1 : 0.7 }));
      expect(r.total).toBe(base.total);                                   // was £144.57 against £53.31
      // the suggestion is kept for the engineer; the line then takes the marking OCR read on its chip (TEF8105)
      const u2 = r.a.bom.find((l: any) => l.suggestedPartNumber === 'TDA4VH');
      expect(u2?.partNumber).toBe('TEF8105');
      expect(r.a.bom.some((l: any) => l.catalogueMpn && /TDA4VH/.test(l.catalogueMpn))).toBe(false);
      expect(r.s4.sanityWarnings.some((w: any) => w.code === 'PART_NUMBER_NOT_EVIDENCED')).toBe(true);
    }
  });

  it('OCR-agreed, BOM-file and user-corrected part numbers stay', () => {
    const { bom, withheld } = gateIdentities([
      { refDes: 'U1', partNumber: 'S32R294', ocrExtracted: true },
      { refDes: 'U2', partNumber: 'TJA1044GT', bomSource: 'file' },
      { refDes: 'U3', partNumber: 'TJA1044GT', bomSource: 'image' },
      { refDes: 'U4', partNumber: 'TCAN1044', userCorrected: true },
      { refDes: 'U5', partNumber: 'TDA4VH' },
      { refDes: 'C1', partNumber: '' },
    ]);
    expect(bom.map(l => l.identityEvidence)).toEqual(['ocr', 'bom-file', 'bom-file', 'user', 'none', undefined]);
    expect(bom[4].partNumber).toBe('');
    expect(bom[4].suggestedPartNumber).toBe('TDA4VH');
    expect(withheld).toEqual(['U5 TDA4VH']);
  });
});
