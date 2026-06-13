import { num, sel, getUniversalTail } from '../helpers.js';
import { computePCBFabDrivers } from '../../engine/modules/pcb-fab.js';
import type { UniversalStackInput } from '../../engine/types.js';

export function renderPCBFabForm(): string {
  return `
    <div class="section-title">Board Specification</div>
    <div class="field-row">
      <div class="field-group"><label>Layers</label><input type="number" id="pcbf-layers" step="2" min="1" value="4"/></div>
      <div class="field-group"><label>Board Area (cm²)</label><input type="number" id="pcbf-board-area" step="1" min="1" value="50"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Panel Area (cm²)</label><input type="number" id="pcbf-panel-area" step="100" min="100" value="3000"/></div>
      <div class="field-group"><label>Panel Util. (0–1)</label><input type="number" id="pcbf-panel-util" step="0.01" min="0.1" max="1" value="0.72"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Base Material Tg (°C)</label><input type="number" id="pcbf-tg" step="5" min="100" value="130"/></div>
      <div class="field-group"><label>Copper Weight (oz)</label><input type="number" id="pcbf-cu" step="0.5" min="0.5" value="1"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Via Count</label><input type="number" id="pcbf-vias" step="10" min="0" value="200"/></div>
      <div class="field-group"><label>Micro Via Count</label><input type="number" id="pcbf-uvias" step="1" min="0" value="0"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Surface Finish</label><select id="pcbf-finish">
        <option value="hasl">HASL</option><option value="enig" selected>ENIG</option>
        <option value="osp">OSP</option><option value="hasl_lf">HASL Lead-Free</option>
        <option value="iteq">ITEQ</option>
      </select></div>
      <div class="field-group"><label>Min Trace/Space (mm)</label><input type="number" id="pcbf-trace" step="0.05" min="0.05" value="0.15"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Fab Yield (0–1)</label><input type="number" id="pcbf-yield" step="0.01" min="0.01" max="1" value="0.96"/></div>
      <div class="field-group"><label>Testable % (0–1)</label><input type="number" id="pcbf-test-pct" step="0.05" min="0" max="1" value="0.5"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Pricing &amp; NRE</div>
    <div class="field-row">
      <div class="field-group"><label>Base Panel Price (£)</label><input type="number" id="pcbf-panel-price" step="1" min="0" value="18"/></div>
      <div class="field-group"><label>NRE Cost (£)</label><input type="number" id="pcbf-nre" step="100" min="0" value="800"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Amort. Volume</label><input type="number" id="pcbf-amort" step="1000" min="1" value="10000"/></div>
    </div>`;
}

export function collectPCBFabInput(): UniversalStackInput {
  const drivers = computePCBFabDrivers({
    layers: num('pcbf-layers') || 2,
    boardAreaCm2: num('pcbf-board-area'),
    panelUtilization: num('pcbf-panel-util'),
    panelAreaCm2: num('pcbf-panel-area'),
    baseMaterialTg: num('pcbf-tg'),
    copperWeightOz: num('pcbf-cu'),
    viaCount: num('pcbf-vias'),
    microViaCount: num('pcbf-uvias'),
    surfaceFinish: sel('pcbf-finish') as 'hasl' | 'enig' | 'osp' | 'hasl_lf' | 'iteq',
    minTraceSpaceMm: num('pcbf-trace'),
    fabYield: num('pcbf-yield'),
    testablePct: num('pcbf-test-pct'),
    nreCost: num('pcbf-nre'),
    amortizationVolume: num('pcbf-amort') || 1,
    basePanelPriceGBP: num('pcbf-panel-price'),
  });
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}
