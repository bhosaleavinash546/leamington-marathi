import { num, sel, getUniversalTail } from '../helpers.js';
import { computeSheetMetalDrivers } from '../../engine/modules/sheet-metal.js';
import type { UniversalStackInput } from '../../engine/types.js';

export function renderSheetMetalForm(): string {
  return `
    <div class="section-title">Material &amp; Blank</div>
    <div class="field-row">
      <div class="field-group"><label>Material</label><select id="sm-mat" class="material-select"></select></div>
      <div class="field-group"><label>Net Weight (kg)</label><input type="number" id="sm-net-wt" step="0.001" min="0" value="0.15"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Blank L (mm)</label><input type="number" id="sm-blank-l" step="1" min="0" value="200"/></div>
      <div class="field-group"><label>Blank W (mm)</label><input type="number" id="sm-blank-w" step="1" min="0" value="150"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Thickness (mm)</label><input type="number" id="sm-thick" step="0.1" min="0.1" value="1.2"/></div>
      <div class="field-group"><label>Perimeter (mm)</label><input type="number" id="sm-perim" step="1" min="0" value="700"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Shear Strength (MPa)</label><input type="number" id="sm-shear" step="1" min="0" value="280"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Strip &amp; Press</div>
    <div class="field-row">
      <div class="field-group"><label>Strip Width (mm)</label><input type="number" id="sm-strip-w" step="1" min="0" value="160"/></div>
      <div class="field-group"><label>Pitch (mm)</label><input type="number" id="sm-pitch" step="1" min="0" value="210"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Parts/Stroke</label><input type="number" id="sm-pps" min="1" step="1" value="1"/></div>
      <div class="field-group"><label>Strokes/Min</label><input type="number" id="sm-spm" step="1" min="1" value="80"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Press</label><select id="sm-press" class="machine-select"></select></div>
      <div class="field-group"><label>Labour</label><select id="sm-lab" class="labour-select"></select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>OEE</label><input type="number" id="sm-oee" step="0.01" min="0.01" max="1" value="0.85"/></div>
      <div class="field-group"><label>Manning</label><input type="number" id="sm-manning" step="0.25" min="0" value="0.25"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Labour Eff.</label><input type="number" id="sm-lab-eff" step="0.01" min="0.01" max="1" value="0.95"/></div>
      <div class="field-group"><label>Num. Ops</label><input type="number" id="sm-num-ops" min="1" step="1" value="3"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Tooling</div>
    <div class="field-row">
      <div class="field-group"><label>Die Type</label><select id="sm-die-type">
        <option value="progressive">Progressive</option>
        <option value="transfer">Transfer</option>
        <option value="single_stage">Single Stage</option>
      </select></div>
      <div class="field-group"><label>Die Life (strokes)</label><input type="number" id="sm-die-life" step="10000" min="0" value="500000"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Die Cost (£)</label><input type="number" id="sm-die-cost" step="1000" min="0" value="45000"/></div>
      <div class="field-group"><label>Amort. Volume</label><input type="number" id="sm-amort" step="10000" min="1" value="500000"/></div>
    </div>`;
}

export function collectSheetMetalInput(): UniversalStackInput {
  const drivers = computeSheetMetalDrivers({
    materialId: sel('sm-mat'),
    netWeightKg: num('sm-net-wt'),
    blankLengthMm: num('sm-blank-l'),
    blankWidthMm: num('sm-blank-w'),
    thicknessMm: num('sm-thick'),
    perimeterMm: num('sm-perim'),
    shearStrengthMPa: num('sm-shear'),
    stripWidthMm: num('sm-strip-w'),
    pitchMm: num('sm-pitch'),
    partsPerStroke: num('sm-pps') || 1,
    pressId: sel('sm-press'),
    labourId: sel('sm-lab'),
    strokesPerMin: num('sm-spm'),
    oee: num('sm-oee'),
    manning: num('sm-manning'),
    labourEfficiency: num('sm-lab-eff'),
    numOperations: num('sm-num-ops') || 1,
    dieType: sel('sm-die-type') as 'progressive' | 'transfer' | 'single_stage',
    dieLife: num('sm-die-life'),
    dieCostEstimate: num('sm-die-cost'),
    amortizationVolume: num('sm-amort') || 1,
  });
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}
