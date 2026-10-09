/**
 * Round 3 (9 Oct 2026): MHEV / PHEV / BEV vehicle boards. The ECU-library merge adds to what earlier rounds found —
 * teardown links and board-cost evidence are never wiped by a later research file.
 */
import { describe, it, expect } from 'vitest';
import { mergeEcuResearch } from '../scripts/pcb-ecu-library-merge.js';

describe('ECU library merge keeps earlier rounds', () => {
  const lib = () => ({
    powertrains: [{ id: 'BEV400', ecus: ['OBC'] }],
    ecus: [{ ecu: 'OBC', name: 'On-board charger', function: 'f', powertrains: ['BEV400'],
      keyIcs: [{ role: 'MCU', examples: ['A'], source: 'https://a' }],
      teardowns: [{ title: 'old', url: 'https://old', finding: 'x' }] }],
    boardCostEvidence: [{ claim: 'earlier', url: 'https://e' }],
    notes: [] as string[],
  });

  it('adds teardowns and board-cost evidence instead of replacing them (each once)', () => {
    const l = lib();
    mergeEcuResearch(l as never, { domain: 'ev-charging', researched: '2026-10-09', ecus: [{ ecu: 'OBC', name: 'On-board charger', function: 'f',
      powertrains: ['BEV400'], keyIcs: [], teardowns: [{ title: 'old again', url: 'https://old', finding: 'x' }, { title: 'new', url: 'https://new', finding: 'y' }] }],
      boardCostEvidence: [{ claim: 'earlier', url: 'https://e' }, { claim: 'later', url: 'https://l' }], notes: ['n'] });
    expect(l.ecus[0].teardowns.map(t => t.url)).toEqual(['https://old', 'https://new']);
    expect(l.boardCostEvidence.map(x => x.claim)).toEqual(['earlier', 'later']);
    expect(l.notes).toEqual(['ev-charging (2026-10-09): n']);
  });
});

import { readFileSync } from 'node:fs';
import { catalogueEntry } from '../server/utils/pcb-price-catalogue.js';
import { PRICE_HOSTS } from '../scripts/pcb-catalogue-research-merge.js';

const host = (u: string) => u.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();

describe('round 3 parts in the catalogue', () => {
  it.each([
    'TLE8888QK', 'MC33PT2000AFR2', 'L99DZ200GTR', 'TLE92108-23QX', 'NVHL080N120SC1', 'UCC27712QDRQ1', '1EDI3031AS', '1EDI3031ASXUMA1',
    'MC33GD3000EP', 'L9680TR', 'ISL78714ANZ', 'AD2428WCCSZ-RL', 'C1210X103JDGACAUTO', 'BUK9Y8R5-80EX',
  ])('%s is distributor-priced from franchised listings', mpn => {
    const e = catalogueEntry(mpn);
    expect(e?.confidence, mpn).toBe('distributor');
    for (const o of e!.observations!) { expect(PRICE_HOSTS.test(host(o.url)), o.url).toBe(true); expect(o.qty).toBeGreaterThanOrEqual(100); }
  });
  it('the round 3 audit decisions hold', () => {
    const ex = JSON.parse(readFileSync(new URL('../scripts/pcb-research/2026-10-09-ev/audit-exclusions.json', import.meta.url), 'utf8'));
    for (const mpn of Object.keys(ex.parts)) expect(catalogueEntry(mpn)?.confidence ?? 'none', mpn).not.toBe('distributor');
    for (const mpn of Object.keys(ex.disputed)) expect(catalogueEntry(mpn)!.source, mpn).toMatch(/DISPUTED:/);
  });
  it('the catalogue grew to 1,217 parts, 880 distributor-priced', () => {
    const c = JSON.parse(readFileSync(new URL('../server/data/pcb-component-catalogue.json', import.meta.url), 'utf8'));
    expect(c.parts.length).toBeGreaterThanOrEqual(1217);
    expect(c.parts.filter((e: { confidence: string }) => e.confidence === 'distributor').length).toBeGreaterThanOrEqual(880);
  });
});

describe('round 3 boards in the vehicle-electronics library', () => {
  const lib = JSON.parse(readFileSync(new URL('../server/data/pcb-ecu-library.json', import.meta.url), 'utf8'));
  const EV = ['BMS_CMU', 'BMS_BMU', 'BMS48', 'IBS', 'OBC', 'DCDC_HV', 'DCDC48', 'CCU', 'TINV', 'PCU', 'BSG_INV', 'EBOOST', 'ECOMP', 'PTC', 'TMS',
    'VCU', 'EPS', 'ESC', 'ACU', 'BCM', 'GW', 'SEAT', 'DOOR', 'HVAC', 'HEADLAMP', 'CLUSTER', 'IVI', 'TEL', 'ECM', 'TCM', 'IGN', 'FPC', 'GPCU', 'NOX', 'DCU'];
  it('every board carries sourced key ICs and board facts with a basis', () => {
    for (const id of EV) {
      const e = lib.ecus.find((x: { ecu: string }) => x.ecu === id);
      expect(e.keyIcs.length, id).toBeGreaterThanOrEqual(3);
      for (const k of e.keyIcs) expect(k.source, `${id} ${k.role}`).toMatch(/^https?:\/\/|engineering judgement/i);
      expect(e.pcb?.basis, id).toBeTruthy();
    }
  });
  it('board-cost evidence from earlier rounds is kept and every claim is linked', () => {
    expect(lib.boardCostEvidence.length).toBeGreaterThanOrEqual(46);
    expect(lib.boardCostEvidence.some((x: { claim: string }) => /zFAS|Audi/i.test(x.claim))).toBe(true);   // ADAS round 2
    for (const x of lib.boardCostEvidence) expect(x.url, x.claim).toMatch(/^https?:\/\//);
  });
});
