/**
 * E-motor should-cost (EV propulsion build, Oct 2026) — PMSM (interior permanent magnet), induction, or
 * wound-field (EESM).
 *
 * Built up from the motor's main dimensions:
 *  - Laminations: stator and rotor stacks stamped together on one progressive die (the rotor blank comes out of
 *    the stator's bore), so the strip buys one square pitch per lamination pair. Net steel = stator annulus ×
 *    its steel share + rotor disc − shaft bore, × the stacking factor. Electrical-steel grade from the library.
 *  - Winding copper: slot area (stator annulus × (1 − steel share)) × slot fill × (active length + end turns).
 *  - Magnets (PMSM): mass given, or 1.5 kg by default (industry benchmark 1–2 kg per traction PMSM [EVR]);
 *    priced as NdFeB blank + heavy-rare-earth content + finishing (ev-data.ts).
 *  - Housing (die-cast aluminium shell around the stator) and shaft (alloy steel) as conversion £/kg on the
 *    library metal — stated estimates; cost them in Cast + Machine / Machining for detail.
 *  - Bought-in parts (bearings, resolver, sensors, liners, terminal block, seals), impregnation resin.
 *  - The line: lamination press, winding (hairpin or round wire), hairpin weld, impregnation, rotor, balancing,
 *    final assembly, end-of-line test — library machines and labour, so the costing country re-rates them.
 * Metal prices come from the ACTIVE rate book (the costing country's).
 */
import type { CommodityDrivers, MaterialLineItem, OperationInput, RawMaterialInput } from '../types.js';
import { activeRates } from '../rate-context.js';
import { inCountry, type CountryBasis } from '../regional-services.js';
import {
  MAGNET_GRADES, TB_OXIDE_CNY_PER_KG, TB_IN_OXIDE, MAGNET_FINISHING_UPLIFT,
  MOTOR_PARTS, MOTOR_STRUCTURE, EV_TOOLING, type MagnetGrade,
} from '../ev-data.js';

export type MotorType = 'pmsm' | 'induction' | 'eesm';
export type WindingType = 'hairpin' | 'round_wire';

export interface EMotorInputs {
  motorType: MotorType;
  statorOdMm: number;
  statorIdMm: number;
  stackLengthMm: number;
  slots: number;
  airgapMm: number;
  shaftDiaMm: number;
  laminationThicknessMm: number;
  laminationMaterialId: string;
  stackingFactor?: number;
  /** Share of the stator annulus that is steel (teeth + yoke); the rest is slots. 0.55–0.65. */
  statorSteelFraction?: number;
  winding: WindingType;
  conductorMaterialId: string;
  slotFill?: number;
  /** End-turn conductor length as a share of the active length (hairpin ~0.5, round wire ~0.9). */
  endTurnFactor?: number;
  /** Hairpin conductors per slot (2–8). */
  hairpinLayers?: number;
  magnetGrade?: MagnetGrade;
  magnetMassKg?: number;
  labourId: string;
  testLabourId: string;
  oee: number;
  labourEfficiency: number;
  rejectRate?: number;
  amortizationVolume: number;
}

export interface EMotorFacts {
  laminations: number; strokes: number;
  statorSteelKg: number; rotorSteelKg: number; grossSteelKg: number;
  copperKg: number; magnetKg: number; housingKg: number; shaftKg: number;
  magnetGbpPerKg: number; welds: number;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const material = (id: string) => activeRates().materials.find(m => m.id === id)
  ?? (() => { throw new Error(`e-motor: material '${id}' is not in the rate library`); })();
const fxCny = () => activeRates().fx?.find(f => f.id === 'fx-gbp-cny')?.rate ?? 8.88;

/** £/kg of a finished traction magnet of this grade. */
export function magnetGbpPerKg(grade: MagnetGrade): number {
  const g = MAGNET_GRADES[grade];
  const tbCny = g.tbMassFraction * TB_OXIDE_CNY_PER_KG / TB_IN_OXIDE;
  return r4((g.blankCnyPerKg + tbCny) * (1 + MAGNET_FINISHING_UPLIFT) / fxCny());
}

export function eMotorFacts(i: EMotorInputs): EMotorFacts {
  const m = (mm: number) => mm / 1000;
  const sf = i.stackingFactor ?? 0.96;
  const steel = material(i.laminationMaterialId);
  const L = m(i.stackLengthMm);
  const annulus = Math.PI / 4 * (m(i.statorOdMm) ** 2 - m(i.statorIdMm) ** 2);
  const steelFrac = i.statorSteelFraction ?? 0.60;
  const rotorOd = i.statorIdMm - 2 * i.airgapMm;
  const rotorDisc = Math.PI / 4 * (m(rotorOd) ** 2 - m(i.shaftDiaMm) ** 2);
  const laminations = Math.ceil(i.stackLengthMm / i.laminationThicknessMm * sf);
  const statorSteelKg = annulus * steelFrac * L * sf * steel.densityKgPerM3;
  // PMSM rotor: the magnet pockets take ~8 % of the disc (ESTIMATE); induction and EESM rotors carry the cage / pole slots.
  const rotorSteelShare = i.motorType === 'pmsm' ? 0.92 : 0.80;
  const rotorSteelKg = rotorDisc * rotorSteelShare * L * sf * steel.densityKgPerM3;
  // One square pitch (OD + 2 × 3 mm carrier) per lamination pair: the rotor comes out of the stator's bore.
  const pitch = m(i.statorOdMm + 6);
  const grossSteelKg = laminations * pitch * pitch * m(i.laminationThicknessMm) * steel.densityKgPerM3;
  const fill = i.slotFill ?? (i.winding === 'hairpin' ? 0.65 : 0.45);
  const endTurn = i.endTurnFactor ?? (i.winding === 'hairpin' ? 0.5 : 0.9);
  const cond = material(i.conductorMaterialId);
  const copperKg = annulus * (1 - steelFrac) * fill * L * (1 + endTurn) * cond.densityKgPerM3;
  const magnetKg = i.motorType === 'pmsm' ? (i.magnetMassKg ?? 1.5) : 0;
  // Housing: a die-cast shell around the stator — circumference × (stack + end turns + 2 × 40 mm end bells) × wall.
  const shellLen = L * (1 + endTurn) + 0.08;
  const housingKg = Math.PI * m(i.statorOdMm + MOTOR_STRUCTURE.housingWallMm) * shellLen * m(MOTOR_STRUCTURE.housingWallMm) * 2700 * MOTOR_STRUCTURE.housingFeatureFactor;
  const shaftKg = Math.PI / 4 * m(i.shaftDiaMm) ** 2 * (L + 0.2) * 7850;
  const welds = i.winding === 'hairpin' ? Math.round(i.slots * (i.hairpinLayers ?? 4) / 2) : 0;
  return {
    laminations, strokes: laminations,
    statorSteelKg: r4(statorSteelKg), rotorSteelKg: r4(rotorSteelKg), grossSteelKg: r4(grossSteelKg),
    copperKg: r4(copperKg), magnetKg, housingKg: r4(housingKg), shaftKg: r4(shaftKg),
    magnetGbpPerKg: i.motorType === 'pmsm' ? magnetGbpPerKg(i.magnetGrade ?? '45UH_GBD') : 0, welds,
  };
}

export function computeEMotorDrivers(i: EMotorInputs): CommodityDrivers {
  const f = eMotorFacts(i);
  const reject = i.rejectRate && i.rejectRate > 0 ? 1 / (1 - i.rejectRate) : 1;
  const steel = material(i.laminationMaterialId);
  const cond = material(i.conductorMaterialId);
  const lines: MaterialLineItem[] = [];
  const add = (ref: string, description: string, qty: number, unitCost: number) => {
    // A credit line (scrap) carries a negative unit cost — kept, not dropped.
    if (qty > 0 && unitCost !== 0) lines.push({ ref, description, qty: r4(qty), unitCost: r4(unitCost) });
  };
  const part = (p: { gbp: number; basis: CountryBasis }) => inCountry(p.gbp, p.basis);

  const netSteel = f.statorSteelKg + f.rotorSteelKg;
  add('LAM', `${steel.grade} laminations — ${f.grossSteelKg.toFixed(2)} kg bought, ${netSteel.toFixed(2)} kg in the stacks (kg bought)`, f.grossSteelKg, steel.pricePerKg);
  add('LAM-SCR', 'Lamination scrap credit (kg, negative)', f.grossSteelKg - netSteel, -steel.scrapRecoveryPricePerKg);
  add('CU', `${cond.grade} — stator winding (kg)`, f.copperKg, cond.pricePerKg);
  if (i.motorType === 'pmsm') add('MAG', `NdFeB magnets ${MAGNET_GRADES[i.magnetGrade ?? '45UH_GBD'].label} (kg)`, f.magnetKg, f.magnetGbpPerKg);
  if (i.motorType === 'induction') {
    const al = material(MOTOR_STRUCTURE.housingAlloyId);
    add('CAGE', 'Rotor cage, die-cast aluminium (kg)', f.rotorSteelKg * MOTOR_PARTS.cageMassFractionOfRotor, al.pricePerKg + inCountry(MOTOR_PARTS.cageConversionGbpPerKg, 'process'));
  }
  if (i.motorType === 'eesm') {
    add('CU-ROT', 'Rotor field winding copper (kg)', f.copperKg * MOTOR_PARTS.eesmRotorCopperFraction, cond.pricePerKg);
    add('SLIP', 'Slip rings + brushes', 1, inCountry(MOTOR_PARTS.slipRingGbp, 'global'));
  }
  add('RESIN', 'Impregnation resin (kg)', f.copperKg * MOTOR_PARTS.resinKgPerKgCopper, inCountry(MOTOR_PARTS.resinGbpPerKg, 'global'));
  add('LINER', 'Slot liners (per slot)', i.slots, part(MOTOR_PARTS.slotLinerPerSlot));
  const alloy = material(MOTOR_STRUCTURE.housingAlloyId);
  add('HSG', `Housing — die-cast ${alloy.grade} + machining (${f.housingKg.toFixed(2)} kg, ESTIMATE conversion)`, f.housingKg,
    alloy.pricePerKg / MOTOR_STRUCTURE.housingCastYield + inCountry(MOTOR_STRUCTURE.housingConversionGbpPerKg, 'process'));
  const shaft = material(MOTOR_STRUCTURE.shaftSteelId);
  add('SHAFT', `Shaft — ${shaft.grade}, turned, ground, splined (kg, ESTIMATE conversion)`, f.shaftKg,
    shaft.pricePerKg + inCountry(MOTOR_STRUCTURE.shaftConversionGbpPerKg, 'process'));
  add('BRG', 'Bearings', 2, part(MOTOR_PARTS.bearing));
  add('RES', 'Resolver', 1, part(MOTOR_PARTS.resolver));
  add('NTC', 'Winding temperature sensors', 2, part(MOTOR_PARTS.tempSensor));
  add('HVT', 'HV terminal block + phase leads', 1, part(MOTOR_PARTS.hvTerminal));
  add('SEAL', 'Seals, fasteners, end-cover gasket', 1, part(MOTOR_PARTS.sealsFasteners));

  const materialCost = lines.reduce((t, l) => t + l.qty * l.unitCost, 0);
  const rawMaterial: RawMaterialInput = {
    materialId: 'mat-virtual', netWeightKg: 0, materialUtilization: 1,
    directCost: materialCost * reject, lines,
  };

  const ops: OperationInput[] = [];
  const op = (name: string, machineId: string, seconds: number, manning: number, labourId = i.labourId) => {
    const hr = seconds / 3600 * reject;
    if (hr > 0) ops.push({ operationName: name, machineId, labourId, cycleTimeHr: hr, partsPerCycle: 1, oee: i.oee, manning, labourTimeHr: hr, labourEfficiency: i.labourEfficiency });
  };
  // 300 strokes a minute, one stator + rotor lamination pair a stroke.
  op(`Lamination stamping (${f.strokes} strokes at 300 spm, interlocked in the die)`, 'emot-lamination-press', f.strokes / 300 * 60, 0.2);
  if (i.winding === 'hairpin') {
    op(`Hairpin forming + insertion (${i.slots} slots × ${i.hairpinLayers ?? 4} layers)`, 'emot-hairpin-line', 90, 0.5);
    op(`Hairpin twist + laser weld (${f.welds} joints × 0.6 s + 30 s handling)`, 'emot-hairpin-weld', f.welds * 0.6 + 30, 0.25);
  } else {
    op(`Round-wire winding + insertion (${i.slots} slots)`, 'emot-winding-machine', 240, 0.5);
  }
  op('Trickle impregnation + cure (in-line, takt)', 'emot-impregnation', 120, 0.25);
  op(i.motorType === 'pmsm' ? 'Rotor: magnet insertion, bonding, shaft press' : 'Rotor: stack, cage / winding, shaft press', 'emot-rotor-line', 60, 0.5);
  op('Rotor balancing', 'emot-balancing', 90, 0.5);
  op('Final assembly: stator shrink-fit, rotor, bearings, resolver, end cover', 'emot-assembly-line', 360, 2);
  op('End-of-line test (back-EMF, HiPot, partial discharge, NVH)', 'emot-eol', 300, 0.5, i.testLabourId);

  // Lamination dies wear out by strokes; hairpin tools and fixtures are one set for the programme.
  const vol = Math.max(1, i.amortizationVolume);
  // Fractional wear-out, as forging dies: a programme of 1.2 die lives pays 1.2 dies, never 2 (one set minimum).
  const dies = Math.max(1, f.strokes * vol / EV_TOOLING.laminationDieLifeStrokes);
  const tools = dies * EV_TOOLING.laminationDieGbp + (i.winding === 'hairpin' ? EV_TOOLING.hairpinToolsGbp : 0) + EV_TOOLING.motorFixturesGbp;
  return {
    rawMaterial, operations: ops,
    tooling: { totalToolingCost: inCountry(tools, { globalShare: 0.2, rest: 'toolroom' }), amortizationVolume: vol, mode: 'amortized' },
  };
}
