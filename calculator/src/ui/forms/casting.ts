import { el, num, sel, getUniversalTail } from '../helpers.js';
import { computeCastingDrivers } from '../../engine/modules/casting.js';
import type { UniversalStackInput } from '../../engine/types.js';

export function renderCastingForm(): string {
  return `
    <div class="section-title">Common</div>
    <div class="field-row">
      <div class="field-group"><label>Subtype</label><select id="cast-subtype">
        <option value="hpdc">HPDC</option><option value="sand">Sand</option>
        <option value="gravity">Gravity Die</option><option value="investment">Investment</option>
      </select></div>
      <div class="field-group"><label>Material</label><select id="cast-mat" class="material-select"></select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Part Weight (kg)</label><input type="number" id="cast-part-wt" step="0.01" min="0.001" value="1.2"/></div>
      <div class="field-group"><label>Casting Yield (0–1)</label><input type="number" id="cast-yield" step="0.01" min="0.01" max="1" value="0.75"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Reject Rate (0–1)</label><input type="number" id="cast-reject" step="0.01" min="0" max="0.5" value="0.03"/></div>
      <div class="field-group"><label>Labour</label><select id="cast-lab" class="labour-select"></select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>OEE</label><input type="number" id="cast-oee" step="0.01" min="0.01" max="1" value="0.8"/></div>
      <div class="field-group"><label>Manning</label><input type="number" id="cast-manning" step="0.5" min="0" value="1"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Labour Eff.</label><input type="number" id="cast-lab-eff" step="0.01" min="0.01" max="1" value="0.92"/></div>
      <div class="field-group"><label>Amort. Volume</label><input type="number" id="cast-amort" step="1000" min="1" value="200000"/></div>
    </div>
    <!-- HPDC -->
    <div id="cast-hpdc" class="cast-section">
      <div class="section-title" style="margin-top:8px">HPDC</div>
      <div class="field-row">
        <div class="field-group"><label>Machine</label><select id="cast-hpdc-mach" class="machine-select"></select></div>
        <div class="field-group"><label>Cycle Time (s)</label><input type="number" id="cast-hpdc-ct" step="1" min="1" value="45"/></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label>Cavities</label><input type="number" id="cast-hpdc-cav" min="1" step="1" value="2"/></div>
        <div class="field-group"><label>Die Cost (£)</label><input type="number" id="cast-hpdc-die-cost" step="1000" min="0" value="120000"/></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label>Die Life (shots)</label><input type="number" id="cast-hpdc-die-life" step="1000" min="0" value="200000"/></div>
      </div>
    </div>
    <!-- Sand -->
    <div id="cast-sand" class="cast-section">
      <div class="section-title" style="margin-top:8px">Sand Casting</div>
      <div class="field-row">
        <div class="field-group"><label>Mould Line</label><select id="cast-sand-line" class="machine-select"></select></div>
        <div class="field-group"><label>Cycle Time (hr)</label><input type="number" id="cast-sand-ct" step="0.1" min="0.01" value="0.5"/></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label>Pattern Cost (£)</label><input type="number" id="cast-sand-pat-cost" step="100" min="0" value="5000"/></div>
        <div class="field-group"><label>Pattern Life (casts)</label><input type="number" id="cast-sand-pat-life" step="100" min="0" value="10000"/></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label>Core Cost/Part (£)</label><input type="number" id="cast-sand-core" step="0.1" min="0" value="1.5"/></div>
      </div>
    </div>
    <!-- Gravity -->
    <div id="cast-gravity" class="cast-section">
      <div class="section-title" style="margin-top:8px">Gravity Die</div>
      <div class="field-row">
        <div class="field-group"><label>Machine</label><select id="cast-grav-mach" class="machine-select"></select></div>
        <div class="field-group"><label>Cycle Time (hr)</label><input type="number" id="cast-grav-ct" step="0.01" min="0.01" value="0.083"/></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label>Mould Cost (£)</label><input type="number" id="cast-grav-mould-cost" step="1000" min="0" value="20000"/></div>
        <div class="field-group"><label>Mould Life (casts)</label><input type="number" id="cast-grav-mould-life" step="1000" min="0" value="50000"/></div>
      </div>
    </div>
    <!-- Investment -->
    <div id="cast-invest" class="cast-section">
      <div class="section-title" style="margin-top:8px">Investment Casting</div>
      <div class="field-row">
        <div class="field-group"><label>Pour Machine</label><select id="cast-inv-mach" class="machine-select"></select></div>
        <div class="field-group"><label>Pour Labour</label><select id="cast-inv-lab" class="labour-select"></select></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label>Pour Cycle (hr)</label><input type="number" id="cast-inv-ct" step="0.01" min="0.01" value="0.5"/></div>
        <div class="field-group"><label>Wax Cost/Part (£)</label><input type="number" id="cast-inv-wax" step="0.1" min="0" value="0.80"/></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label>Shell Cost/Part (£)</label><input type="number" id="cast-inv-shell" step="0.1" min="0" value="1.20"/></div>
      </div>
    </div>`;
}

export function updateCastingSubtype(): void {
  const subtype = sel('cast-subtype');
  ['hpdc', 'sand', 'gravity', 'invest'].forEach(s => {
    el(`cast-${s}`)?.classList.toggle('visible', s === subtype || (s === 'invest' && subtype === 'investment'));
  });
}

export function collectCastingInput(): UniversalStackInput {
  const subtype = sel('cast-subtype') as 'hpdc' | 'sand' | 'gravity' | 'investment';
  const common = {
    subtype,
    materialId: sel('cast-mat'),
    partWeightKg: num('cast-part-wt'),
    castingYield: num('cast-yield'),
    rejectRate: num('cast-reject'),
    labourId: sel('cast-lab'),
    oee: num('cast-oee'),
    manning: num('cast-manning'),
    labourEfficiency: num('cast-lab-eff'),
    amortizationVolume: num('cast-amort') || 1,
  };
  let extra = {};
  if (subtype === 'hpdc') extra = { hpdc: { machineId: sel('cast-hpdc-mach'), cycleTimeSec: num('cast-hpdc-ct'), cavities: num('cast-hpdc-cav') || 1, dieCost: num('cast-hpdc-die-cost'), dieLife: num('cast-hpdc-die-life') } };
  else if (subtype === 'sand') extra = { sand: { mouldLineId: sel('cast-sand-line'), cycleTimeHr: num('cast-sand-ct'), patternCost: num('cast-sand-pat-cost'), patternLife: num('cast-sand-pat-life'), coreCostPerPart: num('cast-sand-core') } };
  else if (subtype === 'gravity') extra = { gravity: { machineId: sel('cast-grav-mach'), cycleTimeHr: num('cast-grav-ct'), mouldCost: num('cast-grav-mould-cost'), mouldLife: num('cast-grav-mould-life') } };
  else if (subtype === 'investment') extra = { investment: { pourMachineId: sel('cast-inv-mach'), pourLabourId: sel('cast-inv-lab') || sel('cast-lab'), pourCycleHr: num('cast-inv-ct'), waxCostPerPart: num('cast-inv-wax'), shellBuildCostPerPart: num('cast-inv-shell') } };
  const drivers = computeCastingDrivers({ ...common, ...extra });
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}
