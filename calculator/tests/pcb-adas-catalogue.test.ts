/**
 * ADAS research round (9 Oct 2026, docs/pcb/adas-component-research-2026-10.md): the catalogue gained the researched
 * ADAS parts through the merge script's own rules, the round's exclusions held, and the vehicle-electronics library
 * gained seven ADAS ECUs with sourced board facts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { catalogueEntry } from '../server/utils/pcb-price-catalogue.js';
import { ecuLibrary } from '../server/utils/pcb-ecu-library.js';
import { PRICE_HOSTS, FRANCHISED } from '../scripts/pcb-catalogue-research-merge.js';
import { mergeEcuResearch } from '../scripts/pcb-ecu-library-merge.js';

const host = (u: string) => u.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();

describe('ADAS parts in the catalogue', () => {
  it.each([
    'TDA4VH88TGAALYRQ1', 'TC397XX256F300SBDKXUMA2', 'S32K396EHT1MJBST', 'DS90UB934TRGZRQ1', 'MAX9295DGTJ/V+',
    'TPS7B7702QPWPRQ1', 'LM74720QDRRRQ1', 'TJA1462AT/0Z', 'LP87702DRHBRQ1', 'CDCE6214LTWRGERQ1', 'PGA460TPWRQ1',
    'GCM31CR71A226KE02L', 'PESD1CAN,215',
  ])('%s is distributor-priced from franchised listings with links and dates', mpn => {
    const e = catalogueEntry(mpn);
    expect(e, mpn).not.toBeNull();
    expect(e!.confidence).toBe('distributor');
    expect(e!.observations!.length).toBeGreaterThan(0);
    for (const o of e!.observations!) {
      expect(FRANCHISED.test(o.distributor), o.distributor).toBe(true);
      expect(PRICE_HOSTS.test(host(o.url)), o.url).toBe(true);
      expect(o.qty).toBeGreaterThanOrEqual(100);
    }
    // a cross-check ADDS to earlier listings (merge rule 8), so at least one is from this round
    expect(e!.observations!.some(o => o.date === '2026-10-09')).toBe(true);
  });

  it('estimates the research priced are replaced by distributor prices', () => {
    for (const k of ['TDA4VE', 'TJA1100', 'W25Q256JW', 'TMP451']) expect(catalogueEntry(k)?.confidence, k).toBe('distributor');
  });

  it('the round\'s exclusions hold: no OmniVision staging price, AWR1443 stays an estimate', () => {
    expect(catalogueEntry('OX08B40-B86Y-00LD')?.confidence ?? 'none').not.toBe('distributor');
    expect(catalogueEntry('AWR1443')?.confidence).toBe('estimate');
    const ex = JSON.parse(readFileSync(new URL('../scripts/pcb-research/2026-10-09-adas/audit-exclusions.json', import.meta.url), 'utf8'));
    expect(Object.keys(ex.parts)).toEqual(expect.arrayContaining(['AWR1443FQIGABLRQ1', 'OX08B40-B86Y-00LD', '0347910042', 'CGA3E3X7R1H474K080AB']));
  });

  it('a price read only on a Digi-Key punchout storefront says so on the entry', () => {
    const cat = JSON.parse(readFileSync(new URL('../server/data/pcb-component-catalogue.json', import.meta.url), 'utf8'));
    const only = cat.parts.filter((e: { observations?: Array<{ url: string }> }) => e.observations?.length && e.observations.every(o => o.url.includes('punchouttest')));
    expect(only.length).toBeGreaterThan(0);
    for (const e of only) expect(e.source, e.mpn).toMatch(/punchouttest/);
    expect(catalogueEntry('MAX20019')!.desc).toMatch(/500 mA/);
  });

  it('the catalogue audit passes with 0 errors', () => {
    const out = execFileSync('npx', ['tsx', 'scripts/pcb-catalogue-audit.ts', '--json'], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
    const a = JSON.parse(out);
    expect(a.errors).toEqual([]);
    expect(a.parts).toBeGreaterThanOrEqual(1018);
  }, 120_000);
});

describe('ADAS ECUs in the vehicle-electronics library', () => {
  const L = ecuLibrary(100_000);
  const ADAS = ['FCAM', 'SVC', 'DMS', 'RADAR', 'CRADAR', 'RADAR4D', 'ADCU', 'PARK', 'LIDAR'];

  it('all nine ADAS ECUs are listed under every powertrain', () => {
    for (const id of ADAS) expect(L.ecus.find(e => e.ecu === id), id).toBeTruthy();
    for (const pt of L.powertrains) for (const id of ADAS) expect((pt.ecus as string[]).includes(id), `${pt.id} ${id}`).toBe(true);
  });

  it('every new claim carries a URL or "engineering judgement"; teardowns are links', () => {
    for (const id of ADAS) {
      const e = L.ecus.find(x => x.ecu === id)! as typeof L.ecus[number] & { teardowns?: Array<{ url: string }> };
      for (const k of e.keyIcs) expect(String(k.source), `${id} ${k.role}`).toMatch(/^https?:\/\/|engineering judgement/i);
      if (e.pcb) expect(String(e.pcb.basis)).toMatch(/https?:\/\/|engineering judgement/i);
      for (const t of e.teardowns ?? []) expect(t.url).toMatch(/^https?:\/\//);
    }
  });

  it('the existing front-camera key ICs were kept and the radar RF laminate is stated from teardowns', () => {
    const f = L.ecus.find(e => e.ecu === 'FCAM')!;
    expect(f.keyIcs.some(k => k.examples.some(x => /EyeQ4 Mid\/High/.test(x)))).toBe(true);
    expect(L.ecus.find(e => e.ecu === 'RADAR')!.pcb!.laminate).toMatch(/RO3003/);
  });

  it('the merge drops a key-IC row with no source and adds a new ECU to its powertrains', () => {
    const lib = { ecus: [] as never[], powertrains: [{ id: 'ICE', ecus: [] as string[] }] };
    const r = mergeEcuResearch(lib as never, { researched: 'x', ecus: [{ ecu: 'X', name: 'X', function: 'f', powertrains: ['ICE'],
      keyIcs: [{ role: 'a', examples: ['A1'], source: 'https://e.x' }, { role: 'b', examples: ['B1'], source: 'no source found' }] }] } as never);
    expect(r.droppedKeyIcs).toHaveLength(1);
    expect(lib.powertrains[0].ecus).toEqual(['X']);
  });
});
