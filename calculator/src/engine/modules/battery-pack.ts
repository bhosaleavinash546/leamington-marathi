/**
 * Battery pack should-cost (EV propulsion build, Oct 2026).
 *
 * Cells are BOUGHT IN at a market price (BNEF 2025 survey, by chemistry — ev-data.ts) or the engineer's quote;
 * everything around them is built up: busbars and the sensing harness from the cell count and format, BMS from
 * the series count, enclosure and cold plate from the footprint, thermal interface and barriers, the HV junction
 * box, and the line that assembles it (cell test, stacking, laser welding, dispensing, pack assembly, leak and
 * end-of-line test). Money is the core stack's: material is a direct cost itemised line by line, operations run on
 * library machines and labour (both follow the costing country), tooling is amortised.
 *
 * The cells are bought-in content: they carry their supplier's overhead and margin, so the pack maker's own
 * overhead and margin are NOT applied to them again (rawMaterial.boughtIn, a handling charge instead) — the BIW
 * rule. Library metals are read from the ACTIVE book, so a costing in China buys Chinese aluminium.
 */
import type { CommodityDrivers, MaterialLineItem, OperationInput, RawMaterialInput } from '../types.js';
import { activeRates } from '../rate-context.js';
import { inCountry, type CountryBasis } from '../regional-services.js';
import {
  CELL_PRICE_USD_PER_KWH, CELL_NOMINAL_V, CELL_FORMAT, PACK_PARTS, PACK_STRUCTURE, EV_TOOLING,
  type CellChemistry, type CellFormat,
} from '../ev-data.js';

export interface BatteryPackInputs {
  chemistry: CellChemistry;
  cellFormat: CellFormat;
  cellCapacityAh: number;
  /** V; default by chemistry. */
  cellNominalV?: number;
  seriesCount: number;
  parallelCount: number;
  architecture: 'module' | 'cell_to_pack';
  /** Module architecture only. */
  cellsPerModule?: number;
  /** A supplier's cell quote, £ per kWh — replaces the market price. */
  cellPriceGbpPerKwh?: number;
  packLengthMm: number;
  packWidthMm: number;
  enclosure: 'aluminium' | 'steel';
  /** Series channels per cell-monitoring board (12–18). */
  cmuChannels?: number;
  mainContactors?: number;
  pyrofuse?: boolean;
  labourId: string;
  testLabourId: string;
  oee: number;
  labourEfficiency: number;
  rejectRate?: number;
  /** Cells are bought in: a handling / procurement charge on them instead of overhead (0.02–0.05). */
  cellHandlingPct?: number;
  amortizationVolume: number;
}

export interface BatteryPackFacts {
  cells: number; packKwh: number; packV: number; modules: number; joints: number;
  cellGbpPerKwh: number; cellBasis: string; footprintM2: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The pack's electrical facts — shared by the module, the advisor and the form's summary. */
export function batteryPackFacts(i: BatteryPackInputs): BatteryPackFacts {
  const fx = activeRates().fx?.find(f => f.id === 'fx-gbp-usd')?.rate ?? 1.324;
  const cells = Math.max(1, Math.round(i.seriesCount) * Math.round(i.parallelCount));
  const v = i.cellNominalV ?? CELL_NOMINAL_V[i.chemistry];
  const packKwh = cells * i.cellCapacityAh * v / 1000;
  const modules = i.architecture === 'module' ? Math.ceil(cells / Math.max(1, i.cellsPerModule ?? 24)) : 0;
  const market = CELL_PRICE_USD_PER_KWH[i.chemistry];
  const cellGbpPerKwh = i.cellPriceGbpPerKwh && i.cellPriceGbpPerKwh > 0 ? i.cellPriceGbpPerKwh : market.usd / fx;
  return {
    cells, packKwh, packV: Math.round(i.seriesCount) * v, modules,
    // One welded joint per cell terminal pair into the busbar (both terminals of every cell).
    joints: cells * 2,
    cellGbpPerKwh,
    cellBasis: i.cellPriceGbpPerKwh && i.cellPriceGbpPerKwh > 0
      ? `supplier quote £${i.cellPriceGbpPerKwh.toFixed(2)}/kWh`
      : `${market.basis}: $${market.usd}/kWh at $${fx}/£`,
    footprintM2: (i.packLengthMm / 1000) * (i.packWidthMm / 1000),
  };
}

const priceOf = (id: string): number => activeRates().materials.find(m => m.id === id)?.pricePerKg
  ?? (() => { throw new Error(`battery pack: material '${id}' is not in the rate library`); })();

export function computeBatteryPackDrivers(i: BatteryPackInputs): CommodityDrivers {
  const f = batteryPackFacts(i);
  const fmt = CELL_FORMAT[i.cellFormat];
  const reject = i.rejectRate && i.rejectRate > 0 ? 1 / (1 - i.rejectRate) : 1;
  const lines: MaterialLineItem[] = [];
  const add = (ref: string, description: string, qty: number, unitCost: number) => {
    if (qty > 0 && unitCost > 0) lines.push({ ref, description, qty: r2(qty * 1000) / 1000, unitCost: Math.round(unitCost * 10_000) / 10_000 });
  };
  const part = (p: { gbp: number; basis: CountryBasis }) => inCountry(p.gbp, p.basis);

  // ── Cells (bought in) ──
  const cellUnit = f.cellGbpPerKwh * (f.packKwh / f.cells);
  const cellsCost = cellUnit * f.cells;

  // ── Electrical integration ──
  const busbarKg = f.joints * fmt.busbarGPerJoint / 1000;
  add('BB-AL', `Aluminium busbars / contact system (${fmt.busbarGPerJoint} g × ${f.joints} joints, kg)`, busbarKg, priceOf(PACK_STRUCTURE.busbarMaterialId) + inCountry(PACK_STRUCTURE.busbarConversionGbpPerKg, 'process'));
  if (f.modules > 1) add('BB-CU', 'Copper inter-module busbars (kg)', f.modules * PACK_STRUCTURE.interModuleCopperKgPerModule, priceOf(PACK_STRUCTURE.copperMaterialId) + inCountry(PACK_STRUCTURE.busbarConversionGbpPerKg, 'process'));
  add('CCS', 'Cell sensing harness per series channel', i.seriesCount, part(PACK_PARTS.sensingPerChannel));
  add('BMS-M', 'BMS master controller', 1, part(PACK_PARTS.bmsMaster));
  add('BMS-C', `Cell monitoring boards (${i.cmuChannels ?? 16} channels each)`, Math.ceil(i.seriesCount / Math.max(1, i.cmuChannels ?? 16)), part(PACK_PARTS.cmuBoard));

  // ── HV junction box ──
  add('K-MAIN', 'HV main contactors', i.mainContactors ?? 2, part(PACK_PARTS.mainContactor));
  add('K-PRE', 'Pre-charge contactor + resistor', 1, part(PACK_PARTS.prechargeCircuit));
  if (i.pyrofuse !== false) add('PYRO', 'Pyrotechnic disconnect', 1, part(PACK_PARTS.pyrofuse));
  add('FUSE', 'HV main fuse', 1, part(PACK_PARTS.mainFuse));
  add('ISENS', 'Pack current sensor', 1, part(PACK_PARTS.currentSensor));
  add('MSD', 'Manual service disconnect', 1, part(PACK_PARTS.serviceDisconnect));
  add('HVC', 'HV connector pair', 1, part(PACK_PARTS.hvConnectors));
  add('LVC', 'LV signal connector', 1, part(PACK_PARTS.lvConnector));

  // ── Structure and thermal ──
  const enc = PACK_STRUCTURE[i.enclosure];
  add('ENC', `${enc.label} (${enc.kgPerM2} kg/m² × ${f.footprintM2.toFixed(2)} m², kg)`, enc.kgPerM2 * f.footprintM2, priceOf(enc.materialId) + inCountry(enc.conversionGbpPerKg, 'process'));
  const cp = PACK_STRUCTURE.coldPlate;
  add('CP', `${cp.label} (kg)`, cp.kgPerM2 * f.footprintM2, priceOf(cp.materialId) + inCountry(cp.conversionGbpPerKg, 'process'));
  add('TIM', 'Gap filler (kg)', PACK_PARTS.gapFillerKgPerM2 * f.footprintM2, inCountry(PACK_PARTS.gapFillerGbpPerKg, 'global'));
  add('MICA', 'Thermal-runaway barriers, 2 layers (m²)', 2 * f.footprintM2, inCountry(PACK_PARTS.micaGbpPerM2, 'global'));
  if (i.architecture === 'cell_to_pack') add('ADH', 'Cell-to-pack structural adhesive (kg)', PACK_PARTS.ctpAdhesiveKgPerKwh * f.packKwh, inCountry(PACK_PARTS.adhesiveGbpPerKg, 'global'));
  else add('MOD-HW', 'Module end / side plates + strap', f.modules, part(PACK_PARTS.moduleHardware));
  add('VENT', 'Vent valve', 1, part(PACK_PARTS.ventValve));
  add('COOL-C', 'Coolant connector pair', 1, part(PACK_PARTS.coolantConnectors));
  add('SEAL', 'Lid seal + fasteners', 1, part(PACK_PARTS.sealsFasteners));

  const integration = lines.reduce((t, l) => t + l.qty * l.unitCost, 0);
  lines.unshift({ ref: 'CELLS', description: `${i.chemistry} ${fmt.label} cells ${i.cellCapacityAh} Ah — ${f.cellBasis} (bought in)`, qty: f.cells, unitCost: Math.round(cellUnit * 10_000) / 10_000 });

  const rawMaterial: RawMaterialInput = {
    materialId: 'mat-virtual', netWeightKg: 0, materialUtilization: 1,
    // The integration parts only: the core ADDS the bought-in cells to the material line itself
    // (core.ts), outside the overhead and margin base — handling only, as on BIW.
    directCost: integration * reject,
    boughtIn: { cost: cellsCost * reject, handlingPct: i.cellHandlingPct ?? 0.03 },
    lines,
  };

  // ── Operations (per pack) ──
  const ops: OperationInput[] = [];
  const op = (name: string, machineId: string, seconds: number, manning: number, labourId = i.labourId) => {
    const hr = seconds / 3600 * reject;
    if (hr > 0) ops.push({ operationName: name, machineId, labourId, cycleTimeHr: hr, partsPerCycle: 1, oee: i.oee, manning, labourTimeHr: hr, labourEfficiency: i.labourEfficiency });
  };
  op(`Cell incoming OCV / IR test (${f.cells} cells × 2 s)`, 'bat-cell-ocv-tester', f.cells * 2, 0.2, i.testLabourId);
  op(`Cell ${i.architecture === 'module' ? 'stacking into modules' : 'placement into pack'} (${f.cells} × ${fmt.stackSecPerCell} s)`, 'bat-module-stacking', f.cells * fmt.stackSecPerCell, 0.5);
  op(`Busbar laser welding (${f.joints} joints × ${fmt.weldSecPerJoint} s)`, 'bat-laser-weld', f.joints * fmt.weldSecPerJoint, 0.25);
  if (f.modules > 0) op(`Module end-of-line test (${f.modules} × 60 s)`, 'bat-module-eol', f.modules * 60, 0.25, i.testLabourId);
  op(`Gap filler / adhesive dispensing (${f.footprintM2.toFixed(2)} m² × 90 s)`, 'bat-dispense', f.footprintM2 * 90, 0.25);
  op(`Pack assembly (BMS, HV box, harness, lid${f.modules ? `, ${f.modules} modules` : ''})`, 'bat-pack-assembly', 2400 + f.modules * 45, 2);
  op('Leak test (enclosure + coolant circuit)', 'bat-leak-test', 300, 0.5, i.testLabourId);
  op('Pack end-of-line test (HiPot, isolation, BMS, charge / discharge check)', 'bat-pack-eol', 1200, 0.5, i.testLabourId);

  return {
    rawMaterial,
    operations: ops,
    tooling: {
      totalToolingCost: inCountry(EV_TOOLING.packFixturesGbp, { globalShare: 0.2, rest: 'toolroom' }),
      amortizationVolume: Math.max(1, i.amortizationVolume), mode: 'amortized',
    },
  };
}
