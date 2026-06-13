import './styles/calculator.css';
import {
  computeUniversalStack, validateStackInput, breakdownPercentages,
  DEFAULT_RATE_LIBRARY, recomputeMachineRates, getLibraryFromStorage, saveLibraryToStorage,
} from '../engine/index.js';
import type { CADAnalysisResult } from '../engine/ai-analysis.js';
import { computeMachiningDrivers } from '../engine/modules/machining.js';
import { computeSheetMetalDrivers } from '../engine/modules/sheet-metal.js';
import { computeInjectionMouldingDrivers } from '../engine/modules/injection-moulding.js';
import { computeCastingDrivers } from '../engine/modules/casting.js';
import { computeForgingDrivers } from '../engine/modules/forging.js';
import { computePaintingDrivers } from '../engine/modules/painting.js';
import { computeBIWDrivers } from '../engine/modules/biw-assembly.js';
import { computePCBFabDrivers } from '../engine/modules/pcb-fab.js';
import { computePCBADrivers } from '../engine/modules/pcba.js';
import { computeCastAndMachineDrivers } from '../engine/modules/cast-and-machine.js';
import { recommendMachineIds } from '../engine/process-taxonomy.js';
import { runSensitivity } from '../engine/sensitivity.js';
import {
  saveScenario, listScenarios, deleteScenario, compareScenarios,
  exportScenarios, importScenarios, initScenarioStore,
} from '../engine/scenario.js';
import { computeAssemblyRollup, newAssembly, saveAssembly, deleteAssembly, listAssemblies } from '../engine/assembly.js';
import { computeLearningCurveAdjustment } from '../engine/learning-curve.js';
import type { Assembly, AssemblyLine } from '../engine/assembly.js';
import type { LearningCurveResult } from '../engine/learning-curve.js';
import { exportToExcelBlob } from '../export/excel.js';
import { printPDF } from '../export/pdf.js';
import type { RateLibrary, UniversalStackInput, PartCostResult, CommodityType, SupplierQuote } from '../engine/types.js';
import type { BOMLine, ComponentType } from '../engine/modules/pcba.js';
import type { MachiningOperation } from '../engine/modules/machining.js';
import type { CoatType } from '../engine/modules/painting.js';
import type { JoiningType } from '../engine/modules/biw-assembly.js';
import type { CastAndMachineInputs } from '../engine/modules/cast-and-machine.js';
import type { CastingSubtype } from '../engine/modules/casting.js';
import { Chart, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, DoughnutController, BarController } from 'chart.js';

Chart.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, DoughnutController, BarController);

// ─── State ────────────────────────────────────────────────────────────────────

let library: RateLibrary = recomputeMachineRates(getLibraryFromStorage());
let lastResult: PartCostResult | null = null;
let lastInput: UniversalStackInput | null = null;
let lastLCResult: LearningCurveResult | null = null;
let activeCommodity: CommodityType = 'machining';
let machOpCount = 0;
let coatCount = 0;
let joinCount = 0;
let stationCount = 0;
let bomCount = 0;
let camMachOpCount = 0;
let asmLineCount = 0;
let cadFile: File | null = null;
let cadAnalysisResult: CADAnalysisResult | null = null;
let supplierQuotes: SupplierQuote[] = [];
let _breakdownChart: Chart | null = null;

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
function val(id: string): string { return (el<HTMLInputElement>(id))?.value?.trim() ?? ''; }
function num(id: string): number { return parseFloat(val(id)) || 0; }
function sel(id: string): string { return el<HTMLSelectElement>(id)?.value ?? ''; }
function fmt(n: number): string { return '£' + n.toFixed(2); }
function fmtPct(n: number): string { return n.toFixed(1) + '%'; }

// ─── Populate selects ─────────────────────────────────────────────────────────

function populateSelects(): void {
  const matOpts = library.materials.map(m =>
    `<option value="${m.id}">${m.grade} (${m.region}) — £${m.pricePerKg.toFixed(2)}/kg</option>`
  ).join('');
  const machOpts = library.machines.map(m =>
    `<option value="${m.id}">${m.machineClass} — £${m.computedRatePerHr.toFixed(2)}/hr</option>`
  ).join('');
  const labOpts = library.labour.map(l =>
    `<option value="${l.id}">${l.skillLevel} (${l.region}) — £${l.fullyLoadedRatePerHr}/hr</option>`
  ).join('');

  document.querySelectorAll<HTMLSelectElement>('.material-select').forEach(s => {
    const c = s.value; s.innerHTML = matOpts; if (c) s.value = c;
  });
  document.querySelectorAll<HTMLSelectElement>('.machine-select').forEach(s => {
    const c = s.value; s.innerHTML = machOpts; if (c) s.value = c;
  });
  document.querySelectorAll<HTMLSelectElement>('.labour-select').forEach(s => {
    const c = s.value; s.innerHTML = labOpts; if (c) s.value = c;
  });
}

// ─── Form: Machining ─────────────────────────────────────────────────────────

function renderMachiningForm(): string {
  return `
    <div class="section-title">Material</div>
    <div class="field-row">
      <div class="field-group"><label>Material</label><select id="mach-mat" class="material-select"></select></div>
      <div class="field-group"><label>Net Weight (kg)</label><input type="number" id="mach-net-wt" step="0.001" min="0" value="0.5"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Stock Weight (kg)</label><input type="number" id="mach-stock-wt" step="0.001" min="0.001" value="0.77"/></div>
      <div class="field-group"><label>Mat. Util. (0=auto)</label><input type="number" id="mach-mat-util" step="0.01" min="0" max="1" value="0"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Setup</div>
    <div class="field-row">
      <div class="field-group"><label>Setup Time (hr)</label><input type="number" id="mach-setup-time" step="0.25" min="0" value="0.5"/></div>
      <div class="field-group"><label>Batch Size</label><input type="number" id="mach-batch-size" step="1" min="1" value="50"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Setup Machine</label><select id="mach-setup-mach" class="machine-select"></select></div>
      <div class="field-group"><label>Setup Labour</label><select id="mach-setup-lab" class="labour-select"></select></div>
    </div>
    <div class="section-title-row" style="margin-top:8px">
      <span class="section-title" style="margin:0;border:none;padding:0">Operations</span>
      <button class="btn btn-secondary btn-sm" id="add-mach-op-btn">+ Add</button>
    </div>
    <div id="mach-ops-container"></div>
    <div class="section-title" style="margin-top:8px">Tooling / NRE</div>
    <div class="field-row">
      <div class="field-group"><label>Tooling Cost (£)</label><input type="number" id="mach-tooling" step="500" min="0" value="15000"/></div>
      <div class="field-group"><label>Amort. Volume</label><input type="number" id="mach-amort" step="1000" min="1" value="50000"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Programming NRE (£)</label><input type="number" id="mach-prog-nre" step="100" min="0" value="0"/></div>
    </div>`;
}

function addMachOp(d?: Partial<MachiningOperation>): void {
  machOpCount++;
  const id = `mop${machOpCount}`;
  const c = el('mach-ops-container');
  if (!c) return;
  const div = document.createElement('div');
  div.className = 'op-card'; div.dataset.opId = id;
  div.innerHTML = `
    <div class="op-title">Op ${machOpCount}
      <button class="remove-op" style="float:right">✕</button>
    </div>
    <div class="field-row">
      <div class="field-group"><label>Name</label><input type="text" id="${id}-name" value="${d?.name ?? 'CNC Turning'}"/></div>
      <div class="field-group"><label>Type</label><select id="${id}-type">
        <option value="turning">Turning</option><option value="milling_3ax">Milling 3ax</option>
        <option value="milling_5ax">Milling 5ax</option><option value="drilling">Drilling</option>
        <option value="grinding">Grinding</option><option value="tapping">Tapping</option>
        <option value="boring">Boring</option>
      </select></div>
    </div>
    <div class="field-row" style="margin-top:4px">
      <div class="field-group"><label>Machine</label><select id="${id}-mach" class="machine-select"></select></div>
      <div class="field-group"><label>Labour</label><select id="${id}-lab" class="labour-select"></select></div>
    </div>
    <div class="field-row" style="margin-top:4px">
      <div class="field-group"><label>Cycle Time (hr)</label><input type="number" id="${id}-ct" step="0.001" min="0" value="${d?.cycleTimeHr ?? 0.05}"/></div>
      <div class="field-group"><label>Parts/Cycle</label><input type="number" id="${id}-ppc" min="1" value="${d?.partsPerCycle ?? 1}"/></div>
    </div>
    <div class="field-row" style="margin-top:4px">
      <div class="field-group"><label>OEE</label><input type="number" id="${id}-oee" step="0.01" min="0.01" max="1" value="${d?.oee ?? 0.85}"/></div>
      <div class="field-group"><label>Manning</label><input type="number" id="${id}-manning" step="0.5" min="0" value="${d?.manning ?? 1}"/></div>
    </div>
    <div class="field-row" style="margin-top:4px">
      <div class="field-group"><label>Labour Time (hr)</label><input type="number" id="${id}-lt" step="0.001" min="0" value="${d?.labourTimeHr ?? 0.05}"/></div>
      <div class="field-group"><label>Labour Eff.</label><input type="number" id="${id}-le" step="0.01" min="0.01" max="1" value="${d?.labourEfficiency ?? 0.92}"/></div>
    </div>`;
  c.appendChild(div);
  populateSelects();
  if (d?.machineId) (el<HTMLSelectElement>(`${id}-mach`)).value = d.machineId;
  if (d?.labourId)  (el<HTMLSelectElement>(`${id}-lab`)).value  = d.labourId;
  if (d?.type)      (el<HTMLSelectElement>(`${id}-type`)).value = d.type;
  div.querySelector('.remove-op')!.addEventListener('click', () => div.remove());
}

// ─── Form: Sheet Metal ────────────────────────────────────────────────────────

function renderSheetMetalForm(): string {
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

// ─── Form: Injection Moulding ─────────────────────────────────────────────────

function renderInjectionForm(): string {
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

// ─── Form: Casting ────────────────────────────────────────────────────────────

function renderCastingForm(): string {
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

function updateCastingSubtype(): void {
  const subtype = sel('cast-subtype');
  ['hpdc', 'sand', 'gravity', 'invest'].forEach(s => {
    el(`cast-${s}`)?.classList.toggle('visible', s === subtype || (s === 'invest' && subtype === 'investment'));
  });
}

// ─── Form: Forging ────────────────────────────────────────────────────────────

function renderForgingForm(): string {
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

// ─── Form: Painting ───────────────────────────────────────────────────────────

function renderPaintingForm(): string {
  return `
    <div class="section-title">Part &amp; Line</div>
    <div class="field-row">
      <div class="field-group"><label>Surface Area (m²)</label><input type="number" id="paint-area" step="0.01" min="0.001" value="0.8"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Paint Line</label><select id="paint-line" class="machine-select"></select></div>
      <div class="field-group"><label>Labour</label><select id="paint-lab" class="labour-select"></select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Line Rate (parts/hr)</label><input type="number" id="paint-line-rate" step="1" min="1" value="60"/></div>
      <div class="field-group"><label>OEE</label><input type="number" id="paint-oee" step="0.01" min="0.01" max="1" value="0.85"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Manning</label><input type="number" id="paint-manning" step="0.5" min="0" value="4"/></div>
      <div class="field-group"><label>Labour Eff.</label><input type="number" id="paint-lab-eff" step="0.01" min="0.01" max="1" value="0.95"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Rework % (0–1)</label><input type="number" id="paint-rework" step="0.01" min="0" max="0.5" value="0.03"/></div>
      <div class="field-group"><label>Fixture Tooling (£)</label><input type="number" id="paint-tooling" step="100" min="0" value="5000"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Amort. Volume</label><input type="number" id="paint-amort" step="1000" min="1" value="100000"/></div>
    </div>
    <div class="section-title-row" style="margin-top:8px">
      <span class="section-title" style="margin:0;border:none;padding:0">Paint Coats</span>
      <button class="btn btn-secondary btn-sm" id="add-coat-btn">+ Add Coat</button>
    </div>
    <table class="dyn-table" id="coats-table">
      <thead><tr>
        <th>Type</th><th>Mat ID</th><th>DFT µm</th><th>Solids</th>
        <th>T.Eff.</th><th>Density</th><th>£/L</th><th></th>
      </tr></thead>
      <tbody id="coats-body"></tbody>
    </table>`;
}

function addCoatRow(d?: {coatType?: CoatType; materialId?: string; dftMicrons?: number; solidsPct?: number; transferEfficiency?: number; paintDensityKgPerL?: number; pricePerL?: number}): void {
  coatCount++;
  const id = `coat${coatCount}`;
  const tbody = el('coats-body');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.dataset.coatId = id;
  tr.innerHTML = `
    <td><select id="${id}-type">
      <option value="pretreat">Pretreat</option><option value="e_coat">E-coat</option>
      <option value="primer">Primer</option><option value="basecoat">Basecoat</option>
      <option value="clearcoat">Clearcoat</option><option value="powder">Powder</option>
    </select></td>
    <td><input type="text" id="${id}-mat" value="${d?.materialId ?? 'mat-virtual'}"/></td>
    <td><input type="number" id="${id}-dft" step="1" min="1" value="${d?.dftMicrons ?? 20}"/></td>
    <td><input type="number" id="${id}-sol" step="0.01" min="0.01" max="1" value="${d?.solidsPct ?? 0.35}"/></td>
    <td><input type="number" id="${id}-te" step="0.01" min="0.01" max="1" value="${d?.transferEfficiency ?? 0.70}"/></td>
    <td><input type="number" id="${id}-dens" step="0.01" min="0.5" value="${d?.paintDensityKgPerL ?? 1.3}"/></td>
    <td><input type="number" id="${id}-price" step="0.1" min="0" value="${d?.pricePerL ?? 10.0}"/></td>
    <td><button class="btn-icon remove-coat">✕</button></td>`;
  tbody.appendChild(tr);
  if (d?.coatType) (el<HTMLSelectElement>(`${id}-type`)).value = d.coatType;
  tr.querySelector('.remove-coat')!.addEventListener('click', () => tr.remove());
}

// ─── Form: BIW / Assembly ─────────────────────────────────────────────────────

function renderBIWForm(): string {
  return `
    <div class="section-title">Sub-parts &amp; Tooling</div>
    <div class="field-row">
      <div class="field-group"><label>Sub-part Total Cost (£)</label><input type="number" id="biw-sub-cost" step="0.5" min="0" value="45.00"/></div>
      <div class="field-group"><label>Fixture Tooling (£)</label><input type="number" id="biw-tooling" step="1000" min="0" value="200000"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Amort. Volume</label><input type="number" id="biw-amort" step="1000" min="1" value="50000"/></div>
    </div>
    <div class="section-title-row" style="margin-top:8px">
      <span class="section-title" style="margin:0;border:none;padding:0">Joining</span>
      <button class="btn btn-secondary btn-sm" id="add-join-btn">+ Add</button>
    </div>
    <table class="dyn-table">
      <thead><tr><th>Type</th><th>Count/m</th><th>Cost/Joint (£)</th><th></th></tr></thead>
      <tbody id="join-body"></tbody>
    </table>
    <div class="section-title-row" style="margin-top:8px">
      <span class="section-title" style="margin:0;border:none;padding:0">Stations</span>
      <button class="btn btn-secondary btn-sm" id="add-station-btn">+ Add</button>
    </div>
    <div id="biw-stations-container"></div>`;
}

function addJoinRow(d?: {type?: JoiningType; count?: number; costPerJoint?: number}): void {
  joinCount++;
  const id = `join${joinCount}`;
  const tbody = el('join-body');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.dataset.joinId = id;
  tr.innerHTML = `
    <td><select id="${id}-type">
      <option value="spot_weld">Spot Weld</option><option value="spr_rivet">SPR Rivet</option>
      <option value="adhesive_m">Adhesive (m)</option><option value="sealer_m">Sealer (m)</option>
      <option value="mig_weld_m">MIG Weld (m)</option><option value="clinch">Clinch</option>
    </select></td>
    <td><input type="number" id="${id}-count" step="1" min="0" value="${d?.count ?? 100}"/></td>
    <td><input type="number" id="${id}-cost" step="0.01" min="0" value="${d?.costPerJoint ?? 0.05}"/></td>
    <td><button class="btn-icon remove-join">✕</button></td>`;
  tbody.appendChild(tr);
  if (d?.type) (el<HTMLSelectElement>(`${id}-type`)).value = d.type;
  tr.querySelector('.remove-join')!.addEventListener('click', () => tr.remove());
}

function addBIWStation(d?: {stationName?: string; machineId?: string; labourId?: string; cycleTimeHr?: number; oee?: number; manning?: number; labourEfficiency?: number}): void {
  stationCount++;
  const id = `sta${stationCount}`;
  const c = el('biw-stations-container');
  if (!c) return;
  const div = document.createElement('div');
  div.className = 'op-card'; div.dataset.stationId = id;
  div.innerHTML = `
    <div class="op-title">Station ${stationCount}
      <button class="remove-station" style="float:right">✕</button>
    </div>
    <div class="field-row">
      <div class="field-group"><label>Name</label><input type="text" id="${id}-name" value="${d?.stationName ?? 'Framing Station'}"/></div>
    </div>
    <div class="field-row" style="margin-top:4px">
      <div class="field-group"><label>Machine</label><select id="${id}-mach" class="machine-select"></select></div>
      <div class="field-group"><label>Labour</label><select id="${id}-lab" class="labour-select"></select></div>
    </div>
    <div class="field-row" style="margin-top:4px">
      <div class="field-group"><label>Cycle Time (hr)</label><input type="number" id="${id}-ct" step="0.001" min="0" value="${d?.cycleTimeHr ?? 0.0167}"/></div>
      <div class="field-group"><label>OEE</label><input type="number" id="${id}-oee" step="0.01" min="0.01" max="1" value="${d?.oee ?? 0.85}"/></div>
    </div>
    <div class="field-row" style="margin-top:4px">
      <div class="field-group"><label>Manning</label><input type="number" id="${id}-manning" step="0.5" min="0" value="${d?.manning ?? 1}"/></div>
      <div class="field-group"><label>Labour Eff.</label><input type="number" id="${id}-le" step="0.01" min="0.01" max="1" value="${d?.labourEfficiency ?? 0.92}"/></div>
    </div>`;
  c.appendChild(div);
  populateSelects();
  if (d?.machineId) (el<HTMLSelectElement>(`${id}-mach`)).value = d.machineId;
  if (d?.labourId)  (el<HTMLSelectElement>(`${id}-lab`)).value  = d.labourId;
  div.querySelector('.remove-station')!.addEventListener('click', () => div.remove());
}

// ─── Form: PCB Fab ────────────────────────────────────────────────────────────

function renderPCBFabForm(): string {
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

// ─── Form: PCBA / SMD ─────────────────────────────────────────────────────────

function renderPCBAForm(): string {
  return `
    <div class="section-title">PCB &amp; Assembly</div>
    <div class="field-row">
      <div class="field-group"><label>PCB Cost/Board (£)</label><input type="number" id="pcba-pcb-cost" step="0.1" min="0" value="2.50"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>SMT Machine</label><select id="pcba-smt-mach" class="machine-select"></select></div>
      <div class="field-group"><label>SMT Labour</label><select id="pcba-smt-lab" class="labour-select"></select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>SMT Lines</label><input type="number" id="pcba-smt-lines" step="1" min="1" value="1"/></div>
      <div class="field-group"><label>SMT Line Rate (CPH)</label><input type="number" id="pcba-smt-rate" step="100" min="100" value="120"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>SMT OEE</label><input type="number" id="pcba-smt-oee" step="0.01" min="0.01" max="1" value="0.85"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Through-hole &amp; Manual</div>
    <div class="field-row">
      <div class="field-group"><label>TH Joint Count</label><input type="number" id="pcba-th-count" step="1" min="0" value="2"/></div>
      <div class="field-group"><label>Manual Solder Count</label><input type="number" id="pcba-man-count" step="1" min="0" value="0"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>TH Labour</label><select id="pcba-th-lab" class="labour-select"></select></div>
      <div class="field-group"><label>TH Time/Joint (s)</label><input type="number" id="pcba-th-time" step="1" min="1" value="12"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Manual Time/Joint (s)</label><input type="number" id="pcba-man-time" step="1" min="1" value="20"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Yield &amp; Rework</div>
    <div class="field-row">
      <div class="field-group"><label>Assembly Yield (0–1)</label><input type="number" id="pcba-yield" step="0.01" min="0.01" max="1" value="0.98"/></div>
      <div class="field-group"><label>Rework Cost/Fail (£)</label><input type="number" id="pcba-rework-cost" step="0.5" min="0" value="8.00"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Test Cost/Bd (£)</label><input type="number" id="pcba-test-cost" step="0.1" min="0" value="0"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Amort. Volume</label><input type="number" id="pcba-amort" step="1000" min="1" value="5000"/></div>
    </div>
    <div class="section-title-row" style="margin-top:8px">
      <span class="section-title" style="margin:0;border:none;padding:0">Bill of Materials</span>
      <div style="display:flex;gap:4px">
        <button class="btn btn-secondary btn-sm" id="add-bom-btn">+ Add Row</button>
        <label class="btn btn-secondary btn-sm" for="bom-csv-input" style="margin:0;cursor:pointer">Import CSV</label>
        <input type="file" id="bom-csv-input" accept=".csv" style="display:none">
      </div>
    </div>
    <table class="dyn-table">
      <thead><tr>
        <th>RefDes</th><th>Type</th><th>Description</th>
        <th>Qty</th><th>£/unit</th><th>MOQ</th><th></th>
      </tr></thead>
      <tbody id="bom-body"></tbody>
    </table>
    <div style="font-size:0.71rem;color:#888;margin-top:2px">CSV header: refDes,componentType,description,qty,unitPriceGBP,moq</div>`;
}

function addBOMRow(d?: Partial<BOMLine>): void {
  bomCount++;
  const id = `bom${bomCount}`;
  const tbody = el('bom-body');
  if (!tbody) return;
  const compTypes: ComponentType[] = [
    'passive_0402','passive_0603','passive_0805','ic_soic','ic_qfn',
    'ic_bga','ic_tqfp','connector_smt','through_hole','manual_solder'
  ];
  const typeOpts = compTypes.map(t =>
    `<option value="${t}"${t === (d?.componentType ?? 'passive_0402') ? ' selected' : ''}>${t}</option>`
  ).join('');
  const tr = document.createElement('tr');
  tr.dataset.bomId = id;
  tr.innerHTML = `
    <td><input type="text" id="${id}-ref" value="${d?.refDes ?? ''}"/></td>
    <td><select id="${id}-type">${typeOpts}</select></td>
    <td><input type="text" id="${id}-desc" value="${d?.description ?? ''}"/></td>
    <td><input type="number" id="${id}-qty" step="1" min="1" value="${d?.qty ?? 1}"/></td>
    <td><input type="number" id="${id}-price" step="0.001" min="0" value="${d?.unitPriceGBP ?? 0.01}"/></td>
    <td><input type="number" id="${id}-moq" step="1" min="1" value="${d?.moq ?? 1}"/></td>
    <td><button class="btn-icon remove-bom">✕</button></td>`;
  tbody.appendChild(tr);
  tr.querySelector('.remove-bom')!.addEventListener('click', () => tr.remove());
}

function importBOMFromCSV(): void {
  const inp = el<HTMLInputElement>('bom-csv-input');
  if (!inp?.files?.length) return;
  const file = inp.files[0];
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result as string;
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const startIdx = lines[0].toLowerCase().includes('refdes') ? 1 : 0;
    el('bom-body').innerHTML = '';
    bomCount = 0;
    for (const line of lines.slice(startIdx)) {
      const parts = line.split(',');
      if (parts.length < 6) continue;
      addBOMRow({
        refDes: parts[0].trim(),
        componentType: parts[1].trim() as ComponentType,
        description: parts[2].trim(),
        qty: parseInt(parts[3]) || 1,
        unitPriceGBP: parseFloat(parts[4]) || 0,
        moq: parseInt(parts[5]) || 1,
      });
    }
    inp.value = '';
  };
  reader.readAsText(file);
}

// ─── Form: Cast + Machine ─────────────────────────────────────────────────────

function renderCastAndMachineForm(): string {
  return `
    <div class="section-title">Casting — Common</div>
    <div class="field-row">
      <div class="field-group"><label>Casting Subtype</label><select id="cam-cast-subtype">
        <option value="hpdc">HPDC</option><option value="sand">Sand</option>
        <option value="gravity">Gravity Die</option><option value="investment">Investment</option>
      </select></div>
      <div class="field-group"><label>Material</label><select id="cam-mat" class="material-select"></select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Cast Part Weight (kg)</label><input type="number" id="cam-cast-wt" step="0.01" min="0.001" value="1.5"/></div>
      <div class="field-group"><label>Finished Weight (kg)</label><input type="number" id="cam-finish-wt" step="0.01" min="0.001" value="1.3"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Casting Yield (0–1)</label><input type="number" id="cam-cast-yield" step="0.01" min="0.01" max="1" value="0.75"/></div>
      <div class="field-group"><label>Reject Rate (0–1)</label><input type="number" id="cam-reject" step="0.01" min="0" max="0.5" value="0.03"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Casting Labour</label><select id="cam-cast-lab" class="labour-select"></select></div>
      <div class="field-group"><label>Casting OEE</label><input type="number" id="cam-cast-oee" step="0.01" min="0.01" max="1" value="0.80"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Casting Manning</label><input type="number" id="cam-cast-manning" step="0.5" min="0" value="1"/></div>
      <div class="field-group"><label>Casting Labour Eff.</label><input type="number" id="cam-cast-lab-eff" step="0.01" min="0.01" max="1" value="0.92"/></div>
    </div>
    <!-- HPDC subtype -->
    <div id="cam-cast-hpdc" class="cast-section">
      <div class="section-title" style="margin-top:8px">HPDC</div>
      <div class="field-row">
        <div class="field-group"><label>Machine</label><select id="cam-hpdc-mach" class="machine-select"></select></div>
        <div class="field-group"><label>Cycle Time (s)</label><input type="number" id="cam-hpdc-ct" step="1" min="1" value="45"/></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label>Cavities</label><input type="number" id="cam-hpdc-cav" min="1" step="1" value="2"/></div>
        <div class="field-group"><label>Die Cost (£)</label><input type="number" id="cam-hpdc-die-cost" step="1000" min="0" value="120000"/></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label>Die Life (shots)</label><input type="number" id="cam-hpdc-die-life" step="1000" min="0" value="200000"/></div>
      </div>
    </div>
    <!-- Sand subtype -->
    <div id="cam-cast-sand" class="cast-section">
      <div class="section-title" style="margin-top:8px">Sand Casting</div>
      <div class="field-row">
        <div class="field-group"><label>Mould Line</label><select id="cam-sand-line" class="machine-select"></select></div>
        <div class="field-group"><label>Cycle Time (hr)</label><input type="number" id="cam-sand-ct" step="0.1" min="0.01" value="0.5"/></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label>Pattern Cost (£)</label><input type="number" id="cam-sand-pat-cost" step="100" min="0" value="5000"/></div>
        <div class="field-group"><label>Pattern Life (casts)</label><input type="number" id="cam-sand-pat-life" step="100" min="0" value="10000"/></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label>Core Cost/Part (£)</label><input type="number" id="cam-sand-core" step="0.1" min="0" value="1.5"/></div>
      </div>
    </div>
    <!-- Gravity subtype -->
    <div id="cam-cast-gravity" class="cast-section">
      <div class="section-title" style="margin-top:8px">Gravity Die</div>
      <div class="field-row">
        <div class="field-group"><label>Machine</label><select id="cam-grav-mach" class="machine-select"></select></div>
        <div class="field-group"><label>Cycle Time (hr)</label><input type="number" id="cam-grav-ct" step="0.01" min="0.01" value="0.083"/></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label>Mould Cost (£)</label><input type="number" id="cam-grav-mould-cost" step="1000" min="0" value="20000"/></div>
        <div class="field-group"><label>Mould Life (casts)</label><input type="number" id="cam-grav-mould-life" step="1000" min="0" value="50000"/></div>
      </div>
    </div>
    <!-- Investment subtype -->
    <div id="cam-cast-invest" class="cast-section">
      <div class="section-title" style="margin-top:8px">Investment Casting</div>
      <div class="field-row">
        <div class="field-group"><label>Pour Machine</label><select id="cam-inv-mach" class="machine-select"></select></div>
        <div class="field-group"><label>Pour Labour</label><select id="cam-inv-lab" class="labour-select"></select></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label>Pour Cycle (hr)</label><input type="number" id="cam-inv-ct" step="0.01" min="0.01" value="0.5"/></div>
        <div class="field-group"><label>Wax Cost/Part (£)</label><input type="number" id="cam-inv-wax" step="0.1" min="0" value="0.80"/></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label>Shell Cost/Part (£)</label><input type="number" id="cam-inv-shell" step="0.1" min="0" value="1.20"/></div>
      </div>
    </div>
    <div class="section-title" style="margin-top:8px">Machining</div>
    <div class="field-row">
      <div class="field-group"><label>Geometry Complexity (1–5)</label><select id="cam-complexity">
        <option value="1">1 — Simple 2D</option>
        <option value="2" selected>2 — 2.5D pockets/slots</option>
        <option value="3">3 — Multi-face (4+ setups)</option>
        <option value="4">4 — Angled + freeform</option>
        <option value="5">5 — Complex organic</option>
      </select></div>
    </div>
    <div id="cam-recommend" style="font-size:0.75rem;color:#888;margin:4px 0 6px;padding:4px 8px;background:#f9f9f9;border-radius:4px"></div>
    <div class="field-row">
      <div class="field-group"><label>Setup Time (hr)</label><input type="number" id="cam-mach-setup-time" step="0.25" min="0" value="0.5"/></div>
      <div class="field-group"><label>Batch Size</label><input type="number" id="cam-mach-batch-size" step="1" min="1" value="50"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Setup Machine</label><select id="cam-mach-setup-mach" class="machine-select"></select></div>
      <div class="field-group"><label>Setup Labour</label><select id="cam-mach-setup-lab" class="labour-select"></select></div>
    </div>
    <div class="section-title-row" style="margin-top:8px">
      <span class="section-title" style="margin:0;border:none;padding:0">Machining Operations</span>
      <button class="btn btn-secondary btn-sm" id="add-cam-mach-op-btn">+ Add</button>
    </div>
    <div id="cam-mach-ops-container"></div>
    <div class="section-title" style="margin-top:8px">Tooling / NRE</div>
    <div class="field-row">
      <div class="field-group"><label>Machining Tooling (£)</label><input type="number" id="cam-mach-tooling" step="500" min="0" value="5000"/></div>
      <div class="field-group"><label>Programming NRE (£)</label><input type="number" id="cam-mach-prog-nre" step="100" min="0" value="2000"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Amort. Volume</label><input type="number" id="cam-amort" step="1000" min="1" value="50000"/></div>
    </div>`;
}

function updateCAMCastSubtype(): void {
  const subtype = sel('cam-cast-subtype');
  ['hpdc', 'sand', 'gravity', 'invest'].forEach(s => {
    el(`cam-cast-${s}`)?.classList.toggle('visible', s === subtype || (s === 'invest' && subtype === 'investment'));
  });
}

function updateCAMRecommendation(): void {
  const level = (num('cam-complexity') || 2) as 1 | 2 | 3 | 4 | 5;
  const ids = recommendMachineIds(level);
  const names = ids.map(id => {
    const m = library.machines.find(x => x.id === id);
    return m ? m.machineClass : id;
  });
  const rec = el('cam-recommend');
  if (rec) {
    const levelData: Record<number, string> = {
      1: 'Simple 2D — external features only',
      2: '2.5D — pockets/slots/drilled holes',
      3: 'Multi-face — 4+ setups or indexed',
      4: 'Angled features + freeform surfaces',
      5: 'Complex organic/turbine geometry',
    };
    rec.textContent = `Level ${level}: ${levelData[level]} → Recommended: ${names.join(', ')}`;
  }
}

function addCAMMachOp(d?: Partial<MachiningOperation>): void {
  camMachOpCount++;
  const id = `cammop${camMachOpCount}`;
  const c = el('cam-mach-ops-container');
  if (!c) return;
  const div = document.createElement('div');
  div.className = 'op-card'; div.dataset.opId = id;
  div.innerHTML = `
    <div class="op-title">Machining Op ${camMachOpCount}
      <button class="remove-op" style="float:right">✕</button>
    </div>
    <div class="field-row">
      <div class="field-group"><label>Name</label><input type="text" id="${id}-name" value="${d?.name ?? 'Face Mill'}"/></div>
      <div class="field-group"><label>Type</label><select id="${id}-type">
        <option value="turning">Turning</option><option value="milling_3ax" selected>Milling 3ax</option>
        <option value="milling_5ax">Milling 5ax</option><option value="drilling">Drilling</option>
        <option value="grinding">Grinding</option><option value="tapping">Tapping</option>
        <option value="boring">Boring</option>
      </select></div>
    </div>
    <div class="field-row" style="margin-top:4px">
      <div class="field-group"><label>Machine</label><select id="${id}-mach" class="machine-select"></select></div>
      <div class="field-group"><label>Labour</label><select id="${id}-lab" class="labour-select"></select></div>
    </div>
    <div class="field-row" style="margin-top:4px">
      <div class="field-group"><label>Cycle Time (hr)</label><input type="number" id="${id}-ct" step="0.001" min="0" value="${d?.cycleTimeHr ?? 0.05}"/></div>
      <div class="field-group"><label>Parts/Cycle</label><input type="number" id="${id}-ppc" min="1" value="${d?.partsPerCycle ?? 1}"/></div>
    </div>
    <div class="field-row" style="margin-top:4px">
      <div class="field-group"><label>OEE</label><input type="number" id="${id}-oee" step="0.01" min="0.01" max="1" value="${d?.oee ?? 0.85}"/></div>
      <div class="field-group"><label>Manning</label><input type="number" id="${id}-manning" step="0.5" min="0" value="${d?.manning ?? 1}"/></div>
    </div>
    <div class="field-row" style="margin-top:4px">
      <div class="field-group"><label>Labour Time (hr)</label><input type="number" id="${id}-lt" step="0.001" min="0" value="${d?.labourTimeHr ?? 0.05}"/></div>
      <div class="field-group"><label>Labour Eff.</label><input type="number" id="${id}-le" step="0.01" min="0.01" max="1" value="${d?.labourEfficiency ?? 0.92}"/></div>
    </div>`;
  c.appendChild(div);
  populateSelects();
  if (d?.machineId) (el<HTMLSelectElement>(`${id}-mach`)).value = d.machineId;
  if (d?.labourId)  (el<HTMLSelectElement>(`${id}-lab`)).value  = d.labourId;
  if (d?.type)      (el<HTMLSelectElement>(`${id}-type`)).value = d.type;
  div.querySelector('.remove-op')!.addEventListener('click', () => div.remove());
}

// ─── Form: AI CAD Analysis ────────────────────────────────────────────────────

function renderCADAnalysisForm(): string {
  return `
    <div class="section-title">AI CAD Analysis</div>
    <div id="cad-drop-zone" class="cad-upload-zone">
      <div class="cad-upload-icon">📐</div>
      <div style="font-size:0.85rem;color:#555;margin-bottom:8px">Drop your CAD file here, or click to browse</div>
      <label class="btn btn-primary btn-sm" for="cad-file-input" style="cursor:pointer">Browse Files</label>
      <input type="file" id="cad-file-input" accept=".stp,.step,.igs,.iges" style="display:none"/>
      <div class="cad-file-formats">STEP (.stp, .step) &nbsp;·&nbsp; IGES (.igs, .iges)</div>
    </div>
    <div id="cad-file-info" class="cad-file-info" style="display:none">
      <span class="file-icon">📄</span>
      <div class="file-details">
        <div id="cad-fname" style="font-weight:600"></div>
        <div id="cad-fsize" style="color:#888;font-size:0.72rem"></div>
      </div>
      <button class="btn btn-secondary btn-sm" id="cad-clear-btn">✕ Clear</button>
    </div>
    <div class="field-group" style="margin-top:4px">
      <label style="font-size:0.75rem">Claude API Key <span style="color:#aaa;font-weight:400">(or set ANTHROPIC_API_KEY on server)</span></label>
      <input type="password" id="cad-api-key" placeholder="sk-ant-api03-… (optional if server has key)"
             value="${localStorage.getItem('cad-api-key') ?? ''}" style="font-family:monospace;font-size:0.8rem"/>
    </div>
    <button class="btn btn-primary" id="cad-analyze-btn" disabled style="margin-top:6px;width:100%">
      Analyze CAD File
    </button>
    <div id="cad-progress-wrap" class="cad-progress-wrap" style="display:none">
      <div class="cad-progress-label" id="cad-progress-label">Uploading file…</div>
      <div class="cad-progress-bar"><div class="cad-progress-fill" id="cad-progress-fill" style="width:0%"></div></div>
    </div>
    <div id="cad-results"></div>`;
}

function wireCADEvents(): void {
  const dropZone = el('cad-drop-zone');
  const fileInput = el<HTMLInputElement>('cad-file-input');
  const analyzeBtn = el('cad-analyze-btn');

  // File input change
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) setCADFile(f);
  });

  // Drag-drop
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const f = e.dataTransfer?.files?.[0];
    if (f) setCADFile(f);
  });
  dropZone.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).tagName !== 'LABEL' && (e.target as HTMLElement).tagName !== 'INPUT')
      fileInput.click();
  });

  // Clear button
  el('cad-clear-btn')?.addEventListener('click', () => {
    cadFile = null; cadAnalysisResult = null;
    el('cad-file-info').style.display = 'none';
    el('cad-drop-zone').style.display = '';
    analyzeBtn.setAttribute('disabled', 'true');
    el('cad-results').innerHTML = '';
  });

  // Analyze button
  analyzeBtn.addEventListener('click', () => { void analyzeCAD(); });
}

function setCADFile(f: File): void {
  const ext = f.name.toLowerCase().split('.').pop() ?? '';
  if (!['stp', 'step', 'igs', 'iges'].includes(ext)) {
    alert('Unsupported file format. Please use STEP (.stp/.step) or IGES (.igs/.iges).');
    return;
  }
  cadFile = f;
  el('cad-drop-zone').style.display = 'none';
  el('cad-file-info').style.display = 'flex';
  el('cad-fname').textContent = f.name;
  el('cad-fsize').textContent = (f.size / 1024).toFixed(1) + ' KB';
  el('cad-analyze-btn').removeAttribute('disabled');
  el('cad-results').innerHTML = '';
  cadAnalysisResult = null;
}

async function analyzeCAD(): Promise<void> {
  if (!cadFile) return;

  const apiKey = val('cad-api-key');
  if (apiKey) localStorage.setItem('cad-api-key', apiKey);

  const progress = el('cad-progress-wrap');
  const progressFill = el('cad-progress-fill');
  const progressLabel = el('cad-progress-label');
  const analyzeBtn = el('cad-analyze-btn');

  progress.style.display = '';
  analyzeBtn.setAttribute('disabled', 'true');
  el('cad-results').innerHTML = '';

  const updateProgress = (pct: number, label: string) => {
    progressFill.style.width = pct + '%';
    progressLabel.textContent = label;
  };

  try {
    updateProgress(20, 'Uploading file…');
    const formData = new FormData();
    formData.append('cadFile', cadFile);

    const headers: HeadersInit = {};
    if (apiKey) headers['x-api-key'] = apiKey;

    updateProgress(40, 'Preprocessing geometry…');
    const res = await fetch('/api/cad/analyze', { method: 'POST', headers, body: formData });

    updateProgress(80, 'AI analysis in progress…');
    const data = await res.json() as { success?: boolean; analysis?: CADAnalysisResult; error?: string };

    if (!res.ok || !data.success) throw new Error(data.error ?? `Server error ${res.status}`);

    updateProgress(100, 'Complete!');
    cadAnalysisResult = data.analysis!;

    // Update part name from AI analysis
    const partNameEl = el<HTMLInputElement>('part-name');
    if (partNameEl && cadAnalysisResult.partName) partNameEl.value = cadAnalysisResult.partName;

    setTimeout(() => { progress.style.display = 'none'; }, 500);
    renderCADResults(cadAnalysisResult);
  } catch (err) {
    progress.style.display = 'none';
    analyzeBtn.removeAttribute('disabled');
    el('cad-results').innerHTML = `
      <div class="risk-card High" style="margin-top:10px">
        <div class="risk-feature">Analysis Error</div>
        <div>${err instanceof Error ? err.message : String(err)}</div>
        <div class="risk-suggestion">Ensure the API server is running (<code>npm run server</code>) and ANTHROPIC_API_KEY is configured.</div>
      </div>`;
  }
}

function renderCADResults(r: CADAnalysisResult): void {
  const panel = el('cad-results');
  const g = r.geometry;
  const bb = g.boundingBoxMm;
  const scoreClass = r.manufacturabilityScore >= 75 ? 'score-high' : r.manufacturabilityScore >= 50 ? 'score-med' : 'score-low';

  const recommendedCommodity = r.costInputSuggestions.recommendedCommodity as CommodityType;
  const commodityLabel: Record<string, string> = {
    machining: 'Machining', sheet_metal: 'Sheet Metal', injection_moulding: 'Injection Moulding',
    casting: 'Casting', forging: 'Forging', cast_and_machine: 'Cast+Machine',
  };

  panel.innerHTML = `
    <!-- Header summary -->
    <div style="display:flex;align-items:center;gap:16px;padding:12px 0;border-bottom:1px solid #eee;margin-bottom:12px">
      <div style="text-align:center">
        <div class="cad-score-ring ${scoreClass}">${r.manufacturabilityScore}</div>
        <div style="font-size:0.7rem;color:#888">Manufacturability</div>
      </div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:0.9rem">${r.partName}</div>
        <div style="font-size:0.78rem;color:#555;margin-top:2px">
          ${bb.x.toFixed(0)}×${bb.y.toFixed(0)}×${bb.z.toFixed(0)} mm &nbsp;·&nbsp;
          ~${g.estimatedVolumeCm3.toFixed(1)} cm³ &nbsp;·&nbsp;
          ~${g.estimatedWeightKg.aluminum.toFixed(2)} kg (Al) / ${g.estimatedWeightKg.steel.toFixed(2)} kg (Steel)
        </div>
        <div style="margin-top:4px">
          <span class="cad-confidence-badge ${r.confidenceLevel}">AI confidence: ${r.confidenceLevel}</span>
          &nbsp;
          <span style="font-size:0.72rem;color:#888">~${g.estimatedSurfaceAreaCm2.toFixed(0)} cm² surface</span>
        </div>
      </div>
    </div>

    <!-- Detected features -->
    <div style="margin-bottom:12px">
      <div class="panel-title" style="margin-bottom:6px">Detected Features</div>
      <div>
        ${r.detectedFeatures.map(f =>
          `<span class="feature-badge ${f.significance}" title="${f.description}">${f.type}${f.count > 1 ? ' ×' + f.count : ''}</span>`
        ).join('')}
      </div>
    </div>

    <!-- Material suggestion -->
    <div style="margin-bottom:12px">
      <div class="panel-title" style="margin-bottom:6px">Material Analysis</div>
      <div style="font-size:0.8rem">
        <strong>${r.materialAnalysis.primarySuggestion.name}</strong>
        <span class="cad-confidence-badge ${r.materialAnalysis.primarySuggestion.confidencePct >= 75 ? 'High' : r.materialAnalysis.primarySuggestion.confidencePct >= 50 ? 'Medium' : 'Low'}"
              style="margin-left:6px">${r.materialAnalysis.primarySuggestion.confidencePct}%</span>
        ${r.materialAnalysis.fromMetadata ? '<span style="font-size:0.7rem;color:#2e7d32;margin-left:6px">from CAD metadata</span>' : ''}
        <div style="color:#666;margin-top:3px">${r.materialAnalysis.primarySuggestion.reasoning}</div>
        ${r.materialAnalysis.alternatives.length > 0 ? `
          <div style="margin-top:4px;font-size:0.72rem;color:#888">Alternatives: ${r.materialAnalysis.alternatives.map(a => `${a.name} (${a.confidencePct}%)`).join(', ')}</div>` : ''}
      </div>
    </div>

    <!-- Process recommendations -->
    <div style="margin-bottom:12px">
      <div class="panel-title" style="margin-bottom:6px">Process Recommendations</div>
      ${r.processRecommendations.slice(0, 5).map(p => `
        <div class="process-rec-row">
          <div>
            <strong style="font-size:0.8rem">${p.process}</strong>
            <div style="font-size:0.7rem;color:#888">${p.reasoning}</div>
          </div>
          <span class="cad-confidence-badge ${p.confidencePct >= 75 ? 'High' : p.confidencePct >= 50 ? 'Medium' : 'Low'}">${p.confidencePct}%</span>
          <div class="confidence-bar-wrap">
            <div class="confidence-bar-bg">
              <div class="confidence-bar-fill" style="width:${p.confidencePct}%;background:${p.confidencePct >= 75 ? '#2e7d32' : p.confidencePct >= 50 ? '#e65100' : '#c62828'}"></div>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <!-- Risks -->
    ${r.manufacturabilityRisks.length > 0 ? `
    <div style="margin-bottom:12px">
      <div class="panel-title" style="margin-bottom:6px">Manufacturability Risks</div>
      ${r.manufacturabilityRisks.map(risk => `
        <div class="risk-card ${risk.severity}">
          <div class="risk-feature">${risk.severity} · ${risk.feature}</div>
          <div>${risk.description}</div>
          <div class="risk-suggestion">→ ${risk.suggestion}</div>
        </div>`).join('')}
    </div>` : ''}

    <!-- AI Explanation -->
    <div style="margin-bottom:12px">
      <div class="panel-title" style="margin-bottom:6px">AI Explanation</div>
      <div style="font-size:0.78rem;color:#444;line-height:1.5">${r.aiExplanation}</div>
    </div>

    <!-- Suggested cost inputs -->
    <div style="margin-bottom:12px">
      <div class="panel-title" style="margin-bottom:6px">Suggested Cost Inputs</div>
      <table class="breakdown-table" style="font-size:0.78rem">
        <tr><td>Weight (net)</td><td>${r.costInputSuggestions.netWeightKg.toFixed(3)} kg</td></tr>
        <tr><td>Material</td><td>${r.materialAnalysis.primarySuggestion.name} (${r.costInputSuggestions.materialId})</td></tr>
        <tr><td>Estimated cycle time</td><td>${r.costInputSuggestions.estimatedCycleTimeHr.toFixed(3)} hr/part</td></tr>
        <tr><td>Setup time</td><td>${r.costInputSuggestions.estimatedSetupTimeHr.toFixed(2)} hr</td></tr>
        <tr><td>Operations</td><td>${r.costInputSuggestions.estimatedOperations.map(o => o.name).join(', ')}</td></tr>
      </table>
    </div>

    <!-- Apply to form -->
    <div class="cad-apply-btn-row">
      <strong style="font-size:0.8rem;align-self:center">Apply to cost engine:</strong>
      <button class="btn btn-primary btn-sm" id="cad-apply-btn" data-commodity="${recommendedCommodity}">
        → ${commodityLabel[recommendedCommodity] ?? recommendedCommodity} (Recommended)
      </button>
      ${r.processRecommendations.slice(1, 3).map(p => {
        const ct = p.commodityType as CommodityType;
        return `<button class="btn btn-secondary btn-sm cad-apply-alt-btn" data-commodity="${ct}">${commodityLabel[ct] ?? ct}</button>`;
      }).join('')}
    </div>

    ${r.analysisLimitations.length > 0 ? `
    <div class="cad-limitations">
      <strong>Limitations:</strong> ${r.analysisLimitations.join(' · ')}
    </div>` : ''}
  `;

  // Wire apply buttons
  el('cad-apply-btn')?.addEventListener('click', () => {
    const ct = (el('cad-apply-btn') as HTMLElement).dataset.commodity as CommodityType;
    applyCADToForm(ct);
  });
  panel.querySelectorAll<HTMLElement>('.cad-apply-alt-btn').forEach(btn => {
    btn.addEventListener('click', () => applyCADToForm(btn.dataset.commodity as CommodityType));
  });
}

function applyCADToForm(targetCommodity: CommodityType): void {
  if (!cadAnalysisResult) return;
  const r = cadAnalysisResult;
  const c = r.costInputSuggestions;

  switchCommodity(targetCommodity);

  setTimeout(() => {
    // Set part name
    const partNameEl = el<HTMLInputElement>('part-name');
    if (partNameEl) partNameEl.value = r.partName || cadFile?.name.replace(/\.[^.]+$/, '') || 'CAD Part';

    if (targetCommodity === 'machining') {
      // Fill material
      const matEl = el<HTMLSelectElement>('mach-mat');
      if (matEl && c.materialId) {
        const opt = Array.from(matEl.options).find(o => o.value === c.materialId);
        if (opt) matEl.value = opt.value;
      }
      // Fill weight
      const wtEl = el<HTMLInputElement>('mach-net-wt');
      if (wtEl) wtEl.value = c.netWeightKg.toFixed(3);
      const stockWt = el<HTMLInputElement>('mach-stock-wt');
      if (stockWt) stockWt.value = (c.netWeightKg * 1.4).toFixed(3);
      const util = el<HTMLInputElement>('mach-mat-util');
      if (util) util.value = '0'; // will be computed from net/stock

      // Add operations
      const container = el('mach-ops-container');
      if (container) {
        container.innerHTML = '';
        machOpCount = 0;
        for (const op of c.estimatedOperations) {
          addMachOp({
            name: op.name,
            type: 'milling_3ax',
            machineId: op.machineId,
            labourId: op.labourId || 'lab-uk-skilled',
            cycleTimeHr: op.cycleTimeHr,
            partsPerCycle: 1,
            oee: op.oee,
            manning: op.manning,
            labourTimeHr: op.cycleTimeHr,
            labourEfficiency: op.labourEfficiency,
          });
        }
      }
    } else if (targetCommodity === 'casting' || targetCommodity === 'cast_and_machine') {
      const matEl = el<HTMLSelectElement>('cast-mat') ?? el<HTMLSelectElement>('cam-mat');
      if (matEl && c.materialId) {
        const opt = Array.from(matEl.options).find(o => o.value === c.materialId);
        if (opt) matEl.value = opt.value;
      }
      const wtEl = el<HTMLInputElement>('cast-net-wt') ?? el<HTMLInputElement>('cam-net-wt');
      if (wtEl) wtEl.value = c.netWeightKg.toFixed(3);
    }
  }, 100);
}

// ─── Commodity switching ──────────────────────────────────────────────────────

function switchCommodity(type: CommodityType): void {
  activeCommodity = type;
  document.querySelectorAll<HTMLElement>('.ctab').forEach(t => {
    t.classList.toggle('active', t.dataset.commodity === type);
  });

  // Reset calc button label for non-assembly modes
  const calcBtn = el('calc-btn');
  if (type !== 'assembly') calcBtn.textContent = 'Calculate';

  // Show/hide part-name for non-assembly modes
  const partNameWrap = el('part-name').closest<HTMLElement>('div[style]');
  if (partNameWrap) partNameWrap.style.display = type === 'assembly' ? 'none' : '';

  const area = el('commodity-form-area');
  machOpCount = 0; coatCount = 0; joinCount = 0; stationCount = 0; bomCount = 0; camMachOpCount = 0; asmLineCount = 0;

  switch (type) {
    case 'machining':
      area.innerHTML = renderMachiningForm();
      populateSelects();
      el('add-mach-op-btn')?.addEventListener('click', () => addMachOp());
      addMachOp({ name: 'CNC Turning', type: 'turning', machineId: 'mach-lathe-cnc', labourId: 'lab-uk-skilled', cycleTimeHr: 0.05, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.05, labourEfficiency: 0.92 });
      break;

    case 'sheet_metal':
      area.innerHTML = renderSheetMetalForm();
      populateSelects();
      // Set default select values after populating
      setTimeout(() => {
        const pressEl = el<HTMLSelectElement>('sm-press');
        if (pressEl) { const opt = Array.from(pressEl.options).find(o => o.value.includes('press-100t')); if (opt) pressEl.value = opt.value; }
        const labEl = el<HTMLSelectElement>('sm-lab');
        if (labEl) { const opt = Array.from(labEl.options).find(o => o.value.includes('semiskilled')); if (opt) labEl.value = opt.value; }
      }, 0);
      break;

    case 'injection_moulding':
      area.innerHTML = renderInjectionForm();
      populateSelects();
      setTimeout(() => {
        const machEl = el<HTMLSelectElement>('imm-mach');
        if (machEl) { const opt = Array.from(machEl.options).find(o => o.value.includes('imm-200t')); if (opt) machEl.value = opt.value; }
        const matEl = el<HTMLSelectElement>('imm-mat');
        if (matEl) { const opt = Array.from(matEl.options).find(o => o.value.includes('mat-pp')); if (opt) matEl.value = opt.value; }
      }, 0);
      break;

    case 'casting':
      area.innerHTML = renderCastingForm();
      populateSelects();
      el('cast-subtype')?.addEventListener('change', updateCastingSubtype);
      updateCastingSubtype();
      setTimeout(() => {
        const matEl = el<HTMLSelectElement>('cast-mat');
        if (matEl) { const opt = Array.from(matEl.options).find(o => o.value.includes('mat-adc12')); if (opt) matEl.value = opt.value; }
        const machEl = el<HTMLSelectElement>('cast-hpdc-mach');
        if (machEl) { const opt = Array.from(machEl.options).find(o => o.value.includes('hpdc-800t')); if (opt) machEl.value = opt.value; }
      }, 0);
      break;

    case 'forging':
      area.innerHTML = renderForgingForm();
      populateSelects();
      setTimeout(() => {
        const matEl = el<HTMLSelectElement>('forge-mat');
        if (matEl) { const opt = Array.from(matEl.options).find(o => o.value.includes('mat-steel1020')); if (opt) matEl.value = opt.value; }
        const machEl = el<HTMLSelectElement>('forge-mach');
        if (machEl) { const opt = Array.from(machEl.options).find(o => o.value.includes('forge-press-500t')); if (opt) machEl.value = opt.value; }
      }, 0);
      break;

    case 'painting':
      area.innerHTML = renderPaintingForm();
      populateSelects();
      el('add-coat-btn')?.addEventListener('click', () => addCoatRow());
      setTimeout(() => {
        const lineEl = el<HTMLSelectElement>('paint-line');
        if (lineEl) { const opt = Array.from(lineEl.options).find(o => o.value.includes('paint-line')); if (opt) lineEl.value = opt.value; }
      }, 0);
      addCoatRow({ coatType: 'e_coat',   materialId: 'mat-paint-ecoat',    dftMicrons: 20, solidsPct: 0.20, transferEfficiency: 0.95, paintDensityKgPerL: 1.3,  pricePerL: 4.55 });
      addCoatRow({ coatType: 'basecoat', materialId: 'mat-paint-basecoat', dftMicrons: 15, solidsPct: 0.35, transferEfficiency: 0.70, paintDensityKgPerL: 1.25, pricePerL: 10.25 });
      break;

    case 'biw_assembly':
      area.innerHTML = renderBIWForm();
      populateSelects();
      el('add-join-btn')?.addEventListener('click', () => addJoinRow());
      el('add-station-btn')?.addEventListener('click', () => addBIWStation());
      addJoinRow({ type: 'spot_weld', count: 120, costPerJoint: 0.05 });
      addJoinRow({ type: 'adhesive_m', count: 0.8, costPerJoint: 1.20 });
      addBIWStation({ stationName: 'Framing Station', machineId: 'robot-weld-station', labourId: 'lab-uk-skilled', cycleTimeHr: 1/60, oee: 0.85, manning: 1, labourEfficiency: 0.92 });
      break;

    case 'pcb_fab':
      area.innerHTML = renderPCBFabForm();
      populateSelects();
      break;

    case 'pcba':
      area.innerHTML = renderPCBAForm();
      populateSelects();
      el('add-bom-btn')?.addEventListener('click', () => addBOMRow());
      el('bom-csv-input')?.addEventListener('change', importBOMFromCSV);
      setTimeout(() => {
        const smtEl = el<HTMLSelectElement>('pcba-smt-mach');
        if (smtEl) { const opt = Array.from(smtEl.options).find(o => o.value.includes('smt-line')); if (opt) smtEl.value = opt.value; }
      }, 0);
      addBOMRow({ refDes: 'R1-R10', componentType: 'passive_0402', description: '10k 0402', qty: 10, unitPriceGBP: 0.008, moq: 1000 });
      addBOMRow({ refDes: 'U1',     componentType: 'ic_qfn',        description: 'MCU QFN',   qty: 1,  unitPriceGBP: 2.80,  moq: 10 });
      break;

    case 'cast_and_machine':
      area.innerHTML = renderCastAndMachineForm();
      populateSelects();
      el('cam-cast-subtype')?.addEventListener('change', updateCAMCastSubtype);
      el('cam-complexity')?.addEventListener('change', updateCAMRecommendation);
      el('add-cam-mach-op-btn')?.addEventListener('click', () => addCAMMachOp());
      updateCAMCastSubtype();
      updateCAMRecommendation();
      camMachOpCount = 0;
      setTimeout(() => {
        const matEl = el<HTMLSelectElement>('cam-mat');
        if (matEl) { const opt = Array.from(matEl.options).find(o => o.value.includes('mat-adc12')); if (opt) matEl.value = opt.value; }
        const machEl = el<HTMLSelectElement>('cam-hpdc-mach');
        if (machEl) { const opt = Array.from(machEl.options).find(o => o.value.includes('hpdc-800t')); if (opt) machEl.value = opt.value; }
        const setupMachEl = el<HTMLSelectElement>('cam-mach-setup-mach');
        if (setupMachEl) { const opt = Array.from(setupMachEl.options).find(o => o.value.includes('mach-haas-vf2')); if (opt) setupMachEl.value = opt.value; }
      }, 0);
      addCAMMachOp({ name: 'Face Mill', type: 'milling_3ax', machineId: 'mach-haas-vf2', labourId: 'lab-uk-skilled', cycleTimeHr: 0.05, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.05, labourEfficiency: 0.92 });
      break;

    case 'cad_analysis':
      area.innerHTML = renderCADAnalysisForm();
      wireCADEvents();
      break;
  }
}

// ─── Input collectors ─────────────────────────────────────────────────────────

function getUniversalTail(): Pick<UniversalStackInput, 'partName' | 'packagingPerPart' | 'logisticsPerPart' | 'overheadPct' | 'marginPct'> {
  return {
    partName: val('part-name') || 'Unnamed Part',
    packagingPerPart: num('packaging'),
    logisticsPerPart: num('logistics'),
    overheadPct: num('overhead-pct') / 100,
    marginPct: num('margin-pct') / 100,
  };
}

function collectMachiningInput(): UniversalStackInput {
  const ops: MachiningOperation[] = Array.from(document.querySelectorAll<HTMLElement>('#mach-ops-container .op-card')).map(card => {
    const id = card.dataset.opId!;
    return {
      name: (el<HTMLInputElement>(`${id}-name`))?.value ?? '',
      type: (el<HTMLSelectElement>(`${id}-type`))?.value as MachiningOperation['type'] ?? 'turning',
      machineId: sel(`${id}-mach`),
      labourId: sel(`${id}-lab`),
      cycleTimeHr: parseFloat((el<HTMLInputElement>(`${id}-ct`))?.value) || 0,
      partsPerCycle: parseInt((el<HTMLInputElement>(`${id}-ppc`))?.value) || 1,
      oee: parseFloat((el<HTMLInputElement>(`${id}-oee`))?.value) || 0.85,
      manning: parseFloat((el<HTMLInputElement>(`${id}-manning`))?.value) || 1,
      labourTimeHr: parseFloat((el<HTMLInputElement>(`${id}-lt`))?.value) || 0,
      labourEfficiency: parseFloat((el<HTMLInputElement>(`${id}-le`))?.value) || 0.92,
    };
  });

  const drivers = computeMachiningDrivers({
    materialId: sel('mach-mat'),
    netWeightKg: num('mach-net-wt'),
    stockWeightKg: num('mach-stock-wt') || num('mach-net-wt') / 0.65,
    materialUtilization: num('mach-mat-util'),
    operations: ops,
    setup: {
      setupTimeHr: num('mach-setup-time'),
      batchSize: num('mach-batch-size') || 50,
      machineId: sel('mach-setup-mach'),
      labourId: sel('mach-setup-lab'),
    },
    programmingNRE: num('mach-prog-nre'),
    toolingCost: num('mach-tooling'),
    amortizationVolume: num('mach-amort') || 1,
  });

  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}

function collectSheetMetalInput(): UniversalStackInput {
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

function collectIMMInput(): UniversalStackInput {
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

function collectCastingInput(): UniversalStackInput {
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

function collectForgingInput(): UniversalStackInput {
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

function collectPaintingInput(): UniversalStackInput {
  const coatRows = document.querySelectorAll<HTMLElement>('#coats-body tr[data-coat-id]');
  const coats = Array.from(coatRows).map(row => {
    const id = row.dataset.coatId!;
    return {
      coatType: (el<HTMLSelectElement>(`${id}-type`))?.value as CoatType ?? 'basecoat',
      materialId: (el<HTMLInputElement>(`${id}-mat`))?.value ?? 'mat-virtual',
      dftMicrons: parseFloat((el<HTMLInputElement>(`${id}-dft`))?.value) || 20,
      solidsPct: parseFloat((el<HTMLInputElement>(`${id}-sol`))?.value) || 0.35,
      transferEfficiency: parseFloat((el<HTMLInputElement>(`${id}-te`))?.value) || 0.70,
      paintDensityKgPerL: parseFloat((el<HTMLInputElement>(`${id}-dens`))?.value) || 1.3,
      pricePerL: parseFloat((el<HTMLInputElement>(`${id}-price`))?.value) || 10,
    };
  });
  const drivers = computePaintingDrivers({
    surfaceAreaM2: num('paint-area'),
    coats,
    lineId: sel('paint-line'),
    labourId: sel('paint-lab'),
    lineRatePartsPerHr: num('paint-line-rate'),
    oee: num('paint-oee'),
    manning: num('paint-manning'),
    labourEfficiency: num('paint-lab-eff'),
    rejectReworkPct: num('paint-rework'),
    toolingCost: num('paint-tooling'),
    amortizationVolume: num('paint-amort') || 1,
  });
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}

function collectBIWInput(): UniversalStackInput {
  const joinRows = document.querySelectorAll<HTMLElement>('#join-body tr[data-join-id]');
  const joining = Array.from(joinRows).map(row => {
    const id = row.dataset.joinId!;
    return {
      type: (el<HTMLSelectElement>(`${id}-type`))?.value as JoiningType ?? 'spot_weld',
      count: parseFloat((el<HTMLInputElement>(`${id}-count`))?.value) || 0,
      costPerJoint: parseFloat((el<HTMLInputElement>(`${id}-cost`))?.value) || 0,
    };
  });
  const stationCards = document.querySelectorAll<HTMLElement>('#biw-stations-container .op-card');
  const stations = Array.from(stationCards).map(card => {
    const id = card.dataset.stationId!;
    return {
      stationName: (el<HTMLInputElement>(`${id}-name`))?.value ?? 'Station',
      machineId: sel(`${id}-mach`),
      labourId: sel(`${id}-lab`),
      cycleTimeHr: parseFloat((el<HTMLInputElement>(`${id}-ct`))?.value) || 0,
      oee: parseFloat((el<HTMLInputElement>(`${id}-oee`))?.value) || 0.85,
      manning: parseFloat((el<HTMLInputElement>(`${id}-manning`))?.value) || 1,
      labourEfficiency: parseFloat((el<HTMLInputElement>(`${id}-le`))?.value) || 0.92,
    };
  });
  const drivers = computeBIWDrivers({
    subPartTotalCost: num('biw-sub-cost'),
    joining,
    stations,
    fixturingToolingCost: num('biw-tooling'),
    amortizationVolume: num('biw-amort') || 1,
  });
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}

function collectPCBFabInput(): UniversalStackInput {
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

function collectPCBAInput(): UniversalStackInput {
  const bomRows = document.querySelectorAll<HTMLElement>('#bom-body tr[data-bom-id]');
  const bom: BOMLine[] = Array.from(bomRows).map(row => {
    const id = row.dataset.bomId!;
    return {
      refDes: (el<HTMLInputElement>(`${id}-ref`))?.value ?? '',
      componentType: (el<HTMLSelectElement>(`${id}-type`))?.value as ComponentType ?? 'passive_0402',
      description: (el<HTMLInputElement>(`${id}-desc`))?.value ?? '',
      qty: parseInt((el<HTMLInputElement>(`${id}-qty`))?.value) || 1,
      unitPriceGBP: parseFloat((el<HTMLInputElement>(`${id}-price`))?.value) || 0,
      moq: parseInt((el<HTMLInputElement>(`${id}-moq`))?.value) || 1,
    };
  });
  const drivers = computePCBADrivers({
    pcbCostPerBoard: num('pcba-pcb-cost'),
    bom,
    smtMachineId: sel('pcba-smt-mach'),
    smtLabourId: sel('pcba-smt-lab'),
    smtLines: num('pcba-smt-lines') || 1,
    smtLineRatePerHr: num('pcba-smt-rate'),
    smtOee: num('pcba-smt-oee'),
    throughHoleCount: num('pcba-th-count'),
    manualSolderCount: num('pcba-man-count'),
    thLabourId: sel('pcba-th-lab'),
    thLabourTimeSecPerJoint: num('pcba-th-time'),
    manualLabourTimeSecPerJoint: num('pcba-man-time'),
    assemblyYield: num('pcba-yield'),
    reworkCostPerFailure: num('pcba-rework-cost'),
    amortizationVolume: num('pcba-amort') || 1,
    testCostPerBoard: num('pcba-test-cost') || undefined,
  });
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}

function collectCastAndMachineInput(): UniversalStackInput {
  const subtype = sel('cam-cast-subtype') as CastingSubtype;

  const camOps: MachiningOperation[] = Array.from(
    document.querySelectorAll<HTMLElement>('#cam-mach-ops-container .op-card')
  ).map(card => {
    const id = card.dataset.opId!;
    return {
      name: (el<HTMLInputElement>(`${id}-name`))?.value ?? '',
      type: (el<HTMLSelectElement>(`${id}-type`))?.value as MachiningOperation['type'] ?? 'milling_3ax',
      machineId: sel(`${id}-mach`),
      labourId: sel(`${id}-lab`),
      cycleTimeHr: parseFloat((el<HTMLInputElement>(`${id}-ct`))?.value) || 0,
      partsPerCycle: parseInt((el<HTMLInputElement>(`${id}-ppc`))?.value) || 1,
      oee: parseFloat((el<HTMLInputElement>(`${id}-oee`))?.value) || 0.85,
      manning: parseFloat((el<HTMLInputElement>(`${id}-manning`))?.value) || 1,
      labourTimeHr: parseFloat((el<HTMLInputElement>(`${id}-lt`))?.value) || 0,
      labourEfficiency: parseFloat((el<HTMLInputElement>(`${id}-le`))?.value) || 0.92,
    };
  });

  let subtypeExtra: Partial<CastAndMachineInputs> = {};
  if (subtype === 'hpdc') {
    subtypeExtra = { hpdc: { machineId: sel('cam-hpdc-mach'), cycleTimeSec: num('cam-hpdc-ct'), cavities: num('cam-hpdc-cav') || 1, dieCost: num('cam-hpdc-die-cost'), dieLife: num('cam-hpdc-die-life') } };
  } else if (subtype === 'sand') {
    subtypeExtra = { sand: { mouldLineId: sel('cam-sand-line'), cycleTimeHr: num('cam-sand-ct'), patternCost: num('cam-sand-pat-cost'), patternLife: num('cam-sand-pat-life'), coreCostPerPart: num('cam-sand-core') } };
  } else if (subtype === 'gravity') {
    subtypeExtra = { gravity: { machineId: sel('cam-grav-mach'), cycleTimeHr: num('cam-grav-ct'), mouldCost: num('cam-grav-mould-cost'), mouldLife: num('cam-grav-mould-life') } };
  } else if (subtype === 'investment') {
    subtypeExtra = { investment: { pourMachineId: sel('cam-inv-mach'), pourLabourId: sel('cam-inv-lab') || sel('cam-cast-lab'), pourCycleHr: num('cam-inv-ct'), waxCostPerPart: num('cam-inv-wax'), shellBuildCostPerPart: num('cam-inv-shell') } };
  }

  const inputs: CastAndMachineInputs = {
    castingSubtype: subtype,
    materialId: sel('cam-mat'),
    castPartWeightKg: num('cam-cast-wt'),
    finishedWeightKg: num('cam-finish-wt'),
    castingYield: num('cam-cast-yield'),
    rejectRate: num('cam-reject'),
    castingLabourId: sel('cam-cast-lab'),
    castingOee: num('cam-cast-oee'),
    castingManning: num('cam-cast-manning'),
    castingLabourEfficiency: num('cam-cast-lab-eff'),
    geometryComplexity: (num('cam-complexity') || 2) as 1 | 2 | 3 | 4 | 5,
    machiningOps: camOps,
    machiningSetup: {
      setupTimeHr: num('cam-mach-setup-time'),
      batchSize: num('cam-mach-batch-size') || 50,
      machineId: sel('cam-mach-setup-mach'),
      labourId: sel('cam-mach-setup-lab'),
    },
    machiningToolingCost: num('cam-mach-tooling'),
    machiningProgrammingNRE: num('cam-mach-prog-nre'),
    amortizationVolume: num('cam-amort') || 1,
    ...subtypeExtra,
  };

  const drivers = computeCastAndMachineDrivers(inputs);
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}

function collectInput(): UniversalStackInput {
  switch (activeCommodity) {
    case 'machining':         return collectMachiningInput();
    case 'sheet_metal':       return collectSheetMetalInput();
    case 'injection_moulding': return collectIMMInput();
    case 'casting':           return collectCastingInput();
    case 'forging':           return collectForgingInput();
    case 'painting':          return collectPaintingInput();
    case 'biw_assembly':      return collectBIWInput();
    case 'pcb_fab':           return collectPCBFabInput();
    case 'pcba':              return collectPCBAInput();
    case 'cast_and_machine':  return collectCastAndMachineInput();
    case 'cad_analysis':
      throw new Error('Apply CAD analysis results to a commodity form first using the "Apply to cost engine" button, then calculate.');
    case 'assembly':
      throw new Error('Use the Calculate Assembly button for Assembly BOM mode.');
  }
}

// ─── Compute ──────────────────────────────────────────────────────────────────

function compute(): void {
  const errBox = el('validation-errors');
  const warnBox = el('validation-warnings');

  let input: UniversalStackInput;
  try {
    input = collectInput();
  } catch (err) {
    errBox.style.display = 'block';
    errBox.innerHTML = `<strong>Input error:</strong> ${err instanceof Error ? err.message : String(err)}`;
    return;
  }

  const validation = validateStackInput(input, library);

  if (!validation.valid) {
    errBox.style.display = 'block';
    errBox.innerHTML = `<strong>Errors:</strong><ul>${validation.errors.map(e => `<li>${e.field}: ${e.message}</li>`).join('')}</ul>`;
    warnBox.style.display = 'none';
    return;
  }
  errBox.style.display = 'none';

  if (validation.warnings.length > 0) {
    warnBox.style.display = 'block';
    warnBox.innerHTML = `<strong>Warnings:</strong><ul>${validation.warnings.map(w => `<li>${w.field}: ${w.message}</li>`).join('')}</ul>`;
  } else {
    warnBox.style.display = 'none';
  }

  try {
    let result = computeUniversalStack(input, library);
    lastLCResult = null;

    const lcEnabled = (document.getElementById('lc-enabled') as HTMLInputElement)?.checked;
    if (lcEnabled && result.breakdown.labour > 0) {
      const annualVolume = parseFloat((document.getElementById('annual-volume') as HTMLInputElement)?.value) || 10000;
      const referenceVolume = parseFloat((document.getElementById('reference-volume') as HTMLInputElement)?.value) || 1000;
      const curvePct = parseFloat((document.getElementById('learning-curve-pct') as HTMLInputElement)?.value) || 85;
      const lcResult = computeLearningCurveAdjustment(result.breakdown.labour, { annualVolume, referenceVolume, curvePct });
      lastLCResult = lcResult;
      const labourDelta = lcResult.volumeEffect;
      result = {
        ...result,
        breakdown: { ...result.breakdown, labour: lcResult.adjustedLabourCost },
        factoryCost: result.factoryCost + labourDelta,
        subtotal: result.subtotal + labourDelta * (1 + input.overheadPct),
        total: result.total + labourDelta * (1 + input.overheadPct) * (1 + input.marginPct),
      };
    }

    lastResult = result;
    lastInput = input;
    showResultsArea();
    renderBreakdown(result);

    // Show action buttons
    el('export-excel-btn').style.display = '';
    el('export-pdf-btn').style.display = '';
    el('save-scenario-btn').style.display = '';
  } catch (err) {
    errBox.style.display = 'block';
    errBox.innerHTML = `<strong>Calculation error:</strong> ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ─── Results area ─────────────────────────────────────────────────────────────

function showResultsArea(): void {
  el('results-tabs').style.display = '';
  switchResultTab('breakdown');
}

function switchResultTab(tab: string): void {
  document.querySelectorAll<HTMLElement>('.rtab').forEach(t => {
    t.classList.toggle('active', t.dataset.panel === tab);
  });
  el('results-breakdown').style.display = tab === 'breakdown' ? '' : 'none';
  el('results-sensitivity').style.display = tab === 'sensitivity' ? '' : 'none';
  el('results-scenarios').style.display = tab === 'scenarios' ? '' : 'none';

  if (tab === 'sensitivity' && lastInput) renderSensitivity();
  if (tab === 'scenarios') renderScenarios();
}

// ─── Render: Breakdown ────────────────────────────────────────────────────────

function renderBreakdown(result: PartCostResult): void {
  const panel = el('results-breakdown');
  const pcts = breakdownPercentages(result);

  const buckets = [
    { label: '1. Raw Material',      value: result.breakdown.rawMaterial, pct: pcts.rawMaterial },
    { label: '2. Process (Machine)', value: result.breakdown.process,     pct: pcts.process },
    { label: '3. Direct Labour',     value: result.breakdown.labour,      pct: pcts.labour },
    { label: '4. Tooling',           value: result.breakdown.tooling,     pct: pcts.tooling },
    { label: '5. Packaging',         value: result.breakdown.packaging,   pct: pcts.packaging },
    { label: '6. Logistics',         value: result.breakdown.logistics,   pct: pcts.logistics },
  ];
  const maxPct = Math.max(...buckets.map(b => b.pct), pcts.overhead, pcts.margin, 1);

  const lcHtml = lastLCResult ? `
    <div style="background:#fff8f3;border:1px solid #ffd699;border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:0.8rem">
      <strong>Learning Curve Applied</strong> (Wright's Law ${lastLCResult.params.curvePct}%, ${lastLCResult.params.annualVolume.toLocaleString()} pcs/yr vs. ref ${lastLCResult.params.referenceVolume.toLocaleString()} pcs/yr)<br/>
      Factor: <strong>×${lastLCResult.adjustmentFactor.toFixed(3)}</strong> &nbsp;|&nbsp;
      Labour: <strong>${fmt(lastLCResult.baseLabourCost)}</strong> → <strong>${fmt(lastLCResult.adjustedLabourCost)}</strong>
      <span style="color:${lastLCResult.volumeEffect < 0 ? '#2e7d32' : '#c62828'}">(${lastLCResult.volumeEffect >= 0 ? '+' : ''}${fmt(lastLCResult.volumeEffect)})</span>
    </div>` : '';

  const sqHtml = supplierQuotes.length > 0 ? `
    <div>
      <div class="panel-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>Supplier Quote vs Should-Cost (PPV)</span>
        <button class="btn btn-secondary btn-sm" id="add-quote-btn-inline" style="font-size:0.72rem">+ Add Quote</button>
      </div>
      <table class="breakdown-table ppv-table">
        <thead><tr><th>Supplier</th><th>Quoted (GBP)</th><th>Should Cost</th><th>PPV £</th><th>PPV %</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${supplierQuotes.map((q, i) => {
            const quotedGBP = q.quotedPriceGBP * q.fxRate;
            const ppv = quotedGBP - result.total;
            const ppvPct = result.total > 0 ? (ppv / result.total) * 100 : 0;
            const ragCls = Math.abs(ppvPct) <= 5 ? 'ppv-rag-green' : Math.abs(ppvPct) <= 15 ? 'ppv-rag-amber' : 'ppv-rag-red';
            const ragLabel = Math.abs(ppvPct) <= 5 ? 'ON TARGET' : ppv > 0 ? 'OVERPRICED' : 'BELOW COST';
            return `<tr>
              <td>${q.supplierName || 'Unnamed'}</td>
              <td>${fmt(quotedGBP)}${q.currency !== 'GBP' ? ` <span style="font-size:0.7rem;color:#888">(${q.currency} ${q.quotedPriceGBP.toFixed(2)} × ${q.fxRate})</span>` : ''}</td>
              <td>${fmt(result.total)}</td>
              <td class="${ppv > 0 ? 'delta-pos' : 'delta-neg'}">${ppv >= 0 ? '+' : ''}${fmt(ppv)}</td>
              <td class="${ppv > 0 ? 'delta-pos' : 'delta-neg'}">${ppvPct >= 0 ? '+' : ''}${ppvPct.toFixed(1)}%</td>
              <td><span class="badge ${ragCls}">${ragLabel}</span></td>
              <td><button class="btn btn-secondary btn-sm del-quote-btn" data-qi="${i}" style="font-size:0.7rem">×</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : `
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
      <button class="btn btn-secondary btn-sm" id="add-quote-btn-inline">+ Add Supplier Quote</button>
    </div>`;

  panel.innerHTML = `
    <div class="summary-cards">
      <div class="summary-card total-card">
        <div class="card-label">Total Should Cost</div>
        <div class="card-value">${fmt(result.total)}</div>
        <div class="card-sub">${result.partName}</div>
      </div>
      <div class="summary-card">
        <div class="card-label">Factory Cost</div>
        <div class="card-value">${fmt(result.factoryCost)}</div>
        <div class="card-sub">${fmtPct((result.factoryCost / result.total) * 100)} of total</div>
      </div>
      <div class="summary-card">
        <div class="card-label">Conversion</div>
        <div class="card-value">${fmt(result.breakdown.process + result.breakdown.labour)}</div>
        <div class="card-sub">${fmtPct(pcts.process + pcts.labour)} of total</div>
      </div>
      <div class="summary-card">
        <div class="card-label">OH + Margin</div>
        <div class="card-value">${fmt(result.breakdown.overhead + result.breakdown.margin)}</div>
        <div class="card-sub">${fmtPct(pcts.overhead + pcts.margin)} of total</div>
      </div>
    </div>

    ${lcHtml}

    ${sqHtml}

    <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:280px">
        <div class="panel-title">8-Bucket Breakdown</div>
        <table class="breakdown-table">
          <thead><tr><th>Bucket</th><th>Amount</th><th>%</th><th style="width:180px">Bar</th></tr></thead>
          <tbody>
            ${buckets.map(b => `<tr>
              <td>${b.label}</td><td>${fmt(b.value)}</td><td>${fmtPct(b.pct)}</td>
              <td><div class="pct-bar"><div class="pct-fill" style="width:${Math.max(3, (b.pct / maxPct) * 160)}px"></div></div></td>
            </tr>`).join('')}
            <tr class="subtotal-row"><td>Factory Cost</td><td>${fmt(result.factoryCost)}</td><td>${fmtPct((result.factoryCost / result.total) * 100)}</td><td></td></tr>
            <tr>
              <td>7. Overhead (SG&amp;A)</td><td>${fmt(result.breakdown.overhead)}</td><td>${fmtPct(pcts.overhead)}</td>
              <td><div class="pct-bar"><div class="pct-fill" style="width:${Math.max(3, (pcts.overhead / maxPct) * 160)}px;opacity:0.4"></div></div></td>
            </tr>
            <tr class="subtotal-row"><td>Subtotal</td><td>${fmt(result.subtotal)}</td><td>${fmtPct((result.subtotal / result.total) * 100)}</td><td></td></tr>
            <tr>
              <td>8. Supplier Margin</td><td>${fmt(result.breakdown.margin)}</td><td>${fmtPct(pcts.margin)}</td>
              <td><div class="pct-bar"><div class="pct-fill" style="width:${Math.max(3, (pcts.margin / maxPct) * 160)}px;opacity:0.4"></div></div></td>
            </tr>
            <tr class="total-row"><td>TOTAL SHOULD COST</td><td>${fmt(result.total)}</td><td>100.0%</td><td></td></tr>
            ${result.toolingNRE !== undefined ? `<tr><td>NRE (one-time)</td><td>${fmt(result.toolingNRE)}</td><td>—</td><td style="font-size:0.73rem;color:#888">Not in unit cost</td></tr>` : ''}
          </tbody>
        </table>
      </div>
      <div style="width:220px;flex-shrink:0">
        <div class="panel-title">Cost Mix</div>
        <div class="chart-wrap"><canvas id="breakdown-doughnut" width="200" height="200"></canvas></div>
      </div>
    </div>

    <div>
      <div class="panel-title">Operations Detail</div>
      <table class="ops-table">
        <thead><tr><th>Operation</th><th>Machine Rate</th><th>Process Cost</th><th>Labour Rate</th><th>Labour Cost</th><th>Total</th></tr></thead>
        <tbody>
          ${result.operationDetails.map(op => `<tr>
            <td>${op.operationName}</td>
            <td>£${op.machineRateUsed.toFixed(2)}/hr</td><td>${fmt(op.processCost)}</td>
            <td>£${op.labourRateUsed.toFixed(2)}/hr</td><td>${fmt(op.labourCost)}</td>
            <td>${fmt(op.processCost + op.labourCost)}</td>
          </tr>`).join('')}
          <tr class="total-row"><td>Total</td><td></td><td>${fmt(result.breakdown.process)}</td><td></td><td>${fmt(result.breakdown.labour)}</td><td>${fmt(result.breakdown.process + result.breakdown.labour)}</td></tr>
        </tbody>
      </table>
    </div>

    <div>
      <div class="panel-title">Rate Traceability</div>
      <table class="trace-table">
        <thead><tr><th>Field</th><th>Value</th><th>Unit</th><th>Source</th><th>Confidence</th></tr></thead>
        <tbody>
          ${result.traceability.map(t => `<tr>
            <td>${t.field}</td><td>${t.value}</td><td>${t.unit}</td>
            <td style="font-family:sans-serif;font-size:0.76rem">${t.rateSource}</td>
            <td><span class="badge ${t.confidence}">${t.confidence}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  // Doughnut chart
  if (_breakdownChart) { _breakdownChart.destroy(); _breakdownChart = null; }
  const canvas = document.getElementById('breakdown-doughnut') as HTMLCanvasElement;
  if (canvas) {
    _breakdownChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Material', 'Process', 'Labour', 'Tooling', 'Pkg+Log', 'Overhead', 'Margin'],
        datasets: [{
          data: [
            result.breakdown.rawMaterial, result.breakdown.process, result.breakdown.labour,
            result.breakdown.tooling,
            result.breakdown.packaging + result.breakdown.logistics,
            result.breakdown.overhead, result.breakdown.margin,
          ],
          backgroundColor: ['#e65100','#f4511e','#ff7043','#ff8a65','#ffccbc','#b0bec5','#78909c'],
          borderWidth: 1,
        }],
      },
      options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }, cutout: '60%' },
    });
  }

  // Wire add-quote button
  panel.querySelector('#add-quote-btn-inline')?.addEventListener('click', openQuoteModal);
  panel.querySelectorAll('.del-quote-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qi = parseInt((btn as HTMLElement).dataset.qi ?? '0');
      supplierQuotes.splice(qi, 1);
      if (lastResult) renderBreakdown(lastResult);
    });
  });
}

// ─── Render: Sensitivity ──────────────────────────────────────────────────────

function renderSensitivity(): void {
  const panel = el('results-sensitivity');
  if (!lastInput) { panel.innerHTML = '<div class="placeholder">Run a calculation first.</div>'; return; }

  panel.innerHTML = '<div class="placeholder">Running sensitivity analysis…</div>';

  setTimeout(() => {
    try {
      const sens = runSensitivity(lastInput!, library, 10);
      const maxRange = sens.drivers[0]?.range ?? 1;
      const BAR_MAX = 140;

      panel.innerHTML = `
        <div>
          <div class="panel-title">Sensitivity / Tornado Chart (±10%)</div>
          <div style="font-size:0.75rem;color:#888;margin-bottom:8px">
            Baseline: ${fmt(sens.baseline.total)} — Showing top ${sens.drivers.length} drivers sorted by impact
          </div>
          <div class="tornado-chart">
            <div class="tornado-header">
              <span>Driver</span>
              <span style="text-align:right">−10% impact</span>
              <span>+10% impact</span>
            </div>
            ${sens.drivers.map(d => {
              const plusW  = Math.max(3, (Math.abs(d.plusCost  - sens.baseline.total) / maxRange) * BAR_MAX);
              const minusW = Math.max(3, (Math.abs(d.minusCost - sens.baseline.total) / maxRange) * BAR_MAX);
              const plusSign  = d.plusPct  >= 0 ? '+' : '';
              const minusSign = d.minusPct >= 0 ? '+' : '';
              return `<div class="tornado-row">
                <div class="tornado-label">${d.driver}</div>
                <div class="tornado-minus-col">
                  <span class="t-pct t-pct-minus">${minusSign}${d.minusPct.toFixed(1)}%</span>
                  <div class="t-bar t-bar-minus" style="width:${minusW}px"></div>
                </div>
                <div class="tornado-plus-col">
                  <div class="t-bar t-bar-plus" style="width:${plusW}px"></div>
                  <span class="t-pct t-pct-plus">${plusSign}${d.plusPct.toFixed(1)}%</span>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>`;
    } catch (err) {
      panel.innerHTML = `<div class="placeholder" style="color:var(--red)">Sensitivity error: ${err instanceof Error ? err.message : String(err)}</div>`;
    }
  }, 20);
}

// ─── Render: Scenarios ────────────────────────────────────────────────────────

function renderScenarios(): void {
  const panel = el('results-scenarios');
  const scenarios = listScenarios();

  const scOptions = scenarios.map(s =>
    `<option value="${s.id}">${s.name} — ${fmt(s.result.total)}</option>`
  ).join('');

  panel.innerHTML = `
    <div>
      <div class="panel-title">Saved Scenarios (${scenarios.length})</div>
      <div class="scenario-list">
        ${scenarios.length === 0 ? '<div style="color:#aaa;font-size:0.82rem">No scenarios saved yet. Calculate a result and click Save Scenario.</div>' : ''}
        ${scenarios.map(s => `
          <div class="scenario-card">
            <div class="sc-name">${s.name}</div>
            <div class="sc-meta">${s.description ? s.description + ' · ' : ''}${new Date(s.createdAt).toLocaleDateString()}</div>
            <div class="sc-total">${fmt(s.result.total)}</div>
            <button class="btn btn-secondary btn-sm del-sc-btn" data-sc-id="${s.id}">Delete</button>
          </div>`).join('')}
      </div>
      <div class="scenario-compare-box">
        <div class="panel-title" style="margin-bottom:10px">Compare Two Scenarios</div>
        <div class="field-row">
          <div class="field-group"><label>Baseline</label><select id="sc-cmp1">${scOptions}</select></div>
          <div class="field-group"><label>Target</label><select id="sc-cmp2">${scOptions}</select></div>
        </div>
        <div class="btn-row" style="margin-top:8px">
          <button class="btn btn-primary btn-sm" id="run-compare-btn">Compare</button>
          <button class="btn btn-secondary btn-sm" id="export-sc-btn">Export JSON</button>
          <label class="btn btn-secondary btn-sm" for="import-sc-file" style="margin:0;cursor:pointer">Import JSON</label>
          <input type="file" id="import-sc-file" accept=".json" style="display:none">
        </div>
        <div id="compare-result" style="margin-top:12px"></div>
      </div>
    </div>`;

  // Wire up events
  panel.querySelectorAll('.del-sc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.scId!;
      deleteScenario(id);
      renderScenarios();
    });
  });

  el('run-compare-btn')?.addEventListener('click', () => {
    const id1 = sel('sc-cmp1');
    const id2 = sel('sc-cmp2');
    if (!id1 || !id2) return;
    try {
      const comp = compareScenarios(id1, id2, library);
      renderCompareResult(comp);
    } catch (err) {
      el('compare-result').innerHTML = `<span style="color:var(--red)">${err instanceof Error ? err.message : String(err)}</span>`;
    }
  });

  el('export-sc-btn')?.addEventListener('click', () => {
    const blob = new Blob([exportScenarios()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'scenarios.json';
    a.click();
  });

  el('import-sc-file')?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { imported, errors } = importScenarios(ev.target?.result as string);
      alert(`Imported ${imported} scenario(s).${errors.length ? '\nErrors: ' + errors.join(', ') : ''}`);
      renderScenarios();
    };
    reader.readAsText(file);
  });
}

function renderCompareResult(comp: { baseline: { name: string; result: PartCostResult }; target: { name: string; result: PartCostResult }; delta: { rawMaterial: number; process: number; labour: number; tooling: number; packaging: number; logistics: number; overhead: number; margin: number; total: number; totalPct: number } }): void {
  const { baseline, target, delta } = comp;
  const b = baseline.result.breakdown;
  const t = target.result.breakdown;

  function deltaCell(d: number): string {
    const cls = d > 0 ? 'delta-pos' : d < 0 ? 'delta-neg' : '';
    return `<td class="${cls}">${d >= 0 ? '+' : ''}${fmt(d)}</td>`;
  }

  const rows = [
    ['1. Raw Material', b.rawMaterial, t.rawMaterial, delta.rawMaterial],
    ['2. Process',       b.process,     t.process,     delta.process],
    ['3. Labour',        b.labour,      t.labour,      delta.labour],
    ['4. Tooling',       b.tooling,     t.tooling,     delta.tooling],
    ['5. Packaging',     b.packaging,   t.packaging,   delta.packaging],
    ['6. Logistics',     b.logistics,   t.logistics,   delta.logistics],
    ['7. Overhead',      b.overhead,    t.overhead,    delta.overhead],
    ['8. Margin',        b.margin,      t.margin,      delta.margin],
  ] as [string, number, number, number][];

  el('compare-result').innerHTML = `
    <table class="compare-table">
      <thead><tr>
        <th>Bucket</th>
        <th>${baseline.name}</th>
        <th>${target.name}</th>
        <th>Delta</th>
      </tr></thead>
      <tbody>
        ${rows.map(([label, bv, tv, dv]) => `<tr>
          <td>${label}</td><td>${fmt(bv)}</td><td>${fmt(tv)}</td>${deltaCell(dv)}
        </tr>`).join('')}
        <tr class="total-row">
          <td>TOTAL</td>
          <td>${fmt(baseline.result.total)}</td>
          <td>${fmt(target.result.total)}</td>
          ${deltaCell(delta.total)}
        </tr>
        <tr>
          <td colspan="3" style="font-size:0.75rem;color:#888">% change vs. baseline</td>
          <td class="${delta.totalPct > 0 ? 'delta-pos' : 'delta-neg'}">${delta.totalPct >= 0 ? '+' : ''}${delta.totalPct.toFixed(1)}%</td>
        </tr>
      </tbody>
    </table>`;
}

// ─── Export ───────────────────────────────────────────────────────────────────

function downloadExcel(): void {
  if (!lastResult) return;
  const blob = exportToExcelBlob(lastResult);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `should-cost-${lastResult.partName.replace(/\s+/g, '-')}.xlsx`;
  a.click();
}

function openPDF(): void {
  if (!lastResult) return;
  printPDF(lastResult);
}

// ─── Scenario modal ───────────────────────────────────────────────────────────

function openScenarioModal(): void {
  if (!lastResult) return;
  el('scenario-modal').style.display = 'flex';
}

function saveScenarioFromModal(): void {
  if (!lastResult || !lastInput) return;
  const name = val('sc-name') || 'Scenario';
  const desc = val('sc-desc');
  saveScenario(name, desc, lastInput, lastResult);
  el('scenario-modal').style.display = 'none';
  // If scenarios tab is active, refresh
  const scTab = el('results-scenarios');
  if (scTab && scTab.style.display !== 'none') renderScenarios();
}

// ─── Load Example ─────────────────────────────────────────────────────────────

function loadExample(): void {
  switch (activeCommodity) {
    case 'machining':
      (el<HTMLInputElement>('mach-mat'))?.value; // already rendered
      setTimeout(() => {
        const matEl = el<HTMLSelectElement>('mach-mat');
        if (matEl) { const opt = Array.from(matEl.options).find(o => o.value === 'mat-al6061'); if (opt) matEl.value = opt.value; }
        (el<HTMLInputElement>('mach-net-wt')).value = '0.5';
        (el<HTMLInputElement>('mach-stock-wt')).value = '0.77';
        (el<HTMLInputElement>('mach-mat-util')).value = '0';
        (el<HTMLInputElement>('mach-setup-time')).value = '0.5';
        (el<HTMLInputElement>('mach-batch-size')).value = '50';
        (el<HTMLInputElement>('mach-tooling')).value = '15000';
        (el<HTMLInputElement>('mach-amort')).value = '50000';
        (el<HTMLInputElement>('mach-prog-nre')).value = '0';
        (el<HTMLInputElement>('part-name')).value = 'Al6061 Bracket';
        (el<HTMLInputElement>('packaging')).value = '0.15';
        (el<HTMLInputElement>('logistics')).value = '0.25';
        (el<HTMLInputElement>('overhead-pct')).value = '12';
        (el<HTMLInputElement>('margin-pct')).value = '8';
        el('mach-ops-container').innerHTML = ''; machOpCount = 0;
        addMachOp({ name: 'CNC Turning', type: 'turning',   machineId: 'mach-lathe-cnc', labourId: 'lab-uk-skilled', cycleTimeHr: 0.05, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.05, labourEfficiency: 0.92 });
        addMachOp({ name: 'CNC Milling', type: 'milling_3ax', machineId: 'mach-vmc3',    labourId: 'lab-uk-skilled', cycleTimeHr: 0.12, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.12, labourEfficiency: 0.92 });
        addMachOp({ name: 'CNC Drilling', type: 'drilling', machineId: 'mach-drill',     labourId: 'lab-uk-skilled', cycleTimeHr: 0.03, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.03, labourEfficiency: 0.92 });
        compute();
      }, 0);
      break;

    case 'sheet_metal':
      setTimeout(() => {
        (el<HTMLInputElement>('sm-net-wt')).value = '0.15';
        (el<HTMLInputElement>('sm-blank-l')).value = '200';
        (el<HTMLInputElement>('sm-blank-w')).value = '150';
        (el<HTMLInputElement>('sm-thick')).value = '1.2';
        (el<HTMLInputElement>('sm-perim')).value = '700';
        (el<HTMLInputElement>('sm-shear')).value = '280';
        (el<HTMLInputElement>('sm-strip-w')).value = '160';
        (el<HTMLInputElement>('sm-pitch')).value = '210';
        (el<HTMLInputElement>('sm-pps')).value = '1';
        (el<HTMLInputElement>('sm-spm')).value = '80';
        (el<HTMLInputElement>('sm-oee')).value = '0.85';
        (el<HTMLInputElement>('sm-manning')).value = '0.25';
        (el<HTMLInputElement>('sm-lab-eff')).value = '0.95';
        (el<HTMLInputElement>('sm-num-ops')).value = '3';
        (el<HTMLInputElement>('sm-die-cost')).value = '45000';
        (el<HTMLInputElement>('sm-die-life')).value = '500000';
        (el<HTMLInputElement>('sm-amort')).value = '500000';
        const matEl = el<HTMLSelectElement>('sm-mat');
        if (matEl) { const opt = Array.from(matEl.options).find(o => o.value === 'mat-dc01'); if (opt) matEl.value = opt.value; }
        (el<HTMLInputElement>('part-name')).value = 'DC01 Bracket';
        compute();
      }, 0);
      break;

    case 'cast_and_machine':
      setTimeout(() => {
        (el<HTMLInputElement>('part-name')).value = 'HPDC Al Bracket + Machined';
        (el<HTMLInputElement>('cam-cast-wt')).value = '1.5';
        (el<HTMLInputElement>('cam-finish-wt')).value = '1.3';
        (el<HTMLInputElement>('cam-cast-yield')).value = '0.75';
        (el<HTMLInputElement>('cam-reject')).value = '0.03';
        (el<HTMLInputElement>('cam-cast-oee')).value = '0.80';
        (el<HTMLInputElement>('cam-cast-manning')).value = '1';
        (el<HTMLInputElement>('cam-cast-lab-eff')).value = '0.92';
        (el<HTMLInputElement>('cam-hpdc-ct')).value = '45';
        (el<HTMLInputElement>('cam-hpdc-cav')).value = '2';
        (el<HTMLInputElement>('cam-hpdc-die-cost')).value = '120000';
        (el<HTMLInputElement>('cam-hpdc-die-life')).value = '200000';
        (el<HTMLInputElement>('cam-mach-setup-time')).value = '0.5';
        (el<HTMLInputElement>('cam-mach-batch-size')).value = '50';
        (el<HTMLInputElement>('cam-mach-tooling')).value = '5000';
        (el<HTMLInputElement>('cam-mach-prog-nre')).value = '2000';
        (el<HTMLInputElement>('cam-amort')).value = '50000';
        const matEl = el<HTMLSelectElement>('cam-mat');
        if (matEl) { const opt = Array.from(matEl.options).find(o => o.value === 'mat-adc12'); if (opt) matEl.value = opt.value; }
        const machEl = el<HTMLSelectElement>('cam-hpdc-mach');
        if (machEl) { const opt = Array.from(machEl.options).find(o => o.value === 'hpdc-800t'); if (opt) machEl.value = opt.value; }
        const setupMachEl = el<HTMLSelectElement>('cam-mach-setup-mach');
        if (setupMachEl) { const opt = Array.from(setupMachEl.options).find(o => o.value === 'mach-haas-vf2'); if (opt) setupMachEl.value = opt.value; }
        (el<HTMLInputElement>('packaging')).value = '0.15';
        (el<HTMLInputElement>('logistics')).value = '0.25';
        (el<HTMLInputElement>('overhead-pct')).value = '12';
        (el<HTMLInputElement>('margin-pct')).value = '9';
        compute();
      }, 0);
      break;

    case 'cad_analysis':
      el('cad-results').innerHTML = `<div style="padding:12px;font-size:0.8rem;color:#555;background:#fff8f3;border-radius:6px;border:1px solid #ffd699">Upload a STEP or IGES file and click "Analyze CAD File" to get AI-powered cost estimates.</div>`;
      break;

    case 'assembly': {
      asmLineCount = 0;
      el('commodity-form-area').innerHTML = renderAssemblyForm();
      el('add-asm-line-btn')?.addEventListener('click', () => addAsmLine());
      addAsmLine();
      renderSavedAssemblies();
      el('universal-costs').style.display = '';
      el('part-name').closest<HTMLElement>('div[style]')!.style.display = 'none';
      el('calc-btn').textContent = 'Calculate Assembly';
      // calc btn is re-wired in init to call computeAssembly for assembly mode
      break;
    }

    default:
      compute();
  }
}

// ─── Supplier Quote Modal ─────────────────────────────────────────────────────

function openQuoteModal(): void {
  const today = new Date().toISOString().slice(0, 10);
  const dateEl = document.getElementById('sq-date') as HTMLInputElement;
  if (dateEl && !dateEl.value) dateEl.value = today;
  el('quote-modal').style.display = 'flex';
}

function addSupplierQuote(): void {
  const price = parseFloat((el<HTMLInputElement>('sq-price')).value) || 0;
  const fxRate = parseFloat((el<HTMLInputElement>('sq-fx')).value) || 1;
  const currency = (el<HTMLSelectElement>('sq-currency')).value;
  const quotedGBP = currency === 'GBP' ? price : price * fxRate;
  const quote: SupplierQuote = {
    supplierName: (el<HTMLInputElement>('sq-supplier')).value.trim() || 'Unnamed Supplier',
    quotedPriceGBP: quotedGBP,
    quoteDate: (el<HTMLInputElement>('sq-date')).value,
    leadTimeDays: parseInt((el<HTMLInputElement>('sq-lead')).value) || 0,
    currency,
    fxRate,
    notes: (el<HTMLInputElement>('sq-notes')).value.trim(),
  };
  supplierQuotes.push(quote);
  el('quote-modal').style.display = 'none';
  if (lastResult) renderBreakdown(lastResult);
}

// ─── Assembly BOM ─────────────────────────────────────────────────────────────

function renderAssemblyForm(): string {
  return `
    <div class="section-title">Assembly BOM Lines</div>
    <div style="font-size:0.76rem;color:#888;margin-bottom:8px">Enter each bought-out / sub-assembled part. Should-Cost is applied on top.</div>
    <div id="asm-lines-container">
      <div class="asm-line-header" style="display:grid;grid-template-columns:2fr 60px 90px 80px 80px 80px 36px;gap:4px;font-size:0.72rem;color:#888;padding:0 2px;margin-bottom:4px">
        <span>Description</span><span>Qty</span><span>Unit Cost £</span><span>Unit Wt kg</span><span>Ext Cost</span><span>Ext Wt</span><span></span>
      </div>
    </div>
    <button class="btn btn-secondary btn-sm" id="add-asm-line-btn" style="margin-top:4px">+ Add Part</button>
    <div class="field-row" style="margin-top:10px">
      <div class="field-group"><label>Assembly Name</label><input type="text" id="asm-name" value="New Assembly"/></div>
    </div>
    <div style="margin-top:10px">
      <div class="panel-title">Saved Assemblies</div>
      <div id="saved-assemblies-list"></div>
    </div>`;
}

function addAsmLine(defaults?: Partial<AssemblyLine>): void {
  asmLineCount++;
  const i = asmLineCount;
  const container = el('asm-lines-container');
  const row = document.createElement('div');
  row.className = 'asm-line-row';
  row.dataset.asmIdx = String(i);
  row.style.cssText = 'display:grid;grid-template-columns:2fr 60px 90px 80px 80px 80px 36px;gap:4px;margin-bottom:4px;align-items:center';
  row.innerHTML = `
    <input type="text" class="asm-desc" value="${defaults?.description ?? ''}" placeholder="Part description" style="font-size:0.78rem;padding:3px 6px"/>
    <input type="number" class="asm-qty" value="${defaults?.qty ?? 1}" min="0" step="1" style="font-size:0.78rem;padding:3px 4px"/>
    <input type="number" class="asm-cost" value="${defaults?.unitCostGBP ?? 0}" min="0" step="0.01" style="font-size:0.78rem;padding:3px 4px"/>
    <input type="number" class="asm-wt" value="${defaults?.unitWeightKg ?? 0}" min="0" step="0.001" style="font-size:0.78rem;padding:3px 4px"/>
    <span class="asm-ext-cost" style="font-size:0.77rem;color:#555;text-align:right">£0.00</span>
    <span class="asm-ext-wt" style="font-size:0.77rem;color:#555;text-align:right">0.000 kg</span>
    <button class="btn btn-secondary btn-sm del-asm-btn" style="padding:2px 6px">×</button>`;

  function updateExt(): void {
    const qty = parseFloat(row.querySelector<HTMLInputElement>('.asm-qty')!.value) || 0;
    const cost = parseFloat(row.querySelector<HTMLInputElement>('.asm-cost')!.value) || 0;
    const wt = parseFloat(row.querySelector<HTMLInputElement>('.asm-wt')!.value) || 0;
    row.querySelector<HTMLSpanElement>('.asm-ext-cost')!.textContent = fmt(qty * cost);
    row.querySelector<HTMLSpanElement>('.asm-ext-wt')!.textContent = (qty * wt).toFixed(3) + ' kg';
  }

  row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', updateExt));
  row.querySelector('.del-asm-btn')!.addEventListener('click', () => { row.remove(); });
  container.appendChild(row);
  updateExt();
}

function collectAssemblyLines(): AssemblyLine[] {
  const rows = el('asm-lines-container').querySelectorAll<HTMLElement>('.asm-line-row');
  return Array.from(rows).map((row, i) => ({
    id: `line-${i+1}`,
    description: row.querySelector<HTMLInputElement>('.asm-desc')!.value.trim(),
    qty: parseFloat(row.querySelector<HTMLInputElement>('.asm-qty')!.value) || 0,
    unitCostGBP: parseFloat(row.querySelector<HTMLInputElement>('.asm-cost')!.value) || 0,
    unitWeightKg: parseFloat(row.querySelector<HTMLInputElement>('.asm-wt')!.value) || 0,
    notes: '',
  }));
}

function computeAssembly(): void {
  const lines = collectAssemblyLines();
  if (lines.length === 0) { alert('Add at least one part to the BOM.'); return; }
  const name = (el<HTMLInputElement>('asm-name'))?.value?.trim() || 'Assembly';
  const assembly: Assembly = newAssembly(name);
  assembly.lines = lines;
  assembly.overheadPct = num('overhead-pct');
  assembly.marginPct = num('margin-pct');

  const rollup = computeAssemblyRollup(assembly);

  el('results-breakdown').innerHTML = `
    <div class="summary-cards">
      <div class="summary-card total-card">
        <div class="card-label">Assembly Total</div>
        <div class="card-value">${fmt(rollup.total)}</div>
        <div class="card-sub">${rollup.assembly.name}</div>
      </div>
      <div class="summary-card">
        <div class="card-label">Parts Cost</div>
        <div class="card-value">${fmt(rollup.totalPartsCost)}</div>
        <div class="card-sub">${rollup.lineSubtotals.length} lines</div>
      </div>
      <div class="summary-card">
        <div class="card-label">OH + Margin</div>
        <div class="card-value">${fmt(rollup.overhead + rollup.margin)}</div>
        <div class="card-sub">${fmtPct(((rollup.overhead + rollup.margin) / rollup.total) * 100)} of total</div>
      </div>
      <div class="summary-card">
        <div class="card-label">Total Weight</div>
        <div class="card-value">${rollup.totalWeightKg.toFixed(3)} kg</div>
        <div class="card-sub">Assembly mass</div>
      </div>
    </div>
    <div>
      <div class="panel-title">BOM Rollup</div>
      <table class="breakdown-table">
        <thead><tr><th>Description</th><th>Qty</th><th>Unit Cost</th><th>Unit Wt (kg)</th><th>Ext Cost</th><th>Ext Wt (kg)</th></tr></thead>
        <tbody>
          ${rollup.lineSubtotals.map(ls => `<tr>
            <td>${ls.line.description || '—'}</td>
            <td style="text-align:right">${ls.line.qty}</td>
            <td>${fmt(ls.line.unitCostGBP)}</td>
            <td style="text-align:right">${ls.line.unitWeightKg.toFixed(3)}</td>
            <td>${fmt(ls.extendedCost)}</td>
            <td style="text-align:right">${ls.extendedWeight.toFixed(3)}</td>
          </tr>`).join('')}
          <tr class="subtotal-row"><td colspan="4">Total Parts Cost</td><td>${fmt(rollup.totalPartsCost)}</td><td style="text-align:right">${rollup.totalWeightKg.toFixed(3)}</td></tr>
          <tr><td colspan="4">Overhead (${rollup.assembly.overheadPct}%)</td><td>${fmt(rollup.overhead)}</td><td></td></tr>
          <tr class="subtotal-row"><td colspan="4">Subtotal</td><td>${fmt(rollup.subtotal)}</td><td></td></tr>
          <tr><td colspan="4">Margin (${rollup.assembly.marginPct}%)</td><td>${fmt(rollup.margin)}</td><td></td></tr>
          <tr class="total-row"><td colspan="4">ASSEMBLY TOTAL</td><td>${fmt(rollup.total)}</td><td style="text-align:right">${rollup.totalWeightKg.toFixed(3)} kg</td></tr>
        </tbody>
      </table>
    </div>
    <div class="btn-row" style="margin-top:10px">
      <button class="btn btn-secondary btn-sm" id="save-asm-btn">Save Assembly</button>
    </div>`;

  showResultsArea();

  el('save-asm-btn')?.addEventListener('click', () => {
    assembly.lines = collectAssemblyLines();
    saveAssembly(assembly);
    renderSavedAssemblies();
    alert(`Assembly "${assembly.name}" saved.`);
  });
}

function renderSavedAssemblies(): void {
  const list = listAssemblies();
  const container = document.getElementById('saved-assemblies-list');
  if (!container) return;
  if (list.length === 0) {
    container.innerHTML = '<div style="color:#aaa;font-size:0.78rem">No saved assemblies.</div>';
    return;
  }
  container.innerHTML = list.map(a => {
    const rollup = computeAssemblyRollup(a);
    return `<div class="scenario-card" style="margin-bottom:6px">
      <div class="sc-name">${a.name}</div>
      <div class="sc-meta">${a.lines.length} parts · ${fmt(rollup.totalPartsCost)} parts cost</div>
      <div class="sc-total">${fmt(rollup.total)} total</div>
      <button class="btn btn-secondary btn-sm del-asm-saved-btn" data-asm-id="${a.id}" style="font-size:0.7rem">Delete</button>
    </div>`;
  }).join('');
  container.querySelectorAll('.del-asm-saved-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteAssembly((btn as HTMLElement).dataset.asmId!);
      renderSavedAssemblies();
    });
  });
}

// ─── Rate Library Editor ──────────────────────────────────────────────────────

function openRateLibrary(): void {
  el('rate-modal').style.display = 'flex';
  renderRateLibraryTable();
}

function renderRateLibraryTable(): void {
  const c = el('rate-library-content');
  c.innerHTML = `
    <div class="panel-title" style="margin-bottom:8px">Materials</div>
    <table class="breakdown-table" style="margin-bottom:16px;font-size:0.76rem">
      <thead><tr><th>ID</th><th>Grade</th><th>£/kg</th><th>Scrap £/kg</th><th>Region</th><th>Conf.</th></tr></thead>
      <tbody>${library.materials.map(m => `<tr>
        <td style="font-family:monospace">${m.id}</td><td>${m.grade}</td>
        <td><input type="number" step="0.01" value="${m.pricePerKg}" data-update="material.${m.id}.pricePerKg" style="width:65px;padding:2px 4px;border:1px solid #ddd;border-radius:3px"/></td>
        <td><input type="number" step="0.01" value="${m.scrapRecoveryPricePerKg}" data-update="material.${m.id}.scrapRecoveryPricePerKg" style="width:65px;padding:2px 4px;border:1px solid #ddd;border-radius:3px"/></td>
        <td>${m.region}</td><td><span class="badge ${m.confidence}">${m.confidence}</span></td>
      </tr>`).join('')}</tbody>
    </table>
    <div class="panel-title" style="margin-bottom:8px">Machine Rates</div>
    <table class="breakdown-table" style="margin-bottom:16px;font-size:0.76rem">
      <thead><tr><th>ID</th><th>Class</th><th>Rate (£/hr)</th><th>Deprec.</th><th>Maint.</th><th>Energy</th><th>Hrs/yr</th><th>Util.</th></tr></thead>
      <tbody>${library.machines.map(m => `<tr>
        <td style="font-family:monospace">${m.id}</td><td>${m.machineClass}</td>
        <td style="font-weight:700">£${m.computedRatePerHr.toFixed(2)}</td>
        <td><input type="number" step="100" value="${m.buildup.annualDepreciation}" data-update="machine.${m.id}.annualDepreciation" style="width:62px;padding:2px 4px;border:1px solid #ddd;border-radius:3px"/></td>
        <td><input type="number" step="100" value="${m.buildup.maintenance}" data-update="machine.${m.id}.maintenance" style="width:62px;padding:2px 4px;border:1px solid #ddd;border-radius:3px"/></td>
        <td><input type="number" step="100" value="${m.buildup.energy}" data-update="machine.${m.id}.energy" style="width:62px;padding:2px 4px;border:1px solid #ddd;border-radius:3px"/></td>
        <td><input type="number" step="100" value="${m.buildup.annualAvailableHours}" data-update="machine.${m.id}.annualAvailableHours" style="width:55px;padding:2px 4px;border:1px solid #ddd;border-radius:3px"/></td>
        <td><input type="number" step="0.01" max="1" value="${m.buildup.machineUtilization}" data-update="machine.${m.id}.machineUtilization" style="width:50px;padding:2px 4px;border:1px solid #ddd;border-radius:3px"/></td>
      </tr>`).join('')}</tbody>
    </table>
    <div class="panel-title" style="margin-bottom:8px">Labour Rates</div>
    <table class="breakdown-table" style="font-size:0.76rem">
      <thead><tr><th>ID</th><th>Region</th><th>Skill</th><th>£/hr</th><th>Conf.</th></tr></thead>
      <tbody>${library.labour.map(l => `<tr>
        <td style="font-family:monospace">${l.id}</td><td>${l.region}</td><td>${l.skillLevel}</td>
        <td><input type="number" step="0.5" value="${l.fullyLoadedRatePerHr}" data-update="labour.${l.id}.fullyLoadedRatePerHr" style="width:65px;padding:2px 4px;border:1px solid #ddd;border-radius:3px"/></td>
        <td><span class="badge ${l.confidence}">${l.confidence}</span></td>
      </tr>`).join('')}</tbody>
    </table>`;
}

function applyRateLibraryEdits(): void {
  el('rate-library-content').querySelectorAll<HTMLInputElement>('input[data-update]').forEach(input => {
    const [type, id, field] = input.dataset.update!.split('.');
    const value = parseFloat(input.value);
    if (isNaN(value)) return;
    if (type === 'material') {
      const m = library.materials.find(x => x.id === id);
      if (m) (m as unknown as Record<string, unknown>)[field] = value;
    } else if (type === 'machine') {
      const m = library.machines.find(x => x.id === id);
      if (m) (m.buildup as unknown as Record<string, unknown>)[field] = value;
    } else if (type === 'labour') {
      const l = library.labour.find(x => x.id === id);
      if (l) (l as unknown as Record<string, unknown>)[field] = value;
    }
  });
  library = recomputeMachineRates(library);
  saveLibraryToStorage(library);
  populateSelects();
  el('rate-modal').style.display = 'none';
}

function resetRateLibrary(): void {
  if (!confirm('Reset rate library to factory defaults?')) return;
  library = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
  saveLibraryToStorage(library);
  populateSelects();
  el('rate-modal').style.display = 'none';
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  // Init IndexedDB scenario store (migrates from localStorage automatically)
  await initScenarioStore();

  // Commodity tabs
  document.querySelectorAll<HTMLElement>('.ctab').forEach(tab => {
    tab.addEventListener('click', () => {
      const type = tab.dataset.commodity as CommodityType;
      if (type === 'assembly') {
        el('calc-btn').onclick = computeAssembly;
      } else {
        el('calc-btn').onclick = compute;
      }
      switchCommodity(type);
    });
  });

  // Results tabs
  document.querySelectorAll<HTMLElement>('.rtab').forEach(tab => {
    tab.addEventListener('click', () => switchResultTab(tab.dataset.panel!));
  });

  // Action buttons
  el('calc-btn')?.addEventListener('click', compute);
  el('export-excel-btn')?.addEventListener('click', downloadExcel);
  el('export-pdf-btn')?.addEventListener('click', openPDF);
  el('save-scenario-btn')?.addEventListener('click', openScenarioModal);
  el('load-ref-btn')?.addEventListener('click', loadExample);
  el('rates-btn')?.addEventListener('click', openRateLibrary);

  // Rate modal
  el('apply-rates-btn')?.addEventListener('click', applyRateLibraryEdits);
  el('reset-rates-btn')?.addEventListener('click', resetRateLibrary);
  el('close-modal-btn')?.addEventListener('click', () => { el('rate-modal').style.display = 'none'; });
  el('rate-modal')?.addEventListener('click', e => { if (e.target === el('rate-modal')) el('rate-modal').style.display = 'none'; });

  // Scenario modal
  el('confirm-save-sc')?.addEventListener('click', saveScenarioFromModal);
  el('cancel-save-sc')?.addEventListener('click', () => { el('scenario-modal').style.display = 'none'; });
  el('scenario-modal')?.addEventListener('click', e => { if (e.target === el('scenario-modal')) el('scenario-modal').style.display = 'none'; });

  // Quote modal
  el('confirm-add-quote')?.addEventListener('click', addSupplierQuote);
  el('cancel-add-quote')?.addEventListener('click', () => { el('quote-modal').style.display = 'none'; });
  el('quote-modal')?.addEventListener('click', e => { if (e.target === el('quote-modal')) el('quote-modal').style.display = 'none'; });

  // Start on machining
  switchCommodity('machining');
}

document.addEventListener('DOMContentLoaded', () => { void init(); });
