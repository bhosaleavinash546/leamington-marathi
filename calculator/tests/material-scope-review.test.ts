/**
 * Material scope review, Oct 2026 — each commodity offers and costs only its own grades.
 * docs/cad/material-scope-review-2026-10.md has the findings.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { MATERIAL_SCOPE_BY_COMMODITY, inMaterialScope } from '../src/engine/material-scope.js';
import { MATERIAL_SCOPE_BY_SELECT, SELECT_COMMODITY } from '../src/ui/material-scope.js';
import { CAD_MATERIALS_BY_COMMODITY } from '../src/ui/data/cad-options.js';
import { representativeMaterialId } from '../src/engine/cost-input-rules/derive/material.js';
import { resinFacts, RESIN_DECISION_ID } from '../src/engine/cost-input-rules/derive/resin.js';
import { elastomerFacts, ELASTOMER_DECISION_ID } from '../src/engine/cost-input-rules/derive/elastomer.js';
import { toCostParams } from '../src/engine/cost-input-rules/to-cost-params.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { MaterialFamily } from '../src/engine/material-family.js';

const LIB = DEFAULT_RATE_LIBRARY;
const cat = (id: string) => LIB.materials.find(m => m.id === id)!.category;
const idsIn = (com: string) => LIB.materials.filter(m => MATERIAL_SCOPE_BY_COMMODITY[com].test(m.category)).map(m => m.id);
const ctx = (commodity: string, answers: Record<string, unknown>) => ({
  commodity, answers, filename: 'part.stp', annualVolume: 10_000, geometryQuality: 'occt',
  geo: { volume: { cm3: 100, mm3: 100_000 } },
} as unknown as RuleContext);

describe('1. every material drop-down is scoped, by the engine\'s own table', () => {
  it('no material-select in the UI falls back to the full catalogue', () => {
    const src = readdirSync('src/ui', { recursive: true }).filter(f => String(f).endsWith('.ts'))
      .map(f => readFileSync(`src/ui/${f}`, 'utf8')).join('\n');
    const ids = [...src.matchAll(/<select id="([a-z0-9-]+)"[^>]*class="[^"]*material-select/g)].map(m => m[1]);
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) expect(MATERIAL_SCOPE_BY_SELECT[id], id).toBeDefined();
  });
  it('each drop-down shows exactly its commodity\'s engine scope', () => {
    for (const [sel, com] of Object.entries(SELECT_COMMODITY)) expect(MATERIAL_SCOPE_BY_SELECT[sel]).toBe(MATERIAL_SCOPE_BY_COMMODITY[com]);
  });
  it('the CAD panel lists, for every commodity, only grades that commodity buys', () => {
    for (const [com, list] of Object.entries(CAD_MATERIALS_BY_COMMODITY)) {
      for (const o of list) expect(inMaterialScope(com, cat(o.id)), `${com}: ${o.id}`).toBe(true);
    }
  });
});

describe('2. the leaks the review closed', () => {
  it('sheet metal: no plastic thermoforming sheet; the hot-stamping and martensitic grades are in', () => {
    const sm = idsIn('sheet_metal');
    expect(sm.some(id => cat(id) === 'Thermoforming Sheet')).toBe(false);
    for (const id of ['mat-22mnb5', 'mat-usibor1500', 'mat-usibor2000', 'mat-ms1200', 'mat-ms1500']) expect(sm, id).toContain(id);
  });
  it('machining and forging: no aluminium extrusion logs', () => {
    for (const com of ['machining', 'forging']) expect(idsIn(com).some(id => cat(id) === 'Aluminium Extrusion Billet')).toBe(false);
  });
  it('injection moulding: resins only — no machining stock shapes, no masterbatch as a base resin', () => {
    const im = idsIn('injection_moulding');
    expect(im).not.toContain('mat-pom-c');
    expect(im).not.toContain('mat-mb-colour');
    expect(im).toContain('mat-pa66gf30');
  });
  it('casting: no machining bar (CZ121 / PB1 moved to "Copper Alloy Bar")', () => {
    expect(idsIn('casting')).not.toContain('mat-brass-cz121');
    expect(idsIn('machining')).toContain('mat-brass-cz121');
  });
  it('gear: steel, iron, bronze and plastic stock — not the whole catalogue', () => {
    const g = idsIn('gear');
    expect(g.length).toBeLessThan(80);
    for (const id of ['mat-steel-20mncr5', 'mat-steel4140', 'mat-ss303', 'mat-adi', 'mat-bronze-pb1', 'mat-pom-c']) expect(g, id).toContain(id);
  });
  it('every grade but the virtual pass-through and the motor winding wire belongs to some commodity', () => {
    const orphan = LIB.materials.filter(m => !Object.values(MATERIAL_SCOPE_BY_COMMODITY).some(r => r.test(m.category)))
      .map(m => m.category);
    expect([...new Set(orphan)].sort()).toEqual(['Virtual', 'Winding Aluminium (Hairpin)', 'Winding Copper (Hairpin)']);
  });
});

describe('3. the engine costs only in-scope grades', () => {
  it('every representative grade is in its commodity\'s scope', () => {
    for (const com of ['machining', 'casting', 'cast_and_machine', 'forging', 'sheet_metal', 'sheet_metal_fab']) {
      for (const fam of ['aluminium', 'steel', 'cast iron', 'titanium', 'copper alloy', 'magnesium', 'zinc', 'nickel alloy', 'plastic'] as MaterialFamily[]) {
        const id = representativeMaterialId(com, fam);
        if (id) expect(inMaterialScope(com, cat(id)), `${com}/${fam} → ${id}`).toBe(true);
      }
    }
  });
  it('a resin outside the commodity\'s scope is asked again, not costed', () => {
    expect(resinFacts(ctx('blow_moulding', { [RESIN_DECISION_ID]: 'mat-pa66gf30' })).decision).toBeDefined();
    expect(resinFacts(ctx('blow_moulding', { [RESIN_DECISION_ID]: 'mat-hdpe-bm' })).materialId).toBe('mat-hdpe-bm');
    expect(resinFacts(ctx('injection_moulding', { [RESIN_DECISION_ID]: 'mat-dc04' })).decision).toBeDefined();
  });
  it('a compound outside rubber\'s scope is asked again', () => {
    expect(elastomerFacts(ctx('rubber', { [ELASTOMER_DECISION_ID]: 'mat-pa6' })).materialId).toBeNull();
  });
  it('a carried materialId the commodity does not buy is replaced by its own grade, and said so', () => {
    const r = toCostParams('forging', { materialId: 'mat-al6082-bar', forging: {} } as never, 10_000, 'aluminium');
    expect(r?.assumed.join(' ') ?? '').toMatch(/not one forging buys → mat-al6082-forge/);
  });
});

describe('4. grades the review added', () => {
  it('injection moulding, sheet metal and machining bar — each with its basis', () => {
    const NEW: Record<string, string[]> = {
      injection_moulding: ['mat-pbt', 'mat-tpe-s-im', 'mat-psu', 'mat-ppsu', 'mat-pla', 'mat-abs-fr', 'mat-pc-gf20'],
      sheet_metal: ['mat-s355mc', 'mat-s420mc', 'mat-ss409l-sheet', 'mat-ss441-sheet', 'mat-aa1050-sheet'],
      machining: ['mat-steel-en3-bar', 'mat-steel-11smnpb30', 'mat-al7075-bar', 'mat-ss416-bar', 'mat-c101-bar'],
    };
    for (const [com, ids] of Object.entries(NEW)) {
      for (const id of ids) {
        expect(idsIn(com), `${com} ${id}`).toContain(id);
        expect(LIB.materials.find(m => m.id === id)!.sourceNote).toMatch(/Material scope review 2026-10/);
      }
    }
  });
});
