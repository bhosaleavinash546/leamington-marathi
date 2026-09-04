// The resolver must be a COVERING map, not an ordered guess.
//
// Every catalogue entry has to be reachable from a name an engineer would
// actually type, and no alias may land on a different entry than its own. That
// second rule is the one that matters: until Sept 2026 (review R-26) the
// ordered regex ladder silently returned A356 for ADC12, carbon fibre for
// GFRP, a cold press line for hot stamping and a cutting table for laser
// welding — and routes/should-cost.mjs stores whatever comes back, so the
// calibration corpus was being fed mislabelled rows.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MATERIALS, PROCESSES } from '../costing-engine.mjs';
import { MATERIAL_ALIASES, PROCESS_ALIASES, materialAlias, processAlias } from '../material-aliases.mjs';
import { resolveMaterial, resolveProcess, resolveRoute } from '../material-process-resolve.mjs';

describe('the alias map covers the catalogue', () => {
  it('every material has at least one alias', () => {
    const missing = Object.keys(MATERIALS).filter(k => !MATERIAL_ALIASES[k]?.length);
    assert.deepEqual(missing, [], `materials with no alias: ${missing.join(', ')}`);
  });

  it('every process has at least one alias', () => {
    const missing = Object.keys(PROCESSES).filter(k => !PROCESS_ALIASES[k]?.length);
    assert.deepEqual(missing, [], `processes with no alias: ${missing.join(', ')}`);
  });

  it('no alias table entry names a key the catalogue does not have', () => {
    const badMat = Object.keys(MATERIAL_ALIASES).filter(k => !MATERIALS[k]);
    const badProc = Object.keys(PROCESS_ALIASES).filter(k => !PROCESSES[k]);
    assert.deepEqual(badMat, [], `alias table drifted from MATERIALS: ${badMat.join(', ')}`);
    assert.deepEqual(badProc, [], `alias table drifted from PROCESSES: ${badProc.join(', ')}`);
  });

  it('every alias resolves to ITS OWN key, never a neighbour', () => {
    const wrong = [];
    for (const [key, aliases] of Object.entries(MATERIAL_ALIASES)) {
      for (const a of aliases) {
        const got = materialAlias(a);
        if (got !== key) wrong.push(`material "${a}" → ${got} (expected ${key})`);
      }
    }
    for (const [key, aliases] of Object.entries(PROCESS_ALIASES)) {
      for (const a of aliases) {
        const got = processAlias(a);
        if (got !== key) wrong.push(`process "${a}" → ${got} (expected ${key})`);
      }
    }
    assert.deepEqual(wrong, [], `aliases landing on the wrong entry:\n  ${wrong.join('\n  ')}`);
  });

  it('every catalogue key is reachable through the full resolver', () => {
    const unreachable = [];
    for (const key of Object.keys(MATERIALS)) {
      const alias = MATERIAL_ALIASES[key]?.[0];
      if (resolveMaterial(alias)?.key !== key) unreachable.push(`material ${key} (via "${alias}")`);
    }
    for (const key of Object.keys(PROCESSES)) {
      const alias = PROCESS_ALIASES[key]?.[0];
      if (resolveProcess(alias)?.key !== key) unreachable.push(`process ${key} (via "${alias}")`);
    }
    assert.deepEqual(unreachable, [], `unreachable catalogue entries:\n  ${unreachable.join('\n  ')}`);
  });
});

describe('the specific misroutes the review measured', () => {
  const mat = (typed) => resolveMaterial(typed)?.key ?? null;
  const proc = (typed) => resolveProcess(typed)?.key ?? null;

  it('die-cast aluminium grades no longer collapse onto A356', () => {
    assert.equal(mat('ADC12'), 'Aluminium A380 / ADC12 (die-cast)');
    assert.equal(mat('A380'), 'Aluminium A380 / ADC12 (die-cast)');
    assert.equal(mat('AlSi9Cu3'), 'Aluminium AlSi9Cu3 / EN AC-46000 (die-cast)');
    assert.equal(mat('EN AC-46000'), 'Aluminium AlSi9Cu3 / EN AC-46000 (die-cast)');
    assert.equal(mat('A357'), 'Aluminium A357 (cast)');
    assert.equal(mat('Silafont-36'), 'Aluminium AlSi10MnMg (Silafont-36, structural HPDC)');
    // …and A356 itself still resolves to A356.
    assert.equal(mat('A356'), 'Aluminium A356 (cast)');
  });

  it('glass fibre is not priced as carbon fibre (€4.50/kg vs €28.00/kg)', () => {
    assert.equal(mat('GFRP'), 'GFRP (Glass Fibre)');
    assert.equal(mat('glass fibre'), 'GFRP (Glass Fibre)');
    assert.equal(mat('fibreglass'), 'GFRP (Glass Fibre)');
    assert.equal(mat('SMC'), 'SMC (Sheet Moulding Compound)');
    assert.equal(mat('CFRP'), 'CFRP (Carbon Fibre)');
    assert.ok(MATERIALS['GFRP (Glass Fibre)'].price < MATERIALS['CFRP (Carbon Fibre)'].price / 3,
      'the two are far apart in price — which is why the mis-resolution mattered');
  });

  it('hot stamping gets the press-hardening line, not a cold press', () => {
    assert.equal(proc('hot stamping'), 'Hot Stamping (Press Hardening)');
    assert.equal(proc('press hardening'), 'Hot Stamping (Press Hardening)');
    assert.equal(proc('lamination stamping'), 'Lamination Stamping (Electrical Steel)');
    assert.equal(proc('stamping'), 'Stamping / Deep Drawing');
    // The tooling and tool-life difference is the reason.
    assert.ok(PROCESSES['Hot Stamping (Press Hardening)'].toolingBase > PROCESSES['Stamping / Deep Drawing'].toolingBase);
  });

  it('joining processes resolve to a joining op, not to cutting', () => {
    for (const q of ['laser welding', 'friction stir welding', 'riveting', 'self-piercing rivet', 'clinching', 'adhesive bonding', 'flow drill screw']) {
      assert.equal(proc(q), 'MIG Welding Assembly', `${q} must resolve to a joining operation`);
    }
    assert.equal(proc('spot welding'), 'Resistance Spot Welding');
    assert.equal(proc('laser cutting'), 'Laser Cutting + Bending');
  });

  it('surface and heat treatments resolve instead of returning null', () => {
    for (const q of ['anodising', 'chrome plating', 'nickel plating', 'phosphating', 'passivation', 'zinc nickel']) {
      assert.equal(proc(q), 'Zinc Plating', `${q} must resolve to a plating operation`);
    }
    for (const q of ['nitriding', 'induction hardening', 'carbonitriding', 'vacuum heat treatment', 'austempering']) {
      assert.equal(proc(q), 'Heat Treatment (batch)', `${q} must resolve to heat treatment`);
    }
    for (const q of ['shot blasting', 'shot peening', 'honing', 'lapping']) {
      assert.ok(proc(q), `${q} must resolve to something`);
    }
  });

  it('powder and additive routes reach their own entries', () => {
    assert.equal(proc('metal injection moulding'), 'Metal Injection Moulding (MIM)');
    assert.equal(proc('MIM'), 'Metal Injection Moulding (MIM)');
    assert.equal(proc('powder metallurgy'), 'Powder Metallurgy (Press & Sinter)');
    assert.equal(proc('DMLS'), 'Laser Powder Bed Fusion (DMLS/SLM)');
    assert.equal(proc('3D printing'), 'Laser Powder Bed Fusion (DMLS/SLM)');
    assert.equal(proc('rotational moulding'), 'Rotational Moulding');
    assert.equal(proc('gun drilling'), 'Deep-Hole / Gun Drilling');
  });

  it('sheet-steel designations reach the right strength class', () => {
    assert.equal(mat('DC04'), 'Steel (mild)');
    assert.equal(mat('CR340LA'), 'Steel (high-strength)');
    assert.equal(mat('DP600'), 'Steel DP600 (dual-phase)');
    assert.equal(mat('DP980'), 'Steel DP980 (dual-phase)');
    assert.equal(mat('22MnB5'), 'Steel 22MnB5 (press-hardened)');
    assert.equal(mat('Usibor 1500'), 'Steel 22MnB5 (press-hardened)');
    assert.equal(mat('1.4404'), 'Stainless Steel 316L');
  });

  it('e-drive families resolve (14 of 19 unpriced EDU ideas failed here)', () => {
    assert.equal(mat('NdFeB N42UH'), 'Magnet (NdFeB, sintered, heavy-RE)');
    assert.equal(mat('Y30BH ferrite'), 'Magnet (Ferrite, Y30BH)');
    assert.equal(mat('hairpin copper'), 'Copper (enamelled winding wire)');
    assert.equal(mat('VPI impregnation resin'), 'Epoxy (impregnation resin)');
    assert.equal(mat('M250-35A'), 'Electrical Steel (M250-35A)');
    assert.equal(mat('NO20'), 'Electrical Steel (NO20, 0.20 mm)');
    assert.equal(proc('hairpin winding'), 'Hairpin Winding (form, insert, weld)');
    assert.equal(proc('VPI'), 'Vacuum Pressure Impregnation (VPI)');
  });
});

describe('the resolver still behaves as before where it was right', () => {
  it('exact catalogue names resolve exactly, not approximately', () => {
    assert.deepEqual(resolveMaterial('Steel (mild)'), { key: 'Steel (mild)', approx: false });
    assert.deepEqual(resolveProcess('Sand Casting'), { key: 'Sand Casting', approx: false });
  });

  it('the ladder still catches what the alias table does not name', () => {
    assert.equal(resolveMaterial('ductile cast iron')?.key, 'Cast Iron (Ductile/GJS)');
    assert.equal(resolveMaterial('some unspecified aluminium part')?.key, 'Aluminium 6061');
    assert.equal(resolveProcess('injection moulded part')?.key, 'Injection Moulding');
  });

  it('nonsense still resolves to nothing', () => {
    assert.equal(resolveMaterial('unobtanium'), null);
    assert.equal(resolveProcess('wishing very hard'), null);
    assert.equal(resolveMaterial(''), null);
  });

  it('routes resolve op by op', () => {
    const r = resolveRoute('hot stamping + laser cutting + e-coat');
    assert.deepEqual(r.keys, ['Hot Stamping (Press Hardening)', 'Laser Cutting + Bending', 'E-coat (KTL)']);
  });

  it('a restricted library cannot resolve to an entry it does not have', () => {
    const tiny = { 'Steel (mild)': MATERIALS['Steel (mild)'] };
    assert.equal(materialAlias('ADC12', tiny), null, 'no silent substitution into a catalogue that lacks the grade');
    assert.equal(materialAlias('DC04', tiny), 'Steel (mild)');
  });
});
