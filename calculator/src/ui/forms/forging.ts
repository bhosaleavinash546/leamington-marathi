import { num, sel, getUniversalTail } from '../helpers.js';
import { computeForgingDrivers } from '../../engine/modules/forging.js';
import type { UniversalStackInput } from '../../engine/types.js';

export function renderForgingForm(): string {
  return `
    <div class="section-title">Material &amp; Billet</div>
    <div class="field-row">
      <div class="field-group"><label>Material</label><select id="forge-mat" class="material-select"></select></div>
      <div class="field-group"><label>Part Weight (kg)</label><input type="number" id="forge-part-wt" step="0.01" min="0.001" value="1.5"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Flash + Scale (kg)</label><input type="number" id="forge-flash" step="0.01" min="0" value="0.4"/></div>
      <div class="field-group"><label>Yield Fraction (0–1)</label><input type="number" id="forge-yield" step="0.01" min="0.01" max="1" value="0.92"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Process</div>
    <div class="field-row">
      <div class="field-group"><label>Forge Machine</label><select id="forge-mach" class="machine-select"></select></div>
      <div class="field-group"><label>Labour</label><select id="forge-lab" class="labour-select"></select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Strokes to Form</label><input type="number" id="forge-strokes" step="1" min="1" value="3"/></div>
      <div class="field-group"><label>Cycle Time (hr)</label><input type="number" id="forge-ct" step="0.001" min="0.001" value="0.008"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>OEE</label><input type="number" id="forge-oee" step="0.01" min="0.01" max="1" value="0.8"/></div>
      <div class="field-group"><label>Manning</label><input type="number" id="forge-manning" step="0.5" min="0" value="2"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Labour Eff.</label><input type="number" id="forge-lab-eff" step="0.01" min="0.01" max="1" value="0.92"/></div>
      <div class="field-group"><label>Heating (kWh/kg)</label><input type="number" id="forge-heat-energy" step="0.1" min="0" value="0.4"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Tooling</div>
    <div class="field-row">
      <div class="field-group"><label>Die Cost (£)</label><input type="number" id="forge-die-cost" step="1000" min="0" value="80000"/></div>
      <div class="field-group"><label>Die Life (forgings)</label><input type="number" id="forge-die-life" step="1000" min="0" value="50000"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Amort. Volume</label><input type="number" id="forge-amort" step="1000" min="1" value="100000"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Optional</div>
    <div class="field-row">
      <div class="field-group"><label>Heat Treat (£/kg, 0=none)</label><input type="number" id="forge-ht-cost" step="0.1" min="0" value="0"/></div>
      <div class="field-group"><label>Descale (£/kg, 0=none)</label><input type="number" id="forge-descale" step="0.1" min="0" value="0"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Trim Machine (opt.)</label><select id="forge-trim-mach" class="machine-select"><option value="">— None —</option></select></div>
      <div class="field-group"><label>Trim Labour (opt.)</label><select id="forge-trim-lab" class="labour-select"><option value="">— None —</option></select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Trim Cycle (hr, 0=none)</label><input type="number" id="forge-trim-ct" step="0.001" min="0" value="0"/></div>
    </div>`;
}

export function collectForgingInput(): UniversalStackInput {
  const trimCt = num('forge-trim-ct');
  const trimmingMachineId = sel('forge-trim-mach') || undefined;
  const trimmingLabourId = sel('forge-trim-lab') || undefined;
  const drivers = computeForgingDrivers({
    materialId: sel('forge-mat'),
    partWeightKg: num('forge-part-wt'),
    flashAndScaleKg: num('forge-flash'),
    yieldFraction: num('forge-yield'),
    forgeId: sel('forge-mach'),
    labourId: sel('forge-lab'),
    strokesToForm: num('forge-strokes') || 1,
    cycleTimeHr: num('forge-ct'),
    oee: num('forge-oee'),
    manning: num('forge-manning'),
    labourEfficiency: num('forge-lab-eff'),
    heatingEnergyKwhPerKg: num('forge-heat-energy'),
    dieLife: num('forge-die-life'),
    dieCost: num('forge-die-cost'),
    amortizationVolume: num('forge-amort') || 1,
    heatTreatCostPerKg: num('forge-ht-cost') || undefined,
    descaleCostPerKg: num('forge-descale') || undefined,
    trimmingMachineId: trimCt > 0 ? trimmingMachineId : undefined,
    trimmingLabourId: trimCt > 0 ? trimmingLabourId : undefined,
    trimmingCycleHr: trimCt > 0 ? trimCt : undefined,
  });
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}
