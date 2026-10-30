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

/**
 * Geometry and line constants of this module — every one an engineering-typical ESTIMATE, not sourced. Each is printed
 * in the material line or operation it moves (arithmetic audit E4, 30 Oct 2026), so the report states it.
 */
/** Stacking factor when none is typed (the form does not offer one). */
export const MOTOR_STACKING_FACTOR = 0.96;
/** Strip carrier each side of the square pitch, mm (pitch = stator OD + 2 × 3 mm). */
export const MOTOR_STRIP_CARRIER_MM = 3;
/** Rotor disc steel share: PMSM 0.92 (magnet pockets ~8 %), induction / EESM 0.80 (cage or pole slots). */
export const rotorSteelShareOf = (t: MotorType): number => (t === 'pmsm' ? 0.92 : 0.80);
/** Housing end bells, m each, on top of the stack + end turns. */
export const MOTOR_END_BELL_M = 0.04;
/** Shaft length beyond the stack (bearing journals, spline, nose), m. */
export const MOTOR_SHAFT_OVERHANG_M = 0.2;
/** Lamination press speed, strokes a minute (one stator + rotor pair a stroke). */
export const LAMINATION_SPM = 300;
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
  const sf = i.stackingFactor ?? MOTOR_STACKING_FACTOR;
  const steel = material(i.laminationMaterialId);
  const L = m(i.stackLengthMm);
  const annulus = Math.PI / 4 * (m(i.statorOdMm) ** 2 - m(i.statorIdMm) ** 2);
  const steelFrac = i.statorSteelFraction ?? 0.60;
  const rotorOd = i.statorIdMm - 2 * i.airgapMm;
  const rotorDisc = Math.PI / 4 * (m(rotorOd) ** 2 - m(i.shaftDiaMm) ** 2);
  const laminations = Math.ceil(i.stackLengthMm / i.laminationThicknessMm * sf);
  const statorSteelKg = annulus * steelFrac * L * sf * steel.densityKgPerM3;
  // PMSM rotor: the magnet pockets take ~8 % of the disc (ESTIMATE); induction and EESM rotors carry the cage / pole slots.
  const rotorSteelShare = rotorSteelShareOf(i.motorType);
  const rotorSteelKg = rotorDisc * rotorSteelShare * L * sf * steel.densityKgPerM3;
  // One square pitch (OD + 2 × 3 mm carrier) per lamination pair: the rotor comes out of the stator's bore.
  const pitch = m(i.statorOdMm + 2 * MOTOR_STRIP_CARRIER_MM);
  const grossSteelKg = laminations * pitch * pitch * m(i.laminationThicknessMm) * steel.densityKgPerM3;
  const fill = i.slotFill ?? (i.winding === 'hairpin' ? 0.65 : 0.45);
  const endTurn = i.endTurnFactor ?? (i.winding === 'hairpin' ? 0.5 : 0.9);
  const cond = material(i.conductorMaterialId);
  const copperKg = annulus * (1 - steelFrac) * fill * L * (1 + endTurn) * cond.densityKgPerM3;
  const magnetKg = i.motorType === 'pmsm' ? (i.magnetMassKg ?? 1.5) : 0;
  // Housing: a die-cast shell around the stator — circumference × (stack + end turns + 2 × 40 mm end bells) × wall,
  // at the library density of the alloy it is priced as (it was a 2,700 kg/m³ literal against A380's 2,680 — audit E2).
  const shellLen = L * (1 + endTurn) + 2 * MOTOR_END_BELL_M;
  const housingKg = Math.PI * m(i.statorOdMm + MOTOR_STRUCTURE.housingWallMm) * shellLen * m(MOTOR_STRUCTURE.housingWallMm)
    * material(MOTOR_STRUCTURE.housingAlloyId).densityKgPerM3 * MOTOR_STRUCTURE.housingFeatureFactor;
  const shaftKg = Math.PI / 4 * m(i.shaftDiaMm) ** 2 * (L + MOTOR_SHAFT_OVERHANG_M) * material(MOTOR_STRUCTURE.shaftSteelId).densityKgPerM3;
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
  const sf = i.stackingFactor ?? MOTOR_STACKING_FACTOR;
  add('LAM', `${steel.grade} laminations — ${f.laminations} = ${i.stackLengthMm} mm × ${sf} stacking ÷ ${i.laminationThicknessMm} mm; `
    + `${f.grossSteelKg.toFixed(2)} kg bought on a ${i.statorOdMm + 2 * MOTOR_STRIP_CARRIER_MM} mm square pitch (OD + 2 × ${MOTOR_STRIP_CARRIER_MM} mm carrier), `
    + `${netSteel.toFixed(2)} kg in the stacks (stator steel share ${i.statorSteelFraction ?? 0.60}, rotor ${rotorSteelShareOf(i.motorType)}`
    + `${i.stackingFactor === undefined ? '; stacking factor, carrier and rotor share are ESTIMATES' : '; carrier and rotor share are ESTIMATES'}) (kg bought)`, f.grossSteelKg, steel.pricePerKg);
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
  add('HSG', `Housing — die-cast ${alloy.grade} + machining (${f.housingKg.toFixed(2)} kg = π × ${i.statorOdMm + MOTOR_STRUCTURE.housingWallMm} mm × `
    + `(stack + end turns + 2 × ${MOTOR_END_BELL_M * 1000} mm end bells) × ${MOTOR_STRUCTURE.housingWallMm} mm wall × ${alloy.densityKgPerM3} kg/m³ × `
    + `${MOTOR_STRUCTURE.housingFeatureFactor} features; ÷ ${MOTOR_STRUCTURE.housingCastYield} cast yield; mass, yield and conversion are ESTIMATES)`, f.housingKg,
    alloy.pricePerKg / MOTOR_STRUCTURE.housingCastYield + inCountry(MOTOR_STRUCTURE.housingConversionGbpPerKg, 'process'));
  const shaft = material(MOTOR_STRUCTURE.shaftSteelId);
  add('SHAFT', `Shaft — ${shaft.grade}, turned, ground, splined (Ø${i.shaftDiaMm} mm × stack + ${MOTOR_SHAFT_OVERHANG_M * 1000} mm, kg; length and conversion are ESTIMATES)`, f.shaftKg,
    shaft.pricePerKg + inCountry(MOTOR_STRUCTURE.shaftConversionGbpPerKg, 'process'));
  add('BRG', 'Bearings', 2, part(MOTOR_PARTS.bearing));
  add('RES', 'Resolver', 1, part(MOTOR_PARTS.resolver));
  add('NTC', 'Winding temperature sensors', 2, part(MOTOR_PARTS.tempSensor));
  add('HVT', 'HV terminal block + phase leads', 1, part(MOTOR_PARTS.hvTerminal));
  add('SEAL', 'Seals, fasteners, end-cover gasket', 1, part(MOTOR_PARTS.sealsFasteners));

  // Provenance on every line (E5): what is the rate book's, what is sourced, what is an ESTIMATE.
  const fill = i.slotFill ?? (i.winding === 'hairpin' ? 0.65 : 0.45);
  const endTurn = i.endTurnFactor ?? (i.winding === 'hairpin' ? 0.5 : 0.9);
  const g = MAGNET_GRADES[i.magnetGrade ?? '45UH_GBD'];
  const NOTES: Record<string, string> = {
    LAM: 'electrical steel at the rate book price',
    'LAM-SCR': 'credited at the rate book scrap price',
    CU: `slot area = stator annulus × (1 − ${i.statorSteelFraction ?? 0.60} steel share) × ${fill} fill × stack × (1 + ${endTurn} end turns)`
      + `${i.slotFill === undefined || i.endTurnFactor === undefined ? '; fill / end-turn factor by winding — ESTIMATE' : ''}; conductor at the rate book price`,
    MAG: `${g.basis}; × (1 + ${MAGNET_FINISHING_UPLIFT * 100} % blank → finished magnet — ESTIMATE) ÷ the rate book's CNY/£`,
    CAGE: `${MOTOR_PARTS.cageMassFractionOfRotor * 100} % of the rotor lamination mass and the casting conversion £/kg — ESTIMATE`,
    'CU-ROT': `${MOTOR_PARTS.eesmRotorCopperFraction * 100} % of the stator copper — ESTIMATE`,
    SLIP: 'slip rings + brushes — ESTIMATE',
    RESIN: `${MOTOR_PARTS.resinKgPerKgCopper} kg a kg of copper and its £/kg — ESTIMATE`,
    HSG: 'alloy at the rate book price ÷ the cast yield, + die-cast and machining conversion £/kg — ESTIMATE; cost it in Cast + Machine for detail',
    SHAFT: 'steel at the rate book price + turn, grind and spline conversion £/kg — ESTIMATE; cost it in Machining for detail',
    LINER: MOTOR_PARTS.slotLinerPerSlot.note, BRG: MOTOR_PARTS.bearing.note, RES: MOTOR_PARTS.resolver.note,
    NTC: MOTOR_PARTS.tempSensor.note, HVT: MOTOR_PARTS.hvTerminal.note, SEAL: MOTOR_PARTS.sealsFasteners.note,
  };
  for (const l of lines) if (NOTES[l.ref]) l.note = NOTES[l.ref];
  const materialCost = lines.reduce((t, l) => t + l.qty * l.unitCost, 0);
  // The reject allowance is part of the material bucket; itemise it so the lines add up to it (audit E1).
  if (reject > 1) lines.push({ ref: 'REJ', description: `Reject allowance ${((i.rejectRate ?? 0) * 100).toFixed(1)} % — the lines above × 1 ÷ (1 − ${i.rejectRate}) − 1`,
    qty: 1, unitCost: materialCost * (reject - 1) });
  const rawMaterial: RawMaterialInput = {
    materialId: 'mat-virtual', netWeightKg: 0, materialUtilization: 1,
    directCost: materialCost * reject, lines,
  };

  // Every line time and crew below is an engineering-typical ESTIMATE; each operation name states its figures.
  const ops: OperationInput[] = [];
  const op = (name: string, machineId: string, seconds: number, manning: number, labourId = i.labourId) => {
    const hr = seconds / 3600 * reject;
    if (hr > 0) ops.push({ operationName: `${name}, crew ${manning} — ESTIMATE`, machineId, labourId, cycleTimeHr: hr, partsPerCycle: 1, oee: i.oee, manning, labourTimeHr: hr, labourEfficiency: i.labourEfficiency });
  };
  // 300 strokes a minute, one stator + rotor lamination pair a stroke.
  op(`Lamination stamping (${f.strokes} strokes at ${LAMINATION_SPM} spm, interlocked in the die)`, 'emot-lamination-press', f.strokes / LAMINATION_SPM * 60, 0.2);
  if (i.winding === 'hairpin') {
    op(`Hairpin forming + insertion (${i.slots} slots × ${i.hairpinLayers ?? 4} layers; 90 s)`, 'emot-hairpin-line', 90, 0.5);
    op(`Hairpin twist + laser weld (${f.welds} joints × 0.6 s + 30 s handling)`, 'emot-hairpin-weld', f.welds * 0.6 + 30, 0.25);
  } else {
    op(`Round-wire winding + insertion (${i.slots} slots; 240 s)`, 'emot-winding-machine', 240, 0.5);
  }
  op('Trickle impregnation + cure (in-line, 120 s takt)', 'emot-impregnation', 120, 0.25);
  op(i.motorType === 'pmsm' ? 'Rotor: magnet insertion, bonding, shaft press (60 s)' : 'Rotor: stack, cage / winding, shaft press (60 s)', 'emot-rotor-line', 60, 0.5);
  op('Rotor balancing (90 s)', 'emot-balancing', 90, 0.5);
  op('Final assembly: stator shrink-fit, rotor, bearings, resolver, end cover (360 s)', 'emot-assembly-line', 360, 2);
  op('End-of-line test (back-EMF, HiPot, partial discharge, NVH; 300 s)', 'emot-eol', 300, 0.5, i.testLabourId);

  // Lamination dies wear out by strokes; hairpin tools and fixtures are one set for the programme.
  const vol = Math.max(1, i.amortizationVolume);
  // Fractional wear-out, as forging dies: a programme of 1.2 die lives pays 1.2 dies, never 2 (one set minimum).
  const dies = Math.max(1, f.strokes * vol / EV_TOOLING.laminationDieLifeStrokes);
  const tools = dies * EV_TOOLING.laminationDieGbp + (i.winding === 'hairpin' ? EV_TOOLING.hairpinToolsGbp : 0) + EV_TOOLING.motorFixturesGbp;
  const toolBasis = { globalShare: 0.2, rest: 'toolroom' } as const;
  const items = [
    { label: `Lamination progressive dies: ${dies.toFixed(2)} sets = max(1, ${f.strokes} strokes × ${vol.toLocaleString('en-GB')} motors ÷ ${EV_TOOLING.laminationDieLifeStrokes.toLocaleString('en-GB')} strokes a die) — ESTIMATE price and life`, gbp: inCountry(dies * EV_TOOLING.laminationDieGbp, toolBasis) },
    ...(i.winding === 'hairpin' ? [{ label: 'Hairpin forming tools — ESTIMATE', gbp: inCountry(EV_TOOLING.hairpinToolsGbp, toolBasis) }] : []),
    { label: 'Motor line fixtures — ESTIMATE', gbp: inCountry(EV_TOOLING.motorFixturesGbp, toolBasis) },
  ];
  return {
    rawMaterial, operations: ops,
    tooling: { totalToolingCost: inCountry(tools, toolBasis), amortizationVolume: vol, mode: 'amortized', items },
  };
}
