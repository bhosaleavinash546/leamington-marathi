import { num, sel, getUniversalTail } from '../helpers.js';
import { computeInjectionMouldingDrivers } from '../../engine/modules/injection-moulding.js';
import type { UniversalStackInput } from '../../engine/types.js';

export function renderInjectionForm(): string {
  return `
    <div class="section-title">Material</div>
    <div class="field-row">
      <div class="field-group"><label>Material</label><select id="imm-mat" class="material-select"></select></div>
      <div class="field-group"><label>Part Weight (kg)</label><input type="number" id="imm-part-wt" step="0.001" min="0.001" value="0.05"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Runner Weight (kg)</label><input type="number" id="imm-runner-wt" step="0.001" min="0" value="0.01"/></div>
      <div class="field-group"><label>Regrind Fraction</label><input type="number" id="imm-regrind" step="0.01" min="0" max="1" value="0.2"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Mould &amp; Cycle</div>
    <div class="field-row">
      <div class="field-group"><label>Cavities</label><input type="number" id="imm-cav" min="1" step="1" value="2"/></div>
      <div class="field-group"><label>Projected Area (cm²)</label><input type="number" id="imm-area" step="1" min="0" value="40"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Cavity Pressure (MPa)</label><input type="number" id="imm-cav-press" step="1" min="0" value="30"/></div>
      <div class="field-group"><label>Wall Thickness (mm)</label><input type="number" id="imm-wall" step="0.1" min="0.1" value="2.0"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Cool Factor (s/mm²)</label><input type="number" id="imm-cool-f" step="0.1" min="0" value="3.16"/></div>
      <div class="field-group"><label>Fill Time (s)</label><input type="number" id="imm-fill" step="0.5" min="0" value="2"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Pack Time (s)</label><input type="number" id="imm-pack" step="0.5" min="0" value="3"/></div>
      <div class="field-group"><label>Eject Time (s)</label><input type="number" id="imm-eject" step="0.5" min="0" value="2"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Machine &amp; Labour</div>
    <div class="field-row">
      <div class="field-group"><label>IMM Machine</label><select id="imm-mach" class="machine-select"></select></div>
      <div class="field-group"><label>Labour</label><select id="imm-lab" class="labour-select"></select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>OEE</label><input type="number" id="imm-oee" step="0.01" min="0.01" max="1" value="0.85"/></div>
      <div class="field-group"><label>Manning</label><input type="number" id="imm-manning" step="0.25" min="0" value="0.25"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Labour Eff.</label><input type="number" id="imm-lab-eff" step="0.01" min="0.01" max="1" value="0.95"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Tooling</div>
    <div class="field-row">
      <div class="field-group"><label>Mould Cost (£)</label><input type="number" id="imm-mould-cost" step="1000" min="0" value="25000"/></div>
      <div class="field-group"><label>Mould Life (shots)</label><input type="number" id="imm-mould-life" step="10000" min="0" value="500000"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Amort. Volume</label><input type="number" id="imm-amort" step="10000" min="1" value="500000"/></div>
    </div>`;
}

export function collectIMMInput(): UniversalStackInput {
  const drivers = computeInjectionMouldingDrivers({
    materialId: sel('imm-mat'),
    partWeightKg: num('imm-part-wt'),
    runnerWeightKg: num('imm-runner-wt'),
    regrindFraction: num('imm-regrind'),
    cavities: num('imm-cav') || 1,
    projectedAreaCm2: num('imm-area'),
    cavityPressureMPa: num('imm-cav-press'),
    wallThicknessMm: num('imm-wall'),
    coolTimeFactorSPerMm2: num('imm-cool-f'),
    fillTimeSec: num('imm-fill'),
    packTimeSec: num('imm-pack'),
    ejectTimeSec: num('imm-eject'),
    machineId: sel('imm-mach'),
    labourId: sel('imm-lab'),
    oee: num('imm-oee'),
    manning: num('imm-manning'),
    labourEfficiency: num('imm-lab-eff'),
    mouldCost: num('imm-mould-cost'),
    mouldLife: num('imm-mould-life'),
    amortizationVolume: num('imm-amort') || 1,
  });
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}
