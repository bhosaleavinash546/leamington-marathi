/**
 * EV propulsion forms — battery pack and e-motor (built Oct 2026). A module, not main.ts (review L12).
 *
 * The forms hold the specification; the collectors call the engine modules (battery-pack.ts, e-motor.ts), which
 * read the active country's rate book. After Calculate, `renderEvChecks` writes the result against the cited
 * market benchmarks (ev-advisor.ts) into the form's check panel. Money inputs hold £ and say £ (the money rule).
 */
import { CELL_PRICE_USD_PER_KWH, CELL_FORMAT, MAGNET_GRADES, type CellChemistry, type CellFormat, type MagnetGrade } from '../engine/ev-data.js';
import { computeBatteryPackDrivers, batteryPackFacts, type BatteryPackInputs } from '../engine/modules/battery-pack.js';
import { computeEMotorDrivers, eMotorFacts, type EMotorInputs, type MotorType, type WindingType } from '../engine/modules/e-motor.js';
import { batteryPackChecks, eMotorChecks, type EvCheck } from '../engine/modules/ev-advisor.js';
import type { CommodityDrivers, PartCostResult, UniversalStackInput } from '../engine/types.js';

export interface EvFormReader { num(id: string): number; sel(id: string): string }

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const numField = (id: string, label: string, value: number | string, tip: string, step = 'any', min = '0') =>
  `<div class="field-group"><label for="${id}">${label} <span title="${esc(tip)}">ℹ</span></label><input type="number" id="${id}" step="${step}" min="${min}" value="${value}"/></div>`;
const select = (id: string, label: string, opts: Array<[string, string]>, selected: string) =>
  `<div class="field-group"><label for="${id}">${label}</label><select id="${id}">${opts.map(([v, l]) => `<option value="${v}"${v === selected ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
const row = (...fields: string[]) => `<div class="field-row" style="margin-top:6px">${fields.join('')}</div>`;
const checksPanel = '<div id="ev-checks" style="margin-top:10px"></div>';

// ─── Battery pack ────────────────────────────────────────────────────────────

export function renderBatteryPackForm(): string {
  const chem: Array<[string, string]> = (Object.keys(CELL_PRICE_USD_PER_KWH) as CellChemistry[]).map(c => [c, `${c} — $${CELL_PRICE_USD_PER_KWH[c].usd}/kWh market`]);
  const fmts: Array<[string, string]> = (Object.keys(CELL_FORMAT) as CellFormat[]).map(f => [f, CELL_FORMAT[f].label]);
  return `
    <div style="font-size:0.72rem;color:var(--text-secondary);padding:6px 8px;background:color-mix(in srgb, var(--accent) 7%, var(--surface));border-radius:4px;margin-bottom:6px">
      Cells are bought in at the BNEF 2025 market price for the chemistry (or your quote); the integration around them — busbars, BMS, HV box, enclosure, cooling — and the assembly line are built up. Part prices marked ESTIMATE in the material lines are engineering typicals: replace them with quotes.
    </div>
    <div class="section-title">Cells</div>
    ${row(select('bp-chem', 'Chemistry', chem, 'NMC'), select('bp-format', 'Cell format', fmts, 'prismatic'))}
    ${row(numField('bp-cell-ah', 'Cell capacity (Ah)', 140, 'Rated capacity of one cell.'), numField('bp-cell-v', 'Cell nominal V (0 = by chemistry)', 0, 'LFP 3.2 V, LMFP 3.7, NMC 3.65, NCA 3.6 when left at 0.'))}
    ${row(numField('bp-series', 'Cells in series', 192, 'Sets pack voltage and the BMS channel count.', '1', '1'), numField('bp-parallel', 'Cells in parallel', 1, 'Parallel cells per series group.', '1', '1'))}
    ${row(numField('bp-cell-quote', 'Cell quote £/kWh (0 = market)', 0, 'A supplier quote replaces the BNEF market price.'), numField('bp-cell-handling', 'Cell handling (0–1)', 0.03, 'Procurement / handling charged on the bought-in cells instead of overhead and margin.'))}
    <div class="section-title" style="margin-top:8px">Pack</div>
    ${row(select('bp-arch', 'Architecture', [['module', 'Modules'], ['cell_to_pack', 'Cell-to-pack']], 'module'), numField('bp-cells-per-module', 'Cells per module', 24, 'Module architecture only.', '1', '1'))}
    ${row(numField('bp-length', 'Pack length (mm)', 2000, 'Footprint: sizes the enclosure, cold plate, gap filler and barriers.'), numField('bp-width', 'Pack width (mm)', 1400, 'Footprint width.'))}
    ${row(select('bp-enclosure', 'Enclosure', [['aluminium', 'Aluminium'], ['steel', 'Steel']], 'aluminium'), numField('bp-cmu', 'Channels per monitoring board', 16, '12–18 series channels per cell-monitoring board.', '1', '1'))}
    ${row(numField('bp-contactors', 'Main contactors', 2, 'Usually 2 (positive and negative).', '1', '0'), select('bp-pyro', 'Pyrofuse', [['yes', 'Yes'], ['no', 'No']], 'yes'))}
    <div class="section-title" style="margin-top:8px">Line</div>
    ${row(`<div class="field-group"><label for="bp-lab">Assembly labour</label><select id="bp-lab" class="labour-select"></select></div>`, `<div class="field-group"><label for="bp-test-lab">Test labour</label><select id="bp-test-lab" class="labour-select"></select></div>`)}
    ${row(numField('bp-oee', 'OEE', 0.85, 'Line OEE.'), numField('bp-lab-eff', 'Labour efficiency', 0.9, 'Breaks, waiting, indirect time.'))}
    ${row(numField('bp-reject', 'Reject rate (0–1)', 0.01, 'Packs scrapped or reworked at EOL.'), numField('bp-amort', 'Amortisation volume (packs)', 300000, 'Programme volume over which the line fixtures are paid.', '1000', '1'))}
    <div id="bp-summary" style="margin-top:8px;font-size:0.74rem;color:var(--text-secondary)"></div>
    ${checksPanel}`;
}

function batteryInputs(r: EvFormReader): BatteryPackInputs {
  const v = r.num('bp-cell-v');
  return {
    chemistry: (r.sel('bp-chem') || 'NMC') as CellChemistry,
    cellFormat: (r.sel('bp-format') || 'prismatic') as CellFormat,
    cellCapacityAh: r.num('bp-cell-ah') || 140,
    cellNominalV: v > 0 ? v : undefined,
    seriesCount: Math.max(1, Math.round(r.num('bp-series') || 192)),
    parallelCount: Math.max(1, Math.round(r.num('bp-parallel') || 1)),
    architecture: r.sel('bp-arch') === 'cell_to_pack' ? 'cell_to_pack' : 'module',
    cellsPerModule: Math.max(1, Math.round(r.num('bp-cells-per-module') || 24)),
    cellPriceGbpPerKwh: r.num('bp-cell-quote') > 0 ? r.num('bp-cell-quote') : undefined,
    cellHandlingPct: r.num('bp-cell-handling') >= 0 ? r.num('bp-cell-handling') : 0.03,
    packLengthMm: r.num('bp-length') || 2000,
    packWidthMm: r.num('bp-width') || 1400,
    enclosure: r.sel('bp-enclosure') === 'steel' ? 'steel' : 'aluminium',
    cmuChannels: Math.max(1, Math.round(r.num('bp-cmu') || 16)),
    mainContactors: Math.max(0, Math.round(r.num('bp-contactors'))),
    pyrofuse: r.sel('bp-pyro') !== 'no',
    labourId: r.sel('bp-lab') || 'lab-uk-semiskilled',
    testLabourId: r.sel('bp-test-lab') || 'lab-uk-technician',
    oee: r.num('bp-oee') || 0.85,
    labourEfficiency: r.num('bp-lab-eff') || 0.9,
    rejectRate: r.num('bp-reject'),
    amortizationVolume: Math.max(1, r.num('bp-amort') || 300000),
  };
}

export function collectBatteryPackDrivers(r: EvFormReader): CommodityDrivers {
  const inputs = batteryInputs(r);
  const f = batteryPackFacts(inputs);
  const s = document.getElementById('bp-summary');
  if (s) s.textContent = `${f.cells} cells · ${f.packKwh.toFixed(1)} kWh · ${f.packV.toFixed(0)} V nominal${f.modules ? ` · ${f.modules} modules` : ' · cell-to-pack'} · ${f.footprintM2.toFixed(2)} m² footprint`;
  return computeBatteryPackDrivers(inputs);
}

// ─── E-motor ─────────────────────────────────────────────────────────────────

export function renderEMotorForm(): string {
  const mags: Array<[string, string]> = (Object.keys(MAGNET_GRADES) as MagnetGrade[]).map(g => [g, MAGNET_GRADES[g].label]);
  return `
    <div style="font-size:0.72rem;color:var(--text-secondary);padding:6px 8px;background:color-mix(in srgb, var(--accent) 7%, var(--surface));border-radius:4px;margin-bottom:6px">
      Built up from the main dimensions: laminations (stator and rotor from one strip), winding copper from the slot area, magnets, housing and shaft, bought-in parts and the line. Housing and shaft use stated conversion estimates — cost them in Cast + Machine and Machining for detail.
    </div>
    <div class="section-title">Machine</div>
    ${row(select('em-type', 'Motor type', [['pmsm', 'PMSM (interior permanent magnet)'], ['induction', 'Induction'], ['eesm', 'Wound-field (EESM)']], 'pmsm'), select('em-winding', 'Winding', [['hairpin', 'Hairpin'], ['round_wire', 'Round wire']], 'hairpin'))}
    ${row(numField('em-od', 'Stator OD (mm)', 220, 'Outer diameter of the stator lamination.'), numField('em-id', 'Stator ID (mm)', 150, 'Stator bore.'))}
    ${row(numField('em-len', 'Stack length (mm)', 150, 'Active (lamination) stack length.'), numField('em-slots', 'Slots', 48, 'Stator slots.', '1', '1'))}
    ${row(numField('em-gap', 'Air gap (mm)', 0.8, 'Rotor OD = stator ID − 2 × air gap.'), numField('em-shaft', 'Shaft Ø (mm)', 45, 'Shaft bore through the rotor.'))}
    <div class="section-title" style="margin-top:8px">Materials</div>
    ${row(`<div class="field-group"><label for="em-lam">Lamination steel</label><select id="em-lam" class="material-select"></select></div>`, numField('em-t', 'Lamination thickness (mm)', 0.27, '0.20–0.35 mm for traction motors.'))}
    ${row(numField('em-steel-frac', 'Stator steel share (0–1)', 0.6, 'Teeth + yoke share of the stator annulus; the rest is slot.'), numField('em-fill', 'Slot fill (0 = by winding)', 0, 'Hairpin ~0.65, round wire ~0.45 when left at 0.'))}
    ${row(select('em-cond', 'Conductor', [['mat-cu-hairpin', 'Copper'], ['mat-al-hairpin', 'Aluminium']], 'mat-cu-hairpin'), numField('em-layers', 'Hairpin layers per slot', 6, 'Sets the weld joint count (slots × layers / 2).', '1', '1'))}
    ${row(select('em-mag', 'Magnet grade (PMSM)', mags, '45UH_GBD'), numField('em-mag-kg', 'Magnet mass (kg)', 1.5, 'Industry benchmark 1–2 kg per traction PMSM.'))}
    <div class="section-title" style="margin-top:8px">Line</div>
    ${row(`<div class="field-group"><label for="em-lab">Assembly labour</label><select id="em-lab" class="labour-select"></select></div>`, `<div class="field-group"><label for="em-test-lab">Test labour</label><select id="em-test-lab" class="labour-select"></select></div>`)}
    ${row(numField('em-oee', 'OEE', 0.85, 'Line OEE.'), numField('em-lab-eff', 'Labour efficiency', 0.9, 'Breaks, waiting, indirect time.'))}
    ${row(numField('em-reject', 'Reject rate (0–1)', 0.01, 'Motors scrapped or reworked at EOL.'), numField('em-amort', 'Amortisation volume (motors)', 300000, 'Programme volume over which dies and fixtures are paid.', '1000', '1'))}
    <div id="em-summary" style="margin-top:8px;font-size:0.74rem;color:var(--text-secondary)"></div>
    ${checksPanel}`;
}

function motorInputs(r: EvFormReader): EMotorInputs {
  const winding = (r.sel('em-winding') || 'hairpin') as WindingType;
  return {
    motorType: (r.sel('em-type') || 'pmsm') as MotorType,
    statorOdMm: r.num('em-od') || 220, statorIdMm: r.num('em-id') || 150, stackLengthMm: r.num('em-len') || 150,
    slots: Math.max(1, Math.round(r.num('em-slots') || 48)), airgapMm: r.num('em-gap') || 0.8, shaftDiaMm: r.num('em-shaft') || 45,
    laminationThicknessMm: r.num('em-t') || 0.27, laminationMaterialId: r.sel('em-lam') || 'mat-no27-27a',
    statorSteelFraction: r.num('em-steel-frac') || 0.6,
    winding, conductorMaterialId: r.sel('em-cond') || 'mat-cu-hairpin',
    slotFill: r.num('em-fill') > 0 ? r.num('em-fill') : undefined,
    hairpinLayers: Math.max(1, Math.round(r.num('em-layers') || 6)),
    magnetGrade: (r.sel('em-mag') || '45UH_GBD') as MagnetGrade,
    magnetMassKg: r.num('em-mag-kg') || 1.5,
    labourId: r.sel('em-lab') || 'lab-uk-semiskilled', testLabourId: r.sel('em-test-lab') || 'lab-uk-technician',
    oee: r.num('em-oee') || 0.85, labourEfficiency: r.num('em-lab-eff') || 0.9, rejectRate: r.num('em-reject'),
    amortizationVolume: Math.max(1, r.num('em-amort') || 300000),
  };
}

export function collectEMotorDrivers(r: EvFormReader): CommodityDrivers {
  const inputs = motorInputs(r);
  const f = eMotorFacts(inputs);
  const s = document.getElementById('em-summary');
  if (s) s.textContent = `${f.laminations} laminations · steel ${f.grossSteelKg.toFixed(1)} kg bought / ${(f.statorSteelKg + f.rotorSteelKg).toFixed(1)} kg in the stacks · copper ${f.copperKg.toFixed(2)} kg${f.magnetKg ? ` · magnets ${f.magnetKg.toFixed(2)} kg` : ''}`;
  return computeEMotorDrivers(inputs);
}

// ─── Checks after Calculate ──────────────────────────────────────────────────

export function renderEvChecks(commodity: string, result: PartCostResult, input: UniversalStackInput, r: EvFormReader): void {
  const panel = document.getElementById('ev-checks');
  if (!panel) return;
  let checks: EvCheck[] = [];
  if (commodity === 'battery_pack') {
    const bi = batteryInputs(r);
    checks = batteryPackChecks(result, batteryPackFacts(bi), input.rawMaterial.boughtIn?.cost ?? 0, bi.chemistry);
  } else if (commodity === 'e_motor') {
    const mi = motorInputs(r);
    checks = eMotorChecks(result, eMotorFacts(mi), mi.motorType);
  }
  panel.innerHTML = checks.length ? `<div class="section-title">Against the market</div>
    <table class="breakdown-table" style="font-size:0.74rem"><tbody>${checks.map(c => `<tr>
      <td>${esc(c.label)}</td><td><strong>${esc(c.value)}</strong> ${c.flag === 'ok' ? '<span style="color:var(--success)">✓</span>' : '<span style="color:var(--warning)" title="Outside the benchmark range — check the inputs">⚠</span>'}</td>
      <td style="color:var(--text-muted)">${esc(c.benchmark)}</td></tr>`).join('')}</tbody></table>` : '';
}
