import './styles/calculator.css';
import {
  computeUniversalStack, validateStackInput, breakdownPercentages,
  DEFAULT_RATE_LIBRARY, recomputeMachineRates, getLibraryFromStorage, saveLibraryToStorage,
} from '../engine/index.js';
import type { CADAnalysisResult, OCCTGeometry } from '../engine/ai-analysis.js';
import { computeMachiningDrivers } from '../engine/modules/machining.js';
import { computeSheetMetalDrivers } from '../engine/modules/sheet-metal.js';
import { computeInjectionMouldingDrivers } from '../engine/modules/injection-moulding.js';
import { computeCastingDrivers } from '../engine/modules/casting.js';
import { computeForgingDrivers } from '../engine/modules/forging.js';
import { computePaintingDrivers } from '../engine/modules/painting.js';
import { computeBIWDrivers } from '../engine/modules/biw-assembly.js';
import { computePCBFabDrivers } from '../engine/modules/pcb-fab.js';
import type { PCBTechnology, PCBQualityGrade } from '../engine/modules/pcb-fab.js';
import { computePCBADrivers } from '../engine/modules/pcba.js';
import type { AssemblyComplexityLevel, PCBAQualityGrade } from '../engine/modules/pcba.js';
import { computeCastAndMachineDrivers } from '../engine/modules/cast-and-machine.js';
import { computeSheetMetalFabDrivers } from '../engine/modules/sheet-metal-fab.js';
import { adviseSheetMetalProcess } from '../engine/modules/sheet-metal-advisor.js';
import type { FabBlankingMethod, AssistGas } from '../engine/modules/sheet-metal-fab.js';
import { computeBlowMouldingDrivers } from '../engine/modules/blow-moulding.js';
import { computeExtrusionDrivers } from '../engine/modules/extrusion.js';
import { computeThermoformingDrivers } from '../engine/modules/thermoforming.js';
import { computeRotationalMouldingDrivers } from '../engine/modules/rotational-moulding.js';
import { computeRubberDrivers } from '../engine/modules/rubber.js';
import type { RubberProcess } from '../engine/modules/rubber.js';
import { computeCompositeDrivers } from '../engine/modules/composites.js';
import type { CompositeProcess } from '../engine/modules/composites.js';
import { computeWiringHarnessDrivers } from '../engine/modules/wiring-harness.js';
import { buildRegionalLibrary, REGIONAL_DATA } from '../engine/regional-rates.js';
import type { ManufacturingRegion } from '../engine/regional-rates.js';
import { recommendMachineIds } from '../engine/process-taxonomy.js';
import { runSensitivity } from '../engine/sensitivity.js';
import {
  saveScenario, listScenarios, deleteScenario, compareScenarios,
  exportScenarios, importScenarios, initScenarioStore, setScenarioErrorHandler,
} from '../engine/scenario.js';
import { computeAssemblyRollup, newAssembly, saveAssembly, deleteAssembly, listAssemblies } from '../engine/assembly.js';
import type { Assembly, AssemblyLine } from '../engine/assembly.js';
import type { LearningCurveResult } from '../engine/learning-curve.js';
import { exportToExcelBlob } from '../export/excel.js';
import { printPDF } from '../export/pdf.js';
import { generateInsights, totalPotentialSaving, FX_TO_GBP } from '../engine/insights.js';
import { generateDFMDFA } from '../engine/dfm-dfa.js';
import type { DFMIssue, CostOptimisation } from '../engine/dfm-dfa.js';
import type { RateLibrary, UniversalStackInput, PartCostResult, CommodityType, SupplierQuote } from '../engine/types.js';
import type { BOMLine, ComponentType } from '../engine/modules/pcba.js';
import { parseBOMCSV } from '../engine/bom-csv.js';
import type { MachiningOperation } from '../engine/modules/machining.js';
import type { CoatType } from '../engine/modules/painting.js';
import type { JoiningType } from '../engine/modules/biw-assembly.js';
import type { CastAndMachineInputs } from '../engine/modules/cast-and-machine.js';
import type { CastingSubtype } from '../engine/modules/casting.js';
import { Chart, ArcElement, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, DoughnutController, BarController, LineController } from 'chart.js';

Chart.register(ArcElement, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, DoughnutController, BarController, LineController);

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
let cadOCCTGeometry: OCCTGeometry | null = null;
let cadGeometrySource: 'occt' | 'text_parsing' = 'text_parsing';
let pcbImageResult: PCBImageAnalysis | null = null;
let pcbImageLoading = false;
let pcbBOMFile: File | null = null;
let pcbImageDataURL: string | null = null;
let pcbNREEnabled = false;
// Slot 0=Top (primary), 1=Bottom, 2-4=Additional 1-3
let pcbImageFiles: (File | null)[] = [null, null, null, null, null];
let pcbEditMode = false;
let _pcbVolumeChart: Chart | null = null;
let supplierQuotes: SupplierQuote[] = [];
let partPhotoDataUrl: string | null = null;
let partPhotoName: string | null = null;
let _mfgRegion: ManufacturingRegion = 'UK';
let _breakdownChart: Chart | null = null;
let _displayCurrency = 'GBP';
let _displayFxRate = 1.0;

const CURRENCY_SYMBOL: Record<string, string> = {
  GBP: '£', EUR: '€', USD: '$', CNY: '¥', INR: '₹',
  MXN: '$M', THB: '฿', VND: '₫', BRL: 'R$', KRW: '₩',
  PLN: 'zł', CZK: 'Kč', TRY: '₺', SEK: 'kr', RON: 'lei', HUF: 'Ft',
};

function _currFmt(n: number): string {
  const sym = CURRENCY_SYMBOL[_displayCurrency] ?? _displayCurrency;
  return `${sym}${(n * _displayFxRate).toFixed(2)}`;
}

// ─── Dashboard state ──────────────────────────────────────────────────────────

interface CostingRecord {
  id: string;
  partName: string;
  commodity: string;
  totalCost: number;
  currency: string;
  region: string;
  timestamp: number;
  vehicle: string;
  system: string;
  confidence: string;
  breakdown?: {
    rawMaterial: number; process: number; labour: number; tooling: number;
    overhead: number; packaging: number; logistics: number; margin: number;
  };
  warnings?: string[];
}

const COMMODITY_LABELS: Record<string, string> = {
  machining: 'Machining', casting: 'Casting', sheet_metal: 'Sheet Metal',
  sheet_metal_fab: 'SM Fab', injection_moulding: 'Injection', blow_moulding: 'Blow Moulding',
  extrusion: 'Extrusion', thermoforming: 'Thermoforming', rotational_moulding: 'Rotomoulding',
  forging: 'Forging', painting: 'Painting', biw_assembly: 'BIW/Assembly',
  pcb_fab: 'PCB Fab', pcba: 'PCBA', cast_and_machine: 'Cast+Machine',
  rubber: 'Rubber', composites: 'Composites', wiring_harness: 'Harness',
  assembly: 'Assembly', ai_agent: 'AI Agent', cad_analysis: 'CAD Analysis',
};

const VEHICLE_OPTS = ['SUV1','SUV2','SUV3','SUV4','SUV5'];
// const SYSTEM_OPTS  = ['Powertrain','Chassis','BIW','Interior','Exterior','E&E','HVAC','ADAS']; // reserved for future use

let _dashFilters = { vehicle: '', commodity: '', system: '', costRange: '', region: '', confidence: '' };
let _dashCommodityChart: Chart | null = null;
let _dashProgramChart: Chart | null = null;
let _waterfallChart: Chart | null = null;
let _chartMode: 'donut' | 'waterfall' = 'donut';
let _landedCostMode = false;
let _wizardSeen: Set<string> = new Set();
let _compareSelected: Set<string> = new Set();
let _chatMessages: { role: 'user' | 'ai'; text: string }[] = [];
let _chatOpen = false;

const CPICKER_META: Record<string, { icon: string; name: string }> = {
  injection_moulding: { icon: '🧪', name: 'Plastics' },
  sheet_metal_fab:    { icon: '✂️', name: 'Sheet Metal Fab' },
  sheet_metal:        { icon: '🔩', name: 'Sheet Metal' },
  casting:            { icon: '🔥', name: 'Castings' },
  machining:          { icon: '⚙️', name: 'Machining' },
  forging:            { icon: '🔨', name: 'Forgings' },
  rubber:             { icon: '🔶', name: 'Rubber' },
  composites:         { icon: '🧵', name: 'Composites' },
  pcb_fab:            { icon: '🖥️', name: 'PCB Fabrication' },
  pcba:               { icon: '🔌', name: 'PCBA Assembly' },
  wiring_harness:     { icon: '🔋', name: 'Wiring Harness' },
  cast_and_machine:   { icon: '🏭', name: 'Cast + Machine' },
  assembly:           { icon: '🔧', name: 'Assemblies' },
  ai_agent:           { icon: '✦',  name: 'AI Agent' },
  cad_analysis:       { icon: '📐', name: 'CAD-to-Cost' },
};

function getCostingHistory(): CostingRecord[] {
  try { return JSON.parse(localStorage.getItem('cv-history') ?? '[]'); } catch { return []; }
}
function saveCostingHistory(records: CostingRecord[]): void {
  // Keep last 200 records
  localStorage.setItem('cv-history', JSON.stringify(records.slice(-200)));
}
function pushCostingRecord(r: Partial<CostingRecord> & { totalCost: number }): void {
  const records = getCostingHistory();
  const region = (document.getElementById('mfg-region-selector') as HTMLSelectElement)?.value ?? 'UK';
  records.push({
    ...r,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    partName: (document.getElementById('part-name') as HTMLInputElement)?.value ?? 'Part',
    commodity: activeCommodity,
    totalCost: r.totalCost,
    currency: _displayCurrency,
    region,
    timestamp: Date.now(),
    vehicle: _dashFilters.vehicle || '',
    system: _dashFilters.system || '',
    confidence: r.confidence ?? 'Medium',
  });
  saveCostingHistory(records);
}

function filterHistory(records: CostingRecord[]): CostingRecord[] {
  return records.filter(r => {
    if (_dashFilters.vehicle && r.vehicle !== _dashFilters.vehicle) return false;
    if (_dashFilters.commodity && r.commodity !== _dashFilters.commodity) return false;
    if (_dashFilters.system && r.system !== _dashFilters.system) return false;
    if (_dashFilters.region && r.region !== _dashFilters.region) return false;
    if (_dashFilters.confidence && r.confidence !== _dashFilters.confidence) return false;
    if (_dashFilters.costRange) {
      if (_dashFilters.costRange === 'low' && r.totalCost >= 10) return false;
      if (_dashFilters.costRange === 'medium' && (r.totalCost < 10 || r.totalCost > 100)) return false;
      if (_dashFilters.costRange === 'high' && r.totalCost <= 100) return false;
    }
    return true;
  });
}

// ─── View switching ───────────────────────────────────────────────────────────


function showHome(): void {
  const homeEl = document.getElementById('home-view');
  const pickerEl = document.getElementById('commodity-picker-view');
  const costingEl = document.getElementById('costing-view');
  const backdrop = document.getElementById('picker-backdrop');
  const errEl = document.getElementById('validation-errors');
  const warnEl = document.getElementById('validation-warnings');
  document.body.classList.remove('cv-new-costing');
  document.body.classList.remove('sidebar-collapsed');
  if (homeEl) homeEl.style.display = '';
  if (pickerEl) pickerEl.style.display = 'none';
  if (backdrop) { backdrop.classList.remove('visible'); backdrop.style.display = 'none'; }
  if (costingEl) {
    costingEl.classList.remove('wf-panel', 'wf-panel--open');
    costingEl.style.display = 'none';
  }
  document.getElementById('wf-panel-header')?.style?.setProperty('display','none');
  if (errEl) errEl.style.display = 'none';
  if (warnEl) warnEl.style.display = 'none';
  renderDashboard();
}

function showCosting(commodity?: string): void {
  const homeEl = document.getElementById('home-view');
  const pickerEl = document.getElementById('commodity-picker-view');
  const costingEl = document.getElementById('costing-view');
  const backdrop = document.getElementById('picker-backdrop');
  document.body.classList.remove('cv-new-costing');
  document.body.classList.remove('sidebar-collapsed');
  if (homeEl) homeEl.style.display = 'none';
  if (pickerEl) pickerEl.style.display = 'none';
  if (backdrop) { backdrop.classList.remove('visible'); backdrop.style.display = 'none'; }
  if (costingEl) {
    costingEl.classList.remove('wf-panel', 'wf-panel--open');
    costingEl.style.display = '';
  }
  document.getElementById('wf-panel-header')?.style?.setProperty('display','none');
  if (commodity) switchCommodity(commodity as CommodityType);
}

function showCommodityPicker(): void {
  const homeEl = document.getElementById('home-view');
  const pickerEl = document.getElementById('commodity-picker-view');
  const costingEl = document.getElementById('costing-view');
  const backdrop = document.getElementById('picker-backdrop');
  const errEl = document.getElementById('validation-errors');
  const warnEl = document.getElementById('validation-warnings');
  document.body.classList.remove('cv-new-costing');
  if (homeEl) homeEl.style.display = 'none';
  if (pickerEl) pickerEl.style.display = '';
  if (costingEl) {
    costingEl.classList.remove('wf-panel', 'wf-panel--open');
    costingEl.style.display = 'none';
  }
  if (backdrop) { backdrop.classList.remove('visible'); backdrop.style.display = 'none'; }
  document.getElementById('wf-panel-header')?.style?.setProperty('display','none');
  if (errEl) errEl.style.display = 'none';
  if (warnEl) warnEl.style.display = 'none';
}

function showWorkflowPanel(commodity: string): void {
  const costingEl = document.getElementById('costing-view');
  const backdrop = document.getElementById('picker-backdrop');
  const headerEl = document.getElementById('wf-panel-header');
  const iconEl = document.getElementById('wf-panel-icon');
  const nameEl = document.getElementById('wf-panel-name');
  const errEl = document.getElementById('validation-errors');
  const warnEl = document.getElementById('validation-warnings');
  if (errEl) errEl.style.display = 'none';
  if (warnEl) warnEl.style.display = 'none';

  const meta = CPICKER_META[commodity] ?? { icon: '⚙️', name: commodity };
  if (iconEl) iconEl.textContent = meta.icon;
  if (nameEl) nameEl.textContent = meta.name;

  // Full-screen split layout: picker becomes narrow sidebar, costing takes remaining width
  document.body.classList.add('cv-new-costing');
  if (costingEl) {
    costingEl.style.display = '';
    costingEl.classList.remove('wf-panel', 'wf-panel--open');
  }
  if (headerEl) headerEl.style.display = '';
  if (backdrop) { backdrop.classList.remove('visible'); backdrop.style.display = 'none'; }
  switchCommodity(commodity as CommodityType);
  setTimeout(() => maybeShowWizard(commodity), 400);
}

function closeWorkflowPanel(): void {
  // Return to full-screen picker (remove split-screen mode, hide costing)
  document.body.classList.remove('cv-new-costing');
  document.body.classList.remove('sidebar-collapsed');
  const sidebarBtn = document.getElementById('sidebar-toggle-btn');
  if (sidebarBtn) sidebarBtn.textContent = '‹';
  const costingEl = document.getElementById('costing-view');
  const backdrop = document.getElementById('picker-backdrop');
  const headerEl = document.getElementById('wf-panel-header');
  costingEl?.classList.remove('wf-panel', 'wf-panel--open');
  if (costingEl) costingEl.style.display = 'none';
  if (backdrop) { backdrop.classList.remove('visible'); backdrop.style.display = 'none'; }
  if (headerEl) headerEl.style.display = 'none';
}

// ─── Dashboard render ─────────────────────────────────────────────────────────

function renderDashboard(): void {
  const all = getCostingHistory();
  const records = filterHistory(all);

  // KPIs
  const kpiTotal = document.getElementById('kpi-total-val');
  const kpiSaving = document.getElementById('kpi-saving-val');
  const kpiTopCom = document.getElementById('kpi-top-commodity-val');
  const kpiAvg = document.getElementById('kpi-avg-val');
  const kpiHighCost = document.getElementById('kpi-high-cost-val');

  if (kpiTotal) kpiTotal.textContent = String(records.length);

  // Estimate savings: 12% of total spend (industry benchmark)
  const totalSpend = records.reduce((s, r) => s + r.totalCost, 0);
  const savings = totalSpend * 0.12;
  if (kpiSaving) {
    const sym = CURRENCY_SYMBOL[_displayCurrency] ?? _displayCurrency;
    const dispSavings = savings * _displayFxRate;
    kpiSaving.textContent = records.length ? `${sym}${dispSavings < 1000 ? dispSavings.toFixed(0) : (dispSavings/1000).toFixed(1)+'k'}` : '—';
  }

  // Top commodity by count
  const commCount: Record<string, number> = {};
  records.forEach(r => { commCount[r.commodity] = (commCount[r.commodity] ?? 0) + 1; });
  const topComm = Object.entries(commCount).sort((a,b) => b[1]-a[1])[0];
  if (kpiTopCom) kpiTopCom.textContent = topComm ? COMMODITY_LABELS[topComm[0]] ?? topComm[0] : '—';

  const avgCost = records.length ? totalSpend / records.length : 0;
  if (kpiAvg) kpiAvg.textContent = records.length ? _currFmt(avgCost) : '—';

  const highCostCount = records.filter(r => r.totalCost > 100).length;
  if (kpiHighCost) kpiHighCost.textContent = String(highCostCount);

  // AI insight — dynamic based on data
  const daiEl = document.getElementById('dai-dynamic');
  if (daiEl) {
    if (records.length === 0) {
      daiEl.innerHTML = '';
    } else if (highCostCount > 0) {
      daiEl.className = 'dash-ai-item dash-ai-item--warn';
      daiEl.innerHTML = `<span class="dai-icon">🎯</span><span>${highCostCount} part${highCostCount>1?'s':''} exceed ${_currFmt(100)} — prioritise these for detailed supplier negotiation.</span>`;
    } else {
      daiEl.className = 'dash-ai-item dash-ai-item--opt';
      daiEl.innerHTML = `<span class="dai-icon">✅</span><span>All costed parts are below ${_currFmt(100)}. Consider checking wiring harness and PCB assemblies next.</span>`;
    }
  }

  // Commodity donut chart
  renderCommodityChart(records);

  // Vehicle program bar chart
  renderProgramChart(records);

  // Recent table
  renderRecentTable(records);
}

const COMM_COLOURS = [
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#0ea5e9', // Sky Blue
  '#14b8a6', // Teal
  '#06b6d4', // Cyan/Aqua
  '#f59e0b', // Amber
  '#d97706', // Gold
  '#64748b', // Slate
  '#7c3aed', // Purple
  '#2563eb', // Royal Blue
  '#0891b2', // Steel Blue
];

function renderCommodityChart(records: CostingRecord[]): void {
  const canvas = document.getElementById('dash-commodity-chart') as HTMLCanvasElement | null;
  const emptyEl = document.getElementById('dash-chart-empty');
  if (!canvas) return;

  if (_dashCommodityChart) { _dashCommodityChart.destroy(); _dashCommodityChart = null; }

  const commCount: Record<string, number> = {};
  records.forEach(r => { commCount[r.commodity] = (commCount[r.commodity] ?? 0) + 1; });
  const entries = Object.entries(commCount).sort((a,b) => b[1]-a[1]);

  if (entries.length === 0) {
    canvas.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'flex';
    return;
  }
  canvas.style.display = '';
  if (emptyEl) emptyEl.style.display = 'none';

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const textCol = isDark ? '#94a3b8' : '#475569';
  const total = entries.reduce((s, [,v]) => s + v, 0);

  // Custom centre-text plugin for doughnut
  const centreTextPlugin = {
    id: 'cvCentreText',
    afterDraw(chart: any) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      const cx = (chartArea.left + chartArea.right) / 2;
      const cy = (chartArea.top + chartArea.bottom) / 2;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 22px Inter, sans-serif`;
      ctx.fillStyle = isDark ? '#f0f0f0' : '#0a0a0a';
      ctx.fillText(String(total), cx, cy - 7);
      ctx.font = `400 10px Inter, sans-serif`;
      ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
      ctx.fillText('costings', cx, cy + 10);
      ctx.restore();
    },
  };

  _dashCommodityChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: entries.map(([k]) => COMMODITY_LABELS[k] ?? k),
      datasets: [{
        data: entries.map(([,v]) => v),
        backgroundColor: entries.map((_, i) => COMM_COLOURS[i % COMM_COLOURS.length]),
        borderWidth: 2,
        borderColor: isDark ? '#141414' : '#ffffff',
        hoverOffset: 8,
        hoverBorderWidth: 3,
      }],
    },
    options: {
      animation: { animateRotate: true, animateScale: false, duration: 420 },
      cutout: '64%',
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2.2,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            font: { size: 11, family: 'Inter, sans-serif' },
            color: textCol,
            padding: 14,
            usePointStyle: true,
            pointStyleWidth: 10,
          },
        },
        tooltip: {
          backgroundColor: isDark ? '#1e293b' : '#fff',
          titleColor: isDark ? '#f0f0f0' : '#0a0a0a',
          bodyColor: textCol,
          borderColor: isDark ? '#334155' : '#e2e8f0',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: ctx => {
              const pct = total > 0 ? ((ctx.raw as number) / total * 100).toFixed(0) : 0;
              return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
            },
          },
        },
      },
    },
    plugins: [centreTextPlugin],
  });
}

function renderProgramChart(records: CostingRecord[]): void {
  const canvas = document.getElementById('dash-program-chart') as HTMLCanvasElement | null;
  if (!canvas) return;
  if (_dashProgramChart) { _dashProgramChart.destroy(); _dashProgramChart = null; }

  const byCost: Record<string, number> = {};
  VEHICLE_OPTS.forEach(v => { byCost[v] = 0; });
  records.forEach(r => {
    const v = r.vehicle || 'Unassigned';
    byCost[v] = (byCost[v] ?? 0) + r.totalCost;
  });

  const labels = Object.keys(byCost);
  const data = Object.values(byCost);
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const textCol = isDark ? '#94a3b8' : '#475569';
  const gridCol = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

  // Custom data-label plugin: value above each bar
  const barLabelPlugin = {
    id: 'cvBarLabel',
    afterDatasetsDraw(chart: any) {
      const { ctx } = chart;
      chart.data.datasets.forEach((_ds: any, di: number) => {
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        meta.data.forEach((bar: any, idx: number) => {
          const val = chart.data.datasets[di].data[idx] as number;
          if (!val) return;
          const _sym = CURRENCY_SYMBOL[_displayCurrency] ?? _displayCurrency;
          const _dv = val * _displayFxRate;
          const text = `${_sym}${_dv < 1000 ? _dv.toFixed(0) : (_dv/1000).toFixed(1)+'k'}`;
          const barHeight = (bar as any).height ?? 0;
          ctx.save();
          ctx.font = `600 9.5px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = barHeight > 18 ? 'middle' : 'bottom';
          ctx.fillStyle = barHeight > 18
            ? '#ffffff'
            : (isDark ? '#94a3b8' : '#475569');
          const yPos = barHeight > 18
            ? bar.y + barHeight / 2
            : bar.y - 4;
          ctx.fillText(text, bar.x, yPos);
          ctx.restore();
        });
      });
    },
  };

  _dashProgramChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: `Total Cost (${_displayCurrency})`,
        data,
        backgroundColor: COMM_COLOURS.slice(0, labels.length),
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.65,
        categoryPercentage: 0.8,
      }],
    },
    options: {
      animation: { duration: 380, easing: 'easeInOutQuart' as const },
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? '#1e293b' : '#fff',
          titleColor: isDark ? '#f0f0f0' : '#0a0a0a',
          bodyColor: textCol,
          borderColor: isDark ? '#334155' : '#e2e8f0',
          borderWidth: 1,
          padding: 10,
          callbacks: { label: ctx => ` ${_currFmt(Number(ctx.raw))}` },
        },
      },
      scales: {
        x: {
          grid: { color: gridCol },
          border: { color: 'transparent' },
          ticks: { color: textCol, font: { size: 10, family: 'Inter, sans-serif' } },
        },
        y: {
          grid: { color: gridCol },
          border: { color: 'transparent' },
          beginAtZero: true,
          ticks: { color: textCol, font: { size: 10, family: 'Inter, sans-serif' }, callback: (v: any) => `${CURRENCY_SYMBOL[_displayCurrency] ?? _displayCurrency}${Number(v) * _displayFxRate}` },
        },
      },
    },
    plugins: [barLabelPlugin],
  });
}

function confBadgeHtml(conf: string): string {
  const map: Record<string, [string, string]> = {
    High:   ['conf-badge conf-badge--high',   '● High'],
    Medium: ['conf-badge conf-badge--medium', '● Med'],
    Low:    ['conf-badge conf-badge--low',    '● Low'],
  };
  const [cls, label] = map[conf] ?? ['conf-badge conf-badge--medium', '● Med'];
  return `<span class="${cls}">${label}</span>`;
}

function renderRecentTable(records: CostingRecord[]): void {
  const tbody = document.getElementById('dash-recent-tbody');
  if (!tbody) return;

  const sorted = [...records].sort((a,b) => b.timestamp - a.timestamp).slice(0, 10);
  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="dash-empty-row">No costings yet. Click a shortcut above to get started.</td></tr>';
    updateCompareBar();
    return;
  }

  tbody.innerHTML = sorted.map(r => {
    const date = new Date(r.timestamp).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'2-digit' });
    const commLabel = COMMODITY_LABELS[r.commodity] ?? r.commodity;
    const costStr = _currFmt(r.totalCost);
    const checked = _compareSelected.has(r.id) ? 'checked' : '';
    return `<tr data-record-id="${r.id}">
      <td><input type="checkbox" class="cmp-chk" data-id="${r.id}" ${checked} title="Select for comparison"/></td>
      <td>${escHtml(r.partName)}</td>
      <td><span class="dash-commodity-badge">${commLabel}</span></td>
      <td>${r.vehicle || '—'}</td>
      <td class="dash-cost-val">${costStr}</td>
      <td>${confBadgeHtml(r.confidence)}</td>
      <td>${date}</td>
      <td><button class="dash-reopen-btn" data-record-id="${r.id}">Open ↗</button></td>
    </tr>`;
  }).join('');

  // Wire checkboxes
  tbody.querySelectorAll<HTMLInputElement>('.cmp-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const id = chk.dataset.id!;
      if (chk.checked) {
        if (_compareSelected.size >= 2) {
          // Deselect oldest — find first checked that isn't this one
          const first = [..._compareSelected][0];
          _compareSelected.delete(first);
          const old = tbody.querySelector<HTMLInputElement>(`.cmp-chk[data-id="${first}"]`);
          if (old) old.checked = false;
        }
        _compareSelected.add(id);
      } else {
        _compareSelected.delete(id);
      }
      updateCompareBar();
    });
  });

  updateCompareBar();
}

function updateCompareBar(): void {
  const bar = document.getElementById('compare-bar');
  if (!bar) return;
  bar.style.display = _compareSelected.size === 2 ? 'flex' : 'none';
}

function renderComparePanel(): void {
  const all = getCostingHistory();
  const ids = [..._compareSelected];
  const recs = ids.map(id => all.find(r => r.id === id)).filter(Boolean) as CostingRecord[];
  if (recs.length !== 2) return;

  const panel = document.getElementById('compare-panel');
  if (!panel) return;
  panel.style.display = '';

  const [a, b] = recs;
  const LABELS: Record<string, string> = {
    rawMaterial: 'Raw Material', process: 'Process (Machine)', labour: 'Labour',
    tooling: 'Tooling', overhead: 'Overhead', packaging: 'Packaging',
    logistics: 'Logistics', margin: 'Margin',
  };

  const bkdRows = (Object.keys(LABELS) as (keyof NonNullable<CostingRecord['breakdown']>)[]).map(k => {
    const va = a.breakdown?.[k] ?? null;
    const vb = b.breakdown?.[k] ?? null;
    const delta = va != null && vb != null ? vb - va : null;
    const sym = CURRENCY_SYMBOL[_displayCurrency] ?? _displayCurrency;
    const _s = (v: number) => `${sym}${(v * _displayFxRate).toFixed(3)}`;
    return `<tr>
      <td class="cmp-row-label">${LABELS[k]}</td>
      <td class="cmp-val">${va != null ? _s(va) : '—'}</td>
      <td class="cmp-val">${vb != null ? _s(vb) : '—'}</td>
      <td class="cmp-delta">${delta != null ? `<span class="${delta > 0 ? 'cmp-worse' : delta < 0 ? 'cmp-better' : ''}">${delta >= 0 ? '+' : ''}${_s(delta)}</span>` : '—'}</td>
    </tr>`;
  }).join('');

  const totalDelta = b.totalCost - a.totalCost;
  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });

  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div class="dash-section-title" style="margin:0">Side-by-Side Comparison</div>
      <button id="close-compare-btn" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.2rem;line-height:1" title="Close comparison">✕</button>
    </div>
    <div class="cmp-header-row">
      <div class="cmp-label-col"></div>
      <div class="cmp-part-col">
        <div class="cmp-part-name">${escHtml(a.partName)}</div>
        <div class="cmp-part-meta">${COMMODITY_LABELS[a.commodity] ?? a.commodity} · ${a.region} · ${fmtDate(a.timestamp)}</div>
        <div style="margin-top:4px">${confBadgeHtml(a.confidence)}</div>
      </div>
      <div class="cmp-part-col">
        <div class="cmp-part-name">${escHtml(b.partName)}</div>
        <div class="cmp-part-meta">${COMMODITY_LABELS[b.commodity] ?? b.commodity} · ${b.region} · ${fmtDate(b.timestamp)}</div>
        <div style="margin-top:4px">${confBadgeHtml(b.confidence)}</div>
      </div>
      <div class="cmp-delta-col">Δ (B−A)</div>
    </div>
    <table class="cmp-table">
      <tbody>
        ${bkdRows}
        <tr class="cmp-total-row">
          <td class="cmp-row-label">TOTAL</td>
          <td class="cmp-val cmp-total-val">${(CURRENCY_SYMBOL[_displayCurrency] ?? _displayCurrency)}${(a.totalCost * _displayFxRate).toFixed(3)}</td>
          <td class="cmp-val cmp-total-val">${(CURRENCY_SYMBOL[_displayCurrency] ?? _displayCurrency)}${(b.totalCost * _displayFxRate).toFixed(3)}</td>
          <td class="cmp-delta"><span class="${totalDelta > 0 ? 'cmp-worse' : totalDelta < 0 ? 'cmp-better' : ''}">${totalDelta >= 0 ? '+' : ''}${(CURRENCY_SYMBOL[_displayCurrency] ?? _displayCurrency)}${(totalDelta * _displayFxRate).toFixed(3)}</span></td>
        </tr>
      </tbody>
    </table>
    ${a.warnings?.length || b.warnings?.length ? `
    <div style="margin-top:12px">
      <div class="dash-section-title" style="margin-bottom:6px">Warnings</div>
      ${a.warnings?.length ? `<div style="font-size:0.75rem;color:var(--amber);margin-bottom:4px"><strong>A:</strong> ${a.warnings.join('; ')}</div>` : ''}
      ${b.warnings?.length ? `<div style="font-size:0.75rem;color:var(--amber)"><strong>B:</strong> ${b.warnings.join('; ')}</div>` : ''}
    </div>` : ''}
  `;

  panel.querySelector('#close-compare-btn')?.addEventListener('click', () => {
    panel.style.display = 'none';
    _compareSelected.clear();
    renderDashboard();
  });

  // Smooth scroll to panel
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

(window as any).showHome = showHome;

// ─── AI Chat Drawer ───────────────────────────────────────────────────────────

function toggleChat(): void {
  _chatOpen = !_chatOpen;
  const drawer = document.getElementById('ai-chat-drawer');
  const fab = document.getElementById('ai-chat-fab');
  if (drawer) drawer.style.display = _chatOpen ? 'flex' : 'none';
  if (fab) fab.setAttribute('aria-expanded', String(_chatOpen));
  if (_chatOpen && _chatMessages.length === 0) {
    _chatMessages.push({ role: 'ai', text: 'Hi! I\'m your CostVision AI assistant. Ask me anything about should-cost analysis, commodity pricing, DFM, or manufacturing processes.' });
    renderChatMessages();
  }
  if (_chatOpen) document.getElementById('ai-chat-input')?.focus();
}

function renderChatMessages(): void {
  const list = document.getElementById('ai-chat-messages');
  if (!list) return;
  list.innerHTML = _chatMessages.map(m => `
    <div class="chat-msg chat-msg--${m.role}">
      ${m.role === 'ai' ? '<span class="chat-avatar">AI</span>' : ''}
      <div class="chat-bubble">${escHtml(m.text)}</div>
    </div>`).join('');
  list.scrollTop = list.scrollHeight;
}

async function sendChatMessage(): Promise<void> {
  const input = document.getElementById('ai-chat-input') as HTMLInputElement;
  const text = input?.value.trim();
  if (!text) return;
  input.value = '';
  _chatMessages.push({ role: 'user', text });
  renderChatMessages();

  const sendBtn = document.getElementById('ai-chat-send') as HTMLButtonElement;
  if (sendBtn) sendBtn.disabled = true;

  try {
    const apiKey = localStorage.getItem('sc-api-key') ?? '';
    const res = await fetch('/api/aichat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) },
      body: JSON.stringify({ message: text }),
    });
    const data = await res.json() as { reply?: string; error?: string };
    _chatMessages.push({ role: 'ai', text: data.reply ?? data.error ?? 'Sorry, I could not get a response.' });
  } catch {
    _chatMessages.push({ role: 'ai', text: 'Unable to reach AI service. Please check your connection and API key.' });
  }
  renderChatMessages();
  if (sendBtn) sendBtn.disabled = false;
  document.getElementById('ai-chat-input')?.focus();
}

// ─── Toast notification ───────────────────────────────────────────────────────

function showToast(message: string, type: 'error' | 'warning' | 'info' = 'info'): void {
  const container = document.getElementById('toast-container') ?? (() => {
    const c = document.createElement('div');
    c.id = 'toast-container';
    c.style.cssText = 'position:fixed;top:12px;right:12px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:360px';
    document.body.appendChild(c);
    return c;
  })();
  const bg = type === 'error' ? '#c62828' : type === 'warning' ? '#e65100' : '#1565c0';
  const icon = type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ';
  const toast = document.createElement('div');
  toast.style.cssText = `background:${bg};color:#fff;border-radius:6px;padding:10px 14px;font-size:0.78rem;box-shadow:0 4px 12px rgba(0,0,0,0.25);display:flex;gap:8px;align-items:flex-start;animation:toastIn .2s ease`;
  toast.innerHTML = `<span style="font-weight:700;flex-shrink:0">${icon}</span><span>${escHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity .3s'; setTimeout(() => toast.remove(), 300); }, 6000);
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
function val(id: string): string { return (el<HTMLInputElement>(id))?.value?.trim() ?? ''; }
function num(id: string): number { return parseFloat(val(id)) || 0; }
function sel(id: string): string { return el<HTMLSelectElement>(id)?.value ?? ''; }
function fmt(n: number): string { return _currFmt(n); }
function fmtPct(n: number): string { return n.toFixed(1) + '%'; }

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function validSel<T extends string>(id: string, valid: readonly T[], fallback: T): T {
  const v = sel(id);
  return (valid as readonly string[]).includes(v) ? (v as T) : fallback;
}

// ─── Part photo upload ────────────────────────────────────────────────────────

function _updatePhotoUI(): void {
  const thumb    = el<HTMLImageElement>('part-photo-thumb');
  const holder   = el('part-photo-placeholder');
  const nameEl   = el('part-photo-name');
  const clearBtn = el('part-photo-clear');
  const zone     = el('part-photo-zone');
  if (!thumb) return;
  if (partPhotoDataUrl) {
    thumb.src = partPhotoDataUrl;
    thumb.style.display = '';
    holder.style.display = 'none';
    nameEl.textContent = partPhotoName ?? '';
    nameEl.style.display = '';
    clearBtn.style.display = '';
    zone.style.borderColor = '#e65100';
    zone.style.borderStyle = 'solid';
  } else {
    thumb.src = '';
    thumb.style.display = 'none';
    holder.style.display = '';
    nameEl.style.display = 'none';
    clearBtn.style.display = 'none';
    zone.style.borderColor = '#ddd';
    zone.style.borderStyle = 'dashed';
  }
}

function _processPhotoFile(file: File): void {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const okTypes = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif']);
  const okExts  = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif']);
  if (!okTypes.has(file.type) && !okExts.has(ext)) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    partPhotoDataUrl = ev.target?.result as string;
    partPhotoName = file.name;
    _updatePhotoUI();
  };
  reader.readAsDataURL(file);
}

// ─── AI Agent ─────────────────────────────────────────────────────────────────

interface AgentMessage { role: 'user' | 'assistant'; content: string }
interface AgentAction { type: string; commodity: string; partName: string; params: Record<string, unknown> }

interface PCBBOMItem {
  refDes: string;
  componentType: string;
  description: string;
  pkg: string;
  value: string;
  voltage: string;
  qty: number;
  unitPriceGBP: number;
  moq: number;
  automotive: boolean;
  highCost: boolean;
  partNumber?: string;       // IC part number from OCR
  lineConf?: number;         // 0–1 confidence for this BOM line
  ocrExtracted?: boolean;    // true if part number came from OCR pass
}
interface PCBCountryBreakdown {
  countryId: string;
  countryName: string;
  flag: string;
  pcbFabPerBoard: number;
  assemblyPerBoard: number;
  logisticsPerBoard: number;
  bomCostPerBoard: number;
  totalPerBoard: number;
  leadTimeWeeks: number;
  qualityIndex: number;
  certifications: string[];
  bestFor: string;
  breakdown: {
    pcbBase: number; pcbLayers: number; pcbSurface: number;
    pcbVias: number; pcbHDI: number; pcbSetup: number;
    smtAssembly: number; thAssembly: number; aoi: number;
    logistics: number; importDuty: number;
  };
  panelInfo?: { boardsPerPanel: number; utilisation: number; panelW: number; panelH: number };
}

interface VolumeCurvePoint {
  qty: number;
  totalPerBoard: number;
  pcbFabPerBoard: number;
  assemblyPerBoard: number;
  logisticsPerBoard: number;
}

interface PCBComplexityScore {
  score: number;
  ipcClass: 1 | 2 | 3;
  label: 'Simple' | 'Moderate' | 'Complex' | 'Very Complex' | 'Extreme';
  factors: { layers: number; viaDensity: number; bgaScore: number; hdiScore: number; traceScore: number };
}

interface PCBImageAnalysis {
  partName: string;
  boardSpec: {
    estimatedLayers: number;
    widthMm: number;
    heightMm: number;
    surfaceFinish: string;
    solderMaskColour: string;
    silkscreenSides: number;
    throughVias: number;
    blindVias: number;
    buriedVias: number;
    microVias: number;
    bgaDetected: boolean;
    minTraceSpaceMm: number;
    technologyType: string;
    hdiStructure: string;
    impedanceControlRequired: boolean;
    copperWeightOz: number;
    qualityGrade: string;
    panelUtilisation: number;
  };
  bom: PCBBOMItem[];
  assembly: {
    smtPlacements: number;
    throughHoleJoints: number;
    manualJoints: number;
    bgaCount: number;
    complexity: string;
    reflowSides: number;
    aoiRequired: boolean;
    ictTimeSec: number;
  };
  costEstimates: {
    pcbFabGBP: { min: number; mid: number; max: number };
    totalBOMCostGBP: number;
    smtAssemblyCostGBP: number;
  };
  aiInsights: string[];
  dfmIssues: string[];
  highCostComponents: string[];
  optimisationSuggestions: string[];
  confidenceLevel: 'High' | 'Medium' | 'Low';
  analysisLimitations: string[];
  stage1Classification?: { domain: string; conf: number; hints: string[] };
  ocrExtraction?: { icMarkings: string[]; extractionQuality: string };
  complexityScore?: PCBComplexityScore;
  // Country-aware cost data (added by server Stage 4)
  _selectedCountry?: string;
  _selectedCountryBreakdown?: PCBCountryBreakdown;
  _countryComparison?: PCBCountryBreakdown[];
  _volumeCurves?: Record<string, VolumeCurvePoint[]>;
  _originalAIValues?: PCBImageAnalysis;  // snapshot before user edits
  _isReanalyzed?: boolean;               // true after re-analysis completes
  _costDeltas?: Record<string, number>;  // per-country total delta vs original (positive = more expensive)
}

let agentHistory: AgentMessage[] = [];
let agentPending = false;
let agentLastAction: AgentAction | null = null;
let agentLastResult: Record<string, unknown> | null = null;

function renderAgentForm(): string {
  return `
    <div id="agent-chat-wrap" style="display:flex;flex-direction:column;gap:8px;padding:0 4px">
      <div id="agent-api-row" style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
        <label style="font-size:0.73rem;color:#888;white-space:nowrap">API Key</label>
        <input type="password" id="agent-api-key" placeholder="sk-ant-… (optional if server configured)"
          style="flex:1;font-size:0.73rem;padding:4px 8px;border:1px solid #ddd;border-radius:4px"
          value="${sessionStorage.getItem('cad_api_key') ?? ''}"/>
      </div>
      <div id="agent-messages"
        style="height:320px;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px;background:#f8f9fa;border-radius:8px;border:1px solid #e8e8e8">
        <div style="text-align:center;padding:20px 10px;color:#888;font-size:0.80rem">
          <div style="font-size:1.4rem;margin-bottom:8px">🤖</div>
          <div style="font-weight:600;color:#1565c0;margin-bottom:6px">Unified Should-Cost AI Agent</div>
          <div style="line-height:1.5">Describe your part — material, dimensions, features, volume, region — and I'll orchestrate the full should-cost model. Attach a photo for better accuracy.</div>
          <div style="margin-top:8px;font-size:0.72rem;color:#aaa">Supports: Machining · Sheet Metal · Castings · Injection Moulding · Forgings · PCB · and more</div>
        </div>
      </div>
      <div style="display:flex;gap:6px;align-items:flex-end">
        <textarea id="agent-input" rows="3"
          placeholder="e.g. 'Al6061 bracket, 200×120×15mm, 4 tapped holes M6, 2 counterbores, 10,000/yr, UK supplier'"
          style="flex:1;resize:vertical;font-size:0.82rem;padding:8px;border:1px solid #ddd;border-radius:6px;font-family:inherit;line-height:1.4"></textarea>
        <button id="agent-send-btn" class="btn btn-primary" style="flex-shrink:0;padding:10px 14px;align-self:flex-end">Send ▶</button>
      </div>
      <div id="agent-status" style="font-size:0.72rem;color:#888;min-height:16px;text-align:center"></div>
    </div>`;
}

function _agentBubble(role: 'user' | 'assistant', content: string, showApplyBtn = false): string {
  const isUser = role === 'user';
  const photoThumb = isUser && partPhotoDataUrl
    ? `<img src="${partPhotoDataUrl}" style="height:36px;width:50px;object-fit:cover;border-radius:4px;margin-bottom:4px;display:block"/>`
    : '';
  const applyBtn = showApplyBtn
    ? `<button class="agent-apply-btn btn btn-primary btn-sm" style="margin-top:8px;font-size:0.75rem">Apply to Calculator &amp; Calculate →</button>`
    : '';
  return `<div style="display:flex;flex-direction:column;align-items:${isUser ? 'flex-end' : 'flex-start'}">
    ${photoThumb}
    <div style="max-width:85%;padding:8px 12px;border-radius:10px;font-size:0.80rem;line-height:1.5;
      background:${isUser ? '#1565c0' : '#fff'};color:${isUser ? '#fff' : '#222'};
      border:${isUser ? 'none' : '1px solid #e0e0e0'};white-space:pre-wrap">${escHtml(content).replace(/\n/g,'<br/>')}</div>
    ${applyBtn}
  </div>`;
}

function _appendAgentBubble(role: 'user' | 'assistant', content: string, showApplyBtn = false): void {
  const box = el('agent-messages');
  if (!box) return;
  const div = document.createElement('div');
  div.innerHTML = _agentBubble(role, content, showApplyBtn);
  box.appendChild(div.firstElementChild!);
  box.scrollTop = box.scrollHeight;
  if (showApplyBtn) {
    div.firstElementChild!.querySelector<HTMLButtonElement>('.agent-apply-btn')
      ?.addEventListener('click', _applyAgentActionAndCompute);
  }
}

async function sendAgentMessage(): Promise<void> {
  if (agentPending) return;
  const inputEl = el<HTMLTextAreaElement>('agent-input');
  const msg = inputEl.value.trim();
  if (!msg) return;

  agentPending = true;
  el('agent-send-btn').setAttribute('disabled', '');
  el('agent-status').textContent = '⏳ Thinking…';

  // Render user bubble
  _appendAgentBubble('user', msg);
  inputEl.value = '';

  // Build photo payload (only JPEG/PNG for vision)
  let photoBase64: string | undefined;
  let photoMime: string | undefined;
  if (partPhotoDataUrl) {
    const match = partPhotoDataUrl.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
    if (match) { photoMime = match[1]; photoBase64 = match[2]; }
  }

  // Store in history (text only for history tracking)
  agentHistory.push({ role: 'user', content: msg });

  // Payload
  const payload: Record<string, unknown> = {
    message: msg,
    history: agentHistory.slice(0, -1), // prior turns only
    ...(photoBase64 ? { photoBase64, photoMime } : {}),
    ...(agentLastResult ? { costResult: agentLastResult } : {}),
  };

  const apiKey = (el<HTMLInputElement>('agent-api-key')?.value ?? '').trim();
  if (apiKey) sessionStorage.setItem('cad_api_key', apiKey);

  try {
    const resp = await fetch('/api/agent/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(90_000),
    });

    if (!resp.ok) {
      const errJson = await resp.json().catch(() => ({ error: resp.statusText }));
      throw new Error(errJson.error ?? resp.statusText);
    }

    const data = await resp.json() as { success: boolean; response: { chat: string; needsInput: string[] | null; action: AgentAction | null }; error?: string };
    if (!data.success) throw new Error(data.error ?? 'Unknown error');

    const agentResp = data.response;
    agentHistory.push({ role: 'assistant', content: agentResp.chat });

    const hasAction = agentResp.action?.type === 'populate_form';
    if (hasAction) agentLastAction = agentResp.action!;

    _appendAgentBubble('assistant', agentResp.chat, hasAction);
    agentLastResult = null; // clear stale result after interpretation

    el('agent-status').textContent = hasAction
      ? '✓ Parameters extracted — click "Apply to Calculator & Calculate" below'
      : agentResp.needsInput?.length
        ? `⚠ Missing: ${agentResp.needsInput.join(', ')}`
        : '';
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    _appendAgentBubble('assistant', `❌ Error: ${msg}`);
    el('agent-status').textContent = '';
  } finally {
    agentPending = false;
    el('agent-send-btn').removeAttribute('disabled');
  }
}

function _applyAgentActionAndCompute(): void {
  if (!agentLastAction) return;
  const action = agentLastAction;

  // Switch to the target commodity tab
  const targetCommodity = action.commodity as CommodityType;
  document.querySelectorAll<HTMLElement>('.ctab').forEach(t => {
    t.classList.toggle('active', t.dataset.commodity === targetCommodity);
  });
  switchCommodity(targetCommodity);

  // Populate form fields after DOM settles
  setTimeout(() => {
    _fillAgentParams(targetCommodity, action.params, action.partName);
    // Set part name
    const pn = el<HTMLInputElement>('part-name');
    if (pn && action.partName) pn.value = action.partName;
    // Compute
    try {
      const input = collectInput();
      if (!input) return;
      const validation = validateStackInput(input, library);
      const result = computeUniversalStack(input, library);
      lastResult = result;
      lastInput = input;
      showResultsArea();
      renderBreakdown(result);
      el('export-excel-btn').style.display = '';
      el('export-pdf-btn').style.display = '';
      el('save-scenario-btn').style.display = '';

      // Send result to agent for interpretation (return to agent mode after brief delay)
      agentLastResult = {
        total: result.total,
        factoryCost: result.factoryCost,
        breakdown: result.breakdown,
        operationDetails: result.operationDetails.map(op => ({
          name: op.operationName,
          processCost: op.processCost,
          labourCost: op.labourCost,
          machineRate: op.machineRateUsed,
          labourRate: op.labourRateUsed,
        })),
        warnings: validation.warnings.map(w => w.message),
      };

      // Switch back to agent tab and show interpretation prompt
      setTimeout(() => {
        document.querySelectorAll<HTMLElement>('.ctab').forEach(t => {
          t.classList.toggle('active', t.dataset.commodity === 'ai_agent');
        });
        _showAgentChatPanel();
        el('universal-costs').style.display = 'none';
        sendAgentInterpretation();
      }, 500);
    } catch (e) {
      console.error('Agent compute error:', e);
    }
  }, 150);
}

async function sendAgentInterpretation(): Promise<void> {
  if (!agentLastResult) return;
  agentPending = true;
  el('agent-status').textContent = '⏳ Interpreting cost results…';
  const apiKey = (el<HTMLInputElement>('agent-api-key')?.value ?? '').trim();

  const interpretMsg = 'The cost calculation is complete. Please interpret the results, identify the top cost drivers, and provide your top 3 DFM recommendations.';
  agentHistory.push({ role: 'user', content: interpretMsg });
  _appendAgentBubble('user', interpretMsg);

  try {
    const resp = await fetch('/api/agent/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
      },
      body: JSON.stringify({
        message: interpretMsg,
        history: agentHistory.slice(0, -1),
        costResult: agentLastResult,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error ?? resp.statusText);
    const data = await resp.json() as { success: boolean; response: { chat: string; action: AgentAction | null } };
    if (!data.success) throw new Error('Interpretation failed');
    agentHistory.push({ role: 'assistant', content: data.response.chat });
    _appendAgentBubble('assistant', data.response.chat);
    agentLastResult = null;
    el('agent-status').textContent = '✓ Analysis complete — ask follow-up questions or try another scenario';
  } catch (err: unknown) {
    el('agent-status').textContent = 'Interpretation error — see console';
  } finally {
    agentPending = false;
    el('agent-send-btn')?.removeAttribute('disabled');
  }
}

function _showAgentChatPanel(): void {
  const area = el('commodity-form-area');
  if (!area.querySelector('#agent-chat-wrap')) {
    area.innerHTML = renderAgentForm();
    _wireAgentInputEvents();
  }
  el('universal-costs').style.display = 'none';
  el('calc-btn').style.display = 'none';
}

function _wireAgentInputEvents(): void {
  el('agent-send-btn')?.addEventListener('click', sendAgentMessage);
  el('agent-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAgentMessage(); }
  });
}

function _fillAgentParams(commodity: CommodityType, params: Record<string, unknown>, partName?: string): void {
  function setVal(id: string, v: unknown): void {
    const el2 = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (!el2 || v === undefined || v === null) return;
    if (el2.tagName === 'SELECT') {
      const opt = Array.from((el2 as HTMLSelectElement).options).find(o => o.value === String(v));
      if (opt) (el2 as HTMLSelectElement).value = String(v);
    } else {
      (el2 as HTMLInputElement).value = String(v);
    }
  }

  switch (commodity) {
    case 'machining': {
      setVal('mach-mat', params.materialId);
      if (typeof params.netWeightKg === 'number') {
        setVal('mach-net-wt', params.netWeightKg.toFixed(3));
        const util = typeof params.materialUtilization === 'number' ? params.materialUtilization : 0.65;
        setVal('mach-stock-wt', (params.netWeightKg / util).toFixed(3));
      }
      setVal('mach-tooling', params.toolingCost);
      setVal('mach-amort', params.amortizationVolume);
      if (Array.isArray(params.operations) && params.operations.length > 0) {
        const container = el('mach-ops-container');
        if (container) container.innerHTML = '';
        machOpCount = 0;
        for (const op of params.operations as Record<string, unknown>[]) {
          addMachOp({
            machineId: String(op.machineId ?? 'mach-vmc3'),
            labourId: String(op.labourId ?? 'lab-uk-skilled'),
            cycleTimeHr: Number(op.cycleTimeHr ?? 0.08),
            oee: Number(op.oee ?? 0.85),
            manning: Number(op.manning ?? 1),
            labourTimeHr: Number(op.labourTimeHr ?? op.cycleTimeHr ?? 0.08),
            labourEfficiency: Number(op.labourEfficiency ?? 0.92),
          });
        }
      }
      break;
    }
    case 'sheet_metal_fab': {
      setVal('smf-mat', params.materialId);
      setVal('smf-part-wt', params.partWeightKg);
      setVal('smf-mat-util', params.materialUtilization);
      setVal('smf-blank-method', params.blankingMethod);
      setVal('smf-blank-ct', params.blankingCycleTimeSec);
      setVal('smf-bends', params.bendCount);
      setVal('smf-bend-t', params.timePerBendSec);
      setVal('smf-tool-chg', params.toolChangeCount ?? 1);
      setVal('smf-tool-chg-t', params.toolChangeTimeSec ?? 300);
      setVal('smf-tolerance', params.toleranceMm);
      setVal('smf-tooling', params.toolingCost);
      setVal('smf-amort', params.amortizationVolume);
      setTimeout(() => {
        setVal('smf-blank-mach', params.blankingMachineId ?? 'laser-trumpf-3030');
        setVal('smf-blank-lab', params.blankingLabourId ?? 'lab-uk-semiskilled');
        setVal('smf-brake-mach', params.bendMachineId ?? 'brake-amada-hfe100');
        setVal('smf-brake-lab', params.bendLabourId ?? 'lab-uk-semiskilled');
      }, 50);
      break;
    }
    case 'injection_moulding': {
      setVal('imm-mat', params.materialId);
      setVal('imm-part-wt', params.partWeightKg);
      setVal('imm-runner-wt', params.runnerWeightKg ?? 0.01);
      setVal('imm-wall', params.wallThicknessMm ?? 2.0);
      setVal('imm-cav', params.cavities ?? 4);
      setVal('imm-mould-cost', params.mouldCost ?? 25000);
      setVal('imm-mould-life', params.mouldLife ?? 500000);
      setVal('imm-amort', params.amortizationVolume);
      setVal('imm-tolerance', params.toleranceMm ?? 0.2);
      setVal('imm-finish', params.surfaceFinishGrade ?? 'standard');
      if (params.runnerSystem) setVal('imm-runner-sys', params.runnerSystem);
      setTimeout(() => setVal('imm-mach', params.machineId ?? 'imm-160t'), 50);
      break;
    }
    case 'casting': {
      setVal('cast-subtype', params.subtype ?? 'hpdc');
      setVal('cast-mat', params.materialId);
      setVal('cast-part-wt', params.grossWeightKg ?? params.netWeightKg);
      if (typeof params.grossWeightKg === 'number' && typeof params.netWeightKg === 'number') {
        setVal('cast-yield', (params.netWeightKg / params.grossWeightKg).toFixed(2));
      }
      setVal('cast-amort', params.amortizationVolume);
      if ((params.subtype ?? 'hpdc') === 'hpdc') {
        setVal('cast-hpdc-cav', params.cavitiesPerMould ?? 2);
        setVal('cast-hpdc-die-cost', params.toolingCost ?? 80000);
      }
      break;
    }
    case 'forging': {
      setVal('forge-mat', params.materialId);
      setVal('forge-part-wt', params.netWeightKg);
      if (typeof params.grossWeightKg === 'number' && typeof params.netWeightKg === 'number') {
        setVal('forge-flash', (params.grossWeightKg - params.netWeightKg).toFixed(3));
        setVal('forge-yield', (params.netWeightKg / params.grossWeightKg).toFixed(2));
      }
      break;
    }
    default:
      break;
  }
  if (partName) {
    const pn = el<HTMLInputElement>('part-name');
    if (pn) pn.value = partName;
  }
}

// ─── Populate selects ─────────────────────────────────────────────────────────

let _libSig = '';

function _currentLibSig(): string {
  return `${library.version}:${library.materials.length}:${library.machines.length}:${library.labour.length}:${_displayCurrency}`;
}

function _setSelectOpts(sel: HTMLSelectElement, html: string, sig: string): void {
  if (sel.dataset.libSig === sig) return;
  const current = sel.value;
  sel.innerHTML = html;
  if (current) sel.value = current;
  sel.dataset.libSig = sig;
}

function populateSelects(): void {
  const sig = _currentLibSig();
  if (sig === _libSig) {
    // Library unchanged — only populate selects that are new (no sig yet)
    const hasNew =
      Array.from(document.querySelectorAll<HTMLSelectElement>('.material-select,.machine-select,.labour-select'))
        .some(s => !s.dataset.libSig);
    if (!hasNew) return;
  }
  _libSig = sig;

  const matOpts = library.materials.map(m =>
    `<option value="${m.id}">${m.grade} (${m.region}) — ${_currFmt(m.pricePerKg)}/kg</option>`
  ).join('');
  const machOpts = library.machines.map(m =>
    `<option value="${m.id}">${m.machineClass} — ${_currFmt(m.computedRatePerHr)}/hr</option>`
  ).join('');
  const labOpts = library.labour.map(l =>
    `<option value="${l.id}">${l.skillLevel} (${l.region}) — ${_currFmt(l.fullyLoadedRatePerHr)}/hr</option>`
  ).join('');

  document.querySelectorAll<HTMLSelectElement>('.material-select').forEach(s => _setSelectOpts(s, matOpts, sig));
  document.querySelectorAll<HTMLSelectElement>('.machine-select').forEach(s => _setSelectOpts(s, machOpts, sig));
  document.querySelectorAll<HTMLSelectElement>('.labour-select').forEach(s => _setSelectOpts(s, labOpts, sig));
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
      <div class="field-group"><label title="Fraction of parts scrapped (dimensional/quality). Uplifts both material consumption and machine time. Typical: 0.5–2% for CNC turning, 1–3% for milling complex parts.">Reject Rate (0=none) ⓘ</label><input type="number" id="mach-reject" step="0.005" min="0" max="0.3" value="0" title="Machining scrap rate. CNC turning: 0.005–0.02. Milling complex: 0.01–0.03. Leave 0 if negligible."/></div>
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
      <div class="field-group"><label>Cycle Time (hr)</label><input type="number" id="${id}-ct" step="0.001" min="0.0001" value="${d?.cycleTimeHr ?? 0.05}"/></div>
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
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label title="Press shop scrap rate. Progressive tool good quality: 0.5–1%. Complex draw/form: 1–3%. Leave 0 if scrap is included in material utilisation already.">Reject Rate (0=none) ⓘ</label><input type="number" id="sm-reject" step="0.005" min="0" max="0.2" value="0" title="Press scrap fraction. Progressive tool: 0.005–0.01. Draw/form: 0.01–0.03."/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Secondary Operation (optional)</div>
    <div class="field-row">
      <div class="field-group"><label>Machine (opt.)</label><select id="sm-sec-mach" class="machine-select"><option value="">— None —</option></select></div>
      <div class="field-group"><label>Labour (opt.)</label><select id="sm-sec-lab" class="labour-select"><option value="">— None —</option></select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Cycle Time (hr, 0=none)</label><input type="number" id="sm-sec-ct" step="0.001" min="0" value="0"/></div>
      <div class="field-group"><label>OEE</label><input type="number" id="sm-sec-oee" step="0.01" min="0.01" max="1" value="0.85"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Manning</label><input type="number" id="sm-sec-manning" step="0.25" min="0" value="1"/></div>
      <div class="field-group"><label>Labour Eff.</label><input type="number" id="sm-sec-lab-eff" step="0.01" min="0.01" max="1" value="0.92"/></div>
    </div>`;
}

// ─── Form: Sheet Metal Fabrication ───────────────────────────────────────────

const _SMF_BLANKING_DEFS: Record<string, {
  desc: string; defaultCycleSec: number; defaultGas: string; showGas: boolean; machId: string;
}> = {
  laser:    { desc: 'Fiber laser — fastest for thin/medium sheet (0.5–20mm), excellent edge quality, no tool wear. Best for complex profiles and small-to-medium batches. Use N₂ for SS/Al, O₂ for mild steel.', defaultCycleSec: 45,  defaultGas: 'nitrogen', showGas: true,  machId: 'laser-trumpf-3030'          },
  plasma:   { desc: 'Plasma cutting — cost-effective for thick plate (6–80mm), faster than laser on thick sections. Wider kerf and more dross than fiber laser. Best for heavy structural fabrication.', defaultCycleSec: 30,  defaultGas: 'air',      showGas: true,  machId: 'plasma-hypertherm-xpr300'    },
  waterjet: { desc: 'Waterjet — no heat affected zone, cuts any material (metal, glass, ceramics, composites). Slower than laser but zero thermal distortion. Ideal for hardened steel or heat-sensitive alloys.', defaultCycleSec: 120, defaultGas: '',         showGas: false, machId: 'waterjet-flow-mach500'       },
  punch:    { desc: 'Turret punching — fastest for parts with many standard holes/louvres/features. High-speed for thin sheet (0.5–6mm). Requires tooling investment. Best for high-volume parts with repetitive features.', defaultCycleSec: 60,  defaultGas: '',         showGas: false, machId: 'punch-amada-emz3610'         },
  shear:    { desc: 'Guillotine shearing — straight-line blanks only. Lowest cost per part, fastest cycle. Best for simple rectangular blanks, strip cutting at high volume. No complex profiles.', defaultCycleSec: 8,   defaultGas: '',         showGas: false, machId: 'shear-hydraulic-3m'          },
};

function wireSheetMetalBlankingChange(): void {
  const methodSel = document.getElementById('smf-blank-method') as HTMLSelectElement | null;
  if (!methodSel) return;
  const update = () => {
    const method = methodSel.value;
    const def = _SMF_BLANKING_DEFS[method];
    if (!def) return;
    const band = document.getElementById('smf-blank-info');
    const label = methodSel.options[methodSel.selectedIndex]?.text ?? method;
    if (band) band.innerHTML = `<strong style="color:var(--accent)">${escHtml(label)}</strong> — ${escHtml(def.desc)}`;
    const gasRow = document.getElementById('smf-gas-row');
    if (gasRow) gasRow.style.display = def.showGas ? '' : 'none';
    const gasEl = document.getElementById('smf-gas') as HTMLSelectElement | null;
    if (gasEl) gasEl.value = def.showGas && def.defaultGas ? def.defaultGas : '';
    const ctEl = document.getElementById('smf-blank-ct') as HTMLInputElement | null;
    if (ctEl && ctEl.value === ctEl.defaultValue || ctEl) {
      // Only update cycle time if it hasn't been manually changed from a process default
      const prevDefault = (methodSel as any)._prevCycleDef as number | undefined;
      if (!prevDefault || Number(ctEl.value) === prevDefault) ctEl.value = String(def.defaultCycleSec);
      (methodSel as any)._prevCycleDef = def.defaultCycleSec;
    }
    const machEl = document.getElementById('smf-blank-mach') as HTMLSelectElement | null;
    if (machEl) { const opt = Array.from(machEl.options).find(o => o.value === def.machId); if (opt) machEl.value = def.machId; }
  };
  methodSel.addEventListener('change', update);
  update();
}

function renderSheetMetalFabAdvisor(): string {
  return `
    <details style="background:#fff8f3;border:1px solid #ffd699;border-radius:6px;padding:6px 8px;margin-bottom:6px">
      <summary style="font-weight:600;font-size:0.78rem;cursor:pointer;color:#b34700">⚡ Process Advisor — Laser vs Punch vs Stamp</summary>
      <div style="margin-top:6px">
        <div class="field-row">
          <div class="field-group"><label>Annual Volume</label><input type="number" id="smf-adv-vol" step="100" min="1" value="5000"/></div>
          <div class="field-group"><label>Thickness (mm)</label><input type="number" id="smf-adv-thick" step="0.25" min="0.3" value="1.5"/></div>
        </div>
        <div class="field-row" style="margin-top:4px">
          <div class="field-group"><label>Complexity</label><select id="smf-adv-cmplx"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></div>
          <div class="field-group"><label>Hole Density</label><select id="smf-adv-holes"><option value="low" selected>Low / none</option><option value="high">High (many punched holes)</option></select></div>
        </div>
        <div class="field-row" style="margin-top:4px">
          <div class="field-group"><label>Material Family</label><select id="smf-adv-mat-fam"><option value="steel" selected>Mild / HSLA Steel</option><option value="stainless">Stainless Steel</option><option value="aluminium">Aluminium</option><option value="galvanised">Galvanised Steel</option></select></div>
          <div class="field-group" style="display:flex;align-items:flex-end"><button class="btn btn-secondary btn-sm" id="smf-adv-btn" style="width:100%">Advise →</button></div>
        </div>
        <div id="smf-adv-result" style="margin-top:6px;font-size:0.75rem;display:none"></div>
      </div>
    </details>`;
}

function renderSheetMetalFabForm(): string {
  return renderSheetMetalFabAdvisor() + `
    <div class="section-title">Material</div>
    <div class="field-row">
      <div class="field-group"><label>Material</label><select id="smf-mat" class="material-select"></select></div>
      <div class="field-group"><label>Part Weight (kg) <span title="Net finished part weight. Used with material utilisation to compute gross blank weight and scrap.">ℹ</span></label><input type="number" id="smf-part-wt" step="0.01" min="0.001" value="0.50"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Material Utilisation <span title="Net part weight / gross blank weight. Driven by flat-pattern nesting efficiency. Laser cut: 0.70–0.90. Stamped: 0.75–0.85.">ℹ</span></label><input type="number" id="smf-mat-util" step="0.01" min="0.1" max="1" value="0.78"/></div>
      <div class="field-group"><label>Tolerance (mm) <span title="Tightest part tolerance. Multiplier on cycle times: ≥0.5→×1.0, ≥0.3→×1.1, ≥0.2→×1.3, ≥0.1→×1.6.">ℹ</span></label><input type="number" id="smf-tolerance" step="0.05" min="0.05" value="0.2"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Blanking</div>
    <div class="field-row">
      <div class="field-group" style="flex:2"><label>Method</label>
        <select id="smf-blank-method">
          <option value="laser"    selected>Laser Cutting (Fiber)</option>
          <option value="plasma"          >Plasma Cutting</option>
          <option value="waterjet"        >Waterjet Cutting</option>
          <option value="punch"           >Turret Punching</option>
          <option value="shear"           >Guillotine Shearing</option>
        </select>
      </div>
    </div>
    <div id="smf-blank-info" class="process-info-band" style="margin:6px 0 6px;padding:6px 10px;background:var(--surface);border-left:3px solid var(--accent);border-radius:4px;font-size:0.82em;line-height:1.4"></div>
    <div class="field-row">
      <div class="field-group"><label>Blanking Machine</label><select id="smf-blank-mach" class="machine-select"></select></div>
      <div class="field-group"><label>Blanking Labour</label><select id="smf-blank-lab" class="labour-select"></select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Cycle Time (s) <span title="Total blanking time per part including sheet load/index. Laser: cut length ÷ speed + pierces × pierce time. Punch: hit count ÷ hits/min. Shear: 5–15s.">ℹ</span></label><input type="number" id="smf-blank-ct" step="1" min="1" value="45"/></div>
    </div>
    <div id="smf-gas-row" class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Assist Gas <span title="Laser: N₂ for SS/Al (clean edge £3.50/hr), O₂ for mild steel (faster £1.20/hr), Air for low cost (£0.40/hr). Plasma: Air standard, O₂ for faster cut on mild steel.">ℹ</span></label><select id="smf-gas"><option value="">None / not applicable</option><option value="nitrogen">Nitrogen (N₂) — SS / Aluminium</option><option value="oxygen">Oxygen (O₂) — Mild Steel, faster</option><option value="air">Compressed Air — low cost / plasma</option></select></div>
    </div>
    <div class="section-title" style="margin-top:8px">Press Brake Bending</div>
    <div class="field-row">
      <div class="field-group"><label>Bend Count <span title="Number of bends per part. 0 if no bending required.">ℹ</span></label><input type="number" id="smf-bends" step="1" min="0" value="3"/></div>
      <div class="field-group"><label>Time / Bend (s) <span title="Per bend including repositioning. Simple bends: 30–45s. Complex back-gauge reposition: 60–120s.">ℹ</span></label><input type="number" id="smf-bend-t" step="5" min="0" value="45"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Tool Changes <span title="Number of die/punch setups per part run. Multi-radius bends need multiple setups.">ℹ</span></label><input type="number" id="smf-tool-chg" step="1" min="0" value="1"/></div>
      <div class="field-group"><label>Tool Change (s) <span title="Setup time per tool change, amortized over batch. Typically 300–600s per setup.">ℹ</span></label><input type="number" id="smf-tool-chg-t" step="30" min="0" value="300"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Brake Machine</label><select id="smf-brake-mach" class="machine-select"></select></div>
      <div class="field-group"><label>Brake Labour</label><select id="smf-brake-lab" class="labour-select"></select></div>
    </div>
    <div class="section-title" style="margin-top:8px">Machine Parameters</div>
    <div class="field-row">
      <div class="field-group"><label>OEE <span title="Overall Equipment Effectiveness — applies to blanking and bending. Typical fab shop: 0.75–0.85.">ℹ</span></label><input type="number" id="smf-oee" step="0.01" min="0.01" max="1" value="0.80"/></div>
      <div class="field-group"><label>Manning <span title="Operators per machine. Laser/punch CNC: 0.5–1. Brake: 1–2. Robotic cell: 0.25–0.5.">ℹ</span></label><input type="number" id="smf-manning" step="0.25" min="0" value="1"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Labour Eff. <span title="Actual productive time fraction per paid hour. Typical 0.88–0.95 for sheet metal.">ℹ</span></label><input type="number" id="smf-lab-eff" step="0.01" min="0.01" max="1" value="0.92"/></div>
      <div class="field-group"><label>Reject Rate <span title="Overall fab scrap fraction. Uplifts material and cycle costs. Typical laser cut: 0–1%. Forming: 0.5–2%.">ℹ</span></label><input type="number" id="smf-reject" step="0.005" min="0" max="0.2" value="0"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Joining (optional)</div>
    <details style="margin-bottom:2px">
      <summary style="font-size:0.80rem;font-weight:600;cursor:pointer;padding:4px 0;color:var(--text-muted)">▶ Spot Welding</summary>
      <div style="padding:4px 0">
        <div class="field-row" style="margin-top:4px">
          <div class="field-group"><label>Spot Weld Count <span title="Number of spot welds per part. 0 = not used.">ℹ</span></label><input type="number" id="smf-sw-count" step="1" min="0" value="0"/></div>
          <div class="field-group"><label>Time / Spot (s) <span title="Per spot weld including electrode approach. Typical: 2–4s pedestal, 1–2s robotic.">ℹ</span></label><input type="number" id="smf-sw-t" step="0.5" min="0" value="3"/></div>
        </div>
        <div class="field-row" style="margin-top:4px">
          <div class="field-group"><label>Spot Weld Machine <span title="Pedestal spot welder for manual, KUKA robot cell for automated body shop production.">ℹ</span></label><select id="smf-sw-mach" class="machine-select"><option value="">None</option></select></div>
          <div class="field-group"><label>Spot Weld Labour</label><select id="smf-sw-lab" class="labour-select"><option value="">None</option></select></div>
        </div>
      </div>
    </details>
    <details style="margin-bottom:2px">
      <summary style="font-size:0.80rem;font-weight:600;cursor:pointer;padding:4px 0;color:var(--text-muted)">▶ MIG / MAG Welding</summary>
      <div style="padding:4px 0">
        <div class="field-row" style="margin-top:4px">
          <div class="field-group"><label>MIG Weld Length (m) <span title="Total weld bead length per part in metres. 0 = not used.">ℹ</span></label><input type="number" id="smf-mig-len" step="0.05" min="0" value="0"/></div>
          <div class="field-group"><label>MIG Speed (m/min) <span title="Deposition speed. Manual MIG: 0.2–0.4 m/min. Robotic MIG: 0.5–1.2 m/min.">ℹ</span></label><input type="number" id="smf-mig-spd" step="0.05" min="0.05" value="0.3"/></div>
        </div>
        <div class="field-row" style="margin-top:4px">
          <div class="field-group"><label>MIG Machine</label><select id="smf-mig-mach" class="machine-select"><option value="">None</option></select></div>
          <div class="field-group"><label>MIG Labour</label><select id="smf-mig-lab" class="labour-select"><option value="">None</option></select></div>
        </div>
        <div class="field-row" style="margin-top:4px">
          <div class="field-group"><label>MIG Consumable (£/m) <span title="Wire + shielding gas cost per metre of weld bead. Typical £0.30–0.60/m for MIG/MAG.">ℹ</span></label><input type="number" id="smf-mig-cons" step="0.05" min="0" value="0.40"/></div>
        </div>
      </div>
    </details>
    <details style="margin-bottom:2px">
      <summary style="font-size:0.80rem;font-weight:600;cursor:pointer;padding:4px 0;color:var(--text-muted)">▶ TIG Welding</summary>
      <div style="padding:4px 0">
        <div class="field-row" style="margin-top:4px">
          <div class="field-group"><label>TIG Weld Length (m) <span title="Total TIG bead length per part. Typical 0.05–2.0m. 0 = not used.">ℹ</span></label><input type="number" id="smf-tig-len" step="0.05" min="0" value="0"/></div>
          <div class="field-group"><label>TIG Speed (m/min) <span title="Manual TIG: 0.05–0.12 m/min. Much slower than MIG. Use TIG for SS, aluminium and critical welds.">ℹ</span></label><input type="number" id="smf-tig-spd" step="0.01" min="0.01" value="0.08"/></div>
        </div>
        <div class="field-row" style="margin-top:4px">
          <div class="field-group"><label>TIG Machine</label><select id="smf-tig-mach" class="machine-select"><option value="">None</option></select></div>
          <div class="field-group"><label>TIG Labour <span title="TIG requires a skilled welder — select skilled or highly skilled labour rate.">ℹ</span></label><select id="smf-tig-lab" class="labour-select"><option value="">None</option></select></div>
        </div>
        <div class="field-row" style="margin-top:4px">
          <div class="field-group"><label>TIG Consumable (£/m) <span title="Argon shielding gas + filler rod per metre of TIG bead. Typical £0.50–0.80/m.">ℹ</span></label><input type="number" id="smf-tig-cons" step="0.05" min="0" value="0.60"/></div>
        </div>
      </div>
    </details>
    <div class="section-title" style="margin-top:8px">Tooling</div>
    <div class="field-row">
      <div class="field-group"><label>Tooling Cost (£) <span title="Press brake tooling + nesting/CNC programming NRE. Laser: £500–3k. Punch: £2k–10k. Stamping die: £15k–150k.">ℹ</span></label><input type="number" id="smf-tooling" step="500" min="0" value="2000"/></div>
      <div class="field-group"><label>Amort. Volume <span title="Annual volume over which to amortize tooling. Higher volume = lower tooling cost per part.">ℹ</span></label><input type="number" id="smf-amort" step="1000" min="1" value="5000"/></div>
    </div>`;
}

function wireSheetMetalFabAdvisor(): void {
  const btn = document.getElementById('smf-adv-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const volume = Number((document.getElementById('smf-adv-vol') as HTMLInputElement)?.value) || 5000;
    const thickness = Number((document.getElementById('smf-adv-thick') as HTMLInputElement)?.value) || 1.5;
    const complexity = ((document.getElementById('smf-adv-cmplx') as HTMLSelectElement)?.value || 'medium') as 'low' | 'medium' | 'high';
    const holeDensity = ((document.getElementById('smf-adv-holes') as HTMLSelectElement)?.value || 'low') as 'low' | 'high';
    const materialFamily = ((document.getElementById('smf-adv-mat-fam') as HTMLSelectElement)?.value || 'steel') as 'steel' | 'stainless' | 'aluminium' | 'galvanised';

    const rec = adviseSheetMetalProcess({ annualVolume: volume, thicknessMm: thickness, complexity, holeDensity, materialFamily });
    const volLabel = { low: '< 1k', medium: '1k–50k', high: '> 50k' }[rec.volumeCategory];
    const resultEl = document.getElementById('smf-adv-result');
    if (!resultEl) return;
    resultEl.innerHTML = `
      <div style="background:#fff;border:1px solid #e0e0e0;border-radius:4px;padding:8px">
        <div style="font-weight:700;color:#b34700">${rec.primaryProcess} → ${rec.formingProcess}</div>
        <div style="color:#555;margin-top:2px">Route: ${rec.processRoute.join(' → ')}</div>
        <div style="margin-top:4px;display:flex;gap:12px;flex-wrap:wrap">
          <span><strong>Volume band:</strong> ${volLabel}/yr</span>
          <span><strong>Tolerance:</strong> ${rec.toleranceCapability}</span>
          <span><strong>Tooling:</strong> ${rec.toolingBand}</span>
        </div>
        <div style="margin-top:4px;color:#444;font-style:italic">${rec.reason}</div>
        <div style="margin-top:4px;font-size:0.72rem;color:#888">Suggested machines: ${rec.suggestedMachineIds.join(', ')}</div>
      </div>`;
    resultEl.style.display = 'block';
  });
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
      <div class="field-group"><label>Runner System</label><select id="imm-runner-sys"><option value="cold">Cold Runner</option><option value="hot">Hot Runner (no waste)</option></select></div>
      <div class="field-group"><label>Runner Weight (kg)</label><input type="number" id="imm-runner-wt" step="0.001" min="0" value="0.01" title="Ignored when Hot Runner selected"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Regrind Fraction <span title="Cold runner only. Hot runner = 0 waste. Max ~0.3 for unfilled resins; 0 for glass-filled.">ℹ</span></label><input type="number" id="imm-regrind" step="0.01" min="0" max="1" value="0.2"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Mould &amp; Cycle</div>
    <div class="field-row">
      <div class="field-group"><label>Cavities</label><input type="number" id="imm-cav" min="1" step="1" value="2"/></div>
      <div class="field-group"><label>Projected Area (cm²)</label><input type="number" id="imm-area" step="1" min="1" value="40"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Cavity Pressure (MPa)</label><input type="number" id="imm-cav-press" step="1" min="1" value="30"/></div>
      <div class="field-group"><label>Wall Thickness (mm)</label><input type="number" id="imm-wall" step="0.1" min="0.1" value="2.0"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Cool Factor (s/mm²)</label><input type="number" id="imm-cool-f" step="0.1" min="0.1" value="3.16"/></div>
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
    <div class="section-title" style="margin-top:8px">Quality &amp; Complexity</div>
    <div class="field-row">
      <div class="field-group"><label>Tightest Tolerance (mm) <span title="Drives mould precision: ≥0.20→×1.0, ≥0.10→×1.2, ≥0.05→×1.5, <0.05→×2.0 on mould cost. Leave 0 for standard ±0.2mm.">ℹ</span></label><input type="number" id="imm-tolerance" step="0.01" min="0" value="0.2" title="Tightest critical dimension tolerance on part mm"/></div>
      <div class="field-group"><label>Surface Finish <span title="Affects mould cost: standard×1.0, textured×1.1, high_gloss×1.4 (+15% cool time), painted×1.6.">ℹ</span></label><select id="imm-finish"><option value="standard" selected>Standard moulded</option><option value="textured">Textured mould</option><option value="high_gloss">High gloss / optical</option><option value="painted">Painted / coated</option></select></div>
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

// ─── Form: Blow Moulding ──────────────────────────────────────────────────────

const _BM_PROCESS_DEFS: Record<string, {
  desc: string; parisonTime: number; blowTime: number; openClose: number;
  coolFactor: number; cavities: number; oee: number; manning: number;
  reject: number; mouldCost: number; mouldLife: number;
  machId: string; flashFraction: number; showParison: boolean;
}> = {
  ebm_2head:  { desc: '2-Head continuous EBM for HDPE/LDPE/PP bottles &amp; containers 1–5L. High output, low tooling cost, standard dairy/detergent packaging.', parisonTime: 6,  blowTime: 5,  openClose: 5,  coolFactor: 3.50, cavities: 2, oee: 0.80, manning: 1.0, reject: 0.025, mouldCost: 8000,  mouldLife: 1000000, machId: 'blow-ebm-2head',  flashFraction: 0.10, showParison: true  },
  ebm_coex3:  { desc: '3-Layer Co-Ex EBM — HDPE/regrind/HDPE or barrier layering for fuel tanks, automotive ducts and barrier packaging. Higher capital &amp; manning.', parisonTime: 8,  blowTime: 6,  openClose: 6,  coolFactor: 3.50, cavities: 2, oee: 0.78, manning: 1.5, reject: 0.030, mouldCost: 15000, mouldLife: 750000,  machId: 'blow-ebm-coex3', flashFraction: 0.12, showParison: true  },
  ebm_coex5:  { desc: '5-Layer Co-Ex EBM — HDPE/tie/EVOH/tie/HDPE high-barrier structure for automotive fuel systems and food packaging. Complex, high capital, specialist skill.', parisonTime: 10, blowTime: 8,  openClose: 6,  coolFactor: 3.50, cavities: 1, oee: 0.75, manning: 2.0, reject: 0.035, mouldCost: 22000, mouldLife: 600000,  machId: 'blow-ebm-coex5', flashFraction: 0.12, showParison: true  },
  ebm_large:  { desc: 'Large accumulator-head EBM for drums, IBCs and automotive fuel tanks (20–200L). Long parison extrusion, single cavity, high-tonnage clamp.', parisonTime: 20, blowTime: 15, openClose: 10, coolFactor: 3.50, cavities: 1, oee: 0.75, manning: 1.5, reject: 0.030, mouldCost: 18000, mouldLife: 500000,  machId: 'blow-ebm-large', flashFraction: 0.08, showParison: true  },
  ibm_rotary: { desc: 'IBM Rotary — 3/4-station indexing, no flash, ±0.05mm accuracy. Pharma vials, cosmetics jars, eye-drop bottles. Very high throughput, multi-cavity.', parisonTime: 2,  blowTime: 3,  openClose: 2,  coolFactor: 1.50, cavities: 4, oee: 0.88, manning: 0.5, reject: 0.012, mouldCost: 25000, mouldLife: 2000000, machId: 'blow-ibm-rotary', flashFraction: 0.01, showParison: false },
  ibm_linear: { desc: 'IBM Linear indexing — wide-mouth jars, pharmaceutical bottles, narrow-neck containers. No flash. PP/PE. Lower speed than rotary.', parisonTime: 2,  blowTime: 4,  openClose: 3,  coolFactor: 1.50, cavities: 2, oee: 0.83, manning: 0.5, reject: 0.015, mouldCost: 20000, mouldLife: 1500000, machId: 'blow-ibm-linear', flashFraction: 0.01, showParison: false },
  sbm_1stage: { desc: 'Single-Stage SBM — preform injection + stretch-blow in one machine. Excellent clarity for PET/PP jars, cosmetics, condiment bottles. Flexible but slower than 2-stage.', parisonTime: 15, blowTime: 4,  openClose: 4,  coolFactor: 2.80, cavities: 1, oee: 0.80, manning: 1.0, reject: 0.020, mouldCost: 12000, mouldLife: 1000000, machId: 'blow-sbm-1stage', flashFraction: 0.03, showParison: false },
  sbm_2stage: { desc: 'Two-Stage Reheat SBM — preforms made separately, reheated and blown at 20k–80k bph. Dominant for PET water/CSD/juice bottles. Very low per-part cost at high volume.', parisonTime: 4,  blowTime: 2,  openClose: 2,  coolFactor: 2.80, cavities: 4, oee: 0.87, manning: 0.5, reject: 0.015, mouldCost: 18000, mouldLife: 2000000, machId: 'blow-sbm-2stage', flashFraction: 0.02, showParison: false },
};

function wireBlowMouldingProcessChange(): void {
  const procSel = document.getElementById('bm-process') as HTMLSelectElement | null;
  if (!procSel) return;
  const update = () => {
    const proc = procSel.value;
    const def = _BM_PROCESS_DEFS[proc];
    if (!def) return;
    const band = document.getElementById('bm-process-info');
    const label = procSel.options[procSel.selectedIndex]?.text ?? proc;
    if (band) band.innerHTML = `<strong style="color:var(--accent)">${escHtml(label)}</strong> — ${def.desc}`;
    const parisonSec = document.getElementById('bm-parison-section');
    if (parisonSec) parisonSec.style.display = def.showParison ? '' : 'none';
    const setV = (id: string, v: number) => { const e = document.getElementById(id) as HTMLInputElement | null; if (e) e.value = String(v); };
    setV('bm-parison-t', def.parisonTime);
    setV('bm-blow-t', def.blowTime);
    setV('bm-open-close', def.openClose);
    setV('bm-cool-f', def.coolFactor);
    setV('bm-cav', def.cavities);
    setV('bm-oee', def.oee);
    setV('bm-manning', def.manning);
    setV('bm-reject', def.reject);
    setV('bm-mould-cost', def.mouldCost);
    setV('bm-mould-life', def.mouldLife);
    const partWt = parseFloat((document.getElementById('bm-part-wt') as HTMLInputElement)?.value ?? '0') || 0.050;
    setV('bm-flash-wt', parseFloat((partWt * def.flashFraction).toFixed(4)));
    const machEl = document.getElementById('bm-mach') as HTMLSelectElement | null;
    if (machEl) { const opt = Array.from(machEl.options).find(o => o.value === def.machId); if (opt) machEl.value = def.machId; }
  };
  procSel.addEventListener('change', update);
  update();
}

function renderBlowMouldingForm(): string {
  return `
    <div class="section-title">Process</div>
    <div class="field-row">
      <div class="field-group" style="flex:2"><label>Process Type</label>
        <select id="bm-process">
          <option value="ebm_2head" selected>EBM — 2-Head (Bottles 1–5L)</option>
          <option value="ebm_coex3">EBM — 3-Layer Co-Ex (Barrier packaging)</option>
          <option value="ebm_coex5">EBM — 5-Layer Co-Ex (High-barrier fuel/food)</option>
          <option value="ebm_large">EBM — Large Accumulator (Tanks 20–200L)</option>
          <option value="ibm_rotary">IBM — Rotary (Pharma/cosmetics, no flash)</option>
          <option value="ibm_linear">IBM — Linear (Jars/pharma, medium volume)</option>
          <option value="sbm_1stage">SBM — Single-Stage (PET/PP jars, clarity)</option>
          <option value="sbm_2stage">SBM — Two-Stage Reheat (High-speed PET bottles)</option>
        </select>
      </div>
    </div>
    <div id="bm-process-info" class="process-info-band" style="margin:6px 0 8px;padding:6px 10px;background:var(--surface);border-left:3px solid var(--accent);border-radius:4px;font-size:0.82em;line-height:1.4"></div>
    <div class="section-title" style="margin-top:8px">Material &amp; Part</div>
    <div class="field-row">
      <div class="field-group"><label>Material</label><select id="bm-mat" class="material-select"></select></div>
      <div class="field-group"><label>Part Weight (kg)</label><input type="number" id="bm-part-wt" step="0.001" min="0.001" value="0.05"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Flash Weight (kg) <span title="Pinch-off flash + neck trim scrap weight per part. IBM has near-zero flash.">ℹ</span></label><input type="number" id="bm-flash-wt" step="0.001" min="0" value="0.005"/></div>
      <div class="field-group"><label>Wall Thickness (mm) <span title="Average wall thickness — drives cooling time via coolFactor × t².">ℹ</span></label><input type="number" id="bm-wall" step="0.1" min="0.1" value="1.5"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Reject Rate <span title="Fraction of parts scrapped (wall failure, leak, flash defect). Uplifts material and cycle cost. Typical EBM 2–3%, IBM &lt;1.5%.">ℹ</span></label><input type="number" id="bm-reject" step="0.005" min="0" max="0.5" value="0.025"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Cycle Time</div>
    <div id="bm-parison-section">
      <div class="field-row">
        <div class="field-group"><label>Parison Extrusion (s) <span title="Time to extrude the parison before mould close. Typical 4–20s for EBM depending on part size.">ℹ</span></label><input type="number" id="bm-parison-t" step="0.5" min="0" value="6"/></div>
      </div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Cool Factor (s/mm²) <span title="Cooling constant. HDPE/LDPE ~3.5, PP ~3.16, PET ~2.8–3.0, IBM ~1.5 (water-cooled core rod).">ℹ</span></label><input type="number" id="bm-cool-f" step="0.1" min="0" value="3.5"/></div>
      <div class="field-group"><label>Blow Time (s) <span title="Pressurisation + hold. EBM bottles 3–8s, large tanks 10–20s. IBM ~3s.">ℹ</span></label><input type="number" id="bm-blow-t" step="0.5" min="0.5" value="5"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Open/Close (s) <span title="Mould open / index / close time. EBM 4–8s, IBM rotary 2s, SBM 2–4s.">ℹ</span></label><input type="number" id="bm-open-close" step="0.5" min="0.5" value="5"/></div>
      <div class="field-group"><label>Cavities</label><input type="number" id="bm-cav" step="1" min="1" value="2"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Machine &amp; Labour</div>
    <div class="field-row">
      <div class="field-group"><label>Blow Machine</label><select id="bm-mach" class="machine-select"></select></div>
      <div class="field-group"><label>Labour</label><select id="bm-lab" class="labour-select"></select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>OEE</label><input type="number" id="bm-oee" step="0.01" min="0.01" max="1" value="0.80"/></div>
      <div class="field-group"><label>Manning</label><input type="number" id="bm-manning" step="0.25" min="0" value="1"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Labour Eff.</label><input type="number" id="bm-lab-eff" step="0.01" min="0.01" max="1" value="0.95"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Tooling</div>
    <div class="field-row">
      <div class="field-group"><label>Mould Cost (£) <span title="Al blow mould: £5k–£25k. Steel (high cavities): higher. IBM mould: £20k–£40k.">ℹ</span></label><input type="number" id="bm-mould-cost" step="500" min="0" value="8000"/></div>
      <div class="field-group"><label>Mould Life (cycles) <span title="Al blow moulds: 500k–2M cycles. IBM steel: up to 5M.">ℹ</span></label><input type="number" id="bm-mould-life" step="50000" min="0" value="1000000"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Amort. Volume</label><input type="number" id="bm-amort" step="10000" min="1" value="500000"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Deflashing (optional)</div>
    <div class="field-row">
      <div class="field-group"><label>Deflash Machine <span title="Use 'Deflash Trim Robot / Station' for automated EBM flash removal. IBM/SBM typically need no deflash.">ℹ</span></label><select id="bm-deflash-mach" class="machine-select"><option value="">None</option></select></div>
      <div class="field-group"><label>Deflash Labour</label><select id="bm-deflash-lab" class="labour-select"><option value="">None</option></select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Deflash Cycle (s, 0=none) <span title="Time per part for automated deflash. Typical 6–15s for EBM parts with pinch-off flash.">ℹ</span></label><input type="number" id="bm-deflash-ct" step="1" min="0" value="0"/></div>
    </div>`;
}

// ─── Form: Extrusion ──────────────────────────────────────────────────────────

function renderExtrusionForm(): string {
  return `
    <div class="section-title">Material &amp; Profile</div>
    <div class="field-row">
      <div class="field-group"><label>Material</label><select id="ext-mat" class="material-select"></select></div>
      <div class="field-group"><label>Profile kg/m <span title="Linear weight density of the extruded profile kg/m. E.g. 20mm dia rod PE: ~0.28 kg/m.">ℹ</span></label><input type="number" id="ext-kg-per-m" step="0.01" min="0.001" value="0.20"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Part Length (m)</label><input type="number" id="ext-length" step="0.1" min="0.01" value="2.0"/></div>
      <div class="field-group"><label>Line Rate (kg/hr) <span title="Extrusion throughput. 75mm SSE: ~200–400 kg/hr for PE pipe; lower for complex profiles.">ℹ</span></label><input type="number" id="ext-rate" step="10" min="1" value="250"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Startup Scrap <span title="Fraction of run lost to startup purge, colour change. Typically 0.02–0.08.">ℹ</span></label><input type="number" id="ext-scrap" step="0.01" min="0" max="0.4" value="0.03"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Machine &amp; Labour</div>
    <div class="field-row">
      <div class="field-group"><label>Extruder</label><select id="ext-mach" class="machine-select"></select></div>
      <div class="field-group"><label>Labour</label><select id="ext-lab" class="labour-select"></select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>OEE</label><input type="number" id="ext-oee" step="0.01" min="0.01" max="1" value="0.82"/></div>
      <div class="field-group"><label>Manning</label><input type="number" id="ext-manning" step="0.5" min="0" value="1"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Labour Eff.</label><input type="number" id="ext-lab-eff" step="0.01" min="0.01" max="1" value="0.95"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Tooling</div>
    <div class="field-row">
      <div class="field-group"><label>Die Cost (£)</label><input type="number" id="ext-die-cost" step="500" min="0" value="3000"/></div>
      <div class="field-group"><label>Amort. Volume</label><input type="number" id="ext-amort" step="1000" min="1" value="100000"/></div>
    </div>`;
}

// ─── Form: Thermoforming ──────────────────────────────────────────────────────

function renderThermoformingForm(): string {
  return `
    <div class="section-title">Sheet &amp; Part</div>
    <div class="field-row">
      <div class="field-group"><label>Material</label><select id="tf-mat" class="material-select"></select></div>
      <div class="field-group"><label>Sheet Weight (kg) <span title="Gross sheet weight per cycle before forming.">ℹ</span></label><input type="number" id="tf-sheet-wt" step="0.01" min="0.001" value="1.2"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Part Weight (kg) <span title="Net part weight after trim.">ℹ</span></label><input type="number" id="tf-part-wt" step="0.001" min="0.001" value="0.25"/></div>
      <div class="field-group"><label>Parts / Sheet</label><input type="number" id="tf-pps" step="1" min="1" value="4"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Method</label><select id="tf-method"><option value="vacuum" selected>Vacuum</option><option value="pressure">Pressure</option><option value="twin_sheet">Twin-Sheet</option></select></div>
    </div>
    <div class="section-title" style="margin-top:8px">Cycle Time</div>
    <div class="field-row">
      <div class="field-group"><label>Heat Time (s)</label><input type="number" id="tf-heat" step="1" min="1" value="30"/></div>
      <div class="field-group"><label>Form Time (s)</label><input type="number" id="tf-form" step="1" min="1" value="10"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Trim Time (s)</label><input type="number" id="tf-trim" step="1" min="0" value="20"/></div>
      <div class="field-group"><label>Index Time (s)</label><input type="number" id="tf-index" step="1" min="1" value="10"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Machine &amp; Labour</div>
    <div class="field-row">
      <div class="field-group"><label>Thermoformer</label><select id="tf-mach" class="machine-select"></select></div>
      <div class="field-group"><label>Labour</label><select id="tf-lab" class="labour-select"></select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>OEE</label><input type="number" id="tf-oee" step="0.01" min="0.01" max="1" value="0.80"/></div>
      <div class="field-group"><label>Manning</label><input type="number" id="tf-manning" step="0.5" min="0" value="1"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Labour Eff.</label><input type="number" id="tf-lab-eff" step="0.01" min="0.01" max="1" value="0.92"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Tooling</div>
    <div class="field-row">
      <div class="field-group"><label>Tool Cost (£) <span title="Forming tool + trim die. Much lower than injection mould — typically £2k–£20k.">ℹ</span></label><input type="number" id="tf-tool-cost" step="500" min="0" value="5000"/></div>
      <div class="field-group"><label>Amort. Volume</label><input type="number" id="tf-amort" step="1000" min="1" value="50000"/></div>
    </div>`;
}

// ─── Form: Rotational Moulding ────────────────────────────────────────────────

function renderRotationalMouldingForm(): string {
  return `
    <div class="section-title">Material &amp; Part</div>
    <div class="field-row">
      <div class="field-group"><label>Material <span title="LLDPE powder is most common. Set pellet price in library; add grinding premium below.">ℹ</span></label><select id="rm-mat" class="material-select"></select></div>
      <div class="field-group"><label>Part Weight (kg) <span title="Equals the powder charge weight.">ℹ</span></label><input type="number" id="rm-part-wt" step="0.1" min="0.1" value="5.0"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Powder Adder (£/kg) <span title="Grinding/screening premium over pellet price. Typically £0.15–0.40/kg.">ℹ</span></label><input type="number" id="rm-powder-adder" step="0.05" min="0" value="0.25"/></div>
      <div class="field-group"><label>No. of Arms <span title="Number of rotating arms on the machine carousel. Typically 2–4.">ℹ</span></label><input type="number" id="rm-num-arms" step="1" min="1" max="6" value="3"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Parts / Arm</label><input type="number" id="rm-parts-per-arm" step="1" min="1" value="1"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Cycle Time</div>
    <div class="field-row">
      <div class="field-group"><label>Heating Time (s) <span title="Oven residence time. Typically 600–1800s.">ℹ</span></label><input type="number" id="rm-heat" step="30" min="60" value="900"/></div>
      <div class="field-group"><label>Cooling Time (s) <span title="Forced air cooling. Typically 900–2400s.">ℹ</span></label><input type="number" id="rm-cool" step="30" min="60" value="1200"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Load/Unload (s) <span title="Demould + charge load. Typically 120–300s.">ℹ</span></label><input type="number" id="rm-load" step="30" min="30" value="180"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Machine &amp; Labour</div>
    <div class="field-row">
      <div class="field-group"><label>Rotomoulder</label><select id="rm-mach" class="machine-select"></select></div>
      <div class="field-group"><label>Labour</label><select id="rm-lab" class="labour-select"></select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>OEE</label><input type="number" id="rm-oee" step="0.01" min="0.01" max="1" value="0.75"/></div>
      <div class="field-group"><label>Manning</label><input type="number" id="rm-manning" step="0.5" min="0" value="2"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Labour Eff.</label><input type="number" id="rm-lab-eff" step="0.01" min="0.01" max="1" value="0.92"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">Tooling</div>
    <div class="field-row">
      <div class="field-group"><label>Mould Cost (£) <span title="Al casting tool. Much cheaper than IM: typically £3k–£30k.">ℹ</span></label><input type="number" id="rm-mould-cost" step="500" min="0" value="8000"/></div>
      <div class="field-group"><label>Mould Life (cycles) <span title="Rotomould Al tools: 50k–200k cycles">ℹ</span></label><input type="number" id="rm-mould-life" step="10000" min="0" value="100000"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Amort. Volume</label><input type="number" id="rm-amort" step="1000" min="1" value="5000"/></div>
    </div>`;
}

// ─── Form: Rubber ─────────────────────────────────────────────────────────────

const _RUBBER_PROCESS_DEFS: Record<string, {
  desc: string; cycleTime: number; cavities: number; oee: number; manning: number;
  reject: number; mouldCost: number; mouldLife: number; machId: string; flashFraction: number; showCure: boolean;
}> = {
  compression_mould: {
    desc: 'Preform loaded into open mould → closed under heat + pressure → rubber vulcanises in cavity → mould opens, flash trimmed manually. Best for: solid mounts, gaskets, O-rings, bushings, anti-vibration pads. Tooling: moderate cost, very high volume.',
    cycleTime: 180, cavities: 4, oee: 0.78, manning: 1.0, reject: 0.030, mouldCost: 5000, mouldLife: 200000, machId: 'compression-mould-std', flashFraction: 0.20, showCure: false,
  },
  transfer_mould: {
    desc: 'Rubber compound placed in transfer pot → plunger forces material through sprue into closed mould → cures under pressure. Better dimensional accuracy than compression; suited to rubber-metal bonded inserts and complex cross-sections.',
    cycleTime: 120, cavities: 8, oee: 0.80, manning: 1.0, reject: 0.025, mouldCost: 9000, mouldLife: 150000, machId: 'transfer-mould-std', flashFraction: 0.12, showCure: false,
  },
  injection_mould_lsr: {
    desc: 'Liquid Silicone Rubber (LSR) metered and injected under pressure into precision hardened steel tool. Flash-free, fast cycle, high automation potential. Optimal for high-volume precision seals, connectors and medical components.',
    cycleTime: 30, cavities: 16, oee: 0.85, manning: 0.5, reject: 0.008, mouldCost: 28000, mouldLife: 500000, machId: 'lsr-injection-machine', flashFraction: 0.03, showCure: false,
  },
  extrusion_vulcanise: {
    desc: 'Rubber compound extruded through a profile die into continuous length, then vulcanised inline (microwave/hot air) or offline in salt bath / oven, and cut to length. Best for: weatherstrips, hoses, tube profiles, door/window seals. Low tooling cost.',
    cycleTime: 60, cavities: 1, oee: 0.80, manning: 1.5, reject: 0.020, mouldCost: 2500, mouldLife: 500000, machId: 'extruder-rubber-60mm', flashFraction: 0.05, showCure: true,
  },
  calendering: {
    desc: 'Rubber compound sheeted between counter-rotating rolls at controlled gap and temperature. Produces flat rubber sheet or fabric-reinforced composite for subsequent die-cutting. Best for: anti-vibration pads, flat gaskets, sheet goods.',
    cycleTime: 30, cavities: 1, oee: 0.82, manning: 2.0, reject: 0.015, mouldCost: 1200, mouldLife: 500000, machId: 'compression-mould-std', flashFraction: 0.05, showCure: false,
  },
  die_cut: {
    desc: 'Pre-vulcanised rubber sheet punched or blanked to final shape by hydraulic die-cutting press. Very fast cycle, minimal tooling cost. Best for: flat gaskets, anti-vibration pads, seals, washers, strips. Inherently higher material scrap from nesting.',
    cycleTime: 8, cavities: 6, oee: 0.88, manning: 1.0, reject: 0.025, mouldCost: 2000, mouldLife: 500000, machId: 'die-cut-press-rubber', flashFraction: 0.20, showCure: false,
  },
};

function wireRubberProcessChange(): void {
  const procSel = document.getElementById('rub-process') as HTMLSelectElement | null;
  if (!procSel) return;

  const update = () => {
    const proc = procSel.value;
    const def = _RUBBER_PROCESS_DEFS[proc];
    if (!def) return;

    // Update info band
    const band = document.getElementById('rub-process-info');
    if (band) {
      const label = procSel.options[procSel.selectedIndex]?.text ?? proc;
      band.innerHTML = `<strong style="color:var(--text-primary)">${escHtml(label)}</strong> — ${escHtml(def.desc)}`;
    }

    // Show/hide offline cure section (only for extrusion)
    const cureSection = document.getElementById('rub-cure-section');
    if (cureSection) cureSection.style.display = def.showCure ? '' : 'none';

    // Apply process-specific defaults
    const setVal = (id: string, v: number) => {
      const inp = document.getElementById(id) as HTMLInputElement | null;
      if (inp) inp.value = String(v);
    };
    setVal('rub-cycle-sec', def.cycleTime);
    setVal('rub-cavities', def.cavities);
    setVal('rub-oee', def.oee);
    setVal('rub-manning', def.manning);
    setVal('rub-reject', def.reject);
    setVal('rub-mould-cost', def.mouldCost);
    setVal('rub-mould-life', def.mouldLife);

    // Flash weight derived from current part weight × flash fraction
    const partWt = parseFloat((document.getElementById('rub-part-wt') as HTMLInputElement)?.value) || 0.050;
    setVal('rub-flash-wt', parseFloat((partWt * def.flashFraction).toFixed(4)));

    // Switch machine to process-appropriate default
    const machEl = document.getElementById('rub-mach') as HTMLSelectElement | null;
    if (machEl) {
      const opt = Array.from(machEl.options).find(o => o.value === def.machId);
      if (opt) machEl.value = def.machId;
    }
  };

  procSel.addEventListener('change', update);
  update();
}

function renderRubberForm(): string {
  return `
  <div class="section-title">Process &amp; Material</div>
  <div class="field-row">
    <div class="field-group">
      <label>Process Route</label>
      <select id="rub-process">
        <option value="compression_mould">Compression Moulding</option>
        <option value="transfer_mould">Transfer Moulding</option>
        <option value="injection_mould_lsr">Injection Moulding (LSR)</option>
        <option value="extrusion_vulcanise">Extrusion + Vulcanise</option>
        <option value="calendering">Calendering (Sheet/Strip)</option>
        <option value="die_cut">Die-Cut / Punching (Gaskets)</option>
      </select>
    </div>
    <div class="field-group">
      <label>Rubber Compound</label>
      <select id="rub-mat" class="material-select"></select>
    </div>
  </div>
  <div id="rub-process-info" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:8px 12px;margin:6px 0 8px;font-size:0.74rem;color:var(--text-secondary);line-height:1.55"></div>
  <div class="section-title" style="margin-top:2px">Part Geometry</div>
  <div class="field-row">
    <div class="field-group">
      <label title="Finished rubber part weight in kg">Part Weight (kg)</label>
      <input type="number" id="rub-part-wt" step="0.001" min="0.001" value="0.050"/>
    </div>
    <div class="field-group">
      <label title="Flash, sprue and runner weight per part. Compression: ~20% of part wt, Transfer: ~12%, LSR: ~3%, Die-cut: ~20% blanking loss.">Flash + Sprue (kg)</label>
      <input type="number" id="rub-flash-wt" step="0.001" min="0" value="0.010"/>
    </div>
  </div>
  <div class="section-title" style="margin-top:6px">Machine &amp; Labour</div>
  <div class="field-row">
    <div class="field-group"><label>Press / Machine</label><select id="rub-mach" class="machine-select"></select></div>
    <div class="field-group"><label>Labour Grade</label><select id="rub-lab" class="labour-select"></select></div>
  </div>
  <div class="field-row" style="margin-top:4px">
    <div class="field-group">
      <label title="Full cycle time per shot in seconds (mould close to next mould close). Includes loading, cure, eject. Compression: 120–600s, Transfer: 60–240s, LSR: 15–60s, Die-cut: 5–20s per shot.">Cycle Time (sec)</label>
      <input type="number" id="rub-cycle-sec" step="1" min="1" value="180"/>
    </div>
    <div class="field-group">
      <label title="Parts per shot (cavities per mould). Compression: 4–64, Transfer: 4–32, LSR: 8–128, Die-cut: 1–12.">Cavities</label>
      <input type="number" id="rub-cavities" step="1" min="1" value="4"/>
    </div>
  </div>
  <div class="field-row" style="margin-top:4px">
    <div class="field-group">
      <label title="Overall Equipment Effectiveness (0–1). Rubber moulding typical: 0.72–0.82. LSR: 0.82–0.88.">OEE</label>
      <input type="number" id="rub-oee" step="0.01" min="0.30" max="1" value="0.78"/>
    </div>
    <div class="field-group">
      <label title="Operators per machine. Compression: 1–2 (manual flash trim). Transfer: 1. LSR injection: 0.5 (one operator per two machines). Extrusion: 1–2.">Manning</label>
      <input type="number" id="rub-manning" step="0.5" min="0.5" value="1"/>
    </div>
  </div>
  <div class="field-row" style="margin-top:4px">
    <div class="field-group">
      <label title="Labour efficiency (0–1). Productive fraction of shift time — excludes breaks, meetings. Typical: 0.85–0.92.">Labour Efficiency</label>
      <input type="number" id="rub-lab-eff" step="0.01" min="0.50" max="1" value="0.88"/>
    </div>
    <div class="field-group">
      <label title="Scrap/reject fraction (0–1). Compression: 0.02–0.05, Transfer: 0.02–0.04, LSR: 0.005–0.01, Die-cut: 0.02–0.03.">Reject Rate (0–1)</label>
      <input type="number" id="rub-reject" step="0.005" min="0" max="0.30" value="0.030"/>
    </div>
  </div>
  <div id="rub-cure-section" style="display:none">
    <div class="section-title" style="margin-top:6px">Vulcanisation Cure (Offline — Extrusion)</div>
    <div class="field-row">
      <div class="field-group">
        <label title="Separate offline cure oven time in seconds per part. Set to 0 if curing is inline with the extruder (microwave/UHF tunnel).">Cure Time (sec)</label>
        <input type="number" id="rub-cure-sec" step="1" min="0" value="0"/>
      </div>
      <div class="field-group">
        <label>Cure Oven Machine</label>
        <select id="rub-cure-mach" class="machine-select"><option value="">— none —</option></select>
      </div>
    </div>
  </div>
  <div class="section-title" style="margin-top:6px">Tooling &amp; NRE</div>
  <div class="field-row">
    <div class="field-group">
      <label title="Mould / die cost £. Compression 4-cav: £3k–£12k. Transfer 8-cav: £6k–£25k. LSR 16-cav: £15k–£60k. Extrusion die: £1k–£4k. Die-cut tool: £0.5k–£5k.">Mould / Die Cost (£)</label>
      <input type="number" id="rub-mould-cost" step="100" min="0" value="5000"/>
    </div>
    <div class="field-group">
      <label title="Tool life in shots (not parts — multiply by cavities for total parts). Steel compression: 200k–500k shots. LSR hardened: 500k+.">Mould Life (shots)</label>
      <input type="number" id="rub-mould-life" step="10000" min="1000" value="200000"/>
    </div>
  </div>
  <div class="field-row" style="margin-top:4px">
    <div class="field-group">
      <label title="Programme volume to amortise tooling over (total parts). Usually = annual volume × amortisation years (3–5 yr typical).">Amortisation Vol.</label>
      <input type="number" id="rub-amort" step="1000" min="100" value="50000"/>
    </div>
    <div class="field-group">
      <label title="Adhesive primer / bonding agent cost per part (£). For rubber-to-metal bonded mounts and bushes. Set to 0 for plain rubber-only parts.">Bonding Primer (£/part)</label>
      <input type="number" id="rub-primer" step="0.01" min="0" value="0"/>
    </div>
  </div>`;
}

// ─── Form: Composites ─────────────────────────────────────────────────────────

function renderCompositesForm(): string {
  return `
  <div class="section-title">Composite Manufacturing — Material</div>
  <div class="field-row">
    <div class="field-group"><label>Process</label>
      <select id="comp-process">
        <option value="prepreg_layup">Prepreg Hand Layup</option>
        <option value="hand_layup">Wet Hand Layup</option>
        <option value="rtm">RTM / VARTM</option>
        <option value="vartm">VARTM Infusion</option>
        <option value="filament_winding">Filament Winding</option>
        <option value="pultrusion">Pultrusion</option>
      </select>
    </div>
    <div class="field-group"><label>Part Weight (kg)</label><input type="number" id="comp-part-wt" step="0.01" min="0.01" value="1.80" title="Cured finished part weight kg"/></div>
  </div>
  <div class="field-row">
    <div class="field-group"><label>Fibre Price (£/kg)</label><input type="number" id="comp-fibre-price" step="0.50" min="1" value="32.00" title="Dry fabric or prepreg price £/kg. CF prepreg: £28–80, dry CF: £20–35, E-glass prepreg: £6–15, dry GF: £3–6"/></div>
    <div class="field-group"><label>Resin Price (£/kg)</label><input type="number" id="comp-resin-price" step="0.50" min="0" value="0" title="Infusion/RTM resin £/kg. Use 0 for prepreg (resin included in fibre price). Epoxy infusion: £8–18, vinyl ester: £4–8"/></div>
  </div>
  <div class="field-row">
    <div class="field-group"><label>Fibre Weight Fraction</label><input type="number" id="comp-fibre-frac" step="0.01" min="0.30" max="0.75" value="0.60" title="Mass fraction of fibre in cured part. Prepreg: 0.60, hand layup: 0.50, RTM: 0.55, GFRP: 0.45–0.55"/></div>
    <div class="field-group"><label>Waste Fraction</label><input type="number" id="comp-waste-frac" step="0.01" min="0.02" max="0.50" value="0.20" title="Trim/offcut waste fraction. Prepreg hand layup: 0.15–0.30, RTM: 0.05–0.10, pultrusion: 0.02–0.05"/></div>
  </div>
  <div class="field-row">
    <div class="field-group"><label>Area (m²)</label><input type="number" id="comp-area" step="0.01" min="0.01" value="0.65" title="Developed part surface area m²"/></div>
    <div class="field-group"><label>Plies</label><input type="number" id="comp-plies" step="1" min="1" value="8" title="Number of laminate plies"/></div>
  </div>

  <div class="section-title" style="margin-top:6px">Layup Operation</div>
  <div class="field-row">
    <div class="field-group"><label>Layup Labour</label><select id="comp-layup-lab" class="labour-select"></select></div>
    <div class="field-group"><label>Layup Time (hr/part)</label><input type="number" id="comp-layup-time" step="0.10" min="0.05" value="3.50" title="Total layup time hr per part. Hand CF: 2–8hr, prepreg: 1–12hr, RTM: 0.2–1hr"/></div>
  </div>
  <div class="field-row">
    <div class="field-group"><label>OEE</label><input type="number" id="comp-oee" step="0.01" min="0.30" max="1" value="0.78"/></div>
    <div class="field-group"><label>Manning</label><input type="number" id="comp-manning" step="0.5" min="0.5" value="2"/></div>
  </div>
  <div class="field-row">
    <div class="field-group"><label>Labour Efficiency</label><input type="number" id="comp-lab-eff" step="0.01" min="0.50" max="1" value="0.90"/></div>
    <div class="field-group"><label>Reject Rate (0–1)</label><input type="number" id="comp-reject" step="0.01" min="0" max="0.30" value="0.04" title="Composite scrap rate (delamination, porosity, dimensional). 0.03–0.08 typical"/></div>
  </div>

  <div class="section-title" style="margin-top:6px">Cure Operation</div>
  <div class="field-row">
    <div class="field-group"><label>Cure Machine</label><select id="comp-cure-mach" class="machine-select"></select></div>
    <div class="field-group"><label>Cure Labour</label><select id="comp-cure-lab" class="labour-select"></select></div>
  </div>
  <div class="field-row">
    <div class="field-group"><label>Cure Time (hr/cycle)</label><input type="number" id="comp-cure-time" step="0.25" min="0.25" value="4.00" title="Full cure cycle time in machine hr. Autoclave CFRP: 3–8hr; oven: 2–4hr; RTM press: 0.5–2hr"/></div>
    <div class="field-group"><label>Parts per Cure Batch</label><input type="number" id="comp-cure-batch" step="1" min="1" value="4" title="Parts per autoclave/oven load. Autoclave batching reduces per-part cure machine cost significantly"/></div>
  </div>

  <div class="section-title" style="margin-top:6px">Trim &amp; Finish</div>
  <div class="field-row">
    <div class="field-group"><label>Trim Machine (optional)</label><select id="comp-trim-mach" class="machine-select"></select></div>
    <div class="field-group"><label>Trim Labour</label><select id="comp-trim-lab" class="labour-select"></select></div>
  </div>
  <div class="field-row">
    <div class="field-group"><label>Trim + Drill Time (hr)</label><input type="number" id="comp-trim-time" step="0.05" min="0" value="0.50" title="Waterjet/router trim + drill time hr per part. Waterjet CFRP: 0.25–1.5hr; manual: 0.5–3hr"/></div>
    <div class="field-group"><label>NDI Inspection (£/part)</label><input type="number" id="comp-ndi" step="0.50" min="0" value="25.00" title="C-scan/UT NDI cost per part. Automotive structural: £15–50, aerospace: £80–250. Use 0 if no NDI required"/></div>
  </div>

  <div class="section-title" style="margin-top:6px">Tooling</div>
  <div class="field-row">
    <div class="field-group"><label>Mould / Mandrel Cost (£)</label><input type="number" id="comp-tool-cost" step="500" min="500" value="18000" title="Mould/mandrel cost £. Al tool: £8k–50k; CFRP mould: £15k–150k; invar: £100k–500k"/></div>
    <div class="field-group"><label>Tool Life (parts)</label><input type="number" id="comp-tool-life" step="50" min="10" value="400" title="Parts per tool life. Al mould: 500–2000, CFRP mould: 100–400, invar: 2000–5000"/></div>
  </div>
  <div class="field-row">
    <div class="field-group"><label>Amortisation Volume (parts)</label><input type="number" id="comp-amort" step="100" min="10" value="2000"/></div>
  </div>`;
}

// ─── Form: Wiring Harness ─────────────────────────────────────────────────────

function renderWiringHarnessForm(): string {
  return `
  <div class="section-title">Wiring Harness — Purchased Materials</div>
  <div style="font-size:0.72rem;color:#888;margin-bottom:4px">Wire cost = length × price/m for each gauge. Add rows as needed.</div>

  <div id="wire-rows">
    <div class="field-row wire-row" data-idx="0">
      <div class="field-group" style="flex:0.8"><label>Gauge (mm²)</label><input type="number" class="wire-gauge" step="0.25" min="0.1" value="0.50" title="Wire cross-section mm²"/></div>
      <div class="field-group"><label>Length (m)</label><input type="number" class="wire-length" step="0.1" min="0" value="3.20" title="Total harness length for this gauge m"/></div>
      <div class="field-group" style="flex:0.8"><label>Price (£/m)</label><input type="number" class="wire-price" step="0.01" min="0" value="0.10" title="Wire price £/m. 0.5mm²: £0.10, 1.5mm²: £0.18, 4mm²: £0.40"/></div>
    </div>
    <div class="field-row wire-row" data-idx="1">
      <div class="field-group" style="flex:0.8"><label>Gauge (mm²)</label><input type="number" class="wire-gauge" step="0.25" min="0.1" value="1.50"/></div>
      <div class="field-group"><label>Length (m)</label><input type="number" class="wire-length" step="0.1" min="0" value="1.40"/></div>
      <div class="field-group" style="flex:0.8"><label>Price (£/m)</label><input type="number" class="wire-price" step="0.01" min="0" value="0.18"/></div>
    </div>
    <div class="field-row wire-row" data-idx="2">
      <div class="field-group" style="flex:0.8"><label>Gauge (mm²)</label><input type="number" class="wire-gauge" step="0.25" min="0.1" value="4.00"/></div>
      <div class="field-group"><label>Length (m)</label><input type="number" class="wire-length" step="0.1" min="0" value="0.60"/></div>
      <div class="field-group" style="flex:0.8"><label>Price (£/m)</label><input type="number" class="wire-price" step="0.01" min="0" value="0.40"/></div>
    </div>
  </div>

  <div style="margin:4px 0">
    <div class="section-title" style="margin-top:6px">Connectors</div>
    <div id="conn-rows">
      <div class="field-row conn-row" data-idx="0">
        <div class="field-group" style="flex:0.7"><label>Count</label><input type="number" class="conn-count" step="1" min="0" value="4" title="Number of connector housings of this type"/></div>
        <div class="field-group"><label>Cost Each (£)</label><input type="number" class="conn-cost" step="0.10" min="0" value="1.20" title="Connector + terminals cost £ each. 2–6 pin: £0.40–1.20; 12–18 pin: £1.80–4.50"/></div>
        <div class="field-group" style="flex:0.7"><label>Circuits</label><input type="number" class="conn-circuits" step="1" min="1" value="6" title="Pins/circuits per connector"/></div>
        <div class="field-group" style="flex:0.8"><label>Term.Time(s)</label><input type="number" class="conn-term-time" step="1" min="1" value="10" title="Crimp time per terminal s (10s semi-auto, 20s manual)"/></div>
      </div>
      <div class="field-row conn-row" data-idx="1">
        <div class="field-group" style="flex:0.7"><label>Count</label><input type="number" class="conn-count" step="1" min="0" value="2"/></div>
        <div class="field-group"><label>Cost Each (£)</label><input type="number" class="conn-cost" step="0.10" min="0" value="2.80"/></div>
        <div class="field-group" style="flex:0.7"><label>Circuits</label><input type="number" class="conn-circuits" step="1" min="1" value="12"/></div>
        <div class="field-group" style="flex:0.8"><label>Term.Time(s)</label><input type="number" class="conn-term-time" step="1" min="1" value="10"/></div>
      </div>
    </div>
  </div>

  <div class="field-row">
    <div class="field-group"><label>Splices</label><input type="number" id="harn-splices" step="1" min="0" value="6" title="Number of in-line splice connections"/></div>
    <div class="field-group"><label>Splice Cost Each (£)</label><input type="number" id="harn-splice-cost" step="0.01" min="0" value="0.08" title="Splice terminal cost £ each (£0.04–0.15)"/></div>
  </div>
  <div class="field-row">
    <div class="field-group"><label>Conduit Length (m)</label><input type="number" id="harn-conduit-len" step="0.1" min="0" value="2.00" title="Corrugated conduit / protective sleeving total m"/></div>
    <div class="field-group"><label>Conduit Price (£/m)</label><input type="number" id="harn-conduit-price" step="0.01" min="0" value="0.35" title="Conduit £/m (£0.25–1.20 depending on type)"/></div>
  </div>
  <div class="field-row">
    <div class="field-group"><label>Tape (metres)</label><input type="number" id="harn-tape-m" step="0.5" min="0" value="5.00" title="Wiring loom tape total metres (0.5–2× wire length typically)"/></div>
    <div class="field-group"><label>Tape Price (£/m)</label><input type="number" id="harn-tape-price" step="0.005" min="0" value="0.12" title="Loom tape £/m (£0.08–0.25)"/></div>
  </div>

  <div class="section-title" style="margin-top:6px">Assembly &amp; Test</div>
  <div class="field-row">
    <div class="field-group"><label>Assembly Labour</label><select id="harn-asm-lab" class="labour-select"></select></div>
    <div class="field-group"><label>Assembly Time (hr)</label><input type="number" id="harn-asm-time" step="0.05" min="0.01" value="0.45" title="Total manual assembly hr per harness. Simple 5-cct: 0.1hr; complex 80+ cct: 2–6hr"/></div>
  </div>
  <div class="field-row">
    <div class="field-group"><label>OEE</label><input type="number" id="harn-oee" step="0.01" min="0.30" max="1" value="0.85"/></div>
    <div class="field-group"><label>Manning</label><input type="number" id="harn-manning" step="0.5" min="0.5" value="1"/></div>
  </div>
  <div class="field-row">
    <div class="field-group"><label>Labour Efficiency</label><input type="number" id="harn-lab-eff" step="0.01" min="0.50" max="1" value="0.90"/></div>
    <div class="field-group"><label>Reject Rate (0–1)</label><input type="number" id="harn-reject" step="0.01" min="0" max="0.20" value="0.02" title="Harness scrap rate (0.01–0.04 with semi-auto crimping)"/></div>
  </div>
  <div class="field-row">
    <div class="field-group"><label>Test Machine</label><select id="harn-test-mach" class="machine-select"></select></div>
    <div class="field-group"><label>Test Labour</label><select id="harn-test-lab" class="labour-select"></select></div>
  </div>
  <div class="field-row">
    <div class="field-group"><label>Test Time (hr)</label><input type="number" id="harn-test-time" step="0.01" min="0" value="0.05" title="Continuity + HiPot test time hr per harness (0.02–0.15)"/></div>
  </div>

  <div class="section-title" style="margin-top:6px">Tooling (Boarding Board / Routing Jig)</div>
  <div class="field-row">
    <div class="field-group"><label>Board Cost (£)</label><input type="number" id="harn-board-cost" step="50" min="0" value="800" title="Routing/boarding board + jig cost £ (£200–3000 typical)"/></div>
    <div class="field-group"><label>Board Life (parts)</label><input type="number" id="harn-board-life" step="1000" min="100" value="20000" title="Parts per board life (5000–50000)"/></div>
  </div>
  <div class="field-row">
    <div class="field-group"><label>Amortisation Volume (parts)</label><input type="number" id="harn-amort" step="1000" min="100" value="10000"/></div>
  </div>`;
}

// ─── Form: Casting ────────────────────────────────────────────────────────────

function renderCastingForm(): string {
  return `
    <div style="font-size:0.72rem;color:#888;padding:2px 4px 6px;background:#fff8f3;border-radius:4px;border-left:3px solid #e65100;margin-bottom:4px">
      For as-cast parts only. Use <strong>Cast+Machine</strong> if the casting is subsequently machined.
    </div>
    <div class="section-title">Common</div>
    <div class="field-row">
      <div class="field-group"><label>Subtype</label><select id="cast-subtype" title="HPDC: high pressure die casting — fastest, highest tooling. Sand: lowest tooling, any shape. Gravity: medium volume. Investment: best accuracy, highest secondary cost.">
        <option value="hpdc">HPDC</option><option value="sand">Sand</option>
        <option value="gravity">Gravity Die</option><option value="investment">Investment</option>
      </select></div>
      <div class="field-group"><label>Material</label><select id="cast-mat" class="material-select"></select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Part Weight (kg)</label><input type="number" id="cast-part-wt" step="0.01" min="0.001" value="1.2" title="Finished casting weight (as-cast, before any machining). Weigh from CAD or design."/></div>
      <div class="field-group"><label title="Part weight ÷ total pour weight. HPDC: 0.55–0.70 (heavy runners). Sand: 0.70–0.85. Gravity: 0.65–0.80. Investment: 0.85–0.95. Lower yield = more scrap metal cost.">Casting Yield (0–1) ⓘ</label><input type="number" id="cast-yield" step="0.01" min="0.01" max="1" value="0.75" title="Part weight ÷ total pour weight. HPDC: 0.55–0.70 (heavy runners). Sand: 0.70–0.85. Gravity: 0.65–0.80. Investment: 0.85–0.95."/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label title="First-pass reject rate. HPDC Al cosmetic: 0.02–0.05. HPDC functional/pressure: 0.005–0.02. Sand: 0.05–0.15. Affects BOTH material AND machine time (must cast more to hit target yield).">Reject Rate (0–1) ⓘ</label><input type="number" id="cast-reject" step="0.01" min="0" max="0.5" value="0.03" title="First-pass reject rate. HPDC Al cosmetic: 0.02–0.05. HPDC functional: 0.005–0.02. Sand: 0.05–0.15. Uplifts both material and machine time."/></div>
      <div class="field-group"><label>Labour</label><select id="cast-lab" class="labour-select" title="Use Foundry Operative for HPDC/gravity. Use Skilled Machinist for investment/precision work."></select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label title="Overall Equipment Effectiveness. HPDC benchmark: 0.75–0.82 (losses: die spray, thermal cycling, shot sleeve change). Sand: 0.70–0.78. Gravity: 0.72–0.80.">OEE ⓘ</label><input type="number" id="cast-oee" step="0.01" min="0.01" max="1" value="0.8" title="HPDC benchmark: 0.75–0.82. Sand: 0.70–0.78. Gravity: 0.72–0.80."/></div>
      <div class="field-group"><label title="Operators per casting machine. HPDC: 1–2. Sand (manual): 2–3. Investment (pour): 1–2.">Manning ⓘ</label><input type="number" id="cast-manning" step="0.5" min="0" value="1" title="Operators per machine. HPDC: 1–2. Sand manual: 2–3."/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Labour Eff.</label><input type="number" id="cast-lab-eff" step="0.01" min="0.01" max="1" value="0.92" title="Labour efficiency: accounts for breaks, waiting, indirect time. 0.90–0.95 typical."/></div>
      <div class="field-group"><label title="Lifetime production volume over which tooling cost is amortised. Use total programme volume (e.g. 5-year platform life × annual volume). Directly sets tooling cost per part.">Amort. Volume ⓘ</label><input type="number" id="cast-amort" step="1000" min="1" value="200000" title="Total programme volume for tooling amortisation. Die life and cavity count determine how many die sets are needed across this volume."/></div>
    </div>
    <!-- HPDC -->
    <div id="cast-hpdc" class="cast-section">
      <div class="section-title" style="margin-top:8px">HPDC — High Pressure Die Casting</div>
      <div style="font-size:0.7rem;color:#888;margin-bottom:4px">Typical: 500–1600T machines, 30–90s cycle, 1–4 cavities. Total die cost = die cost per set × ceil(volume ÷ (life × cavities)).</div>
      <div class="field-row">
        <div class="field-group"><label>Machine</label><select id="cast-hpdc-mach" class="machine-select"></select></div>
        <div class="field-group"><label title="Full HPDC cycle: slow shot + fast shot + solidification + die open + spray + part removal. Al 1–5kg: 35–80s. Large structural: 60–120s.">Cycle Time (s) ⓘ</label><input type="number" id="cast-hpdc-ct" step="1" min="1" value="45" title="Full HPDC cycle: slow+fast shot, solidification, die open, spray, part removal. Small Al part: 30–60s. Medium (1–3kg): 45–90s. Large: 80–150s."/></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label title="Number of parts produced per shot. 1–2 cavities for large parts (>1kg). 4–8 cavities for small parts (<0.3kg). Multi-cavity reduces part cost but increases die cost ~1.5–1.8× per additional cavity.">Cavities ⓘ</label><input type="number" id="cast-hpdc-cav" min="1" step="1" value="2" title="Parts per shot. More cavities = lower piece cost, higher die cost. Multi-cavity factor: 2-cav ≈ 1.5× single-cav die cost."/></div>
        <div class="field-group"><label title="Cost per die set (complete tool with all inserts). Al HPDC small (≤0.5kg): £40–80k. Medium (0.5–3kg): £80–180k. Large (3kg+): £150–350k. Includes steel, machining, trials.">Die Cost (£) ⓘ</label><input type="number" id="cast-hpdc-die-cost" step="1000" min="0" value="120000" title="Cost per die set. Al HPDC small: £40–80k. Medium: £80–180k. Large: £150–350k."/></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label title="Shots before die requires major refurbishment or replacement. Al alloys: 80,000–300,000 shots. Zinc: 500,000–2,000,000 shots. Die life × cavities = parts per die set. Tool cost = die cost × ceil(volume ÷ parts per set).">Die Life (shots) ⓘ — affects total die cost</label><input type="number" id="cast-hpdc-die-life" step="1000" min="0" value="200000" title="Shots before die replacement. Al: 80k–300k. Zinc: 500k–2M. Formula: total die sets = ceil(amort volume ÷ (die life × cavities))."/></div>
      </div>
    </div>
    <!-- Sand -->
    <div id="cast-sand" class="cast-section">
      <div class="section-title" style="margin-top:8px">Sand Casting</div>
      <div style="font-size:0.7rem;color:#888;margin-bottom:4px">Core cost is classified as a per-part material consumable (not tooling). Pattern cost amortised by pattern life.</div>
      <div class="field-row">
        <div class="field-group"><label>Mould Line</label><select id="cast-sand-line" class="machine-select"></select></div>
        <div class="field-group"><label title="Time per mould: mould preparation + pour + solidification + knockout. Small iron: 0.3–0.5hr. Medium Al: 0.4–0.8hr. Large iron/steel: 1–4hr.">Cycle Time (hr) ⓘ</label><input type="number" id="cast-sand-ct" step="0.1" min="0.01" value="0.5" title="Per-part mould cycle. Small Al: 0.3–0.5hr. Medium: 0.5–1hr. Large iron: 1–4hr."/></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label>Pattern Cost (£)</label><input type="number" id="cast-sand-pat-cost" step="100" min="0" value="5000" title="Pattern/core box cost. Wood pattern: £500–5k. Aluminium: £2k–25k. Multiple patterns for complex parts."/></div>
        <div class="field-group"><label title="Castings before pattern wears out. Wood: 500–5,000. Al: 5,000–50,000. Pattern cost = pattern cost × ceil(volume ÷ pattern life).">Pattern Life (casts) ⓘ</label><input type="number" id="cast-sand-pat-life" step="100" min="0" value="10000" title="Castings per pattern. Wood: 500–5k. Aluminium: 5k–50k. Pattern replacements calculated automatically."/></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label title="Cost of sand cores per casting. Simple cavity core: £0.50–2.00. Complex multi-core: £2–8. Water jacket core: £3–12. Appears in MATERIAL cost line, not tooling.">Core Cost/Part (£) ⓘ — material cost</label><input type="number" id="cast-sand-core" step="0.1" min="0" value="1.5" title="Per-part core cost (sand + binder + labour). Classified as material consumable, not tooling. Simple: £0.50–2. Complex: £2–8."/></div>
      </div>
    </div>
    <!-- Gravity -->
    <div id="cast-gravity" class="cast-section">
      <div class="section-title" style="margin-top:8px">Gravity Die Casting</div>
      <div class="field-row">
        <div class="field-group"><label>Machine</label><select id="cast-grav-mach" class="machine-select"></select></div>
        <div class="field-group"><label title="Tilt/gravity die cycle: load + pour + solidify + tilt + extract. Al: 2–6 min (0.033–0.1hr). Fe/Cu alloys: longer due to thermal mass.">Cycle Time (hr) ⓘ</label><input type="number" id="cast-grav-ct" step="0.01" min="0.01" value="0.083" title="Gravity die cycle. Al small: 0.03–0.06hr. Medium: 0.07–0.12hr. Large: 0.12–0.25hr."/></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label>Mould Cost (£)</label><input type="number" id="cast-grav-mould-cost" step="1000" min="0" value="20000" title="Permanent mould (gravity die) cost. Simple: £8–20k. Complex with slides: £20–60k."/></div>
        <div class="field-group"><label title="Castings before mould refurbishment. Al alloys: 30,000–100,000. Mould replacements calculated automatically from volume ÷ life.">Mould Life (casts) ⓘ</label><input type="number" id="cast-grav-mould-life" step="1000" min="0" value="50000" title="Castings per mould. Al: 30k–100k. Mould sets = ceil(volume ÷ mould life)."/></div>
      </div>
    </div>
    <!-- Investment -->
    <div id="cast-invest" class="cast-section">
      <div class="section-title" style="margin-top:8px">Investment Casting (Lost Wax)</div>
      <div style="font-size:0.7rem;color:#888;margin-bottom:4px">Wax and shell costs appear in the MATERIAL cost line as recurring consumables.</div>
      <div class="field-row">
        <div class="field-group"><label>Pour Machine</label><select id="cast-inv-mach" class="machine-select"></select></div>
        <div class="field-group"><label>Pour Labour</label><select id="cast-inv-lab" class="labour-select"></select></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label>Pour Cycle (hr)</label><input type="number" id="cast-inv-ct" step="0.01" min="0.01" value="0.5" title="Pour + solidification + knockout time. Simple small: 0.3–0.5hr. Complex: 0.5–1hr."/></div>
        <div class="field-group"><label title="Cost of wax pattern per part (injection moulded wax). Small: £0.30–1.20. Medium: £0.80–2.50. Classified as MATERIAL cost (recurring consumable).">Wax Cost/Part (£) ⓘ</label><input type="number" id="cast-inv-wax" step="0.1" min="0" value="0.80" title="Wax pattern injection cost per part. Small: £0.30–1.20. Medium: £0.80–2.50. Classified as material consumable."/></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label title="Ceramic shell build cost per part (multiple dip coats + stucco + dry). Simple: £0.80–2.00. Complex: £1.50–5.00. Classified as MATERIAL cost.">Shell Cost/Part (£) ⓘ</label><input type="number" id="cast-inv-shell" step="0.1" min="0" value="1.20" title="Ceramic shell build per part. Simple: £0.80–2.00. Complex: £1.50–5.00. Classified as material consumable."/></div>
      </div>
      <div class="field-row" style="margin-top:6px">
        <div class="field-group"><label title="Fraction of wax recovered via dewaxing autoclave and reused. Typical: 80–90% (0.80–0.90). Reduces effective wax cost per part. Lost wax = 10–20% contamination/loss.">Wax Recovery (0–1) ⓘ</label><input type="number" id="cast-inv-wax-rec" step="0.05" min="0" max="1" value="0.80" title="Wax recovery fraction via autoclave dewaxing. 0.80 = 80% reused. Typical foundry: 0.75–0.90."/></div>
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
      <div class="field-group"><label>Time/Blow (s) <span title="Seconds per blow including dwell and ram travel. Default 10s. Used to compute cycle time when Cycle Time (hr) is 0.">ℹ</span></label><input type="number" id="forge-time-per-blow" step="1" min="1" value="10"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Cycle Time (hr) <span title="Explicit cycle time override. Set to 0 to compute from Strokes × Time/Blow.">ℹ</span></label><input type="number" id="forge-ct" step="0.001" min="0" value="0"/></div>
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
      <div class="field-group"><label>Cycle Time (hr)</label><input type="number" id="${id}-ct" step="0.001" min="0.0001" value="${d?.cycleTimeHr ?? 0.0167}"/></div>
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
    ${buildPCBImageUploadZone()}
    <div id="pcb-img-results"></div>
    <div class="section-title">PCB Technology & Quality</div>
    <div class="field-row">
      <div class="field-group"><label>PCB Technology</label><select id="pcbf-technology">
        <option value="FR4_STD">FR4 Standard (1–8L, Tg 130°C)</option>
        <option value="FR4_HTg">FR4 High-Tg (4–16L, Tg 150–170°C)</option>
        <option value="HDI_RIGID" selected>HDI Rigid (6–24L, microvias)</option>
        <option value="RIGID_FLEX">Rigid-Flex (polyimide + FR4)</option>
        <option value="FLEX">Pure Flex (polyimide, 1–6L)</option>
        <option value="RF_MICRO">RF/Microwave (Rogers/PTFE)</option>
        <option value="MCPCB">Metal-Core PCB (MCPCB)</option>
        <option value="CERAMIC">Ceramic Substrate</option>
      </select></div>
      <div class="field-group"><label>Quality Grade</label><select id="pcbf-quality">
        <option value="consumer">Consumer (IPC Class 1)</option>
        <option value="industrial">Industrial (IPC Class 2)</option>
        <option value="auto_grade2">Automotive Grade 2 (AEC-Q)</option>
        <option value="auto_grade1" selected>Automotive Grade 1 (IATF 16949)</option>
        <option value="aerospace">Aerospace (IPC Class 3 / AS9100)</option>
      </select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Sourcing Region</label><select id="pcbf-region">
        <option value="uk" selected>UK</option>
        <option value="eu">EU</option>
        <option value="china">China</option>
        <option value="india">India</option>
        <option value="na">North America</option>
      </select></div>
      <div class="field-group"><label>Layer Count</label><select id="pcbf-layers">
        <option value="1">1 Layer</option>
        <option value="2">2 Layers</option>
        <option value="4">4 Layers</option>
        <option value="6">6 Layers</option>
        <option value="8" selected>8 Layers</option>
        <option value="10">10 Layers</option>
        <option value="12">12 Layers</option>
        <option value="16">16 Layers</option>
        <option value="20">20 Layers</option>
        <option value="24">24 Layers</option>
      </select></div>
    </div>

    <div class="section-title" style="margin-top:8px">Board Geometry</div>
    <div class="field-row">
      <div class="field-group"><label>Board Width (mm)</label><input type="number" id="pcbf-board-w" step="1" min="5" value="200"/></div>
      <div class="field-group"><label>Board Height (mm)</label><input type="number" id="pcbf-board-h" step="1" min="5" value="150"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Panel Width (mm)</label><input type="number" id="pcbf-panel-w" step="50" min="100" value="500"/></div>
      <div class="field-group"><label>Panel Height (mm)</label><input type="number" id="pcbf-panel-h" step="50" min="100" value="600"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Panel Utilisation (0–1)</label><input type="number" id="pcbf-panel-util" step="0.01" min="0.1" max="1" value="0.72"/></div>
      <div class="field-group"><label>Base Material Tg (°C)</label><select id="pcbf-tg">
        <option value="130">130°C — Standard FR4</option>
        <option value="150">150°C — Mid-Tg FR4</option>
        <option value="170" selected>170°C — High-Tg FR4</option>
      </select></div>
    </div>

    <div class="section-title" style="margin-top:8px">Copper & Stack-Up</div>
    <div class="field-row">
      <div class="field-group"><label>Inner Copper (oz/ft²)</label><select id="pcbf-cu">
        <option value="0.5">0.5 oz — signal layers</option>
        <option value="1" selected>1 oz — standard</option>
        <option value="2">2 oz — power/ground</option>
      </select></div>
      <div class="field-group"><label>Outer Copper (oz/ft²)</label><select id="pcbf-outer-cu">
        <option value="1" selected>1 oz — standard</option>
        <option value="2">2 oz — power</option>
        <option value="3">3 oz — high current</option>
      </select></div>
    </div>

    <div class="section-title" style="margin-top:8px">Via Technology</div>
    <div class="field-row">
      <div class="field-group"><label>Via Type</label><select id="pcbf-via-type">
        <option value="through_only">Through-hole only</option>
        <option value="through_blind">Through + Blind vias</option>
        <option value="through_blind_buried">Through + Blind + Buried</option>
        <option value="microvia_hdi" selected>Microvias (HDI laser-drilled)</option>
      </select></div>
      <div class="field-group"><label>HDI Structure</label><select id="pcbf-hdi-structure">
        <option value="none">None — standard through-vias</option>
        <option value="1plus_n_plus1" selected>1+N+1 — single build-up</option>
        <option value="2plus_n_plus2">2+N+2 — double build-up</option>
        <option value="any_layer">Any-layer HDI</option>
      </select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Through-Vias / Board</label><input type="number" id="pcbf-vias" step="10" min="0" value="300"/></div>
      <div class="field-group"><label>Blind Vias / Board</label><input type="number" id="pcbf-blind-vias" step="10" min="0" value="0"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Buried Vias / Board</label><input type="number" id="pcbf-buried-vias" step="10" min="0" value="0"/></div>
      <div class="field-group"><label>Micro-Vias / Board</label><input type="number" id="pcbf-uvias" step="50" min="0" value="200"/></div>
    </div>

    <div class="section-title" style="margin-top:8px">Design Rules & Features</div>
    <div class="field-row">
      <div class="field-group"><label>Min Trace/Space (mm)</label><select id="pcbf-trace">
        <option value="0.20">0.20 mm — standard</option>
        <option value="0.15">0.15 mm — fine pitch</option>
        <option value="0.10" selected>0.10 mm — HDI</option>
        <option value="0.075">0.075 mm — ultra-HDI</option>
      </select></div>
      <div class="field-group"><label>Surface Finish</label><select id="pcbf-finish">
        <option value="hasl">HASL (leaded)</option>
        <option value="hasl_lf">HASL Lead-Free</option>
        <option value="osp">OSP</option>
        <option value="enig" selected>ENIG (automotive std)</option>
        <option value="enepig">ENEPIG (wire bond)</option>
        <option value="iteq">ITEQ / ImAg</option>
      </select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Solder Mask Colour</label><select id="pcbf-solder-mask">
        <option value="green" selected>Green (standard)</option>
        <option value="black">Black</option>
        <option value="white">White</option>
        <option value="red">Red</option>
        <option value="blue">Blue</option>
      </select></div>
      <div class="field-group"><label>Silkscreen Sides</label><select id="pcbf-silkscreen">
        <option value="0">None</option>
        <option value="1">1 side</option>
        <option value="2" selected>2 sides</option>
      </select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group" style="display:flex;align-items:center;gap:8px;padding-top:18px">
        <input type="checkbox" id="pcbf-impedance" checked/>
        <label for="pcbf-impedance" style="font-weight:normal">Impedance controlled (+18%)</label>
      </div>
      <div class="field-group" style="display:flex;align-items:center;gap:8px;padding-top:18px">
        <input type="checkbox" id="pcbf-bga"/>
        <label for="pcbf-bga" style="font-weight:normal">Fine-pitch BGA ≤0.65 mm</label>
      </div>
    </div>

    <div class="section-title" style="margin-top:8px">Testing & Inspection</div>
    <div class="field-row">
      <div class="field-group"><label>Test Method</label><select id="pcbf-test-method">
        <option value="none">None</option>
        <option value="aoi_only">AOI only</option>
        <option value="flying_probe" selected>Flying Probe (electrical)</option>
        <option value="ict_fixtureless">ICT Fixtureless</option>
        <option value="ict_fixture">ICT Bed-of-Nails Fixture</option>
        <option value="ict_xray">ICT + X-Ray (BGA/CSP)</option>
      </select></div>
      <div class="field-group"><label>Fab Yield Override (0–1, leave 0 for auto)</label><input type="number" id="pcbf-yield" step="0.01" min="0" max="1" value="0"/></div>
    </div>

    <div class="section-title" style="margin-top:8px">NRE & Amortisation</div>
    <div class="field-row">
      <div class="field-group"><label>NRE Cost (£)</label><input type="number" id="pcbf-nre" step="100" min="0" value="2500"/></div>
      <div class="field-group"><label>Amortisation Volume</label><input type="number" id="pcbf-amort" step="1000" min="1" value="5000"/></div>
    </div>`;
}

// ─── Form: PCBA / SMD ─────────────────────────────────────────────────────────

function renderPCBAForm(): string {
  return `
    ${buildPCBImageUploadZone()}
    <div id="pcb-img-results"></div>
    <div class="section-title">Complexity &amp; Grade</div>
    <div class="field-row">
      <div class="field-group"><label>Assembly Complexity <span title="Multiplies SMT placement time. Low=×1.0 (≤100 comps, no BGAs), Medium=×1.3 (100–300, fine-pitch), High=×1.7 (>300, BGAs, 2-sided), Very High=×2.0 (ADAS/domain)">ℹ</span></label>
        <select id="pcba-complexity">
          <option value="low" selected>Low ≤100 comps (×1.0)</option>
          <option value="medium">Medium 100–300, fine-pitch (×1.3)</option>
          <option value="high">High >300, BGAs, 2-sided (×1.7)</option>
          <option value="very_high">Very High — ADAS/Domain (×2.0)</option>
        </select>
      </div>
      <div class="field-group"><label>Quality Grade <span title="Multiplies test/inspection time. Auto Gr.2=×1.5, Gr.1=×1.8">ℹ</span></label>
        <select id="pcba-quality">
          <option value="consumer" selected>Consumer (×1.0)</option>
          <option value="industrial">Industrial (×1.2)</option>
          <option value="auto_grade2">Automotive Grade 2 (×1.5)</option>
          <option value="auto_grade1">Automotive Grade 1 (×1.8)</option>
          <option value="aerospace">Aerospace (×2.2)</option>
        </select>
      </div>
    </div>
    <div class="section-title" style="margin-top:8px">PCB &amp; SMT</div>
    <div class="field-row">
      <div class="field-group"><label>PCB Cost/Board (£)</label><input type="number" id="pcba-pcb-cost" step="0.1" min="0" value="2.50"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>SMT Machine</label><select id="pcba-smt-mach" class="machine-select"></select></div>
      <div class="field-group"><label>SMT Labour</label><select id="pcba-smt-lab" class="labour-select"></select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>SMT Lines</label><input type="number" id="pcba-smt-lines" step="1" min="1" value="1"/></div>
      <div class="field-group"><label>SMT Throughput (CPH) <span title="Components placed per hour per SMT line. Typical: 15,000–25,000 CPH for mixed boards (0402+IC). Modern high-speed: 50,000–100,000 CPH for passives only.">ℹ</span></label><input type="number" id="pcba-smt-rate" step="1000" min="500" value="15000"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>SMT OEE</label><input type="number" id="pcba-smt-oee" step="0.01" min="0.01" max="1" value="0.85"/></div>
      <div class="field-group"><label>SMT Sides <span title="1 = single-sided (1 SMT pass). 2 = double-sided (2× placement passes through the line).">ℹ</span></label><select id="pcba-smt-sides"><option value="1" selected>1 — Single-sided</option><option value="2">2 — Double-sided</option></select></div>
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
    <div class="section-title" style="margin-top:8px">Inspection &amp; Test</div>
    <div class="field-row">
      <div class="field-group"><label>BGA Count <span title="Number of BGA packages. If >0 and X-ray machine is set, an X-ray inspection operation is added.">ℹ</span></label><input type="number" id="pcba-bga-count" step="1" min="0" value="0"/></div>
      <div class="field-group"><label>ICT Cycle Time (s)</label><input type="number" id="pcba-ict-time" step="10" min="0" value="0" title="ICT fixture test time per board. 0 = no ICT operation. Typical: 90–180 s."/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>X-Ray Machine <span title="Required if BGA Count > 0. Select 'xray-bga-inspection' (£90/hr).">ℹ</span></label><select id="pcba-xray-mach" class="machine-select"></select></div>
      <div class="field-group"><label>ICT Machine <span title="Select 'ict-automotive' (£110/hr) or leave at default for no ICT.">ℹ</span></label><select id="pcba-ict-mach" class="machine-select"></select></div>
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
    <div class="section-title" style="margin-top:8px">Conformal Coating <span style="font-weight:400;font-size:0.8em;color:#888">(optional — automotive/aerospace/marine)</span></div>
    <div class="field-row">
      <div class="field-group"><label>Coated Area (cm²) <span title="Board area covered by conformal coat. 0 = no conformal coating.">ℹ</span></label><input type="number" id="pcba-coat-area" step="1" min="0" value="0"/></div>
      <div class="field-group"><label>Coat Price (£/cm²) <span title="Typical selective coat: £0.003–0.008/cm². Full-board dip: £0.001–0.003/cm².">ℹ</span></label><input type="number" id="pcba-coat-price" step="0.001" min="0" value="0.005"/></div>
    </div>
    <div class="section-title" style="margin-top:8px">NRE Costs <span style="font-weight:400;font-size:0.8em;color:#888">(amortised over programme life)</span></div>
    <div class="field-row">
      <div class="field-group"><label>NRE Total (£) <span title="Solder paste stencil, ICT fixture, programming, AOI setup. Typical: £500–£5,000.">ℹ</span></label><input type="number" id="pcba-nre-cost" step="100" min="0" value="0"/></div>
      <div class="field-group"><label>NRE Amort. Volume <span title="Programme volume over which NRE is spread. Usually equals amortisation volume above.">ℹ</span></label><input type="number" id="pcba-nre-amort" step="1000" min="1" value="5000"/></div>
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
    'passive_0402','passive_0603','passive_0805',
    'crystal_osc','power_module','transformer','led','relay_switch','fuse_tvs',
    'ic_soic','ic_qfn','ic_bga','ic_tqfp',
    'connector_smt','through_hole','manual_solder',
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
    const { rows } = parseBOMCSV(text);
    el('bom-body').innerHTML = '';
    bomCount = 0;
    for (const row of rows) {
      addBOMRow(row);
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
        <div class="field-group"><label>Wax Die Cost (£) <span title="One-off wax die tooling cost. Typically £3,000–15,000.">ℹ</span></label><input type="number" id="cam-inv-wax-die" step="100" min="0" value="5000"/></div>
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
    </div>
    <div class="section-title" style="margin-top:8px">Post-Casting Secondary Operations</div>
    <div style="font-size:0.7rem;color:#888;margin-bottom:4px">These costs are added to the material cost line. Leave at 0 if not applicable. Check specification for mandatory operations.</div>
    <div class="field-row">
      <div class="field-group"><label title="T5 (artificial ageing only) or T6 (solution treat + ageing) heat treatment. Structural Al castings (EDU housings, brackets, knuckles) typically REQUIRE T6. T5: £0.80–1.40/kg. T6: £1.40–2.80/kg. Enter 0 if not required.">Heat Treatment (£/kg) ⓘ</label><input type="number" id="cam-ht-cost" step="0.1" min="0" value="0" title="T5: £0.80–1.40/kg. T6: £1.40–2.80/kg. Leave 0 if not required."/></div>
      <div class="field-group"><label title="Shot blast, vibratory deburr, or tumbling. Mandatory for most OEM castings to remove flash and improve surface finish. Typical: £0.15–0.40/part for small, £0.30–0.80 for large. Enter 0 if surface as-cast is acceptable.">Shot Blast / Deburr (£/part) ⓘ</label><input type="number" id="cam-shot-blast" step="0.05" min="0" value="0" title="Shot blast / vibratory deburr. Typical: £0.15–0.40/part small, £0.30–0.80 large."/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label title="Vacuum or pressure impregnation (Ultraseal / Loctite process) to seal micro-porosity. Required for pressure-critical parts: fuel rails, oil passages, coolant circuits. Typical: £0.80–1.80/part depending on part size.">Impregnation (£/part) ⓘ</label><input type="number" id="cam-impreg" step="0.1" min="0" value="0" title="Vacuum impregnation for pressure-critical castings. Typical: £0.80–1.80/part."/></div>
      <div class="field-group"><label title="Manual fettling / gate removal / deburring labour cost per part if not covered by shot blast. Complex castings: £0.20–1.20/part. Simple HPDC trim press: £0.05–0.15/part.">Fettling / Gate Remove (£/part) ⓘ</label><input type="number" id="cam-fettle" step="0.05" min="0" value="0" title="Manual fettling / gate removal. Simple HPDC with trim press: £0.05–0.15. Complex: £0.20–1.20."/></div>
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
      <div class="field-group"><label>Cycle Time (hr)</label><input type="number" id="${id}-ct" step="0.001" min="0.0001" value="${d?.cycleTimeHr ?? 0.05}"/></div>
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
             value="${sessionStorage.getItem('cad-api-key') ?? ''}" style="font-family:monospace;font-size:0.8rem"/>
    </div>
    <div class="cad-btn-row">
      <button class="btn btn-secondary" id="cad-analyze-btn" disabled>
        Analyze Only
      </button>
      <button class="btn btn-primary" id="cad-analyze-calc-btn" disabled>
        Analyze &amp; Calculate ⚡
      </button>
    </div>
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
    cadFile = null; cadAnalysisResult = null; cadOCCTGeometry = null;
    el('cad-file-info').style.display = 'none';
    el('cad-drop-zone').style.display = '';
    analyzeBtn.setAttribute('disabled', 'true');
    el('cad-analyze-calc-btn').setAttribute('disabled', 'true');
    el('cad-results').innerHTML = '';
  });

  // Analyze button
  analyzeBtn.addEventListener('click', () => { void analyzeCAD(false); });
  el('cad-analyze-calc-btn')?.addEventListener('click', () => { void analyzeCAD(true); });
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
  el('cad-analyze-calc-btn').removeAttribute('disabled');
  el('cad-results').innerHTML = '';
  cadAnalysisResult = null;
  cadOCCTGeometry = null;
}

async function analyzeCAD(autoCalculate = false): Promise<void> {
  if (!cadFile) return;

  const apiKey = val('cad-api-key');
  if (apiKey) sessionStorage.setItem('cad-api-key', apiKey);

  const progress = el('cad-progress-wrap');
  const progressFill = el('cad-progress-fill');
  const progressLabel = el('cad-progress-label');
  const analyzeBtn = el('cad-analyze-btn');
  const analyzeCalcBtn = el('cad-analyze-calc-btn');

  const updateProgress = (pct: number, label: string) => {
    progressFill.style.width = pct + '%';
    progressLabel.textContent = label;
  };

  progress.style.display = '';
  analyzeBtn.setAttribute('disabled', 'true');
  analyzeCalcBtn.setAttribute('disabled', 'true');
  el('cad-results').innerHTML = '';

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(new DOMException('Analysis timed out after 150s', 'TimeoutError')),
    150_000,
  );

  try {
    updateProgress(10, 'Uploading file…');
    const formData = new FormData();
    formData.append('cadFile', cadFile);

    const headers: HeadersInit = {};
    if (apiKey) headers['x-api-key'] = apiKey;

    updateProgress(20, 'Running OCCT geometry engine…');
    const res = await fetch('/api/cad/analyze', {
      method: 'POST', headers, body: formData, signal: controller.signal,
    });

    updateProgress(85, 'AI feature analysis…');
    const data = await res.json() as {
      success?: boolean;
      analysis?: CADAnalysisResult;
      occtGeometry?: OCCTGeometry | null;
      geometrySource?: 'occt' | 'text_parsing';
      error?: string;
    };

    if (!res.ok || !data.success) throw new Error(data.error ?? `Server error ${res.status}`);

    updateProgress(100, data.geometrySource === 'occt' ? 'OCCT complete — precise geometry extracted' : 'Complete (text-parsed)');
    cadAnalysisResult = data.analysis!;
    cadOCCTGeometry = data.occtGeometry ?? null;
    cadGeometrySource = data.geometrySource ?? 'text_parsing';

    const partNameEl = el<HTMLInputElement>('part-name');
    if (partNameEl && cadAnalysisResult.partName) partNameEl.value = cadAnalysisResult.partName;

    setTimeout(() => { progress.style.display = 'none'; }, 600);
    renderCADResults(cadAnalysisResult, autoCalculate);
  } catch (err) {
    progress.style.display = 'none';
    el('cad-results').innerHTML = `
      <div class="risk-card High" style="margin-top:10px">
        <div class="risk-feature">Analysis Error</div>
        <div>${escHtml(err instanceof Error ? err.message : String(err))}</div>
        <div class="risk-suggestion">Ensure the API server is running (<code>npm run server</code>) and ANTHROPIC_API_KEY is configured.</div>
      </div>`;
  } finally {
    clearTimeout(timeoutId);
    analyzeBtn.removeAttribute('disabled');
    analyzeCalcBtn.removeAttribute('disabled');
  }
}

function renderCADResults(r: CADAnalysisResult, autoCalculate = false): void {
  const panel = el('cad-results');
  const g = r.geometry;
  const bb = g.boundingBoxMm;
  const scoreClass = r.manufacturabilityScore >= 75 ? 'score-high' : r.manufacturabilityScore >= 50 ? 'score-med' : 'score-low';

  const recommendedCommodity = r.costInputSuggestions.recommendedCommodity as CommodityType;
  const commodityLabel: Record<string, string> = {
    machining: 'Machining', sheet_metal: 'Sheet Metal', sheet_metal_fab: 'SM Fab',
    injection_moulding: 'Injection Moulding', casting: 'Casting', forging: 'Forging',
    cast_and_machine: 'Cast+Machine', rubber: 'Rubber', composites: 'Composites',
    blow_moulding: 'Blow Moulding', thermoforming: 'Thermoforming',
    rotational_moulding: 'Rotomoulding', wiring_harness: 'Harness',
    extrusion: 'Extrusion', pcb_fab: 'PCB Fab', pcba: 'PCBA',
    biw_assembly: 'BIW Assembly', painting: 'Painting', assembly: 'Assembly',
  };

  // Build OCCT geometry panel HTML
  const occtPanel = buildOCCTPanel(cadOCCTGeometry, cadGeometrySource);

  panel.innerHTML = `
    <!-- Header summary -->
    <div style="display:flex;align-items:center;gap:16px;padding:12px 0;border-bottom:1px solid var(--border);margin-bottom:12px">
      <div style="text-align:center">
        <div class="cad-score-ring ${scoreClass}">${r.manufacturabilityScore}</div>
        <div style="font-size:0.7rem;color:var(--text-muted)">Manufacturability</div>
      </div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:0.9rem">${escHtml(r.partName)}</div>
        <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px">
          ${bb.x.toFixed(0)}×${bb.y.toFixed(0)}×${bb.z.toFixed(0)} mm &nbsp;·&nbsp;
          ${g.estimatedVolumeCm3.toFixed(1)} cm³ &nbsp;·&nbsp;
          ${g.estimatedWeightKg.aluminum.toFixed(3)} kg Al / ${g.estimatedWeightKg.steel.toFixed(3)} kg Steel
        </div>
        <div style="margin-top:4px">
          <span class="cad-confidence-badge ${r.confidenceLevel}">AI: ${r.confidenceLevel}</span>
          &nbsp;
          <span class="occt-source-badge ${cadGeometrySource === 'occt' ? 'occt' : 'text'}">${cadGeometrySource === 'occt' ? 'OCCT Kernel' : 'Text-parsed'}</span>
          &nbsp;
          <span style="font-size:0.72rem;color:var(--text-muted)">${g.estimatedSurfaceAreaCm2.toFixed(0)} cm² surface</span>
          ${r.costInputSuggestions.stage1Selection ? `&nbsp;<span style="font-size:0.68rem;background:var(--border);border-radius:3px;padding:1px 5px;color:var(--text-muted)" title="Stage 1 Haiku pre-selection">⚡ ${escHtml(r.costInputSuggestions.stage1Selection.primary)} (${Math.round((r.costInputSuggestions.stage1Selection.conf ?? 0) * 100)}%)</span>` : ''}
        </div>
      </div>
    </div>

    ${occtPanel}

    <!-- Detected features -->
    <div style="margin-bottom:12px">
      <div class="panel-title" style="margin-bottom:6px">Detected Features</div>
      <div>
        ${r.detectedFeatures.map(f =>
          `<span class="feature-badge ${f.significance}" title="${escHtml(f.description)}">${escHtml(f.type)}${f.count > 1 ? ' ×' + f.count : ''}</span>`
        ).join('')}
      </div>
    </div>

    <!-- Material suggestion -->
    <div style="margin-bottom:12px">
      <div class="panel-title" style="margin-bottom:6px">Material Analysis</div>
      <div style="font-size:0.8rem">
        <strong>${escHtml(r.materialAnalysis.primarySuggestion.name)}</strong>
        <span class="cad-confidence-badge ${r.materialAnalysis.primarySuggestion.confidencePct >= 75 ? 'High' : r.materialAnalysis.primarySuggestion.confidencePct >= 50 ? 'Medium' : 'Low'}"
              style="margin-left:6px">${r.materialAnalysis.primarySuggestion.confidencePct}%</span>
        ${r.materialAnalysis.fromMetadata ? '<span style="font-size:0.7rem;color:var(--green);margin-left:6px">✓ from CAD metadata</span>' : ''}
        <div style="color:var(--text-secondary);margin-top:3px">${escHtml(r.materialAnalysis.primarySuggestion.reasoning)}</div>
        ${r.materialAnalysis.alternatives.length > 0 ? `
          <div style="margin-top:4px;font-size:0.72rem;color:var(--text-muted)">
            Alternatives: ${r.materialAnalysis.alternatives.map(a => `${escHtml(a.name)} (${a.confidencePct}%)`).join(', ')}
          </div>` : ''}
      </div>
    </div>

    <!-- Process recommendations -->
    <div style="margin-bottom:12px">
      <div class="panel-title" style="margin-bottom:6px">Process Recommendations</div>
      ${r.processRecommendations.slice(0, 5).map(p => `
        <div class="process-rec-row">
          <div>
            <strong style="font-size:0.8rem">${escHtml(p.process)}</strong>
            <div style="font-size:0.7rem;color:var(--text-muted)">${escHtml(p.reasoning)}</div>
          </div>
          <span class="cad-confidence-badge ${p.confidencePct >= 75 ? 'High' : p.confidencePct >= 50 ? 'Medium' : 'Low'}">${p.confidencePct}%</span>
          <div class="confidence-bar-wrap">
            <div class="confidence-bar-bg">
              <div class="confidence-bar-fill" style="width:${p.confidencePct}%"></div>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <!-- Manufacturability Risks -->
    ${r.manufacturabilityRisks.length > 0 ? `
    <div style="margin-bottom:12px">
      <div class="panel-title" style="margin-bottom:6px">Manufacturability Risks</div>
      ${r.manufacturabilityRisks.map(risk => `
        <div class="risk-card ${risk.severity}">
          <div class="risk-feature">${risk.severity} · ${escHtml(risk.feature)}</div>
          <div>${escHtml(risk.description)}</div>
          <div class="risk-suggestion">→ ${escHtml(risk.suggestion)}</div>
        </div>`).join('')}
    </div>` : ''}

    <!-- AI Explanation -->
    <div style="margin-bottom:12px">
      <div class="panel-title" style="margin-bottom:6px">AI Analysis</div>
      <div style="font-size:0.78rem;color:var(--text-secondary);line-height:1.55">${escHtml(r.aiExplanation)}</div>
    </div>

    ${r.costInputSuggestions.dfmIssues && r.costInputSuggestions.dfmIssues.length > 0 ? `
    <!-- DFM Issues -->
    <div style="margin-bottom:12px">
      <div class="panel-title" style="margin-bottom:6px">DFM Issues (${escHtml(commodityLabel[recommendedCommodity] ?? recommendedCommodity)} specialist)</div>
      ${r.costInputSuggestions.dfmIssues.map(issue => `
        <div class="risk-card ${issue.severity === 'Critical' ? 'High' : issue.severity}">
          <div class="risk-feature">${escHtml(issue.severity)} · ${escHtml(issue.area)}</div>
          <div>${escHtml(issue.description)}</div>
          <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px">Impact: ${escHtml(issue.impact)}</div>
          <div class="risk-suggestion">→ ${escHtml(issue.fix)}</div>
        </div>`).join('')}
    </div>` : ''}

    ${r.costInputSuggestions.costRange ? `
    <!-- Cost range -->
    <div style="margin-bottom:12px">
      <div class="panel-title" style="margin-bottom:6px">Cost Range Estimate</div>
      <div style="display:flex;gap:8px;align-items:stretch">
        <div style="flex:1;text-align:center;padding:8px 6px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:6px">
          <div style="font-size:0.66rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.03em">Optimistic</div>
          <div style="font-weight:700;font-size:0.9rem;color:var(--green)">£${r.costInputSuggestions.costRange.low.toFixed(2)}</div>
        </div>
        <div style="flex:1;text-align:center;padding:8px 6px;background:rgba(79,142,247,0.08);border:1px solid rgba(79,142,247,0.25);border-radius:6px">
          <div style="font-size:0.66rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.03em">Most Likely</div>
          <div style="font-weight:700;font-size:0.9rem;color:var(--accent)">£${r.costInputSuggestions.costRange.mid.toFixed(2)}</div>
        </div>
        <div style="flex:1;text-align:center;padding:8px 6px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.2);border-radius:6px">
          <div style="font-size:0.66rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.03em">Conservative</div>
          <div style="font-weight:700;font-size:0.9rem;color:var(--red)">£${r.costInputSuggestions.costRange.high.toFixed(2)}</div>
        </div>
      </div>
    </div>` : ''}

    <!-- Suggested cost inputs -->
    <div style="margin-bottom:12px">
      <div class="panel-title" style="margin-bottom:6px">Suggested Cost Inputs</div>
      <table class="breakdown-table" style="font-size:0.78rem">
        <tr><td>Net weight</td><td><strong>${r.costInputSuggestions.netWeightKg.toFixed(3)} kg</strong></td></tr>
        <tr><td>Material</td><td>${escHtml(r.materialAnalysis.primarySuggestion.name)} (${r.costInputSuggestions.materialId})</td></tr>
        <tr><td>Est. cycle time</td><td>${r.costInputSuggestions.estimatedCycleTimeHr.toFixed(4)} hr/part</td></tr>
        <tr><td>Setup time</td><td>${r.costInputSuggestions.estimatedSetupTimeHr.toFixed(2)} hr</td></tr>
        <tr><td>Operations</td><td>${r.costInputSuggestions.estimatedOperations.map(o => escHtml(o.name)).join(', ')}</td></tr>
      </table>
    </div>

    <!-- Apply to form -->
    <div class="cad-apply-btn-row">
      <strong style="font-size:0.8rem;align-self:center">Apply to cost engine:</strong>
      <button class="btn btn-primary btn-sm" id="cad-apply-btn" data-commodity="${escHtml(recommendedCommodity)}">
        → ${escHtml(commodityLabel[recommendedCommodity] ?? recommendedCommodity)} (Recommended)
      </button>
      <button class="btn btn-secondary btn-sm" id="cad-apply-calc-btn" data-commodity="${escHtml(recommendedCommodity)}">
        Apply &amp; Calculate ⚡
      </button>
      ${r.processRecommendations.slice(1, 3).map(p => {
        const ct = p.commodityType as CommodityType;
        return `<button class="btn btn-secondary btn-sm cad-apply-alt-btn" data-commodity="${ct}">${escHtml(commodityLabel[ct] ?? ct)}</button>`;
      }).join('')}
    </div>

    ${r.analysisLimitations.length > 0 ? `
    <div class="cad-limitations">
      <strong>Note:</strong> ${escHtml(r.analysisLimitations.join(' · '))}
    </div>` : ''}
  `;

  // Wire apply buttons
  el('cad-apply-btn')?.addEventListener('click', () => {
    const ct = (el('cad-apply-btn') as HTMLElement).dataset.commodity as CommodityType;
    applyCADToForm(ct, false);
  });
  el('cad-apply-calc-btn')?.addEventListener('click', () => {
    const ct = (el('cad-apply-calc-btn') as HTMLElement).dataset.commodity as CommodityType;
    applyCADToForm(ct, true);
  });
  panel.querySelectorAll<HTMLElement>('.cad-apply-alt-btn').forEach(btn => {
    btn.addEventListener('click', () => applyCADToForm(btn.dataset.commodity as CommodityType, false));
  });

  // Auto-calculate if triggered from "Analyze & Calculate" button
  if (autoCalculate) {
    applyCADToForm(recommendedCommodity, true);
  }
}

const FACE_COLOURS: Record<string, string> = {
  PLANE: '#4f8ef7', CYLINDER: '#10b981', CONE: '#f59e0b',
  TORUS: '#7c3aed', BSPLINE: '#ec4899', BEZIER: '#ef4444',
  REVOLUTION: '#06b6d4', OTHER: '#94a3b8',
};

// ─── PCB Image Analysis ───────────────────────────────────────────────────────

// ─── PCB Demo Mode ────────────────────────────────────────────────────────────
// Pre-computed results for two real-world automotive PCB examples.
// All country costs were computed live from pcb-country-rates.ts engine.

function makeDemoCountry(
  id: string, name: string, flag: string,
  fab: number, assy: number, log: number, bom: number,
  weeks: number, qi: number, certs: string[], bestFor: string,
  bd: { pcbBase:number; pcbLayers:number; pcbSurface:number; pcbVias:number; pcbHDI:number; pcbSetup:number; smtAssembly:number; thAssembly:number; aoi:number; logistics:number; importDuty:number }
): PCBCountryBreakdown {
  return { countryId: id, countryName: name, flag, pcbFabPerBoard: fab, assemblyPerBoard: assy, logisticsPerBoard: log, bomCostPerBoard: bom, totalPerBoard: +(fab+assy+log+bom).toFixed(2), leadTimeWeeks: weeks, qualityIndex: qi, certifications: certs, bestFor, breakdown: bd, panelInfo: { boardsPerPanel: 4, utilisation: 0.62, panelW: 480, panelH: 350 } };
}

// Synthesise a demo volume curve from a base per-board total (cost decays with volume).
function demoVolumeCurve(baseTotal: number, fab: number, assy: number, log: number, _bom: number): VolumeCurvePoint[] {
  const qtys = [100, 250, 500, 1000, 2500, 5000, 10000, 25000];
  return qtys.map(qty => {
    // Setup amortisation shrinks with qty; approximate a gentle decay.
    const setupPerBoard = 165 / qty; // mid-range tooling
    const total = +(baseTotal - 165 / 5000 + setupPerBoard).toFixed(2);
    return { qty, totalPerBoard: total, pcbFabPerBoard: fab, assemblyPerBoard: assy, logisticsPerBoard: log };
  });
}

const PCB_DEMO_ECU: PCBImageAnalysis = {
  partName: 'Automotive ECU — Engine Control Unit (DEMO)',
  boardSpec: {
    estimatedLayers: 6, widthMm: 150, heightMm: 100,
    surfaceFinish: 'enig', solderMaskColour: 'green', silkscreenSides: 2,
    throughVias: 280, blindVias: 45, buriedVias: 0, microVias: 12,
    bgaDetected: true, minTraceSpaceMm: 0.10, technologyType: 'HDI_RIGID',
    hdiStructure: '1+N+1', impedanceControlRequired: true, copperWeightOz: 1,
    qualityGrade: 'auto_grade2', panelUtilisation: 72,
  },
  bom: [
    { refDes: 'U1', componentType: 'ic_bga', description: 'ARM Cortex-M7 MCU 550MHz, 1MB Flash', pkg: 'BGA-201', value: 'STM32H735IGK6', voltage: '3.3V', qty: 1, unitPriceGBP: 6.20, moq: 1, automotive: true, highCost: true, partNumber: 'STM32H735IGK6', lineConf: 0.93, ocrExtracted: true },
    { refDes: 'U2', componentType: 'ic_soic', description: 'CAN/LIN System Basis Chip', pkg: 'SOIC-14', value: 'NXP SJA1124', voltage: '5V/3.3V', qty: 2, unitPriceGBP: 3.80, moq: 5, automotive: true, highCost: false, partNumber: 'SJA1124', lineConf: 0.87, ocrExtracted: true },
    { refDes: 'U3', componentType: 'ic_qfn', description: 'Multi-channel Automotive PMIC', pkg: 'QFN-40', value: 'TPS65942A1', voltage: '6–40V in', qty: 1, unitPriceGBP: 4.20, moq: 1, automotive: true, highCost: true, partNumber: 'TPS65942A1', lineConf: 0.90, ocrExtracted: true },
    { refDes: 'U4', componentType: 'ic_soic', description: 'SPI NOR Flash 128Mb AEC-Q100', pkg: 'SOIC-8', value: 'S25FL128SAGBHIA10', voltage: '3.3V', qty: 1, unitPriceGBP: 1.80, moq: 10, automotive: true, highCost: false, partNumber: 'S25FL128SAGBHIA10', lineConf: 0.85, ocrExtracted: true },
    { refDes: 'U5,U6', componentType: 'ic_soic', description: '3-phase Gate Driver 100V', pkg: 'SOIC-28', value: 'DRV8323RS', voltage: '6–60V', qty: 2, unitPriceGBP: 2.40, moq: 5, automotive: true, highCost: false, partNumber: 'DRV8323RS', lineConf: 0.82, ocrExtracted: true },
    { refDes: 'U7,U8,U9', componentType: 'ic_soic', description: '4A LDO Regulator AEC-Q100 Grd2', pkg: 'D-PAK', value: 'LP2951ACMX/NOPB', voltage: '30V max', qty: 3, unitPriceGBP: 1.20, moq: 10, automotive: true, highCost: false },
    { refDes: 'J1', componentType: 'connector_smt', description: '48-way Automotive ECU Edge Connector', pkg: 'SMT Blade', value: 'TE 2-1379000-4', voltage: '—', qty: 1, unitPriceGBP: 2.80, moq: 1, automotive: true, highCost: false },
    { refDes: 'J2', componentType: 'through_hole', description: 'OBD-II Diagnostic Port Connector', pkg: 'THT D-sub', value: 'DE9', voltage: '—', qty: 1, unitPriceGBP: 1.95, moq: 5, automotive: false, highCost: false },
    { refDes: 'X1', componentType: 'crystal_osc', description: '40MHz TCXO ±0.5ppm AEC-Q200', pkg: 'SMD 5×3.2mm', value: '40.000MHz', voltage: '3.3V', qty: 1, unitPriceGBP: 1.60, moq: 5, automotive: true, highCost: false, partNumber: 'SG-8018CG', lineConf: 0.75 },
    { refDes: 'D1–D6', componentType: 'fuse_tvs', description: 'Automotive TVS Array 60V ESD', pkg: 'SOT-363', value: '60V/600W', voltage: '60V', qty: 6, unitPriceGBP: 0.85, moq: 10, automotive: true, highCost: false },
    { refDes: 'R1–R8', componentType: 'passive_0805', description: 'Current Sense Resistor 10mΩ 1%', pkg: '0805', value: '0.01Ω', voltage: '—', qty: 8, unitPriceGBP: 0.22, moq: 25, automotive: true, highCost: false },
    { refDes: 'C1–C12', componentType: 'passive_0805', description: 'Bulk Decoupling Capacitor 100µF X5R', pkg: '0805', value: '100µF', voltage: '10V', qty: 12, unitPriceGBP: 0.45, moq: 25, automotive: true, highCost: false },
    { refDes: 'C13–C97', componentType: 'passive_0402', description: 'MLCC Filter Cap 100nF X7R', pkg: '0402', value: '100nF', voltage: '25V', qty: 85, unitPriceGBP: 0.02, moq: 100, automotive: true, highCost: false },
    { refDes: 'R9–R53', componentType: 'passive_0402', description: 'Pull-up/pull-down 10kΩ 1% 0.1W', pkg: '0402', value: '10kΩ', voltage: '—', qty: 45, unitPriceGBP: 0.01, moq: 100, automotive: true, highCost: false },
  ],
  assembly: { smtPlacements: 290, throughHoleJoints: 30, manualJoints: 4, bgaCount: 5, complexity: 'High', reflowSides: 2, aoiRequired: true, ictTimeSec: 45 },
  costEstimates: { pcbFabGBP: { min: 2.80, mid: 3.70, max: 5.40 }, totalBOMCostGBP: 48.50, smtAssemblyCostGBP: 5.50 },
  aiInsights: [
    'STM32H735IGK6 @ 550MHz provides ample headroom for AUTOSAR Classic CP; consider STM32H730 if cost is priority (similar peripherals, less flash)',
    'CAN FD dual-channel SBC (SJA1124) supports CAN FD up to 8Mbit/s — correctly chosen for next-gen AUTOSAR CAN XL readiness',
    'ENIG surface finish on 6-layer HDI is mandatory for BGA solderability; verified consistent with AEC-Q100 Grade 2 thermal cycling requirements',
    'TVS array selection (60V) correctly rated for 24V truck battery transients per ISO 7637-2 pulse 1/2a/5a',
    'OBD-II THT connector creates a mixed technology board; verify wave-solder selective fixture or hand-solder process in BOM router',
  ],
  dfmIssues: [
    'BGA U1 (STM32H735 BGA-201) requires 0.4mm pad pitch — verify SMT line solder paste aperture capability ≥ Type 4 paste',
    'Conformal coat spec not explicit on BOM; automotive PCBA requires IPC-CC-830B Type UR or AR at ≥50µm DFT',
    'Board aspect ratio 1.5:1 at 150×100mm is within IPC-2221 conveyor limits but confirm with panel layout (edge clearance ≥3mm)',
    'Impedance-controlled traces: 6-layer stackup must include Dk/Df spec on fab drawing for differential pairs on Layer 3/4',
  ],
  highCostComponents: [
    'U1 STM32H735IGK6 — £6.20 (12.8% of BOM): evaluate STM32H730VEH6 at £4.80 for programs where 1MB flash suffices',
    'U3 TPS65942A1 PMIC — £4.20 (8.7%): multichannel PMIC price justified; verify all rails used; stub unused rails at NM resistors',
    'U2 ×2 SJA1124 — £7.60 combined (15.7%): necessary for dual-bus isolation; check if single SJA1126 (4-bus) reduces part count',
  ],
  optimisationSuggestions: [
    'Consolidate passive sizes: 0402 is dominant; remove any 0201s to save pick-and-place time and reduce SMT setup changeover',
    'U7/U8/U9 LDO regulators share footprint — qualify single vendor JW Winsen or Diodes Inc AEC parts for 30–40% cost saving',
    'Investigate HASL-LF surface finish for non-BGA areas (mixed with selective ENIG via BGA-only aperture plating) — saves ~18% surface finish premium',
    'Move to ENEPIG if AEC-Q100 aluminium wire bond options needed in future variant; forward-compatible for sensor integration',
    'Bulk-buy C13–C97 (85 pcs × 100nF): Yageo CC0402KRX5R9BB104 at £0.008 saves £1.02/board (£5100 at 5000 pcs)',
  ],
  confidenceLevel: 'High',
  analysisLimitations: [
    'BOM pricing at 1000-pcs distributor break; production prices at 5000+ pcs from EMS direct negotiation typically 15–25% lower for ICs',
    'Thermal analysis (hotspot, junction temperatures) requires actual layout copper pour data — not available from image alone',
    'PPAP/FMEA/DVP documentation scope not covered by this tool',
  ],
  stage1Classification: { domain: 'automotive_adas', conf: 0.94, hints: ['multiple BGA ICs', 'automotive grade marking', 'CAN/LIN controller visible', 'ENIG surface finish', '6-layer HDI'] },
  ocrExtraction: { icMarkings: ['STM32H735IGK6', 'SJA1124', 'TPS65942A1', 'S25FL128SAGBHIA10', 'DRV8323RS'], extractionQuality: 'Good' },
  complexityScore: { score: 70, ipcClass: 3, label: 'Very Complex', factors: { layers: 10, viaDensity: 15, bgaScore: 10, hdiScore: 10, traceScore: 5 } },
  _volumeCurves: {
    cn: demoVolumeCurve(58.50, 3.37, 5.50, 1.13, 48.50),
    gb: demoVolumeCurve(106.74, 25.58, 32.66, 0.00, 48.50),
  },
  _selectedCountry: 'cn',
  _selectedCountryBreakdown: makeDemoCountry('cn','China (Shenzhen / Suzhou)','🇨🇳', 3.37,5.50,1.13,48.50, 3,0.83,['ISO9001','IATF16949','UL','RoHS','IPC-6012'],'High-volume consumer, cost-optimised, standard FR4', { pcbBase:0.17,pcbLayers:0.42,pcbSurface:0.13,pcbVias:2.34,pcbHDI:0.20,pcbSetup:0.00,smtAssembly:1.22,thAssembly:0.27,aoi:4.27,logistics:0.81,importDuty:0.33 }),
  _countryComparison: [
    makeDemoCountry('cn','China (Shenzhen / Suzhou)','🇨🇳',3.37,5.50,1.13,48.50,3,0.83,['ISO9001','IATF16949','UL','RoHS','IPC-6012'],'High-volume consumer, cost-optimised, standard FR4',{pcbBase:0.17,pcbLayers:0.42,pcbSurface:0.13,pcbVias:2.34,pcbHDI:0.20,pcbSetup:0.00,smtAssembly:1.22,thAssembly:0.27,aoi:4.27,logistics:0.81,importDuty:0.33}),
    makeDemoCountry('vn','Vietnam (Ho Chi Minh City / Hanoi)','🇻🇳',4.31,4.79,1.41,48.50,3,0.80,['ISO9001','UL','RoHS'],'Labour-intensive assembly, high-volume low-complexity PCBA',{pcbBase:0.22,pcbLayers:0.54,pcbSurface:0.17,pcbVias:2.81,pcbHDI:0.25,pcbSetup:0.00,smtAssembly:0.88,thAssembly:0.18,aoi:3.77,logistics:0.95,importDuty:0.46}),
    makeDemoCountry('in','India (Pune / Bengaluru / Chennai)','🇮🇳',5.13,6.26,1.58,48.50,4,0.78,['ISO9001','UL','RoHS'],'Growing capacity, English-speaking, government PLI incentives',{pcbBase:0.26,pcbLayers:0.64,pcbSurface:0.19,pcbVias:3.30,pcbHDI:0.30,pcbSetup:0.00,smtAssembly:1.44,thAssembly:0.24,aoi:4.62,logistics:1.07,importDuty:0.51}),
    makeDemoCountry('th','Thailand (Bangkok / Ayutthaya)','🇹🇭',5.55,7.14,1.66,48.50,3,0.85,['ISO9001','UL','RoHS','IATF16949'],'Japanese-standard quality at low-mid cost; strong automotive supply chain',{pcbBase:0.28,pcbLayers:0.69,pcbSurface:0.21,pcbVias:3.56,pcbHDI:0.33,pcbSetup:0.00,smtAssembly:1.65,thAssembly:0.27,aoi:5.26,logistics:1.13,importDuty:0.54}),
    makeDemoCountry('my','Malaysia (Penang / Kuala Lumpur)','🇲🇾',5.12,7.58,1.63,48.50,3,0.86,['ISO9001','IATF16949','UL','RoHS'],'Strong EMS ecosystem (Intel, Western Digital heritage), good EE talent',{pcbBase:0.26,pcbLayers:0.64,pcbSurface:0.19,pcbVias:3.22,pcbHDI:0.29,pcbSetup:0.00,smtAssembly:1.76,thAssembly:0.27,aoi:5.59,logistics:1.10,importDuty:0.53}),
    makeDemoCountry('tw','Taiwan (Hsinchu / Taipei)','🇹🇼',9.07,11.30,1.76,48.50,2,0.93,['ISO9001','IATF16949','IPC-6012 Class 3'],'Premium HDI, IC substrate, RF boards; world-class Tier-1 fabs',{pcbBase:0.46,pcbLayers:1.13,pcbSurface:0.34,pcbVias:5.42,pcbHDI:0.51,pcbSetup:0.00,smtAssembly:2.62,thAssembly:0.41,aoi:8.32,logistics:1.27,importDuty:0.49}),
    makeDemoCountry('kr','South Korea (Suwon / Incheon)','🇰🇷',11.05,12.94,1.06,48.50,2,0.93,['ISO9001','IATF16949','IPC-6012 Class 3','AEC-Q100'],'Samsung/LG supply chain integration, automotive-grade memory and PMIC',{pcbBase:0.56,pcbLayers:1.38,pcbSurface:0.41,pcbVias:6.52,pcbHDI:0.61,pcbSetup:0.00,smtAssembly:3.00,thAssembly:0.44,aoi:9.54,logistics:0.73,importDuty:0.33}),
    makeDemoCountry('mx','Mexico (Juárez / Monterrey / Guadalajara)','🇲🇽',8.16,8.65,1.83,48.50,3,0.84,['ISO9001','IATF16949','UL'],'USMCA duty-free for US OEM; growing automotive nearshore hub',{pcbBase:0.41,pcbLayers:1.02,pcbSurface:0.30,pcbVias:5.01,pcbHDI:0.47,pcbSetup:0.00,smtAssembly:2.00,thAssembly:0.32,aoi:6.37,logistics:1.24,importDuty:0.59}),
    makeDemoCountry('cz','Czech Republic (Brno / Ostrava)','🇨🇿',11.07,11.77,0.30,48.50,2,0.91,['ISO9001','IATF16949','IPC-6012 Class 3','CE'],'EU-based automotive PCBA (VW, BMW supply chain), zero UK import duty',{pcbBase:0.56,pcbLayers:1.38,pcbSurface:0.41,pcbVias:6.61,pcbHDI:0.62,pcbSetup:0.00,smtAssembly:2.73,thAssembly:0.40,aoi:8.68,logistics:0.30,importDuty:0.00}),
    makeDemoCountry('pl','Poland (Wrocław / Kraków)','🇵🇱',10.13,10.80,0.28,48.50,2,0.90,['ISO9001','IATF16949','IPC-6012 Class 3','CE'],'Cost-competitive EU nearshore, strong automotive sector (Stellantis, VW)',{pcbBase:0.51,pcbLayers:1.26,pcbSurface:0.37,pcbVias:6.09,pcbHDI:0.57,pcbSetup:0.00,smtAssembly:2.50,thAssembly:0.37,aoi:7.97,logistics:0.28,importDuty:0.00}),
    makeDemoCountry('de','Germany (Munich / Stuttgart / Frankfurt)','🇩🇪',21.51,28.39,0.19,48.50,2,0.97,['ISO9001','IATF16949','AS9100','IPC-6012 Class 3','AEC-Q100','ECSS'],'Automotive OEM, aerospace ECSS, highest quality, shortest EU prototype lead time',{pcbBase:1.09,pcbLayers:2.70,pcbSurface:0.79,pcbVias:11.99,pcbHDI:1.12,pcbSetup:0.00,smtAssembly:6.58,thAssembly:0.70,aoi:21.15,logistics:0.19,importDuty:0.00}),
    makeDemoCountry('gb','United Kingdom (Birmingham / Coventry / Edinburgh)','🇬🇧',25.58,32.66,0.00,48.50,2,0.96,['ISO9001','IATF16949','AS9100','IPC-6012 Class 3','UKCA','Def Stan'],'Domestic prototyping, defence/Def Stan, fastest turnaround, zero import risk',{pcbBase:1.29,pcbLayers:3.20,pcbSurface:0.93,pcbVias:14.09,pcbHDI:1.32,pcbSetup:0.00,smtAssembly:7.57,thAssembly:0.80,aoi:25.20,logistics:0.00,importDuty:0.00}),
    makeDemoCountry('us','USA (San Jose / Austin / Milpitas)','🇺🇸',20.14,30.43,2.68,48.50,2,0.96,['ISO9001','IATF16949','AS9100','IPC-6012 Class 3','ITAR'],'Defense/ITAR-sensitive programs, DO-254 airborne electronics, US-content mandates',{pcbBase:1.02,pcbLayers:2.52,pcbSurface:0.74,pcbVias:11.41,pcbHDI:1.07,pcbSetup:0.00,smtAssembly:7.06,thAssembly:0.72,aoi:22.69,logistics:1.63,importDuty:1.05}),
    makeDemoCountry('jp','Japan (Osaka / Nagoya / Tokyo)','🇯🇵',35.88,34.82,1.13,48.50,3,0.99,['ISO9001','IATF16949','AS9100','JPCA','IPC-6012 Class 3'],'Ultra-fine pitch (<35µm), any-layer HDI IC substrate, highest reliability',{pcbBase:1.82,pcbLayers:4.49,pcbSurface:1.30,pcbVias:20.72,pcbHDI:1.93,pcbSetup:0.00,smtAssembly:8.08,thAssembly:0.84,aoi:26.06,logistics:0.81,importDuty:0.32}),
  ],
};

const PCB_DEMO_ADAS: PCBImageAnalysis = {
  partName: 'ADAS Camera Vision PCB — Surround View Processor (DEMO)',
  boardSpec: {
    estimatedLayers: 8, widthMm: 80, heightMm: 80,
    surfaceFinish: 'enig', solderMaskColour: 'black', silkscreenSides: 1,
    throughVias: 180, blindVias: 88, buriedVias: 12, microVias: 42,
    bgaDetected: true, minTraceSpaceMm: 0.075, technologyType: 'HDI_RIGID',
    hdiStructure: '2+N+2', impedanceControlRequired: true, copperWeightOz: 1,
    qualityGrade: 'auto_grade1', panelUtilisation: 65,
  },
  bom: [
    { refDes: 'U1', componentType: 'ic_bga', description: 'Vision SoC — Dual Cortex-A72 + 8× TOPS Vision DSP', pkg: 'BGA-441', value: 'TDA4VM', voltage: '1.0/1.8/3.3V', qty: 1, unitPriceGBP: 14.50, moq: 1, automotive: true, highCost: true, partNumber: 'TDA4VMXAAALHAT', lineConf: 0.91, ocrExtracted: true },
    { refDes: 'U2,U3', componentType: 'ic_bga', description: 'LPDDR4X SDRAM 8Gb 4266Mbps AEC-Q100', pkg: 'BGA-200', value: 'MT40A1G8SA-062E:A', voltage: '1.1V', qty: 2, unitPriceGBP: 4.30, moq: 5, automotive: true, highCost: true, partNumber: 'MT40A1G8SA-062E', lineConf: 0.88, ocrExtracted: true },
    { refDes: 'U4', componentType: 'ic_tqfp', description: 'FPD-Link III 4-camera Deserialiser 6Gbps', pkg: 'WQFN-64', value: 'DS90UB960MRSQ', voltage: '1.8V/3.3V', qty: 1, unitPriceGBP: 6.20, moq: 1, automotive: true, highCost: true, partNumber: 'DS90UB960MRSQ1', lineConf: 0.90, ocrExtracted: true },
    { refDes: 'U5', componentType: 'ic_tqfp', description: 'FPD-Link III Camera Serialiser', pkg: 'WSON-20', value: 'DS90UB953ARSQ', voltage: '1.8V', qty: 1, unitPriceGBP: 3.80, moq: 1, automotive: true, highCost: false, partNumber: 'DS90UB953ARSQ1', lineConf: 0.86, ocrExtracted: true },
    { refDes: 'U6', componentType: 'ic_qfn', description: '6-axis IMU Gyro+Accel AEC-Q100 Grd1', pkg: 'LGA-14', value: 'BMI088', voltage: '3.3V', qty: 1, unitPriceGBP: 2.40, moq: 5, automotive: true, highCost: false, partNumber: 'BMI088', lineConf: 0.84, ocrExtracted: true },
    { refDes: 'U7', componentType: 'ic_bga', description: 'Automotive Multi-Rail PMIC 16 channels', pkg: 'BGA-64', value: 'TPS65941', voltage: '5–36V in', qty: 1, unitPriceGBP: 3.60, moq: 1, automotive: true, highCost: false, partNumber: 'TPS65941RSLR', lineConf: 0.82, ocrExtracted: true },
    { refDes: 'U8', componentType: 'ic_qfn', description: 'Automotive 1000BASE-T1 PHY (2-wire BroadR-Reach)', pkg: 'QFN-32', value: 'TJA1102', voltage: '3.3V', qty: 1, unitPriceGBP: 4.20, moq: 1, automotive: true, highCost: false, partNumber: 'TJA1102AHNJT', lineConf: 0.80, ocrExtracted: true },
    { refDes: 'J1–J4', componentType: 'through_hole', description: 'FAKRA MINI-A SMB Camera Coax Receptacle', pkg: 'FAKRA THT', value: 'FAKRA-A-FEM', voltage: '—', qty: 4, unitPriceGBP: 1.85, moq: 5, automotive: true, highCost: false },
    { refDes: 'J5', componentType: 'through_hole', description: 'Automotive H-MTD Ethernet HSD Connector', pkg: 'THT PCB mount', value: 'H-MTD Plug', voltage: '—', qty: 1, unitPriceGBP: 2.20, moq: 5, automotive: true, highCost: false },
    { refDes: 'X1,X2', componentType: 'crystal_osc', description: '25MHz TCXO ±0.5ppm AEC-Q200 Grade', pkg: 'SMD 3.2×2.5mm', value: '25.000MHz', voltage: '3.3V', qty: 2, unitPriceGBP: 2.10, moq: 5, automotive: true, highCost: false, partNumber: 'SG-8018CG-25MHz', lineConf: 0.74 },
    { refDes: 'L1–L6', componentType: 'passive_0805', description: 'Power Filter Inductor 100µH 1A Aec', pkg: '0805', value: '100µH', voltage: '—', qty: 6, unitPriceGBP: 0.85, moq: 25, automotive: true, highCost: false },
    { refDes: 'D1–D8', componentType: 'fuse_tvs', description: 'TVS ESD Protection Array 24V AEC-Q101', pkg: 'SOT-363', value: '24V/400W', voltage: '24V', qty: 8, unitPriceGBP: 0.65, moq: 10, automotive: true, highCost: false },
    { refDes: 'C1–C120', componentType: 'passive_0402', description: 'MLCC 1µF/100nF X7R Filter Cap AEC-Q200', pkg: '0402', value: '1µF/100nF', voltage: '10V', qty: 120, unitPriceGBP: 0.03, moq: 100, automotive: true, highCost: false },
    { refDes: 'R1–R80', componentType: 'passive_0402', description: 'Signal Conditioning / Termination Resistors', pkg: '0402', value: '49.9Ω–100kΩ', voltage: '—', qty: 80, unitPriceGBP: 0.01, moq: 100, automotive: true, highCost: false },
  ],
  assembly: { smtPlacements: 198, throughHoleJoints: 12, manualJoints: 2, bgaCount: 8, complexity: 'Very High', reflowSides: 1, aoiRequired: true, ictTimeSec: 90 },
  costEstimates: { pcbFabGBP: { min: 4.20, mid: 5.80, max: 9.50 }, totalBOMCostGBP: 62.30, smtAssemblyCostGBP: 4.92 },
  aiInsights: [
    'TDA4VM vision SoC is TI\'s mainstream AV SoC (ISO 26262 ASIL-D capable); production programs typically use TDA4VH for 64-TOPS or TDA4AL for cost reduction below 200 TOPS/W target',
    'DS90UB960 4-channel deserialiser with pixel clocks to 1.5Gbps per channel; verify coax cable assembly (FA-2 or FA-5 shielded) and reference resistor tolerance ±0.1% for eye diagram compliance',
    '2+N+2 HDI stackup with buried vias (U2,U3 DDR4): validate with IPC-2315 impedance calculator for 50Ω SE and 100Ω differential on Layer 3/6',
    'Automotive Ethernet (TJA1102) requires minimum 60Ω, 3m shielded cable for ECE R155 cybersecurity; board layout needs specific OPEN Alliance TC1 connector placement rule',
    'Board solder mask colour (black) reduces thermal radiation slightly; verify AOI contrast ratio with supplier — may need IR backlight AOI system',
  ],
  dfmIssues: [
    'TDA4VM BGA-441 at 0.65mm pitch requires blind vias — verify fab house capability (laser drill tolerance ±0.025mm)',
    'DDR4 BGA routing: differential impedance ±10% across x8/x16 bus; fanout via stubs must be minimised — recommend back-drilling on layers 3–4',
    'FAKRA J1–J4 THT connectors on back side create mixed reflow/wave process; consider SMT FAKRA receptacles to eliminate wave solder step',
    'Black solder mask + fine pitch components: AOI false-call rate typically 2–3× higher than green; validate with sample boards before production',
    'Board size 80×80mm: verify camera connector clearance to edge (FAKRA THT bodies protrude 12mm from board — risks panel routing)',
  ],
  highCostComponents: [
    'U1 TDA4VM — £14.50 (23.3% of BOM): lock in spot pricing at NDA volume by Q3 for next MY; sole-source risk — qualify TDA4VH as premium alt and TDA4AL as economy alt',
    'U2,U3 DDR4 ×2 — £8.60 combined (13.8%): DRAM subject to supply cycles; dual-source Micron and SK Hynix H9HCNNNBMMALHR for resilience',
    'U4 DS90UB960 — £6.20 (9.9%): FPD-Link III is TI-proprietary; evaluate GMSL2 (MAX96724) as drop-in compatible alternative if TI supply constrained',
  ],
  optimisationSuggestions: [
    'Switch FAKRA J1–J4 from THT to SMT reflow (Amphenol C2GR or Rosenberger SMT FAKRA): eliminates wave solder step, saves ~£0.80/board in assembly',
    'Consider dual-layer BOM structure: retain AEC-Q100 Grade 0 ICs, qualify commercial-grade passives (Grade 2 MLCC ±10%) — saves ~12% on passive BOM',
    'TDA4VM thermal management: PCB copper pour on Layer 1/8 over exposed pad critical; model thermal resistance with ANSYS/SIMetrix to validate junction T < 125°C at 85°C ambient',
    'Panel design: 80×80mm boards can be 4-up on a 180×180mm panel (4.5:1 utilisation vs 65% current) — negotiate 30% tooling discount with >50 panel/month commitment',
    'X1/X2 TCXO: evaluate single TCXO with Diff-to-SE buffer IC (TI CDCLVP2102) — saves £2.10/board less buffer cost (≈£1.50 net saving)',
  ],
  confidenceLevel: 'High',
  analysisLimitations: [
    'TDA4VM pricing at 1k unit distributor; Tier-1 volume pricing (>5k/yr) typically 18–30% lower under NDA with TI direct',
    'EMC pre-compliance not modelled: ADAS boards require CISPR 25 Class 5 and UNECE R10; budget additional £8–15k for EMC pre-scan chamber time',
    'Functional Safety (ISO 26262 ASIL-B to ASIL-D): hardware FMEA and diagnostic coverage analysis are outside scope of this should-cost tool',
  ],
  stage1Classification: { domain: 'automotive_adas', conf: 0.97, hints: ['vision SoC BGA', 'FAKRA camera connectors', 'DDR4 high-speed RAM', 'FPD-Link III deserialiser', '8-layer HDI 2+N+2', 'black solder mask'] },
  ocrExtraction: { icMarkings: ['TDA4VMXAAALHAT', 'MT40A1G8SA-062E', 'DS90UB960MRSQ1', 'DS90UB953ARSQ1', 'BMI088', 'TJA1102AHNJT'], extractionQuality: 'Good' },
  complexityScore: { score: 88, ipcClass: 3, label: 'Very Complex', factors: { layers: 14, viaDensity: 20, bgaScore: 15, hdiScore: 16, traceScore: 15 } },
  _volumeCurves: {
    cn: demoVolumeCurve(73.46, 5.40, 4.92, 0.84, 62.30),
    gb: demoVolumeCurve(122.13, 31.36, 28.47, 0.00, 62.30),
  },
  _selectedCountry: 'cn',
  _selectedCountryBreakdown: makeDemoCountry('cn','China (Shenzhen / Suzhou)','🇨🇳',5.40,4.92,0.84,62.30,3,0.83,['ISO9001','IATF16949','UL','RoHS','IPC-6012'],'High-volume consumer, cost-optimised, standard FR4',{pcbBase:0.07,pcbLayers:0.27,pcbSurface:0.07,pcbVias:4.80,pcbHDI:0.12,pcbSetup:0.01,smtAssembly:0.75,thAssembly:0.11,aoi:4.16,logistics:0.46,importDuty:0.38}),
  _countryComparison: [
    makeDemoCountry('cn','China (Shenzhen / Suzhou)','🇨🇳',5.40,4.92,0.84,62.30,3,0.83,['ISO9001','IATF16949','UL','RoHS','IPC-6012'],'High-volume consumer, cost-optimised, standard FR4',{pcbBase:0.07,pcbLayers:0.27,pcbSurface:0.07,pcbVias:4.80,pcbHDI:0.12,pcbSetup:0.01,smtAssembly:0.75,thAssembly:0.11,aoi:4.16,logistics:0.46,importDuty:0.38}),
    makeDemoCountry('vn','Vietnam (Ho Chi Minh City / Hanoi)','🇻🇳',6.74,4.31,1.12,62.30,3,0.80,['ISO9001','UL','RoHS'],'Labour-intensive assembly, high-volume low-complexity PCBA',{pcbBase:0.09,pcbLayers:0.34,pcbSurface:0.10,pcbVias:5.75,pcbHDI:0.32,pcbSetup:0.01,smtAssembly:0.63,thAssembly:0.08,aoi:3.64,logistics:0.72,importDuty:0.40}),
    makeDemoCountry('in','India (Pune / Bengaluru / Chennai)','🇮🇳',7.77,5.56,1.28,62.30,4,0.78,['ISO9001','UL','RoHS'],'Growing capacity, English-speaking, government PLI incentives',{pcbBase:0.10,pcbLayers:0.40,pcbSurface:0.11,pcbVias:6.61,pcbHDI:0.37,pcbSetup:0.01,smtAssembly:0.97,thAssembly:0.09,aoi:4.54,logistics:0.82,importDuty:0.46}),
    makeDemoCountry('th','Thailand (Bangkok / Ayutthaya)','🇹🇭',8.33,6.28,1.35,62.30,3,0.85,['ISO9001','UL','RoHS','IATF16949'],'Japanese-standard quality at low-mid cost; strong automotive supply chain',{pcbBase:0.11,pcbLayers:0.43,pcbSurface:0.12,pcbVias:7.07,pcbHDI:0.39,pcbSetup:0.01,smtAssembly:1.11,thAssembly:0.09,aoi:5.12,logistics:0.87,importDuty:0.48}),
    makeDemoCountry('my','Malaysia (Penang / Kuala Lumpur)','🇲🇾',7.78,6.70,1.33,62.30,3,0.86,['ISO9001','IATF16949','UL','RoHS'],'Strong EMS ecosystem (Intel, Western Digital heritage), good EE talent',{pcbBase:0.10,pcbLayers:0.40,pcbSurface:0.11,pcbVias:6.64,pcbHDI:0.37,pcbSetup:0.01,smtAssembly:1.18,thAssembly:0.09,aoi:5.47,logistics:0.85,importDuty:0.48}),
    makeDemoCountry('tw','Taiwan (Hsinchu / Taipei)','🇹🇼',11.90,9.82,1.38,62.30,2,0.93,['ISO9001','IATF16949','IPC-6012 Class 3'],'Premium HDI, IC substrate, RF boards; world-class Tier-1 fabs',{pcbBase:0.18,pcbLayers:0.71,pcbSurface:0.20,pcbVias:9.72,pcbHDI:0.54,pcbSetup:0.01,smtAssembly:1.73,thAssembly:0.13,aoi:8.00,logistics:0.98,importDuty:0.40}),
    makeDemoCountry('kr','South Korea (Suwon / Incheon)','🇰🇷',14.20,11.19,0.60,62.30,2,0.93,['ISO9001','IATF16949','IPC-6012 Class 3','AEC-Q100'],'Samsung/LG supply chain integration, automotive-grade memory and PMIC',{pcbBase:0.22,pcbLayers:0.86,pcbSurface:0.24,pcbVias:11.58,pcbHDI:0.65,pcbSetup:0.01,smtAssembly:1.98,thAssembly:0.14,aoi:9.12,logistics:0.39,importDuty:0.21}),
    makeDemoCountry('mx','Mexico (Juárez / Monterrey / Guadalajara)','🇲🇽',10.77,7.57,1.37,62.30,3,0.84,['ISO9001','IATF16949','UL'],'USMCA duty-free for US OEM; growing automotive nearshore hub',{pcbBase:0.16,pcbLayers:0.64,pcbSurface:0.18,pcbVias:8.77,pcbHDI:0.49,pcbSetup:0.01,smtAssembly:1.34,thAssembly:0.11,aoi:6.16,logistics:0.88,importDuty:0.49}),
    makeDemoCountry('cz','Czech Republic (Brno / Ostrava)','🇨🇿',14.21,10.24,0.17,62.30,2,0.91,['ISO9001','IATF16949','IPC-6012 Class 3','CE'],'EU-based automotive PCBA (VW, BMW supply chain), zero UK import duty',{pcbBase:0.22,pcbLayers:0.86,pcbSurface:0.24,pcbVias:11.71,pcbHDI:0.65,pcbSetup:0.01,smtAssembly:1.81,thAssembly:0.13,aoi:8.34,logistics:0.17,importDuty:0.00}),
    makeDemoCountry('pl','Poland (Wrocław / Kraków)','🇵🇱',13.10,9.42,0.16,62.30,2,0.90,['ISO9001','IATF16949','IPC-6012 Class 3','CE'],'Cost-competitive EU nearshore, strong automotive sector (Stellantis, VW)',{pcbBase:0.20,pcbLayers:0.79,pcbSurface:0.22,pcbVias:10.79,pcbHDI:0.60,pcbSetup:0.01,smtAssembly:1.66,thAssembly:0.12,aoi:7.68,logistics:0.16,importDuty:0.00}),
    makeDemoCountry('de','Germany (Munich / Stuttgart / Frankfurt)','🇩🇪',27.43,24.76,0.11,62.30,2,0.97,['ISO9001','IATF16949','AS9100','IPC-6012 Class 3','AEC-Q100','ECSS'],'Automotive OEM, aerospace ECSS, highest quality, shortest EU prototype lead time',{pcbBase:0.43,pcbLayers:1.69,pcbSurface:0.47,pcbVias:22.50,pcbHDI:1.25,pcbSetup:0.01,smtAssembly:4.37,thAssembly:0.24,aoi:20.19,logistics:0.11,importDuty:0.00}),
    makeDemoCountry('gb','United Kingdom (Birmingham / Coventry / Edinburgh)','🇬🇧',31.36,28.47,0.00,62.30,2,0.96,['ISO9001','IATF16949','AS9100','IPC-6012 Class 3','UKCA','Def Stan'],'Domestic prototyping, defence/Def Stan, fastest turnaround, zero import risk',{pcbBase:0.49,pcbLayers:1.94,pcbSurface:0.54,pcbVias:26.11,pcbHDI:1.45,pcbSetup:0.01,smtAssembly:4.97,thAssembly:0.27,aoi:23.22,logistics:0.00,importDuty:0.00}),
    makeDemoCountry('us','USA (San Jose / Austin / Milpitas)','🇺🇸',26.12,26.56,2.41,62.30,2,0.96,['ISO9001','IATF16949','AS9100','IPC-6012 Class 3','ITAR'],'Defense/ITAR-sensitive programs, DO-254 airborne electronics, US-content mandates',{pcbBase:0.38,pcbLayers:1.51,pcbSurface:0.42,pcbVias:21.32,pcbHDI:1.19,pcbSetup:0.01,smtAssembly:4.64,thAssembly:0.22,aoi:21.74,logistics:1.47,importDuty:0.94}),
    makeDemoCountry('jp','Japan (Osaka / Nagoya / Tokyo)','🇯🇵',43.32,30.38,0.65,62.30,3,0.99,['ISO9001','IATF16949','AS9100','JPCA','IPC-6012 Class 3'],'Ultra-fine pitch (<35µm), any-layer HDI IC substrate, highest reliability',{pcbBase:0.72,pcbLayers:2.82,pcbSurface:0.78,pcbVias:36.99,pcbHDI:2.06,pcbSetup:0.01,smtAssembly:5.34,thAssembly:0.29,aoi:24.79,logistics:0.46,importDuty:0.19}),
  ],
};

// ─── Demo 3: Bosch-type 77 GHz Automotive Radar ECU ──────────────────────────
const PCB_DEMO_BOSCH_RADAR: PCBImageAnalysis = {
  partName: 'Bosch-type LRR5 77 GHz Radar ECU — Adaptive Cruise Control (DEMO)',
  boardSpec: {
    estimatedLayers: 6, widthMm: 100, heightMm: 70,
    surfaceFinish: 'enig', solderMaskColour: 'green', silkscreenSides: 1,
    throughVias: 48, blindVias: 0, buriedVias: 0, microVias: 0,
    bgaDetected: true, minTraceSpaceMm: 0.10, technologyType: 'RF_MICRO',
    hdiStructure: 'none', impedanceControlRequired: true, copperWeightOz: 1,
    qualityGrade: 'auto_grade1', panelUtilisation: 72,
  },
  bom: [
    { refDes: 'U1', componentType: 'ic_bga', description: 'TI AWR1843AOP 77 GHz FMCW Radar SoC with Antenna-on-Package', pkg: 'BGA-169', value: 'AWR1843AOP', voltage: '1.0/1.8/3.3V', qty: 1, unitPriceGBP: 19.50, moq: 1, automotive: true, highCost: true, partNumber: 'AWR1843AOPMOOD', lineConf: 0.93, ocrExtracted: true },
    { refDes: 'U2', componentType: 'ic_tqfp', description: 'Infineon AURIX TC234L Safety MCU ASIL-B LQFP-144', pkg: 'LQFP-144', value: 'TC234L', voltage: '3.3/5V', qty: 1, unitPriceGBP: 26.00, moq: 1, automotive: true, highCost: true, partNumber: 'SAK-TC234L-32F200N DC', lineConf: 0.90, ocrExtracted: true },
    { refDes: 'U3,U4', componentType: 'ic_soic', description: 'NXP TJA1044 High Speed CAN Transceiver AEC-Q100', pkg: 'SOT-23-5', value: 'TJA1044', voltage: '3.3/5V', qty: 2, unitPriceGBP: 1.20, moq: 10, automotive: true, highCost: false, partNumber: 'TJA1044GT/3', lineConf: 0.88, ocrExtracted: true },
    { refDes: 'U5', componentType: 'ic_qfn', description: 'TI TPS62150 2.1 MHz 1A Synchronous Buck DC-DC', pkg: 'WSON-10', value: 'TPS62150', voltage: '3–17V', qty: 1, unitPriceGBP: 1.90, moq: 5, automotive: false, highCost: false, partNumber: 'TPS62150DSDJ', lineConf: 0.85 },
    { refDes: 'U6,U7', componentType: 'ic_soic', description: 'TI TLV75833 LDO 3.3V 500mA SOT-23-5', pkg: 'SOT-23-5', value: 'TLV75833', voltage: '2.2–5.5V', qty: 2, unitPriceGBP: 0.48, moq: 25, automotive: false, highCost: false, partNumber: 'TLV75833PDRVR', lineConf: 0.80 },
    { refDes: 'U8', componentType: 'ic_soic', description: 'NXP PCA9517D I2C Level Shifter/EEPROM Buffer', pkg: 'SOT-23-8', value: 'PCA9517D', voltage: '2.3–5.5V', qty: 1, unitPriceGBP: 0.70, moq: 25, automotive: false, highCost: false, partNumber: 'PCA9517DP', lineConf: 0.75 },
    { refDes: 'FL1,FL2', componentType: 'passive_0805', description: 'Murata 77 GHz Band-Pass Filter for FMCW Radar', pkg: 'SMD 1.0×0.5mm', value: '77GHz BPF', voltage: '—', qty: 2, unitPriceGBP: 4.80, moq: 5, automotive: true, highCost: true, partNumber: 'BPF77A15CJP00', lineConf: 0.82 },
    { refDes: 'J1', componentType: 'connector_smt', description: 'FAKRA SMB Automotive RF Receptacle Z-Code (Misc)', pkg: 'THT', value: 'FAKRA-Z', voltage: '—', qty: 1, unitPriceGBP: 2.20, moq: 5, automotive: true, highCost: false },
    { refDes: 'J2', componentType: 'through_hole', description: 'TE 776165-1 Superseal 12-pin Automotive Sealed Connector', pkg: 'THT PCB mount', value: '12-pin Superseal', voltage: '—', qty: 1, unitPriceGBP: 3.60, moq: 5, automotive: true, highCost: false },
    { refDes: 'J3,J4', componentType: 'connector_smt', description: 'SMA Edge-mount RF Connector (debug / antenna cal.)', pkg: 'SMT edge-mount', value: 'SMA-F edge', voltage: '—', qty: 2, unitPriceGBP: 0.95, moq: 10, automotive: false, highCost: false },
    { refDes: 'X1', componentType: 'crystal_osc', description: 'Epson TG-5032CE 25 MHz TCXO ±0.5 ppm AEC-Q200', pkg: 'SMD 5.0×3.2mm', value: '25.000MHz', voltage: '3.3V', qty: 1, unitPriceGBP: 3.40, moq: 5, automotive: true, highCost: false, partNumber: 'TG5032CEN25MHZAF', lineConf: 0.78 },
    { refDes: 'L1–L6', componentType: 'passive_0402', description: 'RF Choke 100nH ±5% AEC-Q200 for Power Line Decoupling', pkg: '0402', value: '100nH', voltage: '—', qty: 6, unitPriceGBP: 0.38, moq: 50, automotive: true, highCost: false },
    { refDes: 'D1–D4', componentType: 'fuse_tvs', description: 'NXP PRTR5V0U2X TVS ESD Protection Array AEC-Q101', pkg: 'SOT-363', value: '5V/400W', voltage: '5V', qty: 4, unitPriceGBP: 0.58, moq: 25, automotive: true, highCost: false, partNumber: 'PRTR5V0U2X', lineConf: 0.86 },
    { refDes: 'C1–C60', componentType: 'passive_0402', description: 'MLCC 100nF/1µF X7R AEC-Q200 Decoupling', pkg: '0402', value: '100nF/1µF', voltage: '10V', qty: 60, unitPriceGBP: 0.028, moq: 100, automotive: true, highCost: false },
    { refDes: 'R1–R30', componentType: 'passive_0402', description: 'Thick Film Resistor AEC-Q200 Signal & Termination', pkg: '0402', value: '49.9Ω–100kΩ', voltage: '—', qty: 30, unitPriceGBP: 0.012, moq: 100, automotive: true, highCost: false },
    { refDes: 'Y1', componentType: 'crystal_osc', description: 'NDK NX3225SA 40 MHz Crystal AEC-Q200', pkg: 'SMD 3.2×2.5mm', value: '40.000MHz', voltage: '—', qty: 1, unitPriceGBP: 0.75, moq: 25, automotive: true, highCost: false, partNumber: 'NX3225SA-40M', lineConf: 0.74 },
  ],
  assembly: { smtPlacements: 109, throughHoleJoints: 20, manualJoints: 0, bgaCount: 1, complexity: 'high', reflowSides: 1, aoiRequired: true, ictTimeSec: 180 },
  costEstimates: { pcbFabGBP: { min: 16.00, mid: 24.00, max: 38.00 }, totalBOMCostGBP: 79.44, smtAssemblyCostGBP: 4.50 },
  aiInsights: [
    'AWR1843AOP integrates 77 GHz antenna-on-package eliminating off-chip antenna area — validates board to ~65×55mm minimum; RF keep-out zone of ≥8mm from FAKRA J1 connector is critical to prevent coupling back into receive chain',
    'Rogers 4350B (εr=3.66, tanδ=0.0037) is the industry-standard 77 GHz substrate; validate substrate thickness 0.254mm with Bosch antenna resonance specs — Taconic TLX-9 is ≈15% cheaper alternative if Dk/Df meets tolerance budget',
    'AURIX TC234L targets ASIL-B; for AEB primary path (ASIL-D mandate from ISO 26262), upgrade path is TC297 dual-core lockstep (~£42 BOM delta) or external safety watchdog FS8500 (~£3.20) — evaluate against functional safety concept',
    'CAN transceivers U3/U4 (TJA1044) support Classic CAN 1Mbps; for AUTOSAR Adaptive platform readiness and higher throughput, evaluate TJA1462 (CAN-FD 5Mbps, +£0.90/unit) — no PCB footprint change required as pinout compatible',
    'Rogers substrate RF layer count: 6-layer stackup with Rogers on L1/L6 and FR4 on L2–L5 (hybrid) reduces Rogers material cost by ~60% vs all-Rogers — validate with TI AWR1843 layout guide for signal integrity on digital-to-RF boundary vias',
  ],
  dfmIssues: [
    'Rogers 4350B hybrid lamination requires controlled-atmosphere ENIG only — HASL thermal shock degrades εr uniformity; verify PCB fab has Rogers-qualified ENIG line (Taiyo/MacDermid bath preferred)',
    'AWR1843 BGA-169 at 0.8mm pitch requires registration tolerance ±0.05mm for 77 GHz AoP alignment — any misalignment >0.1mm degrades antenna gain by 1.5–3 dB; mandate X-ray inspection 100% on first article',
    'FAKRA J1 and Superseal J2 are THT connectors on Rogers substrate — selective wave solder or hand solder required; Rogers max wave solder dwell: 265°C/5s — exceed this and Dk shifts ±0.2%',
    'RF filter FL1/FL2 body height 0.5mm with 0.3mm clearance to adjacent 0402 — AOI shadow zone; validate with supplier\'s AOI field-of-view spec and confirm IR backlight capability for Rogers substrate',
    'AURIX LQFP-144 boundary scan: ICT bed-of-nails pitch 2.54mm — verify test point access on bottom copper pour; TC234L does not expose all internal nets on JTAG boundary scan chain (subset only)',
  ],
  highCostComponents: [
    'U2 AURIX TC234L — £26.00 (32.7% of BOM): at ASIL-D upgrade to TC297 adds £42/unit; evaluate functional safety architecture to confirm ASIL-B ceiling before specifying higher-grade MCU',
    'U1 AWR1843AOP — £19.50 (24.5%): TI sole-source for AoP variant; BGT60TR13C (Infineon) is architecturally different (external antenna) requiring PCB re-spin — qualifying alt adds 18–24 months',
    'FL1,FL2 Murata 77 GHz BPF — £9.60 combined (12.1%): Murata sole-source at 16–20 week lead time; TDK HHM15A4 second-source qualification recommended before SOP',
  ],
  optimisationSuggestions: [
    'Downgrade radar SoC to AWR1642 (2TX/4RX vs 3TX/4RX) for programs not requiring Doppler elevation: saves £8.30/board; range performance reduced from 250m to 180m — sufficient for front-facing ACC/AEB below 130km/h',
    'Consolidate D1–D4 TVS arrays: replace 4× PRTR5V0U2X with 2× PRTR5V0U4X (quad-channel) — same footprint, saves 2 parts and £0.74/board',
    'Rogers hybrid layer optimisation: use Rogers 4350B only on L1/L6 with FR4-370HR inner layers — reduces Rogers laminate cost by ~40% (£6–9/board saving depending on fab); validate with AWR1843AOP reference stackup',
    'Evaluate Infineon TC224 (single-core, ASIL-B) as AURIX alternative if ASIL-D not required: £14.00 vs £26.00, saves £12/board; re-evaluate after ISO 26262 functional safety concept is locked',
    'Batch C1–C60 MLCC from Yageo automotive CC series (CC0402KRX7R8BB104): at 5000 pcs programme volume, negotiate direct-from-factory at £0.018/unit vs £0.028 distributor — saves £0.60/board (£3,000 on 5k run)',
  ],
  confidenceLevel: 'High',
  analysisLimitations: [
    '77 GHz AoP antenna radiation pattern verification requires near-field antenna range measurement (Satimo SG 24 or equivalent) — outside scope of this PCB cost tool',
    'Rogers 4350B substrate cost varies ±20% with quarterly raw material index; pricing reflects Jan 2026 spot rates from Isola/Rogers Corp',
    'FMCW radar interference immunity (ITU-R M.2057), UNECE R152 Type Approval, and CISPR 25 Class 5 EMC pre-compliance testing not modelled in this should-cost estimate',
    'BOM pricing at 100-unit distributor break; programme volume (5000+/yr) pricing under NDA with TI/Infineon direct typically 20–35% lower for ICs',
  ],
  stage1Classification: { domain: 'rf_microwave', conf: 0.96, hints: ['77 GHz FMCW radar SoC', 'Rogers 4350B substrate', 'antenna-on-package BGA', 'impedance-controlled layout', 'AURIX safety MCU', 'FAKRA RF connector'] },
  ocrExtraction: { icMarkings: ['AWR1843AOPMOOD', 'SAK-TC234L-32F200N', 'TJA1044GT/3', 'TPS62150DSDJ', 'PRTR5V0U2X'], extractionQuality: 'Good' },
  complexityScore: { score: 78, ipcClass: 3, label: 'Very Complex', factors: { layers: 10, viaDensity: 8, bgaScore: 10, hdiScore: 0, traceScore: 15 } },
  _volumeCurves: {
    cn: demoVolumeCurve(107.44, 22.00, 4.50, 1.50, 79.44),
    gb: demoVolumeCurve(144.44, 45.00, 20.00, 0.00, 79.44),
  },
  _selectedCountry: 'cn',
  _selectedCountryBreakdown: makeDemoCountry('cn','China (Shenzhen / Suzhou)','🇨🇳',22.00,4.50,1.50,79.44,3,0.83,['ISO9001','IATF16949','UL','RoHS','IPC-6012'],'High-volume consumer, cost-optimised; Rogers 4350B capable fabs: Suntak, Kingboard',{pcbBase:1.20,pcbLayers:3.60,pcbSurface:14.50,pcbVias:1.50,pcbHDI:0.80,pcbSetup:0.40,smtAssembly:3.20,thAssembly:0.55,aoi:0.75,logistics:1.00,importDuty:0.50}),
  _countryComparison: [
    makeDemoCountry('cn','China (Shenzhen / Suzhou)','🇨🇳',22.00,4.50,1.50,79.44,3,0.83,['ISO9001','IATF16949','UL','RoHS','IPC-6012'],'High-volume; Rogers 4350B capable fabs (Suntak, Kingboard)',{pcbBase:1.20,pcbLayers:3.60,pcbSurface:14.50,pcbVias:1.50,pcbHDI:0.80,pcbSetup:0.40,smtAssembly:3.20,thAssembly:0.55,aoi:0.75,logistics:1.00,importDuty:0.50}),
    makeDemoCountry('vn','Vietnam (Ho Chi Minh City / Hanoi)','🇻🇳',24.50,4.30,1.80,79.44,3,0.80,['ISO9001','UL','RoHS'],'Emerging RF PCBA; limited Rogers 4350B supplier base',{pcbBase:1.35,pcbLayers:4.00,pcbSurface:16.20,pcbVias:1.65,pcbHDI:0.90,pcbSetup:0.40,smtAssembly:3.00,thAssembly:0.50,aoi:0.80,logistics:1.20,importDuty:0.60}),
    makeDemoCountry('in','India (Pune / Bengaluru / Chennai)','🇮🇳',26.00,5.80,2.10,79.44,4,0.78,['ISO9001','UL','RoHS'],'ISRO space heritage; some RF PCBA capability in Bengaluru',{pcbBase:1.50,pcbLayers:4.40,pcbSurface:17.10,pcbVias:1.75,pcbHDI:0.95,pcbSetup:0.30,smtAssembly:4.20,thAssembly:0.60,aoi:1.00,logistics:1.40,importDuty:0.70}),
    makeDemoCountry('th','Thailand (Bangkok / Ayutthaya)','🇹🇭',26.50,6.20,2.20,79.44,3,0.85,['ISO9001','UL','RoHS','IATF16949'],'Automotive bias; Rogers fab capability limited to Bangkok tier',{pcbBase:1.60,pcbLayers:4.55,pcbSurface:17.30,pcbVias:1.80,pcbHDI:1.00,pcbSetup:0.25,smtAssembly:4.50,thAssembly:0.65,aoi:1.05,logistics:1.50,importDuty:0.70}),
    makeDemoCountry('my','Malaysia (Penang / Kuala Lumpur)','🇲🇾',25.00,6.50,2.10,79.44,3,0.86,['ISO9001','IATF16949','UL','RoHS'],'Keysight/Motorola heritage; strong RF/microwave process capability',{pcbBase:1.45,pcbLayers:4.25,pcbSurface:16.50,pcbVias:1.70,pcbHDI:0.90,pcbSetup:0.20,smtAssembly:4.70,thAssembly:0.68,aoi:1.12,logistics:1.40,importDuty:0.70}),
    makeDemoCountry('tw','Taiwan (Hsinchu / Taipei)','🇹🇼',33.00,9.80,2.30,79.44,2,0.93,['ISO9001','IATF16949','IPC-6012 Class 3'],'World-class RF; TTM, Tripod, Unitech all Rogers 4350B certified',{pcbBase:2.00,pcbLayers:6.10,pcbSurface:21.50,pcbVias:2.20,pcbHDI:1.20,pcbSetup:0.00,smtAssembly:7.10,thAssembly:0.80,aoi:1.90,logistics:1.60,importDuty:0.70}),
    makeDemoCountry('kr','South Korea (Suwon / Incheon)','🇰🇷',37.00,11.50,1.50,79.44,2,0.93,['ISO9001','IATF16949','IPC-6012 Class 3','AEC-Q100'],'Samsung EM/LG Innotek RF PCB; strong mmWave capability',{pcbBase:2.30,pcbLayers:7.00,pcbSurface:24.00,pcbVias:2.50,pcbHDI:1.20,pcbSetup:0.00,smtAssembly:8.30,thAssembly:0.90,aoi:2.30,logistics:1.00,importDuty:0.50}),
    makeDemoCountry('mx','Mexico (Juárez / Monterrey / Guadalajara)','🇲🇽',30.00,7.80,2.50,79.44,3,0.84,['ISO9001','IATF16949','UL'],'Jabil/Foxconn sites with Rogers capability; USMCA duty-free for US programs',{pcbBase:1.80,pcbLayers:5.40,pcbSurface:19.50,pcbVias:2.05,pcbHDI:1.10,pcbSetup:0.15,smtAssembly:5.65,thAssembly:0.70,aoi:1.45,logistics:1.70,importDuty:0.80}),
    makeDemoCountry('cz','Czech Republic (Brno / Ostrava)','🇨🇿',38.00,10.50,0.40,79.44,2,0.91,['ISO9001','IATF16949','IPC-6012 Class 3','CE'],'EU automotive (Bosch/Continental Tier-1 supply chain); EU import duty zero',{pcbBase:2.40,pcbLayers:7.20,pcbSurface:24.80,pcbVias:2.60,pcbHDI:1.00,pcbSetup:0.00,smtAssembly:7.60,thAssembly:0.84,aoi:2.06,logistics:0.40,importDuty:0.00}),
    makeDemoCountry('pl','Poland (Wrocław / Kraków)','🇵🇱',35.00,9.80,0.38,79.44,2,0.90,['ISO9001','IATF16949','IPC-6012 Class 3','CE'],'Cost-competitive EU nearshore; Wurth Elektronik / Eltek Rogers capability',{pcbBase:2.15,pcbLayers:6.55,pcbSurface:22.70,pcbVias:2.40,pcbHDI:1.00,pcbSetup:0.20,smtAssembly:7.10,thAssembly:0.78,aoi:1.92,logistics:0.38,importDuty:0.00}),
    makeDemoCountry('de','Germany (Munich / Stuttgart / Frankfurt)','🇩🇪',65.00,26.00,0.25,79.44,2,0.97,['ISO9001','IATF16949','AS9100','IPC-6012 Class 3','AEC-Q100','ECSS'],'Bosch/Continental home-base; AT&S Rogers capability; fastest automotive NPI',{pcbBase:4.20,pcbLayers:13.00,pcbSurface:44.00,pcbVias:2.30,pcbHDI:1.50,pcbSetup:0.00,smtAssembly:18.85,thAssembly:1.58,aoi:5.57,logistics:0.25,importDuty:0.00}),
    makeDemoCountry('gb','United Kingdom (Birmingham / Coventry / Edinburgh)','🇬🇧',45.00,20.00,0.00,79.44,2,0.96,['ISO9001','IATF16949','AS9100','IPC-6012 Class 3','UKCA','Def Stan'],'Proteus/Chemring Rogers boards; UK domestic with zero import risk and Def Stan support',{pcbBase:2.90,pcbLayers:8.80,pcbSurface:30.20,pcbVias:1.90,pcbHDI:1.20,pcbSetup:0.00,smtAssembly:14.50,thAssembly:1.20,aoi:4.30,logistics:0.00,importDuty:0.00}),
    makeDemoCountry('us','USA (San Jose / Austin / Milpitas)','🇺🇸',62.00,28.00,3.50,79.44,2,0.96,['ISO9001','IATF16949','AS9100','IPC-6012 Class 3','ITAR'],'TTM Rogers mmWave; Sanmina RF; ITAR-controlled variants of radar electronics',{pcbBase:4.00,pcbLayers:12.20,pcbSurface:42.10,pcbVias:2.20,pcbHDI:1.50,pcbSetup:0.00,smtAssembly:20.25,thAssembly:1.68,aoi:6.07,logistics:2.15,importDuty:1.35}),
    makeDemoCountry('jp','Japan (Osaka / Nagoya / Tokyo)','🇯🇵',95.00,32.00,1.60,79.44,3,0.99,['ISO9001','IATF16949','AS9100','JPCA','IPC-6012 Class 3'],'Meiko/Toppan Rogers ultra-precision; Denso/Toyota heritage; world-leading antenna tolerance',{pcbBase:6.20,pcbLayers:19.10,pcbSurface:65.50,pcbVias:3.00,pcbHDI:1.20,pcbSetup:0.00,smtAssembly:23.15,thAssembly:1.93,aoi:6.92,logistics:1.00,importDuty:0.60}),
  ],
};

function buildPCBDemoSection(): string {
  const ecuCN = PCB_DEMO_ECU._selectedCountryBreakdown!;
  const adasCN = PCB_DEMO_ADAS._selectedCountryBreakdown!;
  const radarCN = PCB_DEMO_BOSCH_RADAR._selectedCountryBreakdown!;
  return `
    <div style="margin-top:16px">
      <div style="font-size:0.75rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px;display:flex;align-items:center;gap:8px">
        <span style="flex:1;height:1px;background:var(--border)"></span>
        <span>🚗 Demo: Real Automotive PCB Examples</span>
        <span style="flex:1;height:1px;background:var(--border)"></span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div style="padding:12px;border:1px solid rgba(79,142,247,0.3);border-radius:10px;background:rgba(79,142,247,0.04);cursor:pointer;transition:all 0.15s"
             onmouseenter="this.style.background='rgba(79,142,247,0.09)'" onmouseleave="this.style.background='rgba(79,142,247,0.04)'"
             onclick="window.__loadPCBDemo('ecu')">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
            <span style="font-size:1.1rem">🔧</span>
            <span style="font-weight:700;font-size:0.78rem;color:var(--text-primary)">Automotive ECU</span>
            <span style="margin-left:auto;font-size:0.62rem;background:rgba(34,197,94,0.15);color:#16a34a;padding:1px 6px;border-radius:4px;font-weight:600">DEMO</span>
          </div>
          <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:8px">Engine Control Unit — 6-layer 150×100mm HDI, 290 SMT, 5 BGA, 5000 pcs/yr</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:0.70rem">
            <div><span style="color:var(--text-muted)">BOM lines:</span> <strong>14</strong></div>
            <div><span style="color:var(--text-muted)">BOM cost:</span> <strong>£48.50</strong></div>
            <div><span style="color:var(--text-muted)">China total:</span> <strong style="color:var(--accent)">£${ecuCN.totalPerBoard.toFixed(2)}</strong></div>
            <div><span style="color:var(--text-muted)">UK total:</span> <strong>£${(PCB_DEMO_ECU._countryComparison?.find(c=>c.countryId==='gb')?.totalPerBoard??0).toFixed(2)}</strong></div>
          </div>
          <div style="margin-top:8px;text-align:center">
            <span style="font-size:0.68rem;color:var(--accent);font-weight:600">▶ Try this demo</span>
          </div>
        </div>
        <div style="padding:12px;border:1px solid rgba(139,92,246,0.3);border-radius:10px;background:rgba(139,92,246,0.04);cursor:pointer;transition:all 0.15s"
             onmouseenter="this.style.background='rgba(139,92,246,0.09)'" onmouseleave="this.style.background='rgba(139,92,246,0.04)'"
             onclick="window.__loadPCBDemo('adas')">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
            <span style="font-size:1.1rem">📷</span>
            <span style="font-weight:700;font-size:0.78rem;color:var(--text-primary)">ADAS Camera PCB</span>
            <span style="margin-left:auto;font-size:0.62rem;background:rgba(34,197,94,0.15);color:#16a34a;padding:1px 6px;border-radius:4px;font-weight:600">DEMO</span>
          </div>
          <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:8px">Surround View Processor — 8-layer 80×80mm 2+N+2 HDI, 198 SMT, 8 BGA, 2000 pcs/yr</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:0.70rem">
            <div><span style="color:var(--text-muted)">BOM lines:</span> <strong>14</strong></div>
            <div><span style="color:var(--text-muted)">BOM cost:</span> <strong>£62.30</strong></div>
            <div><span style="color:var(--text-muted)">China total:</span> <strong style="color:var(--accent)">£${adasCN.totalPerBoard.toFixed(2)}</strong></div>
            <div><span style="color:var(--text-muted)">UK total:</span> <strong>£${(PCB_DEMO_ADAS._countryComparison?.find(c=>c.countryId==='gb')?.totalPerBoard??0).toFixed(2)}</strong></div>
          </div>
          <div style="margin-top:8px;text-align:center">
            <span style="font-size:0.68rem;color:#7c3aed;font-weight:600">▶ Try this demo</span>
          </div>
        </div>
        <div style="padding:12px;border:1px solid rgba(239,68,68,0.3);border-radius:10px;background:rgba(239,68,68,0.04);cursor:pointer;transition:all 0.15s"
             onmouseenter="this.style.background='rgba(239,68,68,0.09)'" onmouseleave="this.style.background='rgba(239,68,68,0.04)'"
             onclick="window.__loadPCBDemo('bosch_radar')">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
            <span style="font-size:1.1rem">📡</span>
            <span style="font-weight:700;font-size:0.78rem;color:var(--text-primary)">77 GHz Radar ECU</span>
            <span style="margin-left:auto;font-size:0.62rem;background:rgba(34,197,94,0.15);color:#16a34a;padding:1px 6px;border-radius:4px;font-weight:600">DEMO</span>
          </div>
          <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:8px">Bosch LRR5-type ACC/AEB Radar — 6-layer 100×70mm Rogers 4350B, AWR1843AOP + AURIX TC234</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:0.70rem">
            <div><span style="color:var(--text-muted)">BOM lines:</span> <strong>16</strong></div>
            <div><span style="color:var(--text-muted)">BOM cost:</span> <strong>£79.44</strong></div>
            <div><span style="color:var(--text-muted)">China total:</span> <strong style="color:var(--accent)">£${radarCN.totalPerBoard.toFixed(2)}</strong></div>
            <div><span style="color:var(--text-muted)">UK total:</span> <strong>£${(PCB_DEMO_BOSCH_RADAR._countryComparison?.find(c=>c.countryId==='gb')?.totalPerBoard??0).toFixed(2)}</strong></div>
          </div>
          <div style="margin-top:8px;text-align:center">
            <span style="font-size:0.68rem;color:#dc2626;font-weight:600">▶ Try this demo</span>
          </div>
        </div>
      </div>
      <div style="margin-top:6px;font-size:0.62rem;color:var(--text-muted);text-align:center">
        All costs computed live from the 2026 14-country manufacturing database. Click a card to see the full analysis.
      </div>
    </div>`;
}

// ─── Client-side country metadata (trend / NRE / risk) — Features 5,6,7 ─────
interface PCBCountryMeta {
  trend: { direction: 'rising' | 'stable' | 'falling'; pctChange6m: number; note: string };
  nre: { ppapGBP: number; fmeaGBP: number; dvprGBP: number; firstArticleGBP: number; iatfAuditGBP: number; totalGBP: number };
  risk: { geopolitical: number; logisticsReliability: number; qualityConsistency: number; leadTimeVariance: number };
}
function mkMeta(
  dir: 'rising' | 'stable' | 'falling', pct: number, note: string,
  ppap: number, fmea: number, dvpr: number, fai: number, iatf: number,
  geo: number, log: number, qual: number, lead: number,
): PCBCountryMeta {
  return {
    trend: { direction: dir, pctChange6m: pct, note },
    nre: { ppapGBP: ppap, fmeaGBP: fmea, dvprGBP: dvpr, firstArticleGBP: fai, iatfAuditGBP: iatf, totalGBP: ppap + fmea + dvpr + fai + iatf },
    risk: { geopolitical: geo, logisticsReliability: log, qualityConsistency: qual, leadTimeVariance: lead },
  };
}
const PCB_COUNTRY_META: Record<string, PCBCountryMeta> = {
  cn: mkMeta('rising', 4, 'Copper CCL price increase and CNY appreciation pushing fab cost up', 3500, 2800, 4200, 1800, 2500, 0.55, 0.80, 0.78, 0.80),
  vn: mkMeta('stable', 1, 'Strong EMS investment offsetting wage growth', 3800, 3000, 4500, 1900, 2800, 0.72, 0.76, 0.75, 0.74),
  in: mkMeta('rising', 3, 'PLI-driven capacity ramp but rising skilled-labour wages', 3600, 2900, 4300, 1850, 2700, 0.70, 0.70, 0.72, 0.68),
  th: mkMeta('stable', 1, 'Mature automotive EMS cluster keeps pricing flat', 4200, 3400, 5000, 2100, 3000, 0.74, 0.82, 0.84, 0.80),
  my: mkMeta('rising', 3, 'Semiconductor demand and MYR firming lift assembly rates', 4400, 3500, 5200, 2200, 3100, 0.80, 0.84, 0.85, 0.82),
  tw: mkMeta('rising', 3, 'High demand for HDI/substrate capacity constrains supply', 5000, 4000, 6000, 2500, 3300, 0.48, 0.88, 0.93, 0.86),
  kr: mkMeta('stable', 2, 'Premium HDI stable; KRW softness offsetting wage rises', 5200, 4200, 6200, 2600, 3400, 0.68, 0.90, 0.93, 0.88),
  mx: mkMeta('rising', 5, 'Nearshoring surge tightening EMS capacity and labour', 4600, 3700, 5400, 2300, 3000, 0.74, 0.78, 0.82, 0.76),
  cz: mkMeta('stable', 1, 'EU automotive demand steady; energy costs normalising', 5500, 4400, 6400, 2700, 3400, 0.92, 0.91, 0.90, 0.90),
  pl: mkMeta('falling', -2, 'EU investment and improved yields lowering effective cost', 5000, 4000, 5900, 2500, 3200, 0.90, 0.90, 0.89, 0.89),
  de: mkMeta('rising', 6, 'Energy costs and IG-Metall wage agreements raising rates', 7500, 6000, 8500, 3500, 4500, 0.96, 0.97, 0.97, 0.96),
  gb: mkMeta('stable', 2, 'Domestic capacity stable; modest inflation pass-through', 5500, 4500, 6500, 2800, 3500, 0.95, 0.97, 0.96, 0.97),
  us: mkMeta('rising', 5, 'Reshoring incentives raising demand faster than capacity', 7000, 5600, 8000, 3300, 4300, 0.90, 0.93, 0.95, 0.92),
  jp: mkMeta('stable', 1, 'Weak JPY offsetting premium fab cost inflation', 7800, 6300, 8800, 3600, 4600, 0.88, 0.95, 0.99, 0.95),
};

function computeClientRiskProfile(countryId: string, autoCount: number): { overall: number; label: string; dims: PCBCountryMeta['risk']; singleSource: number } {
  const dims = PCB_COUNTRY_META[countryId]?.risk ?? { geopolitical: 0.7, logisticsReliability: 0.8, qualityConsistency: 0.8, leadTimeVariance: 0.8 };
  const singleSource = Math.max(0.3, 1 - Math.min(autoCount, 12) * 0.05);
  const overall = dims.geopolitical * 0.25 + dims.logisticsReliability * 0.20 + dims.qualityConsistency * 0.25 + singleSource * 0.15 + dims.leadTimeVariance * 0.15;
  const label = overall >= 0.85 ? 'Low Risk' : overall >= 0.68 ? 'Medium Risk' : 'High Risk';
  return { overall, label, dims, singleSource };
}

function buildPCBImageUploadZone(): string {
  return `
    <div class="pcb-img-zone" id="pcb-img-zone">
      <input type="file" id="pcb-img-input" accept="image/jpeg,image/png,image/webp" style="display:none"/>
      <div class="pcb-img-zone-content" id="pcb-img-zone-content">
        <div style="font-size:1.4rem;margin-bottom:4px">🔬</div>
        <div style="font-size:0.78rem;font-weight:600;color:var(--text-secondary)">PCB Image-to-BOM Analysis</div>
        <div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px">Upload a PCB photo or silkscreen image — 4-stage AI pipeline detects components, builds BOM &amp; computes should-cost across 14 manufacturing countries</div>

        <!-- Manufacturing Country Selector -->
        <div style="margin-top:10px;display:flex;align-items:center;gap:8px;justify-content:center;flex-wrap:wrap">
          <label style="font-size:0.72rem;font-weight:600;color:var(--text-secondary);white-space:nowrap">🏭 Manufacturing Country:</label>
          <select id="pcb-mfg-country" style="font-size:0.72rem;padding:3px 8px;border:1px solid var(--border);border-radius:4px;background:var(--card-bg)">
            <optgroup label="Asia — Low Cost">
              <option value="cn" selected>🇨🇳 China (Shenzhen) — Default</option>
              <option value="vn">🇻🇳 Vietnam (Ho Chi Minh City)</option>
              <option value="in">🇮🇳 India (Pune / Bengaluru)</option>
            </optgroup>
            <optgroup label="Asia — Mid Tier">
              <option value="th">🇹🇭 Thailand (Bangkok)</option>
              <option value="my">🇲🇾 Malaysia (Penang)</option>
              <option value="tw">🇹🇼 Taiwan (Taoyuan / Hsinchu)</option>
              <option value="kr">🇰🇷 South Korea (Suwon)</option>
            </optgroup>
            <optgroup label="Americas">
              <option value="mx">🇲🇽 Mexico (Juárez / Monterrey)</option>
              <option value="us">🇺🇸 USA (San Jose / Austin) — ITAR</option>
            </optgroup>
            <optgroup label="Europe — Low Cost">
              <option value="cz">🇨🇿 Czech Republic (Brno)</option>
              <option value="pl">🇵🇱 Poland (Wrocław)</option>
            </optgroup>
            <optgroup label="Europe / Premium">
              <option value="de">🇩🇪 Germany (München)</option>
              <option value="gb">🇬🇧 UK (Birmingham) — Domestic</option>
            </optgroup>
            <optgroup label="Asia — Premium">
              <option value="jp">🇯🇵 Japan (Nagano) — Ultra-precision</option>
            </optgroup>
          </select>
          <input type="number" id="pcb-order-qty" value="100" min="1" step="50"
            style="width:70px;font-size:0.72rem;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--card-bg)"
            title="Order quantity (affects setup amortisation)"/>
          <label style="font-size:0.68rem;color:var(--text-muted)">qty</label>
        </div>

        <!-- Multi-image slots: Top, Bottom, + 3 Additional -->
        <div style="margin-top:10px">
          <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:6px;text-align:center">
            Upload up to 5 photos — top &amp; bottom sides + close-ups for best accuracy
          </div>
          <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
            ${(['Top side ★', 'Bottom side', 'Close-up 1', 'Close-up 2', 'Close-up 3'] as const).map((label, idx) => `
              <div id="pcb-img-slot-${idx}"
                   style="width:96px;min-height:90px;border:1.5px dashed var(--border);border-radius:8px;cursor:pointer;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;transition:border-color 0.15s;overflow:hidden;background:var(--card-bg)"
                   title="Click to choose ${label.replace(' ★', '')} image">
                <input type="file" id="pcb-img-input-${idx}" accept="image/jpeg,image/png,image/webp" style="display:none"/>
                <div id="pcb-img-slot-empty-${idx}" style="display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px">
                  <span style="font-size:1.3rem">${idx === 0 ? '📷' : idx === 1 ? '🔄' : '🔍'}</span>
                  <span style="font-size:0.60rem;color:var(--text-muted);text-align:center;line-height:1.3">${label}</span>
                </div>
                <div id="pcb-img-slot-filled-${idx}" style="display:none;width:100%;height:100%;position:relative">
                  <img id="pcb-img-thumb-${idx}" alt="${label}" style="width:100%;height:90px;object-fit:cover;display:block"/>
                  <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.55);padding:2px 4px">
                    <span style="font-size:0.58rem;color:#fff;font-weight:600">${label.replace(' ★', '')}</span>
                  </div>
                  <button id="pcb-img-remove-${idx}"
                          style="position:absolute;top:2px;right:2px;background:#ef4444;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:0.65rem;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:1"
                          title="Remove this image">×</button>
                </div>
              </div>`).join('')}
          </div>
          <div id="pcb-img-count" style="font-size:0.62rem;color:var(--text-muted);margin-top:4px;text-align:center">No images selected</div>
        </div>
        <div style="display:flex;gap:6px;margin-top:8px;justify-content:center;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="pcb-img-analyze-btn" disabled>🔬 Analyze PCB</button>
        </div>

        <!-- Optional BOM/netlist file upload (Priority 2) -->
        <div style="margin-top:8px;font-size:0.70rem">
          <label style="color:var(--text-muted)">Optional: attach BOM/netlist file</label>
          <div style="display:flex;align-items:center;gap:6px;margin-top:4px;justify-content:center;flex-wrap:wrap">
            <input type="file" id="pcb-bom-input" accept=".csv,.xml,.txt" style="display:none"/>
            <button class="btn btn-secondary btn-sm" id="pcb-bom-pick-btn" style="font-size:0.65rem">📋 Attach BOM</button>
            <span id="pcb-bom-filename" style="font-size:0.65rem;color:var(--text-muted)">No file — AI will extract BOM from image</span>
          </div>
        </div>

        <!-- Automotive NRE toggle (Feature 7) -->
        <div style="margin-top:8px;display:flex;justify-content:center">
          <label style="font-size:0.70rem;display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="checkbox" id="pcb-automotive-nre" style="margin:0"/>
            <span>Include IATF/Automotive NRE costs (PPAP, FMEA, DVP&amp;R, first-article)</span>
          </label>
        </div>

        <!-- Live Pricing (optional, collapsible) -->
        <details style="margin-top:8px;text-align:left">
          <summary style="font-size:0.68rem;color:var(--text-muted);cursor:pointer;user-select:none">⚡ Live Component Pricing (optional)</summary>
          <div style="margin-top:6px;padding:8px;background:var(--border);border-radius:6px;font-size:0.70rem">
            <div style="color:var(--text-muted);margin-bottom:6px">Fetch real-time distributor prices for identified IC part numbers. Requires an API key from your chosen provider.</div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
              <label style="white-space:nowrap;font-weight:600">Provider:</label>
              <select id="pcb-live-provider" style="font-size:0.70rem;padding:2px 6px;border:1px solid var(--border);border-radius:3px;background:var(--card-bg)">
                <option value="octopart">Octopart / Nexar (GraphQL)</option>
                <option value="rs">RS Components</option>
                <option value="farnell">Farnell / element14</option>
              </select>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <label style="white-space:nowrap;font-weight:600">API Key:</label>
              <input type="password" id="pcb-live-api-key" placeholder="Paste your API key here"
                style="flex:1;min-width:120px;font-size:0.70rem;padding:2px 6px;border:1px solid var(--border);border-radius:3px;background:var(--card-bg)"/>
              <button class="btn btn-secondary btn-sm" id="pcb-live-fetch-btn" disabled
                style="font-size:0.68rem;padding:3px 8px">Fetch Live Prices</button>
            </div>
            <div id="pcb-live-status" style="margin-top:4px;font-size:0.66rem;color:var(--text-muted)"></div>
          </div>
        </details>
      </div>
    </div>`;
}

function wirePCBImageZone(): void {
  const analyzeBtn = el<HTMLButtonElement>('pcb-img-analyze-btn');
  const countLabel = el('pcb-img-count');
  const SLOT_LABELS = ['Top side', 'Bottom side', 'Close-up 1', 'Close-up 2', 'Close-up 3'];

  function updateAnalyzeBtn(): void {
    const selected = pcbImageFiles.filter(Boolean);
    const n = selected.length;
    if (countLabel) {
      countLabel.textContent = n === 0
        ? 'No images selected'
        : `${n} image${n > 1 ? 's' : ''} selected (${pcbImageFiles.map((f, i) => f ? SLOT_LABELS[i] : null).filter(Boolean).join(', ')})`;
    }
    if (analyzeBtn) analyzeBtn.disabled = n === 0;
  }

  function setSlot(idx: number, file: File): void {
    pcbImageFiles[idx] = file;
    const thumb = el<HTMLImageElement>(`pcb-img-thumb-${idx}`);
    if (thumb) thumb.src = URL.createObjectURL(file);
    const emptyDiv = el(`pcb-img-slot-empty-${idx}`);
    const filledDiv = el(`pcb-img-slot-filled-${idx}`);
    const slot = el(`pcb-img-slot-${idx}`);
    if (emptyDiv) emptyDiv.style.display = 'none';
    if (filledDiv) filledDiv.style.display = 'block';
    if (slot) slot.style.borderColor = idx === 0 ? 'var(--accent)' : 'rgba(79,142,247,0.4)';
    updateAnalyzeBtn();
  }

  function clearSlot(idx: number): void {
    pcbImageFiles[idx] = null;
    const emptyDiv = el(`pcb-img-slot-empty-${idx}`);
    const filledDiv = el(`pcb-img-slot-filled-${idx}`);
    const slot = el(`pcb-img-slot-${idx}`);
    const input = el<HTMLInputElement>(`pcb-img-input-${idx}`);
    if (emptyDiv) emptyDiv.style.display = 'flex';
    if (filledDiv) filledDiv.style.display = 'none';
    if (slot) slot.style.borderColor = '';
    if (input) input.value = '';
    updateAnalyzeBtn();
  }

  // Wire each of the 5 slots
  [0, 1, 2, 3, 4].forEach(idx => {
    const slot = el(`pcb-img-slot-${idx}`);
    const input = el<HTMLInputElement>(`pcb-img-input-${idx}`);
    const removeBtn = el(`pcb-img-remove-${idx}`);

    slot?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === `pcb-img-remove-${idx}`) return;
      input?.click();
    });
    input?.addEventListener('change', () => {
      const f = input?.files?.[0];
      if (f) setSlot(idx, f);
    });
    removeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      clearSlot(idx);
    });
  });

  // Analyze button — no argument needed, reads pcbImageFiles state
  analyzeBtn?.addEventListener('click', () => void analyzePCBImages());

  // Drag-and-drop: drop one or multiple files, fill slots in order
  const zone = el('pcb-img-zone');
  zone?.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone?.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone?.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const dropped = Array.from((e as DragEvent).dataTransfer?.files ?? [])
      .filter(f => f.type.startsWith('image/'))
      .slice(0, 5);
    dropped.forEach(f => {
      const emptySlot = pcbImageFiles.findIndex(s => s === null);
      if (emptySlot !== -1) setSlot(emptySlot, f);
    });
  });

  // BOM file picker (Priority 2)
  const bomPickBtn = el<HTMLButtonElement>('pcb-bom-pick-btn');
  const bomInput = el<HTMLInputElement>('pcb-bom-input');
  const bomLabel = el('pcb-bom-filename');
  bomPickBtn?.addEventListener('click', () => bomInput?.click());
  bomInput?.addEventListener('change', () => {
    const bf = bomInput?.files?.[0] ?? null;
    pcbBOMFile = bf;
    if (bomLabel) bomLabel.textContent = bf
      ? `📋 ${bf.name} (${(bf.size / 1024).toFixed(0)} KB) — used as ground truth`
      : 'No file — AI will extract BOM from image';
  });

  // Automotive NRE toggle (Feature 7)
  const nreToggle = el<HTMLInputElement>('pcb-automotive-nre');
  nreToggle?.addEventListener('change', () => {
    pcbNREEnabled = !!nreToggle.checked;
    if (pcbImageResult) injectPCBImagePanel();
  });
}

async function analyzePCBImages(): Promise<void> {
  const selectedFiles = pcbImageFiles.map((f, i) => f ? { file: f, label: ['Top side', 'Bottom side', 'Close-up 1', 'Close-up 2', 'Close-up 3'][i] } : null).filter((x): x is { file: File; label: string } => x !== null);
  if (!selectedFiles.length || pcbImageLoading) return;

  pcbImageLoading = true;

  const analyzeBtn = el<HTMLButtonElement>('pcb-img-analyze-btn');
  if (analyzeBtn) { analyzeBtn.disabled = true; analyzeBtn.textContent = `⏳ Analyzing ${selectedFiles.length} image${selectedFiles.length > 1 ? 's' : ''}…`; }

  const zone = el('pcb-img-zone');
  if (zone) zone.classList.add('pcb-img-zone--analyzing');

  const apiKey = (document.querySelector<HTMLInputElement>('#api-key-input'))?.value?.trim()
    ?? sessionStorage.getItem('cv_api_key') ?? '';

  const selectedCountry = (document.getElementById('pcb-mfg-country') as HTMLSelectElement)?.value ?? 'cn';
  const orderQty = (document.getElementById('pcb-order-qty') as HTMLInputElement)?.value ?? '100';

  const formData = new FormData();
  // Append all selected images and their labels
  selectedFiles.forEach(({ file }) => formData.append('pcbImages', file));
  formData.append('pcbImageLabels', JSON.stringify(selectedFiles.map(x => x.label)));
  formData.append('country', selectedCountry);
  formData.append('orderQty', orderQty);

  // Optional BOM/netlist file (Priority 2)
  const bomFileInput = document.getElementById('pcb-bom-input') as HTMLInputElement | null;
  const bomFile = bomFileInput?.files?.[0] ?? pcbBOMFile;
  if (bomFile) formData.append('bomFile', bomFile);

  // Store the primary (first) image as a data URL for board annotation (Feature 9)
  try {
    const primaryFile = selectedFiles[0].file;
    pcbImageDataURL = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(primaryFile);
    });
  } catch { pcbImageDataURL = null; }

  try {
    const resp = await fetch('/api/pcb/analyze-image', {
      method: 'POST',
      headers: apiKey ? { 'x-api-key': apiKey } : {},
      body: formData,
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText })) as { error: string };
      throw new Error(err.error ?? resp.statusText);
    }
    const data = await resp.json() as {
      success: boolean;
      analysis: PCBImageAnalysis;
      selectedCountry?: string;
      selectedCountryBreakdown?: PCBCountryBreakdown;
      countryComparison?: PCBCountryBreakdown[];
      volumeCurves?: Record<string, VolumeCurvePoint[]>;
      complexityScore?: PCBComplexityScore;
    };
    pcbImageResult = data.analysis;
    // Attach country data to analysis object for rendering
    if (pcbImageResult) {
      pcbImageResult._selectedCountry = data.selectedCountry ?? selectedCountry;
      pcbImageResult._selectedCountryBreakdown = data.selectedCountryBreakdown ?? undefined;
      pcbImageResult._countryComparison = data.countryComparison ?? [];
      pcbImageResult._volumeCurves = data.volumeCurves ?? undefined;
      if (data.complexityScore) pcbImageResult.complexityScore = data.complexityScore;
    }
    injectPCBImagePanel();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const resultsEl = el('pcb-img-results');
    if (resultsEl) resultsEl.innerHTML = `<div class="pcb-img-error">⚠ Analysis failed: ${msg}</div>`;
  } finally {
    pcbImageLoading = false;
    const n = pcbImageFiles.filter(Boolean).length;
    if (analyzeBtn) { analyzeBtn.disabled = n === 0; analyzeBtn.textContent = '🔬 Re-analyze'; }
    if (zone) zone.classList.remove('pcb-img-zone--analyzing');
  }
}

function injectPCBDemoCards(): void {
  const resultsEl = el('pcb-img-results');
  if (!resultsEl || pcbImageResult) return;
  resultsEl.innerHTML = buildPCBDemoSection();
}

(window as unknown as Record<string, unknown>).__loadPCBDemo = function(id: string): void {
  pcbImageResult = id === 'adas' ? PCB_DEMO_ADAS : id === 'bosch_radar' ? PCB_DEMO_BOSCH_RADAR : PCB_DEMO_ECU;
  injectPCBImagePanel();
  el('pcb-img-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function injectPCBImagePanel(): void {
  const resultsEl = el('pcb-img-results');
  if (!resultsEl || !pcbImageResult) return;
  resultsEl.innerHTML = buildPCBImagePanel(pcbImageResult);

  el('pcb-apply-fab-btn')?.addEventListener('click', () => applyPCBImageToFab());
  el('pcb-apply-pcba-btn')?.addEventListener('click', () => applyPCBImageToPCBA());
  el('pcb-clear-btn')?.addEventListener('click', () => {
    pcbImageResult = null;
    pcbImageFiles = [null, null, null, null, null];
    pcbImageDataURL = null;
    if (_pcbVolumeChart) { _pcbVolumeChart.destroy(); _pcbVolumeChart = null; }
    injectPCBDemoCards();
  });

  // Feature wiring (Phase 1-2)
  el('pcb-export-csv-btn')?.addEventListener('click', () => { if (pcbImageResult) exportPCBAnalysisCSV(pcbImageResult); });
  el('pcb-export-pdf-btn')?.addEventListener('click', () => { if (pcbImageResult) exportPCBAnalysisPrint(pcbImageResult); });
  if (pcbImageResult) {
    wireScenarioBuilder(pcbImageResult);
    wireRFQTracker(pcbImageResult);
    wireBoardAnnotation(pcbImageResult);
    drawVolumeCurveChart(pcbImageResult);
  }

  // Enable live pricing fetch button if there are OCR-identified parts
  const icMarkings = pcbImageResult.ocrExtraction?.icMarkings ?? [];
  const liveFetchBtn = document.getElementById('pcb-live-fetch-btn') as HTMLButtonElement | null;
  if (liveFetchBtn && icMarkings.length > 0) {
    liveFetchBtn.disabled = false;
    liveFetchBtn.title = `Fetch live prices for: ${icMarkings.slice(0, 3).join(', ')}${icMarkings.length > 3 ? '…' : ''}`;
    liveFetchBtn.addEventListener('click', () => void fetchLivePricingForBOM(icMarkings));
  }

  // Edit toggle
  el('pcb-edit-toggle-btn')?.addEventListener('click', () => {
    if (pcbEditMode) {
      pcbEditMode = false;
    } else {
      // Save original values before entering edit mode (only first time)
      if (pcbImageResult && !pcbImageResult._originalAIValues) {
        pcbImageResult._originalAIValues = JSON.parse(JSON.stringify(pcbImageResult)) as PCBImageAnalysis;
      }
      pcbEditMode = true;
    }
    injectPCBImagePanel();
  });

  // Re-analyze with corrections
  el('pcb-reanalyze-btn')?.addEventListener('click', () => void reanalyzePCBWithCorrections());

  // Reset to AI values
  el('pcb-reset-ai-btn')?.addEventListener('click', () => {
    if (pcbImageResult?._originalAIValues) {
      const orig = pcbImageResult._originalAIValues;
      pcbImageResult = { ...orig };
      pcbEditMode = false;
      injectPCBImagePanel();
      showToast('Reset to original AI values', 'info');
    }
  });

  // Add BOM row
  el('pcb-bom-add-row-btn')?.addEventListener('click', () => {
    if (!pcbImageResult) return;
    pcbImageResult.bom.push({ refDes: '', componentType: 'passive_0402', description: 'New component', pkg: '', value: '', voltage: '', qty: 1, unitPriceGBP: 0.01, moq: 1, automotive: false, highCost: false });
    injectPCBImagePanel();
  });

  // BOM delete row buttons
  document.querySelectorAll<HTMLButtonElement>('.pcb-bom-delete-row').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.bomIdx ?? '-1', 10);
      if (pcbImageResult && idx >= 0) {
        pcbImageResult.bom.splice(idx, 1);
        injectPCBImagePanel();
      }
    });
  });
}

async function fetchLivePricingForBOM(icMarkings: string[]): Promise<void> {
  const provider = (document.getElementById('pcb-live-provider') as HTMLSelectElement)?.value ?? 'octopart';
  const apiKey = (document.getElementById('pcb-live-api-key') as HTMLInputElement)?.value?.trim() ?? '';
  const statusEl = document.getElementById('pcb-live-status');
  const fetchBtn = document.getElementById('pcb-live-fetch-btn') as HTMLButtonElement | null;

  if (!apiKey) {
    if (statusEl) statusEl.textContent = '⚠ Please enter an API key first.';
    return;
  }
  if (fetchBtn) { fetchBtn.disabled = true; fetchBtn.textContent = '⏳ Fetching…'; }
  if (statusEl) statusEl.textContent = `Querying ${provider} for ${icMarkings.length} parts…`;

  try {
    const resp = await fetch('/api/pcb/live-pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partNumbers: icMarkings, provider, apiKey, qty: 100 }),
    });
    const data = await resp.json() as { success?: boolean; prices?: Array<{ mpn: string; unitPriceGBP: number; stockQty: number; distPartNumber: string; description: string }>; error?: string };
    if (!resp.ok || data.error) throw new Error(data.error ?? resp.statusText);

    const prices = data.prices ?? [];
    if (statusEl) statusEl.textContent = `✓ Live prices fetched for ${prices.length}/${icMarkings.length} parts.`;

    // Update BOM table rows with live prices
    if (pcbImageResult && prices.length > 0) {
      const priceMap = new Map(prices.map(p => [p.mpn.toUpperCase(), p]));
      pcbImageResult.bom = pcbImageResult.bom.map(item => {
        const live = item.partNumber ? priceMap.get(item.partNumber.toUpperCase()) : undefined;
        if (live) return { ...item, unitPriceGBP: live.unitPriceGBP, lineConf: 0.95, ocrExtracted: true };
        return item;
      });
      injectPCBImagePanel();
      showToast(`Live prices updated for ${prices.length} components from ${provider}`, 'info');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (statusEl) statusEl.textContent = `⚠ Error: ${msg.slice(0, 120)}`;
    showToast(`Live pricing failed: ${msg.slice(0, 80)}`, 'error');
  } finally {
    if (fetchBtn) { fetchBtn.disabled = false; fetchBtn.textContent = 'Fetch Live Prices'; }
  }
}

function collectPCBEditsFromDOM(): { correctedSpec: PCBImageAnalysis['boardSpec']; correctedAssembly: PCBImageAnalysis['assembly']; correctedBOM: PCBBOMItem[] } {
  const g = (id: string) => (document.getElementById(id) as HTMLInputElement | null);
  const gNum = (id: string, def: number) => parseFloat(g(id)?.value ?? '') || def;
  const gBool = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.checked ?? false;

  const r = pcbImageResult!;
  const correctedSpec: PCBImageAnalysis['boardSpec'] = {
    estimatedLayers:          Math.round(gNum('pcb-edit-layers', r.boardSpec.estimatedLayers)),
    widthMm:                  gNum('pcb-edit-width', r.boardSpec.widthMm),
    heightMm:                 gNum('pcb-edit-height', r.boardSpec.heightMm),
    surfaceFinish:            g('pcb-edit-surface')?.value ?? r.boardSpec.surfaceFinish,
    solderMaskColour:         r.boardSpec.solderMaskColour,
    silkscreenSides:          r.boardSpec.silkscreenSides,
    throughVias:              Math.round(gNum('pcb-edit-through-vias', r.boardSpec.throughVias)),
    blindVias:                Math.round(gNum('pcb-edit-blind-vias', r.boardSpec.blindVias)),
    buriedVias:               r.boardSpec.buriedVias,
    microVias:                Math.round(gNum('pcb-edit-micro-vias', r.boardSpec.microVias)),
    bgaDetected:              r.boardSpec.bgaDetected,
    minTraceSpaceMm:          r.boardSpec.minTraceSpaceMm,
    technologyType:           g('pcb-edit-tech')?.value ?? r.boardSpec.technologyType,
    hdiStructure:             g('pcb-edit-hdi')?.value ?? r.boardSpec.hdiStructure,
    impedanceControlRequired: gBool('pcb-edit-impedance'),
    copperWeightOz:           gNum('pcb-edit-copper-oz', r.boardSpec.copperWeightOz),
    qualityGrade:             g('pcb-edit-quality')?.value ?? r.boardSpec.qualityGrade,
    panelUtilisation:         r.boardSpec.panelUtilisation,
  };

  const correctedAssembly: PCBImageAnalysis['assembly'] = {
    smtPlacements:    Math.round(gNum('pcb-edit-smt', r.assembly.smtPlacements)),
    throughHoleJoints:Math.round(gNum('pcb-edit-th-joints', r.assembly.throughHoleJoints)),
    manualJoints:     Math.round(gNum('pcb-edit-manual-joints', r.assembly.manualJoints)),
    bgaCount:         Math.round(gNum('pcb-edit-bga-count', r.assembly.bgaCount)),
    complexity:       g('pcb-edit-complexity')?.value ?? r.assembly.complexity,
    reflowSides:      Math.round(gNum('pcb-edit-reflow-sides', r.assembly.reflowSides)),
    aoiRequired:      gBool('pcb-edit-aoi'),
    ictTimeSec:       gNum('pcb-edit-ict-time', r.assembly.ictTimeSec),
  };

  // Collect BOM edits from table
  const correctedBOM: PCBBOMItem[] = r.bom.map((item, i) => {
    const qtyInput = document.querySelector<HTMLInputElement>(`.pcb-edit-bom-qty[data-bom-idx="${i}"]`);
    const priceInput = document.querySelector<HTMLInputElement>(`.pcb-edit-bom-price[data-bom-idx="${i}"]`);
    return {
      ...item,
      qty: Math.round(parseFloat(qtyInput?.value ?? '') || item.qty),
      unitPriceGBP: parseFloat(priceInput?.value ?? '') || item.unitPriceGBP,
    };
  });

  return { correctedSpec, correctedAssembly, correctedBOM };
}

async function reanalyzePCBWithCorrections(): Promise<void> {
  if (!pcbImageResult || pcbImageLoading) return;
  const { correctedSpec, correctedAssembly, correctedBOM } = collectPCBEditsFromDOM();

  const reanalyzeBtn = el<HTMLButtonElement>('pcb-reanalyze-btn');
  if (reanalyzeBtn) { reanalyzeBtn.disabled = true; reanalyzeBtn.textContent = '⏳ Re-analyzing…'; }
  pcbImageLoading = true;

  const apiKey = (document.querySelector<HTMLInputElement>('#api-key-input'))?.value?.trim()
    ?? sessionStorage.getItem('cv_api_key') ?? '';

  const selectedCountry = (document.getElementById('pcb-mfg-country') as HTMLSelectElement)?.value ?? 'cn';
  const orderQty = (document.getElementById('pcb-order-qty') as HTMLInputElement)?.value ?? '100';

  const formData = new FormData();
  // Append images if available
  const activeFiles = pcbImageFiles.filter((f): f is File => f !== null);
  activeFiles.forEach(f => formData.append('pcbImages', f));
  if (activeFiles.length > 0) {
    formData.append('pcbImageLabels', JSON.stringify(
      pcbImageFiles.map((f, i) => f ? ['Top side','Bottom side','Close-up 1','Close-up 2','Close-up 3'][i] : null).filter(Boolean)
    ));
  }
  formData.append('correctedSpec', JSON.stringify(correctedSpec));
  formData.append('correctedBOM', JSON.stringify(correctedBOM));
  formData.append('correctedAssembly', JSON.stringify(correctedAssembly));
  formData.append('domain', pcbImageResult.stage1Classification?.domain ?? 'general');
  formData.append('ocrMarkings', JSON.stringify(pcbImageResult.ocrExtraction?.icMarkings ?? []));
  formData.append('country', selectedCountry);
  formData.append('orderQty', orderQty);

  try {
    const resp = await fetch('/api/pcb/reanalyze', {
      method: 'POST',
      headers: apiKey ? { 'x-api-key': apiKey } : {},
      body: formData,
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText })) as { error: string };
      throw new Error(err.error ?? resp.statusText);
    }
    const data = await resp.json() as {
      success: boolean;
      analysis: PCBImageAnalysis;
      selectedCountry?: string;
      selectedCountryBreakdown?: PCBCountryBreakdown;
      countryComparison?: PCBCountryBreakdown[];
      volumeCurves?: Record<string, VolumeCurvePoint[]>;
      complexityScore?: PCBComplexityScore;
    };

    // Compute cost deltas (new total - original total per country)
    const costDeltas: Record<string, number> = {};
    const origComparison = pcbImageResult._originalAIValues?._countryComparison ?? pcbImageResult._countryComparison ?? [];
    const origMap = new Map(origComparison.map(c => [c.countryId, c.totalPerBoard]));
    (data.countryComparison ?? []).forEach(c => {
      const orig = origMap.get(c.countryId);
      if (orig !== undefined) costDeltas[c.countryId] = c.totalPerBoard - orig;
    });

    const originalAIValues = pcbImageResult._originalAIValues ?? JSON.parse(JSON.stringify(pcbImageResult)) as PCBImageAnalysis;

    pcbImageResult = data.analysis;
    if (pcbImageResult) {
      pcbImageResult._selectedCountry = data.selectedCountry ?? selectedCountry;
      pcbImageResult._selectedCountryBreakdown = data.selectedCountryBreakdown ?? undefined;
      pcbImageResult._countryComparison = data.countryComparison ?? [];
      pcbImageResult._volumeCurves = data.volumeCurves ?? undefined;
      if (data.complexityScore) pcbImageResult.complexityScore = data.complexityScore;
      pcbImageResult._originalAIValues = originalAIValues;
      pcbImageResult._isReanalyzed = true;
      pcbImageResult._costDeltas = costDeltas;
    }
    pcbEditMode = false;
    injectPCBImagePanel();
    showToast('Re-analysis complete — updated with corrected data', 'info');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`Re-analysis failed: ${msg.slice(0, 100)}`, 'error');
    if (reanalyzeBtn) { reanalyzeBtn.disabled = false; reanalyzeBtn.textContent = '♻ Re-analyze with Corrections'; }
  } finally {
    pcbImageLoading = false;
  }
}

function buildPCBImagePanel(r: PCBImageAnalysis): string {
  const b = r.boardSpec;
  const a = r.assembly;
  const c = r.costEstimates;
  const confClass = r.confidenceLevel === 'High' ? 'score-high' : r.confidenceLevel === 'Medium' ? 'score-med' : 'score-low';

  const totalBOMLines = r.bom.length;
  const totalPlacements = a.smtPlacements;
  const totalBOMCost = c.totalBOMCostGBP.toFixed(2);

  const bomRows = r.bom.map((item, i) => `
    <tr class="${item.highCost ? 'pcb-bom-row--high-cost' : ''}" data-bom-idx="${i}">
      <td>${i + 1}</td>
      <td>${item.refDes}</td>
      <td>${item.description}</td>
      <td>${item.pkg}</td>
      <td>${item.value}</td>
      <td>${item.voltage}</td>
      <td>${item.partNumber ? `<span style="font-size:0.68rem;font-family:monospace;background:var(--border);padding:1px 4px;border-radius:3px">${item.partNumber}${item.ocrExtracted ? ' <span title="OCR extracted" style="color:var(--green)">&#10003;</span>' : ''}</span>` : ''}${(item.lineConf !== undefined && item.lineConf < 0.6) ? ' <span title="Low confidence" style="color:orange;font-size:0.65rem">&#9888;</span>' : ''}</td>
      <td>${pcbEditMode ? `<input class="pcb-edit-bom-qty" data-bom-idx="${i}" type="number" min="1" value="${item.qty}" style="width:50px"/>` : String(item.qty)}</td>
      <td>${pcbEditMode ? `<input class="pcb-edit-bom-price" data-bom-idx="${i}" type="number" min="0" step="0.001" value="${item.unitPriceGBP.toFixed(3)}" style="width:65px"/>` : `&#163;${item.unitPriceGBP.toFixed(3)}`}</td>
      <td>&#163;${(item.qty * item.unitPriceGBP).toFixed(2)}</td>
      <td>${item.automotive ? '<span class="pcb-badge pcb-badge--auto">AEC</span>' : ''}${item.highCost ? '<span class="pcb-badge pcb-badge--cost">$$</span>' : ''}${pcbEditMode ? `<button class="pcb-bom-delete-row btn btn-secondary btn-sm" data-bom-idx="${i}" style="font-size:0.6rem;padding:1px 4px;margin-left:2px">&#128465;</button>` : ''}</td>
    </tr>`).join('');

  const insights = r.aiInsights.map(s => `<li>${s}</li>`).join('');
  const dfm = r.dfmIssues.map(s => `<li>⚠ ${s}</li>`).join('');
  const opts = r.optimisationSuggestions.map(s => `<li>💡 ${s}</li>`).join('');
  const limits = r.analysisLimitations.map(s => `<li>${s}</li>`).join('');
  const complexityScoreHtml = r.complexityScore ? `<div class="occt-stat"><div class="occt-stat-value">${r.complexityScore.score}/100</div><div class="occt-stat-label">Complexity (${r.complexityScore.label})</div></div>
        <div class="occt-stat"><div class="occt-stat-value">Class ${r.complexityScore.ipcClass}</div><div class="occt-stat-label">IPC class</div></div>` : '';

  return `
    <div class="pcb-analysis-panel" style="${pcbEditMode ? 'border:2px solid #f59e0b;' : ''}">
      <div class="pcb-analysis-header">
        <span style="font-size:1rem">🔬</span>
        <div style="flex:1">
          <strong>${r.partName}</strong>
          <span style="font-size:0.65rem;color:var(--text-muted);margin-left:8px">PCB Image Analysis</span>
        </div>
        <span class="occt-mfg-score ${confClass}">${r.confidenceLevel} Confidence</span>
        ${r._isReanalyzed ? '<span style="background:#16a34a;color:#fff;font-size:0.6rem;padding:2px 6px;border-radius:10px;margin-left:6px">&#10003; Recalculated</span>' : ''}
        <button class="btn btn-secondary btn-sm" id="pcb-edit-toggle-btn" style="font-size:0.65rem;padding:2px 8px">${pcbEditMode ? '&#10005; Cancel Edit' : '&#9999; Edit'}</button>
        <button class="btn btn-secondary btn-sm" id="pcb-clear-btn" style="font-size:0.65rem;padding:2px 8px">&#10005; Clear</button>
      </div>

      <div style="display:flex;gap:6px;margin-top:6px">
        <button class="btn btn-secondary btn-sm" id="pcb-export-csv-btn" style="font-size:0.65rem">&#11015; Export CSV</button>
        <button class="btn btn-secondary btn-sm" id="pcb-export-pdf-btn" style="font-size:0.65rem">&#128438; Print/PDF</button>
      </div>

      ${pcbEditMode ? `<div id="pcb-edit-actions" style="display:flex;gap:8px;margin-top:6px;padding:8px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:6px;align-items:center">
        <span style="font-size:0.72rem;color:#f59e0b;flex:1">&#9999; Edit mode — modify spec, assembly, or BOM then re-analyze</span>
        <button class="btn btn-primary btn-sm" id="pcb-reanalyze-btn" style="font-size:0.65rem">&#9851; Re-analyze with Corrections</button>
        <button class="btn btn-secondary btn-sm" id="pcb-reset-ai-btn" style="font-size:0.65rem" ${!r._originalAIValues ? 'disabled' : ''}>&#8634; Reset to AI values</button>
      </div>` : ''}

      ${pcbEditMode ? `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:8px;padding:10px;background:var(--card-bg);border-radius:6px;border:1px solid var(--border)">
        <div style="grid-column:1/-1;font-size:0.72rem;font-weight:700;color:var(--text-secondary);margin-bottom:4px">Board Spec</div>
        <label style="font-size:0.68rem">Layers<br/><input type="number" id="pcb-edit-layers" min="1" value="${b.estimatedLayers}" style="width:60px"/></label>
        <label style="font-size:0.68rem">Width (mm)<br/><input type="number" id="pcb-edit-width" min="0" value="${b.widthMm}" style="width:60px"/></label>
        <label style="font-size:0.68rem">Height (mm)<br/><input type="number" id="pcb-edit-height" min="0" value="${b.heightMm}" style="width:60px"/></label>
        <label style="font-size:0.68rem">Surface Finish<br/><select id="pcb-edit-surface"><option value="hasl" ${b.surfaceFinish==='hasl'?'selected':''}>HASL</option><option value="hasl_lf" ${b.surfaceFinish==='hasl_lf'?'selected':''}>HASL LF</option><option value="enig" ${b.surfaceFinish==='enig'?'selected':''}>ENIG</option><option value="osp" ${b.surfaceFinish==='osp'?'selected':''}>OSP</option><option value="enepig" ${b.surfaceFinish==='enepig'?'selected':''}>ENEPIG</option><option value="iteq" ${b.surfaceFinish==='iteq'?'selected':''}>ITEQ</option></select></label>
        <label style="font-size:0.68rem">Through Vias<br/><input type="number" id="pcb-edit-through-vias" min="0" value="${b.throughVias}" style="width:60px"/></label>
        <label style="font-size:0.68rem">Blind Vias<br/><input type="number" id="pcb-edit-blind-vias" min="0" value="${b.blindVias}" style="width:60px"/></label>
        <label style="font-size:0.68rem">Micro Vias<br/><input type="number" id="pcb-edit-micro-vias" min="0" value="${b.microVias}" style="width:60px"/></label>
        <label style="font-size:0.68rem">Quality Grade<br/><select id="pcb-edit-quality"><option value="consumer" ${b.qualityGrade==='consumer'?'selected':''}>Consumer</option><option value="industrial" ${b.qualityGrade==='industrial'?'selected':''}>Industrial</option><option value="auto_grade2" ${b.qualityGrade==='auto_grade2'?'selected':''}>Auto Grade 2</option><option value="auto_grade1" ${b.qualityGrade==='auto_grade1'?'selected':''}>Auto Grade 1</option><option value="aerospace" ${b.qualityGrade==='aerospace'?'selected':''}>Aerospace</option></select></label>
        <label style="font-size:0.68rem">Technology<br/><select id="pcb-edit-tech"><option value="FR4_STD" ${b.technologyType==='FR4_STD'?'selected':''}>FR4 Std</option><option value="FR4_HTg" ${b.technologyType==='FR4_HTg'?'selected':''}>FR4 HTg</option><option value="HDI_RIGID" ${b.technologyType==='HDI_RIGID'?'selected':''}>HDI Rigid</option><option value="RIGID_FLEX" ${b.technologyType==='RIGID_FLEX'?'selected':''}>Rigid-Flex</option><option value="RF_MICRO" ${b.technologyType==='RF_MICRO'?'selected':''}>RF Micro</option></select></label>
        <label style="font-size:0.68rem">HDI Structure<br/><select id="pcb-edit-hdi"><option value="none" ${b.hdiStructure==='none'?'selected':''}>None</option><option value="1plus_n_plus1" ${b.hdiStructure==='1plus_n_plus1'?'selected':''}>1+N+1</option><option value="2plus_n_plus2" ${b.hdiStructure==='2plus_n_plus2'?'selected':''}>2+N+2</option><option value="any_layer" ${b.hdiStructure==='any_layer'?'selected':''}>Any Layer</option></select></label>
        <label style="font-size:0.68rem">Impedance Ctrl<br/><input type="checkbox" id="pcb-edit-impedance" ${b.impedanceControlRequired?'checked':''}/></label>
        <label style="font-size:0.68rem">Copper (oz)<br/><input type="number" id="pcb-edit-copper-oz" min="0" step="0.5" value="${b.copperWeightOz}" style="width:60px"/></label>
        <div style="grid-column:1/-1;font-size:0.72rem;font-weight:700;color:var(--text-secondary);margin-top:8px;margin-bottom:4px">Assembly</div>
        <label style="font-size:0.68rem">SMT Placements<br/><input type="number" id="pcb-edit-smt" min="0" value="${a.smtPlacements}" style="width:60px"/></label>
        <label style="font-size:0.68rem">TH Joints<br/><input type="number" id="pcb-edit-th-joints" min="0" value="${a.throughHoleJoints}" style="width:60px"/></label>
        <label style="font-size:0.68rem">Manual Joints<br/><input type="number" id="pcb-edit-manual-joints" min="0" value="${a.manualJoints}" style="width:60px"/></label>
        <label style="font-size:0.68rem">BGA Count<br/><input type="number" id="pcb-edit-bga-count" min="0" value="${a.bgaCount}" style="width:60px"/></label>
        <label style="font-size:0.68rem">Complexity<br/><select id="pcb-edit-complexity"><option value="low" ${a.complexity==='low'?'selected':''}>Low</option><option value="medium" ${a.complexity==='medium'?'selected':''}>Medium</option><option value="high" ${a.complexity==='high'?'selected':''}>High</option><option value="very_high" ${a.complexity==='very_high'?'selected':''}>Very High</option></select></label>
        <label style="font-size:0.68rem">Reflow Sides<br/><input type="number" id="pcb-edit-reflow-sides" min="1" max="2" value="${a.reflowSides}" style="width:60px"/></label>
        <label style="font-size:0.68rem">AOI Required<br/><input type="checkbox" id="pcb-edit-aoi" ${a.aoiRequired?'checked':''}/></label>
        <label style="font-size:0.68rem">ICT Time (s)<br/><input type="number" id="pcb-edit-ict-time" min="0" value="${a.ictTimeSec}" style="width:60px"/></label>
      </div>` : `<div class="pcb-stat-grid">
        <div class="occt-stat"><div class="occt-stat-value">${b.estimatedLayers}</div><div class="occt-stat-label">Layers</div></div>
        <div class="occt-stat"><div class="occt-stat-value">${b.widthMm}&#xD7;${b.heightMm}</div><div class="occt-stat-label">Board (mm)</div></div>
        <div class="occt-stat"><div class="occt-stat-value">${b.technologyType.replace('_', ' ')}</div><div class="occt-stat-label">Technology</div></div>
        <div class="occt-stat"><div class="occt-stat-value">${b.surfaceFinish.toUpperCase()}</div><div class="occt-stat-label">Surface finish</div></div>
        <div class="occt-stat"><div class="occt-stat-value">${b.throughVias + b.blindVias + b.microVias}</div><div class="occt-stat-label">Total vias</div></div>
        <div class="occt-stat"><div class="occt-stat-value">${b.qualityGrade.replace('_', ' ')}</div><div class="occt-stat-label">Quality grade</div></div>
        <div class="occt-stat"><div class="occt-stat-value">${totalPlacements}</div><div class="occt-stat-label">SMT placements</div></div>
        <div class="occt-stat"><div class="occt-stat-value">${a.throughHoleJoints}</div><div class="occt-stat-label">TH joints</div></div>
        <div class="occt-stat"><div class="occt-stat-value">${a.complexity}</div><div class="occt-stat-label">Assembly complexity</div></div>
        <div class="occt-stat"><div class="occt-stat-value">${a.reflowSides === 2 ? 'Double' : 'Single'}</div><div class="occt-stat-label">Reflow sides</div></div>
        <div class="occt-stat"><div class="occt-stat-value">&#163;${c.pcbFabGBP.min.toFixed(2)}–&#163;${c.pcbFabGBP.max.toFixed(2)}</div><div class="occt-stat-label">PCB fab est.</div></div>
        <div class="occt-stat"><div class="occt-stat-value">&#163;${totalBOMCost}</div><div class="occt-stat-label">BOM total (${totalBOMLines} lines)</div></div>
        <div class="occt-stat"><div class="occt-stat-value">${r.stage1Classification?.domain?.replace(/_/g,' ') ?? 'general'}</div><div class="occt-stat-label">Board domain</div></div>
        <div class="occt-stat"><div class="occt-stat-value">${r.ocrExtraction?.icMarkings?.length ?? 0}</div><div class="occt-stat-label">ICs identified</div></div>
        ${complexityScoreHtml}
      </div>`}

      <div class="pcb-apply-row">
        <button class="btn btn-primary btn-sm" id="pcb-apply-fab-btn">⚡ Apply to PCB Fab Form</button>
        <button class="btn btn-primary btn-sm" id="pcb-apply-pcba-btn">⚡ Apply to PCBA BOM + Assembly</button>
      </div>

      <div class="pcb-analysis-section">
        <div class="pcb-analysis-section-title">📋 Bill of Materials (${totalBOMLines} lines · ${totalPlacements} placements)</div>
        <div class="pcb-bom-wrap">
          <table class="pcb-bom-table">
            <thead><tr><th>#</th><th>Ref Des</th><th>Description</th><th>Pkg</th><th>Value</th><th>Voltage</th><th>Part No.</th><th>Qty</th><th>Unit &#163;</th><th>Ext &#163;</th><th>Flags${pcbEditMode ? '/Del' : ''}</th></tr></thead>
            <tbody>${bomRows}</tbody>
            <tfoot><tr><td colspan="9" style="text-align:right;font-weight:700">Total BOM Cost</td><td colspan="2" style="font-weight:700;color:var(--accent)">&#163;${totalBOMCost}</td></tr></tfoot>
          </table>
          ${pcbEditMode ? '<button class="btn btn-secondary btn-sm" id="pcb-bom-add-row-btn" style="margin-top:6px;font-size:0.65rem">&#65291; Add Row</button>' : ''}
        </div>
      </div>

      ${buildCountryBreakdownSection(r)}

      ${buildVolumeCurveSection(r)}

      ${buildRiskRadarSection(r)}

      ${buildScenarioBuilderSection(r)}

      ${buildBoardAnnotationSection()}

      ${buildRFQTrackerSection(r)}

      <div class="pcb-insights-grid">
        <div class="pcb-analysis-section">
          <div class="pcb-analysis-section-title">💡 AI Insights</div>
          <ul class="pcb-insight-list">${insights}</ul>
        </div>
        <div class="pcb-analysis-section">
          <div class="pcb-analysis-section-title">⚠ DFM / DFA Issues</div>
          <ul class="pcb-insight-list pcb-insight-list--warn">${dfm}</ul>
        </div>
        <div class="pcb-analysis-section">
          <div class="pcb-analysis-section-title">🔑 High-Cost Components</div>
          <ul class="pcb-insight-list pcb-insight-list--cost">${r.highCostComponents.map(s => `<li>${s}</li>`).join('')}</ul>
        </div>
        <div class="pcb-analysis-section">
          <div class="pcb-analysis-section-title">✂ Optimisation Opportunities</div>
          <ul class="pcb-insight-list pcb-insight-list--opt">${opts}</ul>
        </div>
      </div>

      <div class="pcb-analysis-section" style="margin-top:8px">
        <div class="pcb-analysis-section-title" style="color:var(--text-muted)">Analysis Limitations</div>
        <ul class="pcb-insight-list" style="color:var(--text-muted)">${limits}</ul>
      </div>
    </div>`;
}

function buildCountryBreakdownSection(r: PCBImageAnalysis): string {
  const sel = r._selectedCountryBreakdown;
  const comparison = r._countryComparison ?? [];
  if (!sel && !comparison.length) return '';

  const selectedCountryId = r._selectedCountry ?? 'cn';

  // Selected country detail card
  const selectedCard = sel ? `
    <div style="margin-bottom:10px;padding:10px;background:rgba(79,142,247,0.07);border:1px solid rgba(79,142,247,0.25);border-radius:8px">
      <div style="font-weight:700;font-size:0.82rem;margin-bottom:6px">${sel.flag} ${sel.countryName} — Should Cost Breakdown</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px;font-size:0.75rem">
        <div><span style="color:var(--text-muted)">PCB Fab:</span> <strong>£${sel.pcbFabPerBoard.toFixed(2)}</strong></div>
        <div><span style="color:var(--text-muted)">Assembly:</span> <strong>£${sel.assemblyPerBoard.toFixed(2)}</strong></div>
        <div><span style="color:var(--text-muted)">Logistics:</span> <strong>£${sel.logisticsPerBoard.toFixed(2)}</strong></div>
        <div><span style="color:var(--text-muted)">BOM:</span> <strong>£${sel.bomCostPerBoard.toFixed(2)}</strong></div>
        <div><span style="color:var(--text-muted)">Lead time:</span> <strong>${sel.leadTimeWeeks}w</strong></div>
        <div><span style="color:var(--text-muted)">Quality:</span> <strong>${Math.round(sel.qualityIndex * 100)}%</strong></div>
      </div>
      <div style="margin-top:8px;padding:8px;background:var(--card-bg);border-radius:6px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="font-size:0.72rem;font-weight:700;color:var(--text-secondary)">Total per board:</span>
          <span style="font-size:1.1rem;font-weight:800;color:var(--accent)">£${sel.totalPerBoard.toFixed(2)}</span>
        </div>
        <div style="font-size:0.68rem;color:var(--text-muted)">Breakdown: PCB base £${sel.breakdown.pcbBase.toFixed(2)} + layers £${sel.breakdown.pcbLayers.toFixed(2)} + surface £${sel.breakdown.pcbSurface.toFixed(2)} + vias £${sel.breakdown.pcbVias.toFixed(2)} + HDI £${sel.breakdown.pcbHDI.toFixed(2)} + setup £${sel.breakdown.pcbSetup.toFixed(2)} | assembly £${sel.breakdown.smtAssembly.toFixed(2)} | test £${sel.breakdown.aoi.toFixed(2)} | logistics £${sel.breakdown.logistics.toFixed(2)} + duty £${sel.breakdown.importDuty.toFixed(2)}</div>
      </div>
      ${sel.panelInfo ? `<div style="margin-top:6px;padding:6px 8px;background:var(--card-bg);border-radius:6px;font-size:0.68rem;color:var(--text-muted)">📐 Panelisation: <strong style="color:var(--text-secondary)">${sel.panelInfo.boardsPerPanel}-up</strong> on ${sel.panelInfo.panelW}×${sel.panelInfo.panelH}mm panel · utilisation <strong style="color:var(--text-secondary)">${Math.round(sel.panelInfo.utilisation * 100)}%</strong> (waste amortised into PCB base cost)</div>` : ''}
      ${pcbNREEnabled && PCB_COUNTRY_META[selectedCountryId]?.nre ? `<div style="margin-top:6px;padding:6px 8px;background:var(--card-bg);border-radius:6px;font-size:0.68rem;color:var(--text-muted)">🏭 Automotive NRE (one-time/programme): PPAP £${PCB_COUNTRY_META[selectedCountryId].nre.ppapGBP.toLocaleString()} + FMEA £${PCB_COUNTRY_META[selectedCountryId].nre.fmeaGBP.toLocaleString()} + DVP&amp;R £${PCB_COUNTRY_META[selectedCountryId].nre.dvprGBP.toLocaleString()} + FAI £${PCB_COUNTRY_META[selectedCountryId].nre.firstArticleGBP.toLocaleString()} + IATF £${PCB_COUNTRY_META[selectedCountryId].nre.iatfAuditGBP.toLocaleString()} = <strong style="color:var(--text-secondary)">£${PCB_COUNTRY_META[selectedCountryId].nre.totalGBP.toLocaleString()}</strong></div>` : ''}
      <div style="margin-top:4px;font-size:0.68rem;color:var(--text-muted)">Best for: ${escHtml(sel.bestFor)}</div>
    </div>` : '';

  // Country comparison table
  const maxTotal = Math.max(...comparison.map(c => c.totalPerBoard), 0.01);
  const orderQtyVal = (document.getElementById('pcb-order-qty') as HTMLInputElement)?.value;
  const nreQty = parseInt(orderQtyVal ?? '', 10) || 5000;
  const compRows = comparison.map(c => {
    const isSelected = c.countryId === selectedCountryId;
    const barW = Math.round((c.totalPerBoard / maxTotal) * 100);
    const qualityStars = '★'.repeat(Math.round(c.qualityIndex * 5)) + '☆'.repeat(5 - Math.round(c.qualityIndex * 5));
    const meta = PCB_COUNTRY_META[c.countryId];
    const trend = meta?.trend;
    const trendCell = trend ? (() => {
      const arrow = trend.direction === 'rising' ? '↑' : trend.direction === 'falling' ? '↓' : '→';
      const colour = trend.direction === 'rising' ? '#ef4444' : trend.direction === 'falling' ? '#16a34a' : 'var(--text-muted)';
      const sign = trend.pctChange6m > 0 ? '+' : '';
      return `<td style="color:${colour};white-space:nowrap" title="${escHtml(trend.note)}">${arrow} ${sign}${trend.pctChange6m}%</td>`;
    })() : '<td>—</td>';
    const nreCell = pcbNREEnabled
      ? `<td style="white-space:nowrap" title="One-time programme NRE">£${((meta?.nre?.totalGBP ?? 0) / 1000).toFixed(1)}k</td>`
      : '';
    const delta = r._costDeltas?.[c.countryId];
    const deltaCell = delta !== undefined
      ? `<td style="font-size:0.68rem;white-space:nowrap;color:${delta > 0 ? '#ef4444' : delta < 0 ? '#16a34a' : 'var(--text-muted)'}">${delta > 0 ? '↑' : delta < 0 ? '↓' : '→'}£${Math.abs(delta).toFixed(2)}</td>`
      : (r._costDeltas ? '<td>—</td>' : '');
    return `<tr style="${isSelected ? 'background:rgba(79,142,247,0.10);font-weight:700' : ''}">
      <td style="white-space:nowrap">${c.flag} ${c.countryName.split(' (')[0]}</td>
      <td>£${c.pcbFabPerBoard.toFixed(2)}</td>
      <td>£${c.assemblyPerBoard.toFixed(2)}</td>
      <td>£${c.logisticsPerBoard.toFixed(2)}</td>
      <td style="color:var(--accent);font-weight:700">£${c.totalPerBoard.toFixed(2)}</td>
      ${deltaCell}
      <td>
        <div style="display:flex;align-items:center;gap:4px">
          <div style="flex:1;height:6px;background:var(--border);border-radius:3px;min-width:40px">
            <div style="height:100%;width:${barW}%;background:${isSelected ? 'var(--accent)' : 'var(--text-muted)'};border-radius:3px"></div>
          </div>
        </div>
      </td>
      <td style="white-space:nowrap">${c.leadTimeWeeks}w</td>
      ${trendCell}
      ${nreCell}
      <td style="font-size:0.65rem;color:#f59e0b" title="${Math.round(c.qualityIndex * 100)}% quality">${qualityStars}</td>
    </tr>`;
  }).join('');

  return comparison.length === 0 ? selectedCard : `
    ${selectedCard}
    <div class="pcb-analysis-section">
      <div class="pcb-analysis-section-title">🌍 Global Manufacturing Cost Comparison (${comparison.length} countries · 2026 data)</div>
      <div style="overflow-x:auto">
        <table class="pcb-bom-table" style="font-size:0.72rem;white-space:nowrap">
          <thead>
            <tr>
              <th>Country</th>
              <th>PCB Fab</th>
              <th>Assembly</th>
              <th>Logistics</th>
              <th>Total/Board</th>
              ${r._costDeltas ? '<th>&#916; vs orig</th>' : ''}
              <th style="min-width:60px">Cost bar</th>
              <th>Lead time</th>
              <th title="6-month should-cost trend">Trend</th>
              ${pcbNREEnabled ? '<th title="One-time automotive NRE per programme">NRE</th>' : ''}
              <th>Quality</th>
            </tr>
          </thead>
          <tbody>${compRows}</tbody>
        </table>
      </div>
      <div style="margin-top:4px;font-size:0.65rem;color:var(--text-muted)">
        Prices include PCB fabrication + SMT/THT assembly + logistics/import duty to UK. BOM component cost (£${(comparison[0]?.bomCostPerBoard ?? 0).toFixed(2)}) is the same for all countries. Data calibrated to Jan 2026 market rates.
        ${pcbNREEnabled ? `<br/>NRE costs are one-time per programme. At ${(nreQty / 1000).toFixed(nreQty % 1000 === 0 ? 0 : 1)}k units, ${selectedCountryId.toUpperCase()} NRE adds £${(((PCB_COUNTRY_META[selectedCountryId]?.nre?.totalGBP ?? 0) / nreQty)).toFixed(2)}/board.` : ''}
      </div>
    </div>`;
}

// ─── Feature: Volume sensitivity chart (Priority 3) ────────────────────────
function buildVolumeCurveSection(r: PCBImageAnalysis): string {
  if (!r._volumeCurves || Object.keys(r._volumeCurves).length === 0) return '';
  const curves = r._volumeCurves;
  const selId = r._selectedCountry ?? 'cn';
  const orderQty = parseInt((document.getElementById('pcb-order-qty') as HTMLInputElement)?.value ?? '5000', 10) || 5000;

  // Crossover insight: compare cheapest vs UK at the user's nearest volume break.
  const ids = Object.keys(curves);
  const cheapestId = ids.find(id => id !== 'gb' && id !== selId) ?? ids[0];
  const gbCurve = curves.gb ?? curves[ids[0]];
  const cheapCurve = curves[cheapestId] ?? gbCurve;
  const pointAt = (curve: VolumeCurvePoint[]): VolumeCurvePoint => {
    let best = curve[0];
    for (const p of curve) if (Math.abs(p.qty - orderQty) < Math.abs(best.qty - orderQty)) best = p;
    return best;
  };
  const cheapPt = pointAt(cheapCurve);
  const gbPt = pointAt(gbCurve);
  const saving = gbPt.totalPerBoard - cheapPt.totalPerBoard;
  const fullRun = saving * orderQty;
  const cheapName = PCB_COUNTRY_META[cheapestId] ? cheapestId.toUpperCase() : cheapestId.toUpperCase();
  const insight = saving > 0
    ? `At your volume (${orderQty.toLocaleString()}), ${cheapName} saves £${saving.toFixed(2)}/board vs UK (£${Math.round(fullRun).toLocaleString()} on the full run).`
    : `At your volume (${orderQty.toLocaleString()}), UK is within £${Math.abs(saving).toFixed(2)}/board of the cheapest option.`;

  return `
    <div class="pcb-analysis-section">
      <div class="pcb-analysis-section-title">📈 Volume Sensitivity — Cost per Board vs Order Quantity</div>
      <div style="position:relative;height:240px;background:var(--card-bg);border-radius:6px;padding:8px">
        <canvas id="pcb-volume-chart"></canvas>
      </div>
      <div style="margin-top:6px;font-size:0.68rem;color:var(--text-muted)">${escHtml(insight)}</div>
    </div>`;
}

function drawVolumeCurveChart(r: PCBImageAnalysis): void {
  const canvas = document.getElementById('pcb-volume-chart') as HTMLCanvasElement | null;
  if (!canvas || !r._volumeCurves) return;
  if (_pcbVolumeChart) { _pcbVolumeChart.destroy(); _pcbVolumeChart = null; }

  const curves = r._volumeCurves;
  const selId = r._selectedCountry ?? 'cn';
  const ids = Object.keys(curves);
  const cheapestId = ids.find(id => id !== 'gb' && id !== selId) ?? ids[0];
  const labels = (curves[ids[0]] ?? []).map(p => p.qty.toLocaleString());

  const nameOf = (id: string): string => {
    const c = r._countryComparison?.find(cc => cc.countryId === id);
    return c ? `${c.flag} ${c.countryName.split(' (')[0]}` : id.toUpperCase();
  };

  const datasets: Array<{ label: string; data: number[]; borderColor: string; backgroundColor: string; tension: number; pointRadius: number }> = [];
  const addLine = (id: string, colour: string) => {
    if (!curves[id]) return;
    datasets.push({
      label: nameOf(id),
      data: curves[id].map(p => p.totalPerBoard),
      borderColor: colour,
      backgroundColor: colour,
      tension: 0.25,
      pointRadius: 3,
    });
  };
  addLine(cheapestId, '#16a34a');
  if (selId !== cheapestId) addLine(selId, '#4f8ef7');
  if (selId !== 'gb' && cheapestId !== 'gb') addLine('gb', '#f59e0b');

  _pcbVolumeChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: £${Number(ctx.parsed.y).toFixed(2)}/board` } },
      },
      scales: {
        x: { title: { display: true, text: 'Order quantity', font: { size: 10 } } },
        y: { title: { display: true, text: 'Cost per board (£)', font: { size: 10 } }, beginAtZero: false },
      },
    },
  });
}

// ─── Feature 6: Supply chain risk radar ────────────────────────────────────
function riskBar(v: number): string {
  const filled = Math.max(1, Math.min(5, Math.round(v * 5)));
  return '■'.repeat(filled) + '□'.repeat(5 - filled);
}
function buildRiskRadarSection(r: PCBImageAnalysis): string {
  const comparison = r._countryComparison ?? [];
  if (!comparison.length) return '';
  const selId = r._selectedCountry ?? 'cn';
  const autoCount = r.bom.filter(b => b.automotive).length;

  // Selected + top 3 cheapest alternatives (distinct)
  const ordered = [...comparison].sort((a, b) => a.totalPerBoard - b.totalPerBoard);
  const chosen: PCBCountryBreakdown[] = [];
  const sel = comparison.find(c => c.countryId === selId);
  if (sel) chosen.push(sel);
  for (const c of ordered) {
    if (chosen.length >= 4) break;
    if (!chosen.some(x => x.countryId === c.countryId)) chosen.push(c);
  }

  const rows = chosen.map(c => {
    const p = computeClientRiskProfile(c.countryId, autoCount);
    const colour = p.label === 'Low Risk' ? '#16a34a' : p.label === 'Medium Risk' ? '#f59e0b' : '#ef4444';
    return `<tr ${c.countryId === selId ? 'style="background:rgba(79,142,247,0.10);font-weight:700"' : ''}>
      <td style="white-space:nowrap">${c.flag} ${c.countryName.split(' (')[0]}</td>
      <td style="font-family:monospace" title="Geopolitical stability">${riskBar(p.dims.geopolitical)}</td>
      <td style="font-family:monospace" title="Logistics reliability">${riskBar(p.dims.logisticsReliability)}</td>
      <td style="font-family:monospace" title="Quality consistency">${riskBar(p.dims.qualityConsistency)}</td>
      <td style="font-family:monospace" title="Lead-time variance">${riskBar(p.dims.leadTimeVariance)}</td>
      <td style="color:${colour};font-weight:700;white-space:nowrap">${p.label}</td>
    </tr>`;
  }).join('');

  const autoParts = r.bom.filter(b => b.automotive && (b.componentType.startsWith('ic_') || b.highCost)).slice(0, 3).map(b => b.value || b.partNumber || b.refDes).filter(Boolean);
  const singleSourceLine = autoCount > 0
    ? `${autoCount} components are automotive-grade from potential single-source suppliers${autoParts.length ? ` (e.g. ${escHtml(autoParts.join(', '))})` : ''}.`
    : 'No automotive-grade single-source exposure detected in BOM.';

  return `
    <div class="pcb-analysis-section">
      <div class="pcb-analysis-section-title">🛡 Supply Chain Risk Radar</div>
      <div style="overflow-x:auto">
        <table class="pcb-bom-table" style="font-size:0.72rem;white-space:nowrap">
          <thead><tr><th>Country</th><th>Geopolitical</th><th>Logistics</th><th>Quality</th><th>Lead Time</th><th>Overall</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="margin-top:6px;font-size:0.68rem;color:var(--text-muted)">⚠ Single-source risk: ${singleSourceLine}</div>
    </div>`;
}

// ─── Feature 10: What-if scenario builder ──────────────────────────────────
function buildScenarioBuilderSection(r: PCBImageAnalysis): string {
  const b = r.boardSpec;
  const selId = r._selectedCountry ?? 'cn';
  const curFinish = (b.surfaceFinish || 'enig').toLowerCase();
  const orderQty = parseInt((document.getElementById('pcb-order-qty') as HTMLInputElement)?.value ?? '5000', 10) || 5000;

  const finishOpt = (v: string, label: string) => `<option value="${v}"${curFinish === v ? ' selected' : ''}>${label}</option>`;
  const layerOpt = (v: number) => `<option value="${v}"${b.estimatedLayers === v ? ' selected' : ''}>${v}-layer</option>`;
  const countryOpt = (id: string, flag: string, name: string) => `<option value="${id}"${selId === id ? ' selected' : ''}>${flag} ${name}</option>`;

  return `
    <details class="pcb-analysis-section" style="margin-top:8px">
      <summary class="pcb-analysis-section-title" style="cursor:pointer;list-style:revert">🧪 What-If Scenario Builder</summary>
      <div style="margin-top:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;font-size:0.72rem">
        <label style="display:flex;flex-direction:column;gap:3px">Surface finish
          <select id="pcb-scn-finish" style="font-size:0.72rem;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--card-bg)">
            ${finishOpt('hasl', 'HASL')}${finishOpt('hasl_lf', 'HASL-LF')}${finishOpt('enig', 'ENIG')}${finishOpt('osp', 'OSP')}${finishOpt('enepig', 'ENEPIG')}
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:3px">Layer count
          <select id="pcb-scn-layers" style="font-size:0.72rem;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--card-bg)">
            ${[2,4,6,8,10,12].map(layerOpt).join('')}
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:3px">Order quantity: <span id="pcb-scn-qty-label">${orderQty.toLocaleString()}</span>
          <input type="range" id="pcb-scn-qty" min="100" max="25000" step="100" value="${orderQty}"/>
        </label>
        <label style="display:flex;flex-direction:column;gap:3px">Country
          <select id="pcb-scn-country" style="font-size:0.72rem;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--card-bg)">
            ${countryOpt('cn','🇨🇳','China')}${countryOpt('vn','🇻🇳','Vietnam')}${countryOpt('in','🇮🇳','India')}${countryOpt('th','🇹🇭','Thailand')}${countryOpt('my','🇲🇾','Malaysia')}${countryOpt('tw','🇹🇼','Taiwan')}${countryOpt('kr','🇰🇷','South Korea')}${countryOpt('mx','🇲🇽','Mexico')}${countryOpt('cz','🇨🇿','Czechia')}${countryOpt('pl','🇵🇱','Poland')}${countryOpt('de','🇩🇪','Germany')}${countryOpt('gb','🇬🇧','UK')}${countryOpt('us','🇺🇸','USA')}${countryOpt('jp','🇯🇵','Japan')}
          </select>
        </label>
      </div>
      <div id="pcb-scn-result" style="margin-top:8px;padding:8px;background:var(--card-bg);border-radius:6px;font-size:0.72rem;color:var(--text-muted)">Adjust a parameter to see the cost delta vs the current baseline.</div>
    </details>`;
}

let _scnDebounce: ReturnType<typeof setTimeout> | null = null;
function wireScenarioBuilder(r: PCBImageAnalysis): void {
  const ids = ['pcb-scn-finish', 'pcb-scn-layers', 'pcb-scn-qty', 'pcb-scn-country'];
  const qtyLabel = document.getElementById('pcb-scn-qty-label');
  const resultEl = document.getElementById('pcb-scn-result');
  if (!resultEl) return;

  const baseTotal = r._selectedCountryBreakdown?.totalPerBoard ?? 0;

  const recompute = async () => {
    const finish = (document.getElementById('pcb-scn-finish') as HTMLSelectElement)?.value ?? 'enig';
    const layers = parseInt((document.getElementById('pcb-scn-layers') as HTMLSelectElement)?.value ?? '2', 10);
    const qty = parseInt((document.getElementById('pcb-scn-qty') as HTMLInputElement)?.value ?? '5000', 10);
    const country = (document.getElementById('pcb-scn-country') as HTMLSelectElement)?.value ?? 'cn';
    if (qtyLabel) qtyLabel.textContent = qty.toLocaleString();

    const b = r.boardSpec; const a = r.assembly;
    const payload = {
      widthMm: b.widthMm, heightMm: b.heightMm, layers, surfaceFinish: finish,
      throughVias: b.throughVias, blindVias: b.blindVias, microVias: b.microVias,
      hdiStructure: b.hdiStructure, impedanceControlled: b.impedanceControlRequired,
      smtPlacements: a.smtPlacements, throughHoleJoints: a.throughHoleJoints, manualJoints: a.manualJoints,
      bgaCount: a.bgaCount, aoiRequired: a.aoiRequired, ictTimeSec: a.ictTimeSec, conformalCoatAreaCm2: 0,
      totalBOMCostGBP: r.costEstimates.totalBOMCostGBP, orderQuantity: qty, country,
    };
    try {
      const resp = await fetch('/api/pcb/scenario', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await resp.json() as { success?: boolean; breakdown?: PCBCountryBreakdown; error?: string };
      if (!resp.ok || !data.breakdown) throw new Error(data.error ?? resp.statusText);
      const nt = data.breakdown.totalPerBoard;
      const delta = nt - baseTotal;
      const pct = baseTotal > 0 ? (delta / baseTotal) * 100 : 0;
      const totalRun = delta * qty;
      const sign = delta >= 0 ? '+' : '−';
      const colour = delta > 0 ? '#ef4444' : delta < 0 ? '#16a34a' : 'var(--text-muted)';
      resultEl.innerHTML = `New total: <strong style="color:var(--accent)">£${nt.toFixed(2)}/board</strong> · Delta vs baseline (£${baseTotal.toFixed(2)}): <strong style="color:${colour}">${sign}£${Math.abs(delta).toFixed(2)} (${sign}${Math.abs(pct).toFixed(1)}%)</strong>. At ${qty.toLocaleString()} units, that is ${sign}£${Math.abs(totalRun).toLocaleString(undefined, { maximumFractionDigits: 0 })} total.`;
    } catch (err) {
      resultEl.textContent = `⚠ Scenario error: ${(err instanceof Error ? err.message : String(err)).slice(0, 100)}`;
    }
  };

  for (const id of ids) {
    const elem = document.getElementById(id);
    elem?.addEventListener('input', () => {
      if (_scnDebounce) clearTimeout(_scnDebounce);
      _scnDebounce = setTimeout(() => void recompute(), 250);
    });
  }
}

// ─── Feature 4: RFQ tracker (localStorage) ─────────────────────────────────
interface RFQEntry {
  id: string; partName: string; date: string; country: string; emsName: string;
  quotedTotalPerBoard: number; estimatedTotalPerBoard: number; variancePct: number; notes: string;
}
const RFQ_KEY = 'pcb_rfq_log';
function loadRFQ(): RFQEntry[] {
  try { return JSON.parse(localStorage.getItem(RFQ_KEY) ?? '[]') as RFQEntry[]; } catch { return []; }
}
function saveRFQ(entries: RFQEntry[]): void {
  try { localStorage.setItem(RFQ_KEY, JSON.stringify(entries)); } catch { /* ignore quota */ }
}
function buildRFQTrackerSection(r: PCBImageAnalysis): string {
  const estimated = r._selectedCountryBreakdown?.totalPerBoard ?? 0;
  const countryName = r._selectedCountryBreakdown?.countryName.split(' (')[0] ?? (r._selectedCountry ?? 'cn').toUpperCase();
  return `
    <details class="pcb-analysis-section" style="margin-top:8px">
      <summary class="pcb-analysis-section-title" style="cursor:pointer;list-style:revert">📥 RFQ Tracker — Log &amp; Compare EMS Quotes</summary>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;font-size:0.72rem">
        <label style="display:flex;flex-direction:column;gap:3px">EMS Name
          <input type="text" id="pcb-rfq-ems" placeholder="e.g. Jabil" style="font-size:0.72rem;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--card-bg)"/>
        </label>
        <label style="display:flex;flex-direction:column;gap:3px">Quoted £/board
          <input type="number" id="pcb-rfq-quoted" step="0.01" min="0" style="width:110px;font-size:0.72rem;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--card-bg)"/>
        </label>
        <label style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:120px">Notes
          <input type="text" id="pcb-rfq-notes" placeholder="lead time, MOQ, terms…" style="font-size:0.72rem;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--card-bg)"/>
        </label>
        <button class="btn btn-primary btn-sm" id="pcb-rfq-log-btn" style="font-size:0.68rem">Log Quote</button>
      </div>
      <div style="margin-top:4px;font-size:0.66rem;color:var(--text-muted)">Estimated baseline: ${countryName} £${estimated.toFixed(2)}/board</div>
      <div id="pcb-rfq-table-wrap" style="margin-top:8px"></div>
    </details>`;
}
function renderRFQTable(): void {
  const wrap = document.getElementById('pcb-rfq-table-wrap');
  if (!wrap) return;
  const entries = loadRFQ().slice(-10).reverse();
  if (!entries.length) { wrap.innerHTML = '<div style="font-size:0.68rem;color:var(--text-muted)">No quotes logged yet.</div>'; return; }
  const rows = entries.map(e => {
    const colour = e.variancePct > 0 ? '#ef4444' : e.variancePct < 0 ? '#16a34a' : 'var(--text-muted)';
    const sign = e.variancePct >= 0 ? '+' : '';
    return `<tr>
      <td style="white-space:nowrap">${new Date(e.date).toLocaleDateString()}</td>
      <td>${escHtml(e.emsName)}</td>
      <td>${escHtml(e.country)}</td>
      <td>£${e.quotedTotalPerBoard.toFixed(2)}</td>
      <td>£${e.estimatedTotalPerBoard.toFixed(2)}</td>
      <td style="color:${colour};font-weight:700">${sign}${e.variancePct.toFixed(1)}%</td>
      <td style="max-width:200px;white-space:normal">${escHtml(e.notes)}</td>
    </tr>`;
  }).join('');
  const avg = entries.reduce((s, e) => s + e.variancePct, 0) / entries.length;
  const avgSign = avg >= 0 ? 'above' : 'below';
  wrap.innerHTML = `
    <div style="overflow-x:auto">
      <table class="pcb-bom-table" style="font-size:0.72rem">
        <thead><tr><th>Date</th><th>EMS</th><th>Country</th><th>Quoted</th><th>Estimated</th><th>Variance %</th><th>Notes</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="margin-top:4px;font-size:0.68rem;color:var(--text-muted)">Your quotes run <strong>${Math.abs(avg).toFixed(1)}% ${avgSign}</strong> estimates on average.</div>`;
}
function wireRFQTracker(r: PCBImageAnalysis): void {
  const btn = document.getElementById('pcb-rfq-log-btn');
  btn?.addEventListener('click', () => {
    const ems = (document.getElementById('pcb-rfq-ems') as HTMLInputElement)?.value?.trim() ?? '';
    const quoted = parseFloat((document.getElementById('pcb-rfq-quoted') as HTMLInputElement)?.value ?? '');
    const notes = (document.getElementById('pcb-rfq-notes') as HTMLInputElement)?.value?.trim() ?? '';
    if (!ems || !Number.isFinite(quoted) || quoted <= 0) {
      showToast('Enter an EMS name and a valid quoted price.', 'warning');
      return;
    }
    const estimated = r._selectedCountryBreakdown?.totalPerBoard ?? 0;
    const variancePct = estimated > 0 ? ((quoted - estimated) / estimated) * 100 : 0;
    const entries = loadRFQ();
    entries.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      partName: r.partName,
      date: new Date().toISOString(),
      country: r._selectedCountryBreakdown?.countryName.split(' (')[0] ?? (r._selectedCountry ?? 'cn').toUpperCase(),
      emsName: ems, quotedTotalPerBoard: quoted, estimatedTotalPerBoard: estimated, variancePct, notes,
    });
    saveRFQ(entries);
    (document.getElementById('pcb-rfq-ems') as HTMLInputElement).value = '';
    (document.getElementById('pcb-rfq-quoted') as HTMLInputElement).value = '';
    (document.getElementById('pcb-rfq-notes') as HTMLInputElement).value = '';
    renderRFQTable();
  });
  renderRFQTable();
}

// ─── Feature 9: Board image annotation ─────────────────────────────────────
function buildBoardAnnotationSection(): string {
  if (!pcbImageDataURL) return '';
  return `
    <div class="pcb-analysis-section">
      <div class="pcb-analysis-section-title" style="display:flex;align-items:center;gap:8px">
        🖼 Annotated Board
        <button class="btn btn-secondary btn-sm" id="pcb-annot-toggle" style="font-size:0.62rem;margin-left:auto">Show Annotated Board</button>
      </div>
      <div id="pcb-annot-wrap" style="display:none;margin-top:6px;text-align:center">
        <canvas id="pcb-annotated-img" style="max-width:100%;border:1px solid var(--border);border-radius:6px"></canvas>
        <div style="margin-top:4px;font-size:0.64rem;color:var(--text-muted)">RefDes labels distributed across the board — <span style="color:#ef4444">red=high-cost</span>, <span style="color:#f59e0b">amber=automotive</span>, <span style="color:#4f8ef7">blue=standard</span>. Positions are approximate (grid layout).</div>
      </div>
    </div>`;
}
function wireBoardAnnotation(r: PCBImageAnalysis): void {
  const toggle = document.getElementById('pcb-annot-toggle');
  const wrap = document.getElementById('pcb-annot-wrap');
  if (!toggle || !wrap || !pcbImageDataURL) return;
  let drawn = false;
  toggle.addEventListener('click', () => {
    const visible = wrap.style.display !== 'none';
    wrap.style.display = visible ? 'none' : 'block';
    toggle.textContent = visible ? 'Show Annotated Board' : 'Hide Annotated Board';
    if (!visible && !drawn) { drawBoardAnnotation(r); drawn = true; }
  });
}
function drawBoardAnnotation(r: PCBImageAnalysis): void {
  const canvas = document.getElementById('pcb-annotated-img') as HTMLCanvasElement | null;
  if (!canvas || !pcbImageDataURL) return;
  const img = new Image();
  img.onload = () => {
    const maxW = 720;
    const scale = img.width > maxW ? maxW / img.width : 1;
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // Distribute BOM refdes labels in a grid overlay
    const items = r.bom.slice(0, 40);
    const cols = Math.ceil(Math.sqrt(items.length)) || 1;
    const rows = Math.ceil(items.length / cols) || 1;
    const cw = canvas.width / cols;
    const ch = canvas.height / rows;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    items.forEach((item, i) => {
      const cx = (i % cols) * cw + cw / 2;
      const cy = Math.floor(i / cols) * ch + ch / 2;
      const colour = item.highCost ? '#ef4444' : item.automotive ? '#f59e0b' : '#4f8ef7';
      const label = item.refDes.split(/[\s,]/)[0] || item.refDes;
      const w = ctx.measureText(label).width + 8;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(cx - w / 2, cy - 8, w, 16);
      ctx.fillStyle = colour;
      ctx.fillText(label, cx, cy);
    });
  };
  img.src = pcbImageDataURL;
}

// ─── Feature 8: Export to CSV / PDF ────────────────────────────────────────
function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function exportPCBAnalysisCSV(r: PCBImageAnalysis): void {
  const lines: string[] = [];
  const dateStr = new Date().toISOString().slice(0, 10);
  lines.push(`PCB Analysis Export,${csvCell(r.partName)},${dateStr}`);
  lines.push('');
  lines.push('=== BILL OF MATERIALS ===');
  lines.push('RefDes,Description,Package,Value,Voltage,PartNumber,Qty,Unit GBP,Ext GBP,Automotive,HighCost');
  for (const b of r.bom) {
    lines.push([b.refDes, b.description, b.pkg, b.value, b.voltage, b.partNumber ?? '', b.qty, b.unitPriceGBP.toFixed(4), (b.qty * b.unitPriceGBP).toFixed(2), b.automotive ? 'Y' : 'N', b.highCost ? 'Y' : 'N'].map(csvCell).join(','));
  }
  lines.push(`Total BOM Cost,,,,,,,,${r.costEstimates.totalBOMCostGBP.toFixed(2)}`);
  lines.push('');
  lines.push('=== COUNTRY COMPARISON ===');
  lines.push('Country,PCB Fab,Assembly,Logistics,BOM,Total/Board,Lead Weeks,Quality %,NRE Total GBP');
  for (const c of r._countryComparison ?? []) {
    const nreTot = PCB_COUNTRY_META[c.countryId]?.nre?.totalGBP ?? 0;
    lines.push([c.countryName, c.pcbFabPerBoard.toFixed(2), c.assemblyPerBoard.toFixed(2), c.logisticsPerBoard.toFixed(2), c.bomCostPerBoard.toFixed(2), c.totalPerBoard.toFixed(2), c.leadTimeWeeks, Math.round(c.qualityIndex * 100), nreTot].map(csvCell).join(','));
  }
  if (r._volumeCurves) {
    lines.push('');
    lines.push('=== VOLUME CURVES (Total GBP/board) ===');
    const ids = Object.keys(r._volumeCurves);
    const qtys = r._volumeCurves[ids[0]]?.map(p => p.qty) ?? [];
    lines.push(['Qty', ...ids.map(id => id.toUpperCase())].join(','));
    qtys.forEach((q, i) => {
      lines.push([q, ...ids.map(id => (r._volumeCurves![id][i]?.totalPerBoard ?? 0).toFixed(2))].join(','));
    });
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pcb-analysis-${r.partName.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}-${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function exportPCBAnalysisPrint(r: PCBImageAnalysis): void {
  const w = window.open('', '_blank');
  if (!w) { showToast('Pop-up blocked — allow pop-ups to print/PDF.', 'warning'); return; }
  const bomRows = r.bom.map(b => `<tr><td>${escHtml(b.refDes)}</td><td>${escHtml(b.description)}</td><td>${escHtml(b.pkg)}</td><td>${escHtml(b.value)}</td><td>${escHtml(b.partNumber ?? '')}</td><td>${b.qty}</td><td>£${b.unitPriceGBP.toFixed(3)}</td><td>£${(b.qty * b.unitPriceGBP).toFixed(2)}</td></tr>`).join('');
  const compRows = (r._countryComparison ?? []).map(c => `<tr><td>${escHtml(c.countryName)}</td><td>£${c.pcbFabPerBoard.toFixed(2)}</td><td>£${c.assemblyPerBoard.toFixed(2)}</td><td>£${c.logisticsPerBoard.toFixed(2)}</td><td>£${c.totalPerBoard.toFixed(2)}</td><td>${c.leadTimeWeeks}w</td></tr>`).join('');
  const cx = r.complexityScore;
  w.document.write(`<!DOCTYPE html><html><head><title>PCB Analysis — ${escHtml(r.partName)}</title>
    <style>body{font-family:system-ui,sans-serif;margin:24px;color:#111}h1{font-size:18px}h2{font-size:14px;margin-top:18px;border-bottom:1px solid #ccc;padding-bottom:4px}table{border-collapse:collapse;width:100%;font-size:11px;margin-top:6px}th,td{border:1px solid #ccc;padding:3px 6px;text-align:left}th{background:#f2f2f2}.meta{font-size:12px;color:#555}</style>
    </head><body>
    <h1>${escHtml(r.partName)}</h1>
    <div class="meta">Generated ${new Date().toLocaleString()} · Confidence: ${r.confidenceLevel}${cx ? ` · Complexity: ${cx.score}/100 (IPC Class ${cx.ipcClass}, ${cx.label})` : ''}</div>
    <h2>Board Specification</h2>
    <div class="meta">${r.boardSpec.estimatedLayers}-layer · ${r.boardSpec.widthMm}×${r.boardSpec.heightMm}mm · ${escHtml(r.boardSpec.surfaceFinish.toUpperCase())} · ${escHtml(r.boardSpec.technologyType)} · ${r.boardSpec.throughVias + r.boardSpec.blindVias + r.boardSpec.microVias} vias</div>
    <h2>Bill of Materials (${r.bom.length} lines)</h2>
    <table><thead><tr><th>RefDes</th><th>Description</th><th>Pkg</th><th>Value</th><th>Part No.</th><th>Qty</th><th>Unit £</th><th>Ext £</th></tr></thead><tbody>${bomRows}</tbody>
    <tfoot><tr><th colspan="7" style="text-align:right">Total BOM</th><th>£${r.costEstimates.totalBOMCostGBP.toFixed(2)}</th></tr></tfoot></table>
    <h2>Global Manufacturing Cost Comparison</h2>
    <table><thead><tr><th>Country</th><th>PCB Fab</th><th>Assembly</th><th>Logistics</th><th>Total/Board</th><th>Lead</th></tr></thead><tbody>${compRows}</tbody></table>
    </body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 300);
}

function applyPCBImageToFab(): void {
  if (!pcbImageResult) return;
  const b = pcbImageResult.boardSpec;

  const setF = (id: string, val: string | number) => {
    const el2 = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (!el2) return;
    el2.value = String(val);
    el2.classList.add('ai-filled');
    el2.addEventListener('input', () => el2.classList.remove('ai-filled'), { once: true });
  };
  // Safe select setter: only assigns if the value is a valid <option>; logs a warning otherwise
  const setSelectSafe = (id: string, val: string, fallback: string) => {
    const sel = document.getElementById(id) as HTMLSelectElement | null;
    if (!sel) return;
    const valid = Array.from(sel.options).some(o => o.value === val);
    sel.value = valid ? val : fallback;
    sel.classList.add('ai-filled');
    if (!valid) console.warn(`[PCB→Fab] "${val}" is not a valid option for #${id} — defaulted to "${fallback}"`);
    sel.addEventListener('input', () => sel.classList.remove('ai-filled'), { once: true });
  };
  const setCheck = (id: string, val: boolean) => {
    const el2 = document.getElementById(id) as HTMLInputElement | null;
    if (el2) { el2.checked = val; el2.classList.add('ai-filled'); }
  };

  // Map Vision free-text HDI strings → engine enum
  const HDI_MAP: Record<string, string> = {
    'none': 'none',
    '1+n+1': '1plus_n_plus1',
    '1plus_n_plus1': '1plus_n_plus1',
    '2+n+2': '2plus_n_plus2',
    '2plus_n_plus2': '2plus_n_plus2',
    'any_layer': 'any_layer',
    'elic': 'any_layer',
    'any layer': 'any_layer',
  };
  const rawHdi = (b.hdiStructure ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const mappedHdi = HDI_MAP[rawHdi] ?? (rawHdi.includes('2') ? '2plus_n_plus2' : rawHdi.includes('any') ? 'any_layer' : rawHdi.includes('1') ? '1plus_n_plus1' : 'none');

  // Map Vision surface finish values → engine enum (hard_gold → enepig as nearest equivalent)
  const FINISH_MAP: Record<string, string> = {
    'hasl': 'hasl',
    'hasl_lf': 'hasl_lf',
    'enig': 'enig',
    'osp': 'osp',
    'enepig': 'enepig',
    'iteq': 'iteq',
    'hard_gold': 'enepig',
    'hard gold': 'enepig',
    'immersion gold': 'enig',
    'immersion silver': 'hasl_lf',
  };
  const rawFinish = (b.surfaceFinish ?? '').toLowerCase().trim();
  const mappedFinish = FINISH_MAP[rawFinish] ?? 'enig';

  // Map Vision solder mask colour → form option values (lowercase, normalise)
  const MASK_MAP: Record<string, string> = {
    'green': 'green', 'black': 'black', 'white': 'white', 'red': 'red', 'blue': 'blue',
    'enig green': 'green', 'hasl green': 'green', 'yellow': 'green',
  };
  const rawMask = (b.solderMaskColour ?? '').toLowerCase().trim();
  const mappedMask = MASK_MAP[rawMask] ?? 'green';

  // Snap Vision's minTraceSpaceMm to nearest valid select option
  const VALID_TRACES = ['0.075', '0.10', '0.15', '0.20'];
  const nearestTrace = VALID_TRACES.reduce((prev, cur) =>
    Math.abs(parseFloat(cur) - b.minTraceSpaceMm) < Math.abs(parseFloat(prev) - b.minTraceSpaceMm) ? cur : prev
  );

  setSelectSafe('pcbf-technology', b.technologyType, 'HDI_RIGID');
  setSelectSafe('pcbf-quality', b.qualityGrade, 'auto_grade1');
  setF('pcbf-layers', String(b.estimatedLayers));
  setF('pcbf-board-w', b.widthMm);
  setF('pcbf-board-h', b.heightMm);
  setF('pcbf-panel-util', b.panelUtilisation);
  setSelectSafe('pcbf-cu', String(b.copperWeightOz), '1');
  setSelectSafe('pcbf-outer-cu', String(b.copperWeightOz), '1');
  setSelectSafe('pcbf-via-type', b.microVias > 0 ? 'microvia_hdi' : 'through_only', 'through_only');
  setSelectSafe('pcbf-hdi-structure', mappedHdi, 'none');
  setF('pcbf-vias', b.throughVias);
  setF('pcbf-blind-vias', b.blindVias);
  setF('pcbf-buried-vias', b.buriedVias);
  setF('pcbf-uvias', b.microVias);
  setSelectSafe('pcbf-trace', nearestTrace, '0.10');
  setSelectSafe('pcbf-finish', mappedFinish, 'enig');
  setSelectSafe('pcbf-solder-mask', mappedMask, 'green');
  setF('pcbf-silkscreen', String(b.silkscreenSides));
  setCheck('pcbf-impedance', b.impedanceControlRequired);
  setCheck('pcbf-bga', b.bgaDetected);

  // Infer Tg from technology
  const tgMap: Record<string, string> = { FR4_STD: '130', FR4_HTg: '150', HDI_RIGID: '170', RF_MICRO: '170' };
  setF('pcbf-tg', tgMap[b.technologyType] ?? '150');

  const partNameEl = el<HTMLInputElement>('part-name');
  if (partNameEl && pcbImageResult.partName) {
    partNameEl.value = pcbImageResult.partName;
    partNameEl.classList.add('ai-filled');
  }

  switchCommodity('pcb_fab');
}

function applyPCBImageToPCBA(): void {
  if (!pcbImageResult) return;
  const r = pcbImageResult;
  const a = r.assembly;

  const setF = (id: string, val: string | number) => {
    const el2 = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (!el2) return;
    el2.value = String(val);
    el2.classList.add('ai-filled');
    el2.addEventListener('input', () => el2.classList.remove('ai-filled'), { once: true });
  };

  // Ensure we're on PCBA
  if (activeCommodity !== 'pcba') switchCommodity('pcba');

  setTimeout(() => {
    // Assembly parameters
    setF('pcba-complexity', a.complexity);
    setF('pcba-quality', r.boardSpec.qualityGrade);
    setF('pcba-smt-sides', String(a.reflowSides));
    setF('pcba-th-count', a.throughHoleJoints);
    setF('pcba-man-count', a.manualJoints);
    setF('pcba-bga-count', a.bgaCount);
    if (a.ictTimeSec > 0) setF('pcba-ict-time', a.ictTimeSec);

    // PCB cost from fab estimate mid
    setF('pcba-pcb-cost', r.costEstimates.pcbFabGBP.mid.toFixed(2));

    // Auto-set X-ray if BGAs detected
    if (a.bgaCount > 0) {
      const xrayEl = el<HTMLSelectElement>('pcba-xray-mach');
      if (xrayEl) {
        const xrayOpt = Array.from(xrayEl.options).find(o => o.value.includes('xray'));
        if (xrayOpt) xrayEl.value = xrayOpt.value;
      }
      const ictEl = el<HTMLSelectElement>('pcba-ict-mach');
      if (ictEl) {
        const ictOpt = Array.from(ictEl.options).find(o => o.value.includes('ict-auto'));
        if (ictOpt) ictEl.value = ictOpt.value;
      }
    }

    // Populate BOM table from image analysis
    const bomBody = el('bom-body');
    if (bomBody && r.bom.length > 0) {
      bomBody.innerHTML = '';
      bomCount = 0;
      for (const item of r.bom) {
        const validTypes: ComponentType[] = [
          'passive_0402','passive_0603','passive_0805',
          'crystal_osc','power_module','transformer','led','relay_switch','fuse_tvs',
          'ic_soic','ic_qfn','ic_bga','ic_tqfp',
          'connector_smt','through_hole','manual_solder',
        ];
        const isKnownType = validTypes.includes(item.componentType as ComponentType);
        const ct = isKnownType
          ? (item.componentType as ComponentType)
          : 'passive_0402';
        const descSuffix = !isKnownType
          ? ` ⚠ type "${item.componentType}" unrecognised — defaulted to 0402`
          : '';
        addBOMRow({
          refDes: item.refDes,
          componentType: ct,
          description: `${item.description}${item.pkg ? ` [${item.pkg}]` : ''}${item.value ? ` ${item.value}` : ''}${descSuffix}`,
          qty: item.qty,
          unitPriceGBP: item.unitPriceGBP,
          moq: item.moq,
        });
      }
    }

    const partNameEl = el<HTMLInputElement>('part-name');
    if (partNameEl && r.partName) {
      partNameEl.value = r.partName;
      partNameEl.classList.add('ai-filled');
    }
  }, 150);
}

function buildOCCTPanel(geo: OCCTGeometry | null, source: string): string {
  if (!geo || geo.status !== 'success') return '';

  const bb = geo.boundingBox!;
  const vol = geo.volume!;
  const sa = geo.surfaceArea!;
  const w = geo.weights!;
  const f = geo.features!;
  const faces = geo.faces!;

  const totalFaces = faces.total || 1;
  const faceEntries = Object.entries(faces.byType).sort(([, a], [, b]) => b - a);

  const barSegments = faceEntries.map(([k, v]) => {
    const pct = (v / totalFaces * 100).toFixed(1);
    const colour = FACE_COLOURS[k] ?? FACE_COLOURS.OTHER;
    return `<div class="occt-face-segment" style="width:${pct}%;background:${colour}" title="${k}: ${v} (${pct}%)"></div>`;
  }).join('');

  const legend = faceEntries.slice(0, 6).map(([k, v]) => {
    const colour = FACE_COLOURS[k] ?? FACE_COLOURS.OTHER;
    return `<span><span class="occt-legend-dot" style="background:${colour}"></span>${k} ${v}</span>`;
  }).join('');

  const mfgScore = geo.manufacturabilityScore;
  const mfgScoreClass = mfgScore === undefined ? '' : mfgScore >= 75 ? 'score-high' : mfgScore >= 50 ? 'score-med' : 'score-low';
  const warningBanners = [
    geo.assemblyWarning ? `<div class="occt-warning occt-warning--red">⚠ Assembly detected: ${geo.assemblyWarning} — costs shown per component</div>` : '',
    geo.unitWarning    ? `<div class="occt-warning occt-warning--orange">⚠ ${geo.unitWarning}</div>` : '',
  ].join('');

  return `
    <div class="occt-panel">
      ${warningBanners}
      <div class="occt-panel-header">
        Geometry — Open CASCADE Kernel
        <span class="occt-source-badge ${source === 'occt' ? 'occt' : 'text'}">Precise</span>
        ${mfgScore !== undefined ? `<span class="occt-mfg-score ${mfgScoreClass}" title="Geometry-derived manufacturability score">MFG ${mfgScore}/100</span>` : ''}
      </div>
      <div class="occt-stat-grid">
        <div class="occt-stat">
          <div class="occt-stat-value">${bb.xMm}×${bb.yMm}×${bb.zMm}</div>
          <div class="occt-stat-label">Bounding box (mm)</div>
        </div>
        <div class="occt-stat">
          <div class="occt-stat-value">${vol.cm3.toFixed(2)} cm³</div>
          <div class="occt-stat-label">True volume</div>
        </div>
        <div class="occt-stat">
          <div class="occt-stat-value">${sa.cm2.toFixed(0)} cm²</div>
          <div class="occt-stat-label">True surface area</div>
        </div>
        <div class="occt-stat">
          <div class="occt-stat-value">${(geo.fillRatio! * 100).toFixed(1)}%</div>
          <div class="occt-stat-label">Fill ratio</div>
        </div>
        <div class="occt-stat">
          <div class="occt-stat-value">${geo.wallThickness ? geo.wallThickness.meanMm.toFixed(2) + ' mm' : '—'}</div>
          <div class="occt-stat-label">Mean wall thickness${geo.wallThickness ? ` (${geo.wallThickness.method === 'ray_cast' ? 'ray-cast' : 'formula'})` : ''}</div>
        </div>
        <div class="occt-stat">
          <div class="occt-stat-value">${geo.wallThickness ? `${geo.wallThickness.minMm.toFixed(1)}–${geo.wallThickness.maxMm.toFixed(1)} mm` : '—'}</div>
          <div class="occt-stat-label">Wall thickness range</div>
        </div>
        <div class="occt-stat">
          <div class="occt-stat-value">${geo.draftAnalysis ? (geo.draftAnalysis.undercutFaceCount > 0 ? `⚠ ${geo.draftAnalysis.undercutFaceCount}` : '0') : '—'}</div>
          <div class="occt-stat-label">Undercut faces</div>
        </div>
        <div class="occt-stat">
          <div class="occt-stat-value">${geo.draftAnalysis ? `${geo.draftAnalysis.minPositiveDraftDeg?.toFixed(1) ?? '?'}°–${geo.draftAnalysis.maxPositiveDraftDeg?.toFixed(1) ?? '?'}°` : '—'}</div>
          <div class="occt-stat-label">Draft angle range</div>
        </div>
        <div class="occt-stat">
          <div class="occt-stat-value">${geo.setupAnalysis ? geo.setupAnalysis.estimatedSetupCount : '—'}</div>
          <div class="occt-stat-label">Est. CNC setups</div>
        </div>
        <div class="occt-stat">
          <div class="occt-stat-value">${geo.cncCycleTimeEstimate ? geo.cncCycleTimeEstimate.estimatedTotalHrs.toFixed(3) + ' hr' : '—'}</div>
          <div class="occt-stat-label">CNC cycle estimate</div>
        </div>
        <div class="occt-stat">
          <div class="occt-stat-value">${w.aluminiumKg.toFixed(3)} kg</div>
          <div class="occt-stat-label">Al weight (2.70 g/cm³)</div>
        </div>
        <div class="occt-stat">
          <div class="occt-stat-value">${w.steelKg.toFixed(3)} kg</div>
          <div class="occt-stat-label">Steel weight (7.85 g/cm³)</div>
        </div>
      </div>
      <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px">
        Face topology — ${faces.total} faces total
        ${f.estimatedHoleCount > 0 ? `· ${f.estimatedHoleCount} holes [${f.holeRadiiMm.slice(0,5).join(', ')} mm]` : ''}
        ${f.bossShaftRadiiMm.length > 0 ? `· bosses [${f.bossShaftRadiiMm.join(', ')} mm]` : ''}
        ${f.threadFeaturesDetected ? '· <strong>threads detected</strong>' : ''}
        ${geo.draftAnalysis?.undercutFaceCount ? `· <span style="color:#ef4444"><strong>${geo.draftAnalysis.undercutFaceCount} undercuts</strong></span>` : ''}
      </div>
      <div class="occt-face-bar">${barSegments}</div>
      <div class="occt-face-legend">${legend}</div>
    </div>`;
}

function markAIFilled(element: HTMLInputElement | HTMLSelectElement | null): void {
  if (!element) return;
  element.classList.add('ai-filled');
  // Remove highlight after user edits
  element.addEventListener('input', () => element.classList.remove('ai-filled'), { once: true });
}

function setMaterial(selectEl: HTMLSelectElement | null, materialId: string): void {
  if (!selectEl || !materialId) return;
  const opt = Array.from(selectEl.options).find(o => o.value === materialId);
  if (opt) { selectEl.value = opt.value; markAIFilled(selectEl); }
}

function setNumericField(id: string, value: number, decimals = 3): void {
  const el2 = el<HTMLInputElement>(id);
  if (el2) { el2.value = value.toFixed(decimals); markAIFilled(el2); }
}

function applyCADToForm(targetCommodity: CommodityType, autoCalculate = false): void {
  if (!cadAnalysisResult) return;
  const r = cadAnalysisResult;
  const c = r.costInputSuggestions;

  switchCommodity(targetCommodity);

  setTimeout(() => {
    // Part name
    const partNameEl = el<HTMLInputElement>('part-name');
    if (partNameEl) {
      partNameEl.value = r.partName || cadFile?.name.replace(/\.[^.]+$/, '') || 'CAD Part';
      markAIFilled(partNameEl);
    }

    switch (targetCommodity) {
      case 'machining': {
        setMaterial(el<HTMLSelectElement>('mach-mat'), c.materialId);
        setNumericField('mach-net-wt', c.netWeightKg, 3);
        setNumericField('mach-stock-wt', c.netWeightKg * 1.4, 3);
        // Prefer OCCT bottom-up cycle time over Claude's AI estimate
        const occtCycleHrs = cadOCCTGeometry?.cncCycleTimeEstimate?.estimatedTotalHrs ?? null;
        const occtSetupCount = cadOCCTGeometry?.setupAnalysis?.estimatedSetupCount ?? null;
        const occtSetupMinsPerSetup = cadOCCTGeometry?.cncCycleTimeEstimate?.assumedSetupTimeMinsPerSetup ?? 45;
        // Operations
        const container = el('mach-ops-container');
        if (container && c.estimatedOperations.length > 0) {
          container.innerHTML = '';
          machOpCount = 0;
          // Scale AI cycle times proportionally if OCCT total differs from AI total
          const aiTotalHrs = c.estimatedOperations.reduce((s, op) => s + op.cycleTimeHr, 0);
          const scaleFactor = (occtCycleHrs !== null && aiTotalHrs > 0) ? occtCycleHrs / aiTotalHrs : 1;
          for (const op of c.estimatedOperations) {
            addMachOp({
              name: op.name,
              type: 'milling_3ax',
              machineId: op.machineId,
              labourId: op.labourId || 'lab-uk-skilled',
              cycleTimeHr: op.cycleTimeHr * scaleFactor,
              partsPerCycle: 1,
              oee: op.oee,
              manning: op.manning,
              labourTimeHr: op.cycleTimeHr * scaleFactor,
              labourEfficiency: op.labourEfficiency,
            });
          }
        }
        // Override setup time with OCCT estimate if available
        if (occtSetupCount !== null) {
          const setupHrs = (occtSetupCount * occtSetupMinsPerSetup) / 60;
          setNumericField('mach-setup-time', setupHrs, 3);
        }
        break;
      }

      case 'casting': {
        setMaterial(el<HTMLSelectElement>('cast-mat'), c.materialId);
        setNumericField('cast-part-wt', c.netWeightKg, 3);
        const cast = c.casting;
        const occtTC = cadOCCTGeometry?.toolingCostEstimates;
        const occtPS = cadOCCTGeometry?.processSpecificEstimates;
        if (cast) {
          const subtypeEl = el<HTMLSelectElement>('cast-subtype');
          if (subtypeEl) {
            subtypeEl.value = cast.subtype;
            markAIFilled(subtypeEl);
            subtypeEl.dispatchEvent(new Event('change'));
          }
          setNumericField('cast-yield', cast.yieldFraction, 2);
          if (cast.subtype === 'hpdc') {
            setNumericField('cast-hpdc-ct', cast.cycleTimeHpdcSec, 0);
            setNumericField('cast-hpdc-cav', cast.cavities, 0);
            setNumericField('cast-hpdc-die-cost', occtTC?.hpdcDieCostGBP ?? cast.dieMouldCostGBP, 0);
            setNumericField('cast-hpdc-die-life', cast.dieMouldLife, 0);
          } else if (cast.subtype === 'sand') {
            setNumericField('cast-sand-ct', occtPS?.sandCycleTimeHr ?? cast.cycleTimeSandGravHr, 4);
            setNumericField('cast-sand-pat-cost', occtTC?.sandPatternCostGBP ?? cast.dieMouldCostGBP, 0);
            setNumericField('cast-sand-pat-life', cast.dieMouldLife, 0);
          } else if (cast.subtype === 'gravity') {
            setNumericField('cast-grav-ct', cast.cycleTimeSandGravHr, 4);
            setNumericField('cast-grav-mould-cost', occtTC?.gravityMouldCostGBP ?? cast.dieMouldCostGBP, 0);
            setNumericField('cast-grav-mould-life', cast.dieMouldLife, 0);
          } else if (cast.subtype === 'investment') {
            setNumericField('cast-inv-ct', cast.cycleTimeSandGravHr, 4);
          }
        }
        break;
      }

      case 'cast_and_machine': {
        setMaterial(el<HTMLSelectElement>('cam-mat'), c.materialId);
        setNumericField('cam-cast-wt', c.netWeightKg * 1.15, 3);
        setNumericField('cam-finish-wt', c.netWeightKg, 3);
        // Casting section
        const castCAM = c.casting;
        const camTC = cadOCCTGeometry?.toolingCostEstimates;
        const camPS = cadOCCTGeometry?.processSpecificEstimates;
        if (castCAM) {
          const camSubEl = el<HTMLSelectElement>('cam-cast-subtype');
          if (camSubEl) {
            camSubEl.value = castCAM.subtype;
            markAIFilled(camSubEl);
            camSubEl.dispatchEvent(new Event('change'));
          }
          setNumericField('cam-cast-yield', castCAM.yieldFraction, 2);
          if (castCAM.subtype === 'hpdc') {
            setNumericField('cam-hpdc-ct', castCAM.cycleTimeHpdcSec, 0);
            setNumericField('cam-hpdc-cav', castCAM.cavities, 0);
            setNumericField('cam-hpdc-die-cost', camTC?.hpdcDieCostGBP ?? castCAM.dieMouldCostGBP, 0);
            setNumericField('cam-hpdc-die-life', castCAM.dieMouldLife, 0);
          } else if (castCAM.subtype === 'sand') {
            setNumericField('cam-sand-ct', camPS?.sandCycleTimeHr ?? castCAM.cycleTimeSandGravHr, 4);
            setNumericField('cam-sand-pat-cost', camTC?.sandPatternCostGBP ?? castCAM.dieMouldCostGBP, 0);
            setNumericField('cam-sand-pat-life', castCAM.dieMouldLife, 0);
          } else if (castCAM.subtype === 'gravity') {
            setNumericField('cam-grav-ct', castCAM.cycleTimeSandGravHr, 4);
            setNumericField('cam-grav-mould-cost', camTC?.gravityMouldCostGBP ?? castCAM.dieMouldCostGBP, 0);
            setNumericField('cam-grav-mould-life', castCAM.dieMouldLife, 0);
          } else if (castCAM.subtype === 'investment') {
            setNumericField('cam-inv-ct', castCAM.cycleTimeSandGravHr, 4);
          }
        }
        // Machining section — populate ops and setup time
        const camCycleHrs = cadOCCTGeometry?.cncCycleTimeEstimate?.estimatedTotalHrs ?? null;
        const camSetupCount = cadOCCTGeometry?.setupAnalysis?.estimatedSetupCount ?? null;
        const camSetupMins = cadOCCTGeometry?.cncCycleTimeEstimate?.assumedSetupTimeMinsPerSetup ?? 45;
        const camContainer = el('cam-mach-ops-container');
        if (camContainer && c.estimatedOperations.length > 0) {
          camContainer.innerHTML = '';
          camMachOpCount = 0;
          const aiTotalCAM = c.estimatedOperations.reduce((s, op) => s + op.cycleTimeHr, 0);
          const scaleCAM = (camCycleHrs !== null && aiTotalCAM > 0) ? camCycleHrs / aiTotalCAM : 1;
          for (const op of c.estimatedOperations) {
            addCAMMachOp({
              name: op.name, type: 'milling_3ax', machineId: op.machineId,
              labourId: op.labourId || 'lab-uk-skilled',
              cycleTimeHr: op.cycleTimeHr * scaleCAM, partsPerCycle: 1,
              oee: op.oee, manning: op.manning,
              labourTimeHr: op.cycleTimeHr * scaleCAM, labourEfficiency: op.labourEfficiency,
            });
          }
        }
        if (camSetupCount !== null) {
          setNumericField('cam-mach-setup-time', (camSetupCount * camSetupMins) / 60, 3);
        } else {
          setNumericField('cam-mach-setup-time', c.estimatedSetupTimeHr, 3);
        }
        break;
      }

      case 'forging': {
        setMaterial(el<HTMLSelectElement>('forge-mat'), c.materialId);
        setNumericField('forge-part-wt', c.netWeightKg, 3);
        const forging = c.forging;
        const forgeTC = cadOCCTGeometry?.toolingCostEstimates;
        const forgePS = cadOCCTGeometry?.processSpecificEstimates;
        if (forging) {
          setNumericField('forge-flash', forging.flashKg, 3);
          setNumericField('forge-yield', forging.yieldFraction, 2);
          // Prefer OCCT geometry-derived stroke count over AI guess
          setNumericField('forge-strokes', forgePS?.forgeStrokes ?? forging.strokes, 0);
          setNumericField('forge-time-per-blow', forging.timePerBlowSec, 0);
          // Prefer OCCT parametric die cost over AI bracket estimate
          setNumericField('forge-die-cost', forgeTC?.forgeDieCostGBP ?? forging.dieCostGBP, 0);
          setNumericField('forge-die-life', forging.dieLife, 0);
        } else {
          // Fallback geometry-derived estimates
          setNumericField('forge-flash', c.netWeightKg * 0.1, 3);
          setNumericField('forge-yield', 0.9, 2);
          if (forgePS) setNumericField('forge-strokes', forgePS.forgeStrokes, 0);
          if (forgeTC) setNumericField('forge-die-cost', forgeTC.forgeDieCostGBP, 0);
        }
        // Material-specific heating energy (kWh/kg)
        const forgeHeatMap: Record<string, number> = {
          'mat-dc01': 0.35, 'mat-hss': 0.38, 'mat-stainless-316': 0.42, 'mat-ss304c': 0.42,
          'mat-al6061': 0.25, 'mat-al5052': 0.23, 'mat-brass-crz': 0.18,
        };
        setNumericField('forge-heat-energy', forgeHeatMap[c.materialId] ?? 0.40, 2);
        break;
      }

      case 'sheet_metal': {
        setMaterial(el<HTMLSelectElement>('sm-mat'), c.materialId);
        setNumericField('sm-net-wt', c.netWeightKg, 3);
        // Derive blank dims from OCCT bounding box (sorted: L ≥ W ≥ thickness)
        const smBB = cadOCCTGeometry?.boundingBox;
        let smBlankL = 0;
        let smBlankW = 0;
        if (smBB) {
          const dims = [smBB.xMm, smBB.yMm, smBB.zMm].sort((a, b) => b - a);
          smBlankL = dims[0] * 1.05;
          smBlankW = dims[1] * 1.05;
          setNumericField('sm-blank-l', smBlankL, 0);
          setNumericField('sm-blank-w', smBlankW, 0);
          const wallMin = cadOCCTGeometry?.wallThickness?.minMm;
          setNumericField('sm-thick', wallMin ?? dims[2], 1);
          // Perimeter ≈ 2×(L+W), strip width and pitch with typical scrap allowances
          setNumericField('sm-perim', 2 * (smBlankL + smBlankW), 0);
          setNumericField('sm-strip-w', smBlankW * 1.06, 0);
          setNumericField('sm-pitch', smBlankL * 1.04, 0);
        }
        // Material shear strength lookup
        const smShearMap: Record<string, number> = {
          'mat-dc01': 290, 'mat-hss': 420, 'mat-stainless-316': 520,
          'mat-al5052': 125, 'mat-al6061': 195, 'mat-brass-crz': 350, 'mat-ss304c': 510,
        };
        setNumericField('sm-shear', smShearMap[c.materialId] ?? 280, 0);
        const sm = c.sheetMetal;
        const smTC = cadOCCTGeometry?.toolingCostEstimates;
        if (sm) {
          if (!smBB) {
            setNumericField('sm-blank-l', sm.blankLengthMm, 0);
            setNumericField('sm-blank-w', sm.blankWidthMm, 0);
            setNumericField('sm-thick', sm.thicknessMm, 1);
            smBlankL = sm.blankLengthMm;
            smBlankW = sm.blankWidthMm;
            setNumericField('sm-perim', 2 * (smBlankL + smBlankW), 0);
            setNumericField('sm-strip-w', smBlankW * 1.06, 0);
            setNumericField('sm-pitch', smBlankL * 1.04, 0);
          }
          // Prefer OCCT parametric progressive die cost over AI bracket estimate
          setNumericField('sm-die-cost', smTC?.progressiveDieCostGBP ?? sm.dieCostGBP, 0);
          setNumericField('sm-die-life', sm.dieLife, 0);
          setNumericField('sm-num-ops', sm.numOps, 0);
        } else if (smTC) {
          setNumericField('sm-die-cost', smTC.progressiveDieCostGBP, 0);
        }
        break;
      }

      case 'sheet_metal_fab': {
        setMaterial(el<HTMLSelectElement>('smf-mat'), c.materialId);
        setNumericField('smf-part-wt', c.netWeightKg, 3);
        // Estimate bend count: planar faces form bends; 2 faces per 90° bend minus the flat base
        const smfPlanar = cadOCCTGeometry?.features?.planarFaceCount ?? 0;
        if (smfPlanar > 2) {
          const estimatedBends = Math.max(1, Math.round((smfPlanar - 2) / 2));
          setNumericField('smf-bends', estimatedBends, 0);
        }
        // Tolerance from wall thickness (5% of mean wall, min 0.1mm)
        const smfWallMean = cadOCCTGeometry?.wallThickness?.meanMm;
        if (smfWallMean) {
          setNumericField('smf-tolerance', Math.max(0.1, smfWallMean * 0.05), 2);
        }
        // Laser blanking cycle time: perimeter / laser speed + pierce time per hole
        const smfBB = cadOCCTGeometry?.boundingBox;
        if (smfBB) {
          const fbDims = [smfBB.xMm, smfBB.yMm, smfBB.zMm].sort((a, b) => b - a);
          const perimMm = 2 * (fbDims[0] * 1.05 + fbDims[1] * 1.05);
          const holeCount = cadOCCTGeometry?.features?.estimatedHoleCount ?? 0;
          const laserSpeedMmPerSec = 333; // ~20 m/min typical laser feed
          const blankCt = Math.max(15, Math.round(perimMm / laserSpeedMmPerSec + holeCount * 2 + 5));
          setNumericField('smf-blank-ct', blankCt, 0);
        }
        const smFab = c.sheetMetal;
        if (smFab) {
          setNumericField('smf-tooling', smFab.dieCostGBP, 0);
        }
        break;
      }

      case 'injection_moulding': {
        setMaterial(el<HTMLSelectElement>('imm-mat'), c.materialId);
        setNumericField('imm-part-wt', c.netWeightKg, 4);
        // OCCT-derived: projected area and wall thickness
        const immBB = cadOCCTGeometry?.boundingBox;
        const immWall = cadOCCTGeometry?.wallThickness?.meanMm;
        if (immBB) {
          const projCm2 = (immBB.xMm * immBB.yMm) / 100;
          setNumericField('imm-area', projCm2, 1);
        }
        if (immWall) {
          setNumericField('imm-wall', immWall, 1);
        }
        const im = c.injectionMoulding;
        const immTC = cadOCCTGeometry?.toolingCostEstimates;
        if (im) {
          setNumericField('imm-cav', im.cavities, 0);
          if (!immBB) setNumericField('imm-area', im.projectedAreaCm2, 1);
          if (!immWall) setNumericField('imm-wall', im.wallThicknessMm, 1);
          // Prefer OCCT parametric mould cost over AI bracket estimate
          setNumericField('imm-mould-cost', immTC?.imMouldCostGBP ?? im.mouldCostGBP, 0);
          setNumericField('imm-mould-life', im.mouldLife, 0);
          setNumericField('imm-runner-wt', im.runnerWeightKg, 4);
        } else if (immTC) {
          setNumericField('imm-mould-cost', immTC.imMouldCostGBP, 0);
        }
        // Material-specific cooling factor and cavity pressure (key cycle time drivers)
        const immCoolMap: Record<string, number> = {
          'mat-pp': 3.16, 'mat-pa6': 2.20, 'mat-pc': 4.50,
        };
        const immPressMap: Record<string, number> = {
          'mat-pp': 35, 'mat-pa6': 55, 'mat-pc': 65,
        };
        setNumericField('imm-cool-f', immCoolMap[c.materialId] ?? 3.0, 2);
        setNumericField('imm-cav-press', immPressMap[c.materialId] ?? 50, 0);
        // Cycle time sub-components from wall thickness
        const wallForCycle = immWall ?? im?.wallThicknessMm ?? 2.5;
        setNumericField('imm-fill', Math.max(1.5, parseFloat((wallForCycle * 0.5).toFixed(1))), 1);
        setNumericField('imm-pack', Math.max(2.0, parseFloat((wallForCycle * 0.8).toFixed(1))), 1);
        setNumericField('imm-eject', 2, 0);
        break;
      }

      case 'blow_moulding': {
        const bm = c.blowMoulding;
        const bmWall = cadOCCTGeometry?.wallThickness?.meanMm;
        setMaterial(el<HTMLSelectElement>('bm-mat'), c.materialId);
        setNumericField('bm-part-wt', c.netWeightKg, 4);
        if (bm) {
          setNumericField('bm-flash-wt', bm.flashWeightKg, 4);
          setNumericField('bm-wall', bm.wallThicknessMm ?? bmWall ?? 2.0, 1);
          setNumericField('bm-cav', bm.cavities, 0);
          setNumericField('bm-mould-cost', bm.mouldCostGBP, 0);
          setNumericField('bm-mould-life', bm.mouldLife, 0);
          setNumericField('bm-blow-t', bm.blowTimeSec, 0);
          setNumericField('bm-open-close', bm.openCloseSec, 0);
          // Machine prefix from subtype
          const bmMachPfx = bm.subtype === 'ibm' ? 'bm-ibm' : bm.subtype === 'sbm' ? 'bm-sbm' : 'bm-ebm';
          const bmMachEl = el<HTMLSelectElement>('bm-mach');
          if (bmMachEl) {
            const match = Array.from(bmMachEl.options).find(o => o.value.startsWith(bmMachPfx));
            if (match) { bmMachEl.value = match.value; markAIFilled(bmMachEl); }
          }
        } else if (bmWall) {
          setNumericField('bm-wall', bmWall, 1);
          setNumericField('bm-flash-wt', c.netWeightKg * 0.12, 4);
        }
        // Cooling time factor: HDPE/LDPE ~3.5, PP ~3.16, PET ~3.0
        const bmCoolMap: Record<string, number> = { 'mat-pp': 3.16, 'mat-pc': 4.5 };
        setNumericField('bm-cool-f', bmCoolMap[c.materialId] ?? 3.5, 2);
        setNumericField('bm-amort', 100000, 0);
        break;
      }

      case 'thermoforming': {
        const tf = c.thermoforming;
        setMaterial(el<HTMLSelectElement>('tf-mat'), c.materialId);
        setNumericField('tf-part-wt', c.netWeightKg, 4);
        if (tf) {
          setNumericField('tf-sheet-wt', tf.sheetWeightKg, 4);
          setNumericField('tf-tool-cost', tf.toolCostGBP, 0);
          setNumericField('tf-heat', tf.heatTimeSec, 0);
          setNumericField('tf-form', tf.formTimeSec, 0);
          setNumericField('tf-trim', tf.trimTimeSec, 0);
          const tfMethodEl = el<HTMLSelectElement>('tf-method');
          if (tfMethodEl && tf.method) {
            const methodMap: Record<string, string> = { vacuum: 'vacuum', pressure: 'pressure', twin_sheet: 'twin_sheet' };
            const mv = methodMap[tf.method];
            if (mv && Array.from(tfMethodEl.options).some(o => o.value === mv)) {
              tfMethodEl.value = mv; markAIFilled(tfMethodEl);
            }
          }
        } else {
          // Derive from geometry: plastic weight from OCCT
          const tfPlastic = cadOCCTGeometry?.weights?.plasticKg ?? c.netWeightKg;
          setNumericField('tf-sheet-wt', tfPlastic * 1.35, 4);
        }
        setNumericField('tf-amort', 50000, 0);
        break;
      }

      case 'rotational_moulding': {
        const rm = c.rotationalMoulding;
        setMaterial(el<HTMLSelectElement>('rm-mat'), c.materialId);
        setNumericField('rm-part-wt', c.netWeightKg, 4);
        if (rm) {
          setNumericField('rm-num-arms', rm.numArms, 0);
          setNumericField('rm-parts-per-arm', rm.partsPerArm, 0);
          setNumericField('rm-heat', rm.heatTimeSec, 0);
          setNumericField('rm-cool', rm.coolTimeSec, 0);
          setNumericField('rm-mould-cost', rm.mouldCostGBP, 0);
          setNumericField('rm-mould-life', rm.mouldLife, 0);
        } else {
          // Rule-of-thumb defaults by part weight
          const rmHeat = Math.max(900, Math.round(c.netWeightKg * 180 + 900));
          setNumericField('rm-heat', rmHeat, 0);
          setNumericField('rm-cool', Math.round(rmHeat * 0.7), 0);
          setNumericField('rm-num-arms', 3, 0);
          setNumericField('rm-parts-per-arm', c.netWeightKg > 5 ? 1 : 2, 0);
        }
        setNumericField('rm-amort', 20000, 0);
        break;
      }

      case 'rubber': {
        const rub = c.rubber;
        setMaterial(el<HTMLSelectElement>('rub-mat'), c.materialId);
        setNumericField('rub-part-wt', c.netWeightKg, 4);
        if (rub) {
          setNumericField('rub-flash-wt', rub.flashWeightKg, 4);
          setNumericField('rub-cavities', rub.cavities, 0);
          setNumericField('rub-cycle-sec', rub.cycleTimeSec, 0);
          setNumericField('rub-mould-cost', rub.mouldCostGBP, 0);
          setNumericField('rub-mould-life', rub.mouldLife, 0);
          const rubProcEl = el<HTMLSelectElement>('rub-process');
          if (rubProcEl && rub.process) {
            if (Array.from(rubProcEl.options).some(o => o.value === rub.process)) {
              rubProcEl.value = rub.process; markAIFilled(rubProcEl);
            }
          }
        } else {
          setNumericField('rub-flash-wt', c.netWeightKg * 0.08, 4);
          setNumericField('rub-cycle-sec', 180, 0);
          setNumericField('rub-cavities', 2, 0);
        }
        setNumericField('rub-amort', 50000, 0);
        break;
      }

      case 'composites': {
        const comp = c.composites;
        setNumericField('comp-part-wt', c.netWeightKg, 4);
        const compSA = cadOCCTGeometry?.surfaceArea?.cm2 ?? null;
        if (comp) {
          setNumericField('comp-fibre-frac', comp.fibreFraction, 2);
          setNumericField('comp-waste-frac', comp.wasteFraction, 2);
          setNumericField('comp-area', comp.areaCm2 ?? compSA ?? 0, 0);
          setNumericField('comp-plies', comp.plies, 0);
          setNumericField('comp-tool-cost', comp.toolCostGBP, 0);
          setNumericField('comp-tool-life', comp.toolLife, 0);
          setNumericField('comp-cure-time', comp.cureTimeSec, 0);
          const compProcEl = el<HTMLSelectElement>('comp-process');
          if (compProcEl && comp.process) {
            const procMap: Record<string, string> = {
              hand_layup: 'hand_layup', prepreg_autoclave: 'prepreg_autoclave',
              rtm: 'rtm', infusion: 'infusion', smc: 'smc', wet_layup: 'wet_layup',
            };
            const pv = procMap[comp.process];
            if (pv && Array.from(compProcEl.options).some(o => o.value === pv)) {
              compProcEl.value = pv; markAIFilled(compProcEl);
            }
          }
        } else if (compSA) {
          setNumericField('comp-area', compSA, 0);
          setNumericField('comp-plies', 4, 0);
          setNumericField('comp-fibre-frac', 0.45, 2);
          setNumericField('comp-waste-frac', 0.20, 2);
        }
        setNumericField('comp-amort', 10000, 0);
        break;
      }

      case 'wiring_harness': {
        // Wiring harness has no geometry-driven sub-object; populate sensible defaults
        setNumericField('harn-asm-time', c.estimatedCycleTimeHr * 3600, 0);
        setNumericField('harn-amort', 10000, 0);
        break;
      }
    }

    if (autoCalculate) {
      compute();
    }
  }, 150);
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

  // Show/hide country bar (hidden for AI Agent only)
  const countryBar = document.getElementById('wf-country-bar');
  if (countryBar) countryBar.style.display = (type as string) === 'ai_agent' ? 'none' : '';

  const area = el('commodity-form-area');
  machOpCount = 0; coatCount = 0; joinCount = 0; stationCount = 0; bomCount = 0; camMachOpCount = 0; asmLineCount = 0;

  switch (type) {
    case 'machining':
      area.innerHTML = renderMachiningForm();
      populateSelects();
      el('add-mach-op-btn')?.addEventListener('click', () => addMachOp());
      addMachOp({ name: 'CNC Turning', type: 'turning', machineId: 'mach-lathe-cnc', labourId: 'lab-uk-skilled', cycleTimeHr: 0.05, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.05, labourEfficiency: 0.92 });
      break;

    case 'sheet_metal_fab': {
      area.innerHTML = renderSheetMetalFabForm();
      populateSelects();
      wireSheetMetalFabAdvisor();
      setTimeout(() => {
        // ── Material — filter to sheet metal categories only ──────────────────
        const smfMatCats = new Set([
          'Mild Steel Sheet', 'Galvanised Steel Sheet', 'Electrogalvanised Steel Sheet',
          'AHSS Sheet', 'High Strength Steel Sheet', 'Ultra-High Strength Steel',
          'Aluminium Sheet', 'Stainless Steel Sheet', 'Copper & Brass Sheet',
        ]);
        const matEl = el<HTMLSelectElement>('smf-mat');
        if (matEl) {
          const smfMats = library.materials.filter(m => smfMatCats.has(m.category));
          matEl.innerHTML = smfMats.map(m => `<option value="${escHtml(m.id)}">${escHtml(m.grade)} — £${m.pricePerKg.toFixed(2)}/kg</option>`).join('');
          if (Array.from(matEl.options).some(o => o.value === 'mat-dc01')) matEl.value = 'mat-dc01';
        }
        // ── Blanking machine — filter to laser/plasma/waterjet/punch/shear ────
        const blankMachIds = new Set([
          'laser-trumpf-3030', 'laser-trumpf-5030', 'laser-amada-ensis-3015', 'laser-bystronic-3015',
          'plasma-hypertherm-xpr300', 'plasma-kjellberg-hifocus280',
          'waterjet-flow-mach500', 'waterjet-omax-80x',
          'punch-amada-emz3610', 'punch-trumpf-5000',
          'shear-hydraulic-3m', 'shear-guillotine-6mm',
        ]);
        const blankMachEl = el<HTMLSelectElement>('smf-blank-mach');
        if (blankMachEl) {
          const blankMachs = library.machines.filter(m => blankMachIds.has(m.id));
          blankMachEl.innerHTML = blankMachs.map(m => `<option value="${escHtml(m.id)}">${escHtml(m.machineClass)} — £${m.computedRatePerHr.toFixed(2)}/hr</option>`).join('');
        }
        // ── Brake machine — filter to press brake machines ────────────────────
        const brakeMachIds = new Set([
          'brake-amada-hfe100', 'brake-amada-hfe170', 'brake-trumpf-trubend3100',
          'brake-lvd-ppeb135', 'brake-trumpf-5230',
        ]);
        const brakeMachEl = el<HTMLSelectElement>('smf-brake-mach');
        if (brakeMachEl) {
          const brakeMachs = library.machines.filter(m => brakeMachIds.has(m.id));
          brakeMachEl.innerHTML = brakeMachs.map(m => `<option value="${escHtml(m.id)}">${escHtml(m.machineClass)} — £${m.computedRatePerHr.toFixed(2)}/hr</option>`).join('');
        }
        // ── Spot weld machine — pedestal + robotic ────────────────────────────
        const swMachEl = el<HTMLSelectElement>('smf-sw-mach');
        if (swMachEl) {
          const swMachs = library.machines.filter(m => ['spotweld-gun-manual','robot-spotweld-kuka'].includes(m.id));
          swMachEl.innerHTML = `<option value="">None</option>${swMachs.map(m => `<option value="${escHtml(m.id)}">${escHtml(m.machineClass)} — £${m.computedRatePerHr.toFixed(2)}/hr</option>`).join('')}`;
        }
        // ── MIG machine — manual station + robotic cell ───────────────────────
        const migMachEl = el<HTMLSelectElement>('smf-mig-mach');
        if (migMachEl) {
          const migMachs = library.machines.filter(m => ['mig-welder-manual','robot-mig-cell'].includes(m.id));
          migMachEl.innerHTML = `<option value="">None</option>${migMachs.map(m => `<option value="${escHtml(m.id)}">${escHtml(m.machineClass)} — £${m.computedRatePerHr.toFixed(2)}/hr</option>`).join('')}`;
        }
        // ── TIG machine ───────────────────────────────────────────────────────
        const tigMachEl = el<HTMLSelectElement>('smf-tig-mach');
        if (tigMachEl) {
          const tigM = library.machines.find(m => m.id === 'tig-welder-manual');
          tigMachEl.innerHTML = `<option value="">None</option>${tigM ? `<option value="${tigM.id}">${escHtml(tigM.machineClass)} — £${tigM.computedRatePerHr.toFixed(2)}/hr</option>` : ''}`;
        }
        // ── Labour defaults ───────────────────────────────────────────────────
        for (const id of ['smf-blank-lab', 'smf-brake-lab']) {
          const labEl = el<HTMLSelectElement>(id);
          if (labEl) { const opt = Array.from(labEl.options).find(o => o.value === 'lab-uk-semiskilled'); if (opt) labEl.value = 'lab-uk-semiskilled'; }
        }
        for (const id of ['smf-sw-lab', 'smf-mig-lab', 'smf-tig-lab']) {
          const labEl = el<HTMLSelectElement>(id);
          if (labEl) { const opt = Array.from(labEl.options).find(o => o.value === 'lab-uk-skilled'); if (opt) labEl.value = 'lab-uk-skilled'; }
        }
        wireSheetMetalBlankingChange();
      }, 0);
      break;
    }

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
      wirePCBImageZone();
      if (pcbImageResult) injectPCBImagePanel(); else injectPCBDemoCards();
      break;

    case 'pcba':
      area.innerHTML = renderPCBAForm();
      populateSelects();
      wirePCBImageZone();
      if (pcbImageResult) injectPCBImagePanel(); else injectPCBDemoCards();
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

    case 'blow_moulding':
      area.innerHTML = renderBlowMouldingForm();
      populateSelects();
      setTimeout(() => {
        // Filter material select to blow-moulding-relevant materials only
        const matEl = el<HTMLSelectElement>('bm-mat');
        if (matEl) {
          const bmMatIds = new Set(['mat-hdpe', 'mat-ldpe', 'mat-pet-bg']);
          const bmMats = library.materials.filter(m => m.category === 'Blow Moulding' || bmMatIds.has(m.id));
          matEl.innerHTML = bmMats.map(m => `<option value="${escHtml(m.id)}">${escHtml(m.grade)} — £${m.pricePerKg.toFixed(2)}/kg</option>`).join('');
          if (Array.from(matEl.options).some(o => o.value === 'mat-hdpe')) matEl.value = 'mat-hdpe';
        }
        // Filter machine select to blow-moulding machines only
        const bmMachIds = new Set(['blow-ebm-100l','blow-ebm-500l','blow-ebm-2head','blow-ebm-coex3','blow-ebm-coex5','blow-ebm-large','blow-ibm-rotary','blow-ibm-linear','blow-sbm-1stage','blow-sbm-2stage','blow-deflash-trimmer']);
        const machEl = el<HTMLSelectElement>('bm-mach');
        if (machEl) {
          const bmMachs = library.machines.filter(m => bmMachIds.has(m.id));
          machEl.innerHTML = bmMachs.map(m => `<option value="${escHtml(m.id)}">${escHtml(m.machineClass)} — £${m.computedRatePerHr.toFixed(2)}/hr</option>`).join('');
        }
        // Deflash machine select — only the deflash trimmer
        const deflashEl = el<HTMLSelectElement>('bm-deflash-mach');
        if (deflashEl) {
          const deflashMach = library.machines.find(m => m.id === 'blow-deflash-trimmer');
          deflashEl.innerHTML = `<option value="">None</option>${deflashMach ? `<option value="${deflashMach.id}">${escHtml(deflashMach.machineClass)} — £${deflashMach.computedRatePerHr.toFixed(2)}/hr</option>` : ''}`;
        }
        // Labour default to semiskilled
        const labEl = el<HTMLSelectElement>('bm-lab');
        if (labEl) { const opt = Array.from(labEl.options).find(o => o.value === 'lab-uk-semiskilled'); if (opt) labEl.value = 'lab-uk-semiskilled'; }
        wireBlowMouldingProcessChange();
      }, 0);
      break;

    case 'extrusion':
      area.innerHTML = renderExtrusionForm();
      populateSelects();
      setTimeout(() => {
        const machEl = el<HTMLSelectElement>('ext-mach');
        if (machEl) { const opt = Array.from(machEl.options).find(o => o.value.includes('extruder-75mm')); if (opt) machEl.value = opt.value; }
        const matEl = el<HTMLSelectElement>('ext-mat');
        if (matEl) { const opt = Array.from(matEl.options).find(o => o.value.includes('mat-hdpe')); if (opt) matEl.value = opt.value; }
      }, 0);
      break;

    case 'thermoforming':
      area.innerHTML = renderThermoformingForm();
      populateSelects();
      setTimeout(() => {
        const machEl = el<HTMLSelectElement>('tf-mach');
        if (machEl) { const opt = Array.from(machEl.options).find(o => o.value.includes('thermoform-small')); if (opt) machEl.value = opt.value; }
        const matEl = el<HTMLSelectElement>('tf-mat');
        if (matEl) { const opt = Array.from(matEl.options).find(o => o.value.includes('mat-hips')); if (opt) matEl.value = opt.value; }
      }, 0);
      break;

    case 'rotational_moulding':
      area.innerHTML = renderRotationalMouldingForm();
      populateSelects();
      setTimeout(() => {
        const machEl = el<HTMLSelectElement>('rm-mach');
        if (machEl) { const opt = Array.from(machEl.options).find(o => o.value.includes('rotomould-biaxial')); if (opt) machEl.value = opt.value; }
        const matEl = el<HTMLSelectElement>('rm-mat');
        if (matEl) { const opt = Array.from(matEl.options).find(o => o.value.includes('mat-lldpe')); if (opt) matEl.value = opt.value; }
      }, 0);
      break;

    case 'rubber':
      area.innerHTML = renderRubberForm();
      populateSelects();
      setTimeout(() => {
        // Filter material select to rubber compounds only
        const matEl = el<HTMLSelectElement>('rub-mat');
        if (matEl) {
          const rubberMats = library.materials.filter(m => m.category === 'Rubber');
          matEl.innerHTML = rubberMats.map(m =>
            `<option value="${m.id}">${m.grade} — £${m.pricePerKg.toFixed(2)}/kg</option>`
          ).join('');
          if (Array.from(matEl.options).some(o => o.value === 'mat-epdm')) matEl.value = 'mat-epdm';
        }
        // Filter main machine select to rubber-specific machines only
        const rubberMachIds = new Set(['compression-mould-std','transfer-mould-std','lsr-injection-machine','extruder-rubber-60mm','die-cut-press-rubber']);
        const machEl = el<HTMLSelectElement>('rub-mach');
        if (machEl) {
          const rubberMachs = library.machines.filter(m => rubberMachIds.has(m.id));
          machEl.innerHTML = rubberMachs.map(m =>
            `<option value="${m.id}">${m.machineClass} — £${m.computedRatePerHr.toFixed(2)}/hr</option>`
          ).join('');
        }
        // Filter cure oven select to only the rubber cure oven
        const cureMachEl = el<HTMLSelectElement>('rub-cure-mach');
        if (cureMachEl) {
          const cureOven = library.machines.find(m => m.id === 'cure-oven-rubber');
          cureMachEl.innerHTML = `<option value="">— none —</option>${cureOven ? `<option value="${cureOven.id}">${cureOven.machineClass} — £${cureOven.computedRatePerHr.toFixed(2)}/hr</option>` : ''}`;
        }
        // Labour — default semi-skilled operator
        const labEl = el<HTMLSelectElement>('rub-lab');
        if (labEl) {
          const opt = Array.from(labEl.options).find(o => o.value === 'lab-uk-semiskilled');
          if (opt) labEl.value = 'lab-uk-semiskilled';
        }
        // Wire process change handler — sets defaults + info band for initial process
        wireRubberProcessChange();
      }, 0);
      break;

    case 'composites':
      area.innerHTML = renderCompositesForm();
      populateSelects();
      setTimeout(() => {
        const cureEl = el<HTMLSelectElement>('comp-cure-mach');
        if (cureEl) { const opt = Array.from(cureEl.options).find(o => o.value.includes('autoclave') || o.value.includes('oven-composite')); if (opt) cureEl.value = opt.value; }
        const layupLabEl = el<HTMLSelectElement>('comp-layup-lab');
        if (layupLabEl) { const opt = Array.from(layupLabEl.options).find(o => o.value.includes('skilled')); if (opt) layupLabEl.value = opt.value; }
      }, 0);
      break;

    case 'wiring_harness':
      area.innerHTML = renderWiringHarnessForm();
      populateSelects();
      setTimeout(() => {
        const testMachEl = el<HTMLSelectElement>('harn-test-mach');
        if (testMachEl) { const opt = Array.from(testMachEl.options).find(o => o.value.includes('harness-test')); if (opt) testMachEl.value = opt.value; }
        const labEl = el<HTMLSelectElement>('harn-asm-lab');
        if (labEl) { const opt = Array.from(labEl.options).find(o => o.value.includes('semiskilled')); if (opt) labEl.value = opt.value; }
      }, 0);
      break;

    case 'ai_agent' as CommodityType:
      area.innerHTML = renderAgentForm();
      _wireAgentInputEvents();
      el('universal-costs').style.display = 'none';
      el('calc-btn').style.display = 'none';
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
      type: validSel<MachiningOperation['type']>(`${id}-type`, ['turning','milling_3ax','milling_5ax','drilling','grinding','tapping','boring'], 'turning'),
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
    rejectRate: num('mach-reject') || undefined,
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
    dieType: validSel<'progressive' | 'transfer' | 'single_stage'>('sm-die-type', ['progressive', 'transfer', 'single_stage'], 'progressive'),
    dieLife: num('sm-die-life'),
    dieCostEstimate: num('sm-die-cost'),
    amortizationVolume: num('sm-amort') || 1,
    rejectRate: num('sm-reject') || undefined,
    secondaryOpsMachineId: sel('sm-sec-mach') || undefined,
    secondaryOpsLabourId: sel('sm-sec-lab') || undefined,
    secondaryOpsCycleHr: num('sm-sec-ct') || undefined,
    secondaryOpsOee: num('sm-sec-oee') || undefined,
    secondaryOpsManning: num('sm-sec-manning') || undefined,
    secondaryOpsLabourEfficiency: num('sm-sec-lab-eff') || undefined,
  });
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}

function collectIMMInput(): UniversalStackInput {
  const drivers = computeInjectionMouldingDrivers({
    materialId: sel('imm-mat'),
    partWeightKg: num('imm-part-wt'),
    runnerSystem: validSel<'cold'|'hot'>('imm-runner-sys', ['cold','hot'], 'cold'),
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
    toleranceMm: num('imm-tolerance') || undefined,
    surfaceFinishGrade: validSel<'standard'|'textured'|'high_gloss'|'painted'>('imm-finish', ['standard','textured','high_gloss','painted'], 'standard'),
  });
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}

function collectCastingInput(): UniversalStackInput {
  const subtype = validSel<CastingSubtype>('cast-subtype', ['hpdc', 'sand', 'gravity', 'investment'], 'hpdc');
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
  else if (subtype === 'investment') extra = { investment: { pourMachineId: sel('cast-inv-mach'), pourLabourId: sel('cast-inv-lab') || sel('cast-lab'), pourCycleHr: num('cast-inv-ct'), waxCostPerPart: num('cast-inv-wax'), shellBuildCostPerPart: num('cast-inv-shell'), waxRecoveryFraction: num('cast-inv-wax-rec') } };

  // C17: Warn when casting yield and reject rate appear to double-count losses
  const castYield = num('cast-yield');
  const castReject = num('cast-reject');
  if (castYield < 0.55 && castReject > 0.08) {
    showToast(
      `Casting: yield ${(castYield * 100).toFixed(0)}% AND reject rate ${(castReject * 100).toFixed(0)}% are both high. ` +
      'Yield (runner/gate loss) and reject rate (quality scrap) are additive — verify both are not capturing the same losses.',
      'warning'
    );
  }

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
    timePerBlowSec: num('forge-time-per-blow') || undefined,
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
      coatType: validSel<CoatType>(`${id}-type`, ['pretreat','e_coat','primer','basecoat','clearcoat','powder'], 'basecoat'),
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
      type: validSel<JoiningType>(`${id}-type`, ['spot_weld','spr_rivet','adhesive_m','sealer_m','mig_weld_m','clinch'], 'spot_weld'),
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
  const yieldOverride = num('pcbf-yield');
  const drivers = computePCBFabDrivers({
    layers:               parseInt(sel('pcbf-layers')) || 8,
    boardWidthMm:         num('pcbf-board-w') || 200,
    boardHeightMm:        num('pcbf-board-h') || 150,
    panelWidthMm:         num('pcbf-panel-w') || 500,
    panelHeightMm:        num('pcbf-panel-h') || 600,
    panelUtilization:     num('pcbf-panel-util') || 0.72,
    technology:           sel('pcbf-technology') as PCBTechnology,
    baseMaterialTg:       parseInt(sel('pcbf-tg')) || 170,
    copperWeightOz:       parseFloat(sel('pcbf-cu')) || 1,
    outerCopperWeightOz:  parseFloat(sel('pcbf-outer-cu')) || 1,
    viaType:              sel('pcbf-via-type') as any,
    throughViaCount:      num('pcbf-vias'),
    blindViaCount:        num('pcbf-blind-vias'),
    buriedViaCount:       num('pcbf-buried-vias'),
    microViaCount:        num('pcbf-uvias'),
    hdiStructure:         sel('pcbf-hdi-structure') as any,
    minTraceSpaceMm:      parseFloat(sel('pcbf-trace')) || 0.10,
    surfaceFinish:        sel('pcbf-finish') as any,
    solderMaskColor:      sel('pcbf-solder-mask') as any,
    silkscreenSides:      parseInt(sel('pcbf-silkscreen')) || 2,
    impedanceControlled:  (document.getElementById('pcbf-impedance') as HTMLInputElement)?.checked ?? false,
    hasFinePitchBGA:      (document.getElementById('pcbf-bga') as HTMLInputElement)?.checked ?? false,
    testMethod:           sel('pcbf-test-method') as any,
    qualityGrade:         sel('pcbf-quality') as PCBQualityGrade,
    region:               sel('pcbf-region') as any,
    nreCost:              num('pcbf-nre'),
    amortizationVolume:   num('pcbf-amort') || 1,
    fabYieldOverride:     yieldOverride > 0 ? yieldOverride : undefined,
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
  const ASSEMBLY_LEVELS: AssemblyComplexityLevel[] = ['low','medium','high','very_high'];
  const PCBA_QUALS: PCBAQualityGrade[] = ['consumer','industrial','auto_grade2','auto_grade1','aerospace'];
  const bgaCount = num('pcba-bga-count') || 0;
  const ictTimeSec = num('pcba-ict-time') || 0;
  const xrayMachId = sel('pcba-xray-mach');
  const ictMachId = sel('pcba-ict-mach');
  const drivers = computePCBADrivers({
    pcbCostPerBoard: num('pcba-pcb-cost'),
    bom,
    smtMachineId: sel('pcba-smt-mach'),
    smtLabourId: sel('pcba-smt-lab'),
    smtLines: num('pcba-smt-lines') || 1,
    smtLineRatePerHr: num('pcba-smt-rate'),
    smtOee: num('pcba-smt-oee'),
    smtSides: (parseInt(sel('pcba-smt-sides')) as 1|2) || 1,
    throughHoleCount: num('pcba-th-count'),
    manualSolderCount: num('pcba-man-count'),
    thLabourId: sel('pcba-th-lab'),
    thLabourTimeSecPerJoint: num('pcba-th-time'),
    manualLabourTimeSecPerJoint: num('pcba-man-time'),
    assemblyYield: num('pcba-yield'),
    reworkCostPerFailure: num('pcba-rework-cost'),
    amortizationVolume: num('pcba-amort') || 1,
    testCostPerBoard: num('pcba-test-cost') || undefined,
    assemblyComplexity: validSel<AssemblyComplexityLevel>('pcba-complexity', ASSEMBLY_LEVELS, 'low'),
    qualityGrade: validSel<PCBAQualityGrade>('pcba-quality', PCBA_QUALS, 'consumer'),
    bgaCount: bgaCount || undefined,
    xrayMachineId: (bgaCount > 0 && xrayMachId) ? xrayMachId : undefined,
    ictMachineId: (ictTimeSec > 0 && ictMachId) ? ictMachId : undefined,
    ictCycleTimeSec: ictTimeSec || undefined,
    conformalCoatAreaCm2: num('pcba-coat-area') || undefined,
    conformalCoatPricePerCm2: num('pcba-coat-price') || undefined,
    nreCost: num('pcba-nre-cost') || undefined,
    nreAmortizationVolume: num('pcba-nre-amort') || undefined,
  });
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}

function collectCastAndMachineInput(): UniversalStackInput {
  const subtype = validSel<CastingSubtype>('cam-cast-subtype', ['hpdc', 'sand', 'gravity', 'investment'], 'hpdc');

  const camOps: MachiningOperation[] = Array.from(
    document.querySelectorAll<HTMLElement>('#cam-mach-ops-container .op-card')
  ).map(card => {
    const id = card.dataset.opId!;
    return {
      name: (el<HTMLInputElement>(`${id}-name`))?.value ?? '',
      type: validSel<MachiningOperation['type']>(`${id}-type`, ['turning','milling_3ax','milling_5ax','drilling','grinding','tapping','boring'], 'milling_3ax'),
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
    subtypeExtra = { investment: { pourMachineId: sel('cam-inv-mach'), pourLabourId: sel('cam-inv-lab') || sel('cam-cast-lab'), pourCycleHr: num('cam-inv-ct'), waxCostPerPart: num('cam-inv-wax'), shellBuildCostPerPart: num('cam-inv-shell'), waxDieCost: num('cam-inv-wax-die') } };
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
    // Post-casting secondary operations
    heatTreatmentCostPerKg: num('cam-ht-cost') || undefined,
    shotBlastCostPerPart: num('cam-shot-blast') || undefined,
    impregnationCostPerPart: num('cam-impreg') || undefined,
    deburringCostPerPart: num('cam-fettle') || undefined,
    ...subtypeExtra,
  };

  const drivers = computeCastAndMachineDrivers(inputs);
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}

function collectSheetMetalFabInput(): UniversalStackInput {
  const swCount = num('smf-sw-count');
  const swMach = sel('smf-sw-mach') || undefined;
  const swLab = sel('smf-sw-lab') || undefined;
  const migLen = num('smf-mig-len');
  const migMach = sel('smf-mig-mach') || undefined;
  const migLab = sel('smf-mig-lab') || undefined;
  const tigLen = num('smf-tig-len');
  const tigMach = sel('smf-tig-mach') || undefined;
  const tigLab = sel('smf-tig-lab') || undefined;
  const gasVal = sel('smf-gas') || undefined;

  const drivers = computeSheetMetalFabDrivers({
    materialId: sel('smf-mat'),
    partWeightKg: num('smf-part-wt'),
    materialUtilization: num('smf-mat-util') || 0.78,
    blankingMethod: validSel<FabBlankingMethod>('smf-blank-method', ['laser','plasma','waterjet','punch','shear'], 'laser'),
    blankingMachineId: sel('smf-blank-mach'),
    blankingLabourId: sel('smf-blank-lab'),
    blankingCycleTimeSec: num('smf-blank-ct'),
    assistGas: (gasVal && ['nitrogen','oxygen','air'].includes(gasVal)) ? gasVal as AssistGas : undefined,
    bendCount: num('smf-bends'),
    timePerBendSec: num('smf-bend-t') || 45,
    toolChangeCount: num('smf-tool-chg'),
    toolChangeTimeSec: num('smf-tool-chg-t') || 300,
    bendMachineId: sel('smf-brake-mach'),
    bendLabourId: sel('smf-brake-lab'),
    oee: num('smf-oee'),
    manning: num('smf-manning'),
    labourEfficiency: num('smf-lab-eff'),
    rejectRate: num('smf-reject') || undefined,
    toleranceMm: num('smf-tolerance') || undefined,
    spotWeldCount: swCount > 0 ? swCount : undefined,
    spotWeldMachineId: swCount > 0 ? swMach : undefined,
    spotWeldLabourId: swCount > 0 ? swLab : undefined,
    timePerSpotWeldSec: num('smf-sw-t') || 3,
    migWeldLengthM: migLen > 0 ? migLen : undefined,
    migWeldSpeedMPerMin: num('smf-mig-spd') || 0.3,
    migWeldMachineId: migLen > 0 ? migMach : undefined,
    migWeldLabourId: migLen > 0 ? migLab : undefined,
    migWeldConsumableCostPerM: num('smf-mig-cons') || 0.40,
    tigWeldLengthM: tigLen > 0 ? tigLen : undefined,
    tigWeldSpeedMPerMin: num('smf-tig-spd') || 0.08,
    tigWeldMachineId: tigLen > 0 ? tigMach : undefined,
    tigWeldLabourId: tigLen > 0 ? tigLab : undefined,
    tigWeldConsumableCostPerM: num('smf-tig-cons') || 0.60,
    toolingCost: num('smf-tooling'),
    amortizationVolume: num('smf-amort') || 1,
  });
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}

function collectBlowMouldingInput(): UniversalStackInput {
  const deflashCt = num('bm-deflash-ct');
  const deflashMach = sel('bm-deflash-mach') || undefined;
  const deflashLab = sel('bm-deflash-lab') || undefined;
  const parisonT = num('bm-parison-t');
  const rejectR = num('bm-reject');
  const drivers = computeBlowMouldingDrivers({
    materialId: sel('bm-mat'),
    partWeightKg: num('bm-part-wt'),
    flashWeightKg: num('bm-flash-wt'),
    wallThicknessMm: num('bm-wall'),
    coolTimeFactorSPerMm2: num('bm-cool-f'),
    blowTimeSec: num('bm-blow-t'),
    openCloseSec: num('bm-open-close'),
    machineId: sel('bm-mach'),
    labourId: sel('bm-lab'),
    cavities: num('bm-cav') || 1,
    oee: num('bm-oee'),
    manning: num('bm-manning'),
    labourEfficiency: num('bm-lab-eff'),
    mouldCost: num('bm-mould-cost'),
    mouldLife: num('bm-mould-life'),
    amortizationVolume: num('bm-amort') || 1,
    deflashMachineId: deflashCt > 0 ? deflashMach : undefined,
    deflashLabourId: deflashCt > 0 ? deflashLab : undefined,
    deflashCycleTimeSec: deflashCt > 0 ? deflashCt : undefined,
    parisonExtrusionTimeSec: parisonT > 0 ? parisonT : undefined,
    rejectRate: rejectR > 0 ? rejectR : undefined,
  });
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}

function collectExtrusionInput(): UniversalStackInput {
  const drivers = computeExtrusionDrivers({
    materialId: sel('ext-mat'),
    profileWeightKgPerM: num('ext-kg-per-m'),
    partLengthM: num('ext-length'),
    lineRateKgPerHr: num('ext-rate'),
    extruderId: sel('ext-mach'),
    labourId: sel('ext-lab'),
    oee: num('ext-oee'),
    manning: num('ext-manning'),
    labourEfficiency: num('ext-lab-eff'),
    startupScrapFraction: num('ext-scrap'),
    dieCost: num('ext-die-cost'),
    amortizationVolume: num('ext-amort') || 1,
  });
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}

function collectThermoformingInput(): UniversalStackInput {
  const drivers = computeThermoformingDrivers({
    materialId: sel('tf-mat'),
    sheetWeightKg: num('tf-sheet-wt'),
    partsPerSheet: num('tf-pps') || 1,
    partWeightKg: num('tf-part-wt'),
    method: validSel<'vacuum'|'pressure'|'twin_sheet'>('tf-method', ['vacuum','pressure','twin_sheet'], 'vacuum'),
    machineId: sel('tf-mach'),
    labourId: sel('tf-lab'),
    heatTimeSec: num('tf-heat'),
    formTimeSec: num('tf-form'),
    trimTimeSec: num('tf-trim'),
    indexTimeSec: num('tf-index'),
    oee: num('tf-oee'),
    manning: num('tf-manning'),
    labourEfficiency: num('tf-lab-eff'),
    toolCost: num('tf-tool-cost'),
    amortizationVolume: num('tf-amort') || 1,
  });
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}

function collectRotationalMouldingInput(): UniversalStackInput {
  const drivers = computeRotationalMouldingDrivers({
    materialId: sel('rm-mat'),
    partWeightKg: num('rm-part-wt'),
    powderCostAdderPerKg: num('rm-powder-adder'),
    numArms: num('rm-num-arms') || 3,
    partsPerArm: num('rm-parts-per-arm') || 1,
    heatingTimeSec: num('rm-heat'),
    coolingTimeSec: num('rm-cool'),
    loadUnloadTimeSec: num('rm-load'),
    machineId: sel('rm-mach'),
    labourId: sel('rm-lab'),
    oee: num('rm-oee'),
    manning: num('rm-manning'),
    labourEfficiency: num('rm-lab-eff'),
    mouldCost: num('rm-mould-cost'),
    mouldLife: num('rm-mould-life'),
    amortizationVolume: num('rm-amort') || 1,
  });
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}

function collectRubberInput(): UniversalStackInput {
  const drivers = computeRubberDrivers({
    materialId: sel('rub-mat'),
    partWeightKg: num('rub-part-wt') || 0.05,
    flashAndRunnerWeightKg: num('rub-flash-wt'),
    process: (sel('rub-process') || 'compression_mould') as RubberProcess,
    machineId: sel('rub-mach'),
    labourId: sel('rub-lab'),
    cycleTimeSec: num('rub-cycle-sec') || 120,
    cavities: num('rub-cavities') || 4,
    oee: num('rub-oee') || 0.80,
    manning: num('rub-manning') || 1,
    labourEfficiency: num('rub-lab-eff') || 0.90,
    rejectRate: num('rub-reject') || 0,
    cureTimeSec: num('rub-cure-sec') || undefined,
    cureOvenMachineId: sel('rub-cure-mach') || undefined,
    mouldCost: num('rub-mould-cost') || 5000,
    mouldLife: num('rub-mould-life') || 200000,
    amortizationVolume: num('rub-amort') || 50000,
    bondingPrimerCostPerPart: num('rub-primer') || undefined,
  });
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}

function collectCompositesInput(): UniversalStackInput {
  const drivers = computeCompositeDrivers({
    fibrePricePerKg: num('comp-fibre-price') || 32.00,
    resinPricePerKg: num('comp-resin-price') || 0,
    fibreWeightFraction: num('comp-fibre-frac') || 0.60,
    partWeightKg: num('comp-part-wt') || 1.80,
    wasteFraction: num('comp-waste-frac') || 0.20,
    process: (sel('comp-process') || 'prepreg_layup') as CompositeProcess,
    areaM2: num('comp-area') || 0.65,
    plies: num('comp-plies') || 8,
    layupLabourId: sel('comp-layup-lab'),
    layupTimeHrPerPart: num('comp-layup-time') || 3.50,
    oee: num('comp-oee') || 0.78,
    manning: num('comp-manning') || 2,
    labourEfficiency: num('comp-lab-eff') || 0.90,
    cureMachineId: sel('comp-cure-mach'),
    cureLabourId: sel('comp-cure-lab'),
    cureTimeHr: num('comp-cure-time') || 4.00,
    partsPerCureCycle: num('comp-cure-batch') || 4,
    trimMachineId: sel('comp-trim-mach') || undefined,
    trimLabourId: sel('comp-trim-lab'),
    trimTimeHr: num('comp-trim-time') || 0.50,
    ndiCostPerPart: num('comp-ndi') || undefined,
    rejectRate: num('comp-reject') || 0.04,
    toolingCost: num('comp-tool-cost') || 18000,
    toolingLife: num('comp-tool-life') || 400,
    amortizationVolume: num('comp-amort') || 2000,
  });
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}

function collectWiringHarnessInput(): UniversalStackInput {
  const wireRows = Array.from(document.querySelectorAll('.wire-row'));
  const wires = wireRows
    .map(row => ({
      crossSectionMm2: parseFloat((row.querySelector('.wire-gauge') as HTMLInputElement)?.value || '0.5'),
      lengthM: parseFloat((row.querySelector('.wire-length') as HTMLInputElement)?.value || '0'),
      pricePerM: parseFloat((row.querySelector('.wire-price') as HTMLInputElement)?.value || '0'),
    }))
    .filter(w => w.lengthM > 0);

  const connRows = Array.from(document.querySelectorAll('.conn-row'));
  const connectors = connRows
    .map(row => ({
      count: parseInt((row.querySelector('.conn-count') as HTMLInputElement)?.value || '0', 10),
      costEach: parseFloat((row.querySelector('.conn-cost') as HTMLInputElement)?.value || '0'),
      circuitsPerConnector: parseInt((row.querySelector('.conn-circuits') as HTMLInputElement)?.value || '1', 10),
      terminationTimeSec: parseFloat((row.querySelector('.conn-term-time') as HTMLInputElement)?.value || '10'),
    }))
    .filter(c => c.count > 0);

  const drivers = computeWiringHarnessDrivers({
    wires,
    connectors,
    spliceCount: num('harn-splices') || 0,
    spliceCostEach: num('harn-splice-cost') || 0.08,
    conduitLengthM: num('harn-conduit-len') || 0,
    conduitCostPerM: num('harn-conduit-price') || 0.35,
    tapeMetres: num('harn-tape-m') || 0,
    tapeCostPerM: num('harn-tape-price') || 0.12,
    labourId: sel('harn-asm-lab'),
    assemblyTimeHr: num('harn-asm-time') || 0.45,
    oee: num('harn-oee') || 0.85,
    manning: num('harn-manning') || 1,
    labourEfficiency: num('harn-lab-eff') || 0.90,
    testMachineId: sel('harn-test-mach') || undefined,
    testLabourId: sel('harn-test-lab'),
    testTimeHr: num('harn-test-time') || 0.05,
    rejectRate: num('harn-reject') || 0.02,
    boardingBoardCost: num('harn-board-cost') || 800,
    boardingBoardLife: num('harn-board-life') || 20000,
    amortizationVolume: num('harn-amort') || 10000,
  });
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}

function collectInput(): UniversalStackInput {
  switch (activeCommodity) {
    case 'machining':            return collectMachiningInput();
    case 'sheet_metal':          return collectSheetMetalInput();
    case 'sheet_metal_fab':      return collectSheetMetalFabInput();
    case 'injection_moulding':   return collectIMMInput();
    case 'blow_moulding':        return collectBlowMouldingInput();
    case 'extrusion':            return collectExtrusionInput();
    case 'thermoforming':        return collectThermoformingInput();
    case 'rotational_moulding':  return collectRotationalMouldingInput();
    case 'casting':              return collectCastingInput();
    case 'forging':              return collectForgingInput();
    case 'painting':             return collectPaintingInput();
    case 'biw_assembly':         return collectBIWInput();
    case 'pcb_fab':              return collectPCBFabInput();
    case 'pcba':                 return collectPCBAInput();
    case 'cast_and_machine':     return collectCastAndMachineInput();
    case 'rubber':               return collectRubberInput();
    case 'composites':           return collectCompositesInput();
    case 'wiring_harness':       return collectWiringHarnessInput();
    case 'cad_analysis':
      throw new Error('Apply CAD analysis results to a commodity form first using the "Apply to cost engine" button, then calculate.');
    case 'ai_agent' as CommodityType:
      throw new Error('Use the AI Agent chat to build and compute your cost estimate.');
    case 'assembly':
      throw new Error('Use the Calculate Assembly button for Assembly BOM mode.');
    default:
      throw new Error(`Unknown commodity: ${activeCommodity}`);
  }
}

// ─── Compute ──────────────────────────────────────────────────────────────────

function compute(): void {
  const errBox = el('validation-errors');
  const warnBox = el('validation-warnings');
  const calcBtn = el<HTMLButtonElement>('calc-btn');
  const originalLabel = calcBtn.textContent ?? 'Calculate';
  calcBtn.disabled = true;
  calcBtn.textContent = '⏳ Calculating…';

  let input: UniversalStackInput;
  try {
    input = collectInput();
  } catch (err) {
    calcBtn.disabled = false;
    calcBtn.textContent = originalLabel;
    errBox.style.display = 'block';
    errBox.innerHTML = `<strong>Input error:</strong> ${escHtml(err instanceof Error ? err.message : String(err))}`;
    return;
  }

  const validation = validateStackInput(input, library);

  if (!validation.valid) {
    calcBtn.disabled = false;
    calcBtn.textContent = originalLabel;
    errBox.style.display = 'block';
    errBox.innerHTML = `<strong>Errors:</strong><ul>${validation.errors.map(e => `<li>${escHtml(e.field)}: ${escHtml(e.message)}</li>`).join('')}</ul>`;
    warnBox.style.display = 'none';
    return;
  }
  errBox.style.display = 'none';

  if (validation.warnings.length > 0) {
    warnBox.style.display = 'block';
    warnBox.innerHTML = `<strong>Warnings:</strong><ul>${validation.warnings.map(w => `<li>${escHtml(w.field)}: ${escHtml(w.message)}</li>`).join('')}</ul>`;
  } else {
    warnBox.style.display = 'none';
  }

  try {
    lastLCResult = null;

    // Inject learning curve config into the formal input (wires through computeUniversalStack)
    const lcEnabled = (document.getElementById('lc-enabled') as HTMLInputElement)?.checked;
    if (lcEnabled) {
      const annualVolume = parseFloat((document.getElementById('annual-volume') as HTMLInputElement)?.value) || 10000;
      const referenceVolume = parseFloat((document.getElementById('reference-volume') as HTMLInputElement)?.value) || 1000;
      const curvePct = parseFloat((document.getElementById('learning-curve-pct') as HTMLInputElement)?.value) || 85;
      input = { ...input, annualVolume, learningCurve: { enabled: true, curvePct, referenceVolume } };
    }

    const result = computeUniversalStack(input, library);

    // Populate lastLCResult from formal result for display compatibility
    if (result.learningCurveApplied) {
      lastLCResult = {
        baseLabourCost: result.breakdown.labour - result.learningCurveApplied.labourSaving,
        adjustedLabourCost: result.breakdown.labour,
        adjustmentFactor: result.learningCurveApplied.adjustmentFactor,
        volumeEffect: result.learningCurveApplied.labourSaving,
        params: {
          annualVolume: result.learningCurveApplied.annualVolume,
          referenceVolume: result.learningCurveApplied.referenceVolume,
          curvePct: result.learningCurveApplied.curvePct,
        },
      };
    }

    lastResult = result;
    lastInput = input;
    pushCostingRecord({ totalCost: result.total, confidence: result.warnings?.length ? 'Medium' : 'High', breakdown: result.breakdown, warnings: result.warnings });
    showResultsArea();
    renderBreakdown(result);
    updateTabBadges(result, input);
    fetchAICommentary(result);

    // Show action buttons
    el('export-excel-btn').style.display = '';
    el('export-pdf-btn').style.display = '';
    el('export-card-btn').style.display = '';
    el('save-scenario-btn').style.display = '';
  } catch (err) {
    errBox.style.display = 'block';
    errBox.innerHTML = `<strong>Calculation error:</strong> ${escHtml(err instanceof Error ? err.message : String(err))}`;
  } finally {
    calcBtn.disabled = false;
    calcBtn.textContent = originalLabel;
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
  el('results-detail').style.display = tab === 'detail' ? '' : 'none';
  el('results-insights').style.display = tab === 'insights' ? '' : 'none';
  el('results-sensitivity').style.display = tab === 'sensitivity' ? '' : 'none';
  el('results-scenarios').style.display = tab === 'scenarios' ? '' : 'none';
  el('results-dfm').style.display = tab === 'dfm' ? '' : 'none';

  if (tab === 'detail' && lastResult && lastInput) renderDetail(lastResult, lastInput);
  if (tab === 'insights' && lastResult && lastInput) renderInsights(lastResult, lastInput);
  if (tab === 'sensitivity' && lastInput) renderSensitivity();
  if (tab === 'scenarios') renderScenarios();
  if (tab === 'dfm' && lastResult && lastInput) renderDFMDFA(lastResult, lastInput);
}

// ─── Tab Badges ────────────────────────────────────────────────────────────────

function updateTabBadges(result: PartCostResult, input: UniversalStackInput): void {
  const insightsBadge = document.getElementById('badge-insights');
  const dfmBadge = document.getElementById('badge-dfm');

  if (insightsBadge) {
    try {
      const insights = generateInsights(result, input, library, activeCommodity);
      const highVal = insights.filter(i => (i as any).savingPct >= 10);
      const count = highVal.length || insights.length;
      if (count > 0) {
        insightsBadge.textContent = String(count);
        insightsBadge.className = `rtab-badge rtab-badge--${highVal.length > 0 ? 'green' : 'amber'}`;
        insightsBadge.style.display = '';
      } else {
        insightsBadge.style.display = 'none';
      }
    } catch { insightsBadge.style.display = 'none'; }
  }

  if (dfmBadge) {
    try {
      const dfm = generateDFMDFA(result, input, activeCommodity);
      const critCount = [...dfm.dfm.issues, ...dfm.dfa.issues]
        .filter(i => i.severity === 'critical' || i.severity === 'major').length;
      if (critCount > 0) {
        dfmBadge.textContent = String(critCount);
        dfmBadge.className = 'rtab-badge rtab-badge--red';
        dfmBadge.style.display = '';
      } else {
        dfmBadge.style.display = 'none';
      }
    } catch { dfmBadge.style.display = 'none'; }
  }
}

// ─── AI Commentary ─────────────────────────────────────────────────────────────

function fetchAICommentary(result: PartCostResult): void {
  const div = document.getElementById('ai-commentary-box');
  if (!div) return;
  const pcts = breakdownPercentages(result);
  div.innerHTML = `<div class="ai-commentary-label">✦ AI Cost Commentary</div>
    <span class="ai-commentary-loading">Analysing cost structure…</span>`;
  div.style.display = '';

  const commLabel = COMMODITY_LABELS[activeCommodity] ?? activeCommodity.replace(/_/g,' ');
  const regionName = REGIONAL_DATA[_mfgRegion]?.name ?? _mfgRegion;
  const prompt = `Should-cost result for "${result.partName}" (${commLabel}), manufactured in ${regionName}:
Total: ${fmt(result.total)} (${_displayCurrency}), Material ${pcts.rawMaterial.toFixed(0)}%, Process ${pcts.process.toFixed(0)}%, Labour ${pcts.labour.toFixed(0)}%, Tooling ${pcts.tooling.toFixed(0)}%, Overhead ${pcts.overhead.toFixed(0)}%.
In exactly 2-3 sentences: identify the dominant cost driver, whether it is above or below benchmark for this commodity type at this volume in ${regionName}, and the single highest-leverage action to reduce unit cost.`;

  fetch('/api/aichat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: prompt }),
  })
    .then(r => r.json())
    .then(data => {
      if (data.reply && !data.error) {
        div.innerHTML = `<div class="ai-commentary-label">✦ AI Cost Commentary</div><div>${escHtml(data.reply)}</div>`;
      } else {
        div.style.display = 'none';
      }
    })
    .catch(() => { div.style.display = 'none'; });
}

// ─── AI Autofill ──────────────────────────────────────────────────────────────

function handleAIAutofill(): void {
  const inputEl = document.getElementById('ai-autofill-input') as HTMLInputElement | null;
  const btn = document.getElementById('ai-autofill-btn') as HTMLButtonElement | null;
  if (!inputEl || !inputEl.value.trim()) { showToast('Enter a part description first.', 'warning'); return; }
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Filling…'; }

  const prompt = `Extract manufacturing cost parameters from this part description. Respond with ONLY valid JSON, no explanation:
"${inputEl.value.trim()}"

{
  "partName": "string or null",
  "weightKg": number or null,
  "annualVolume": number or null,
  "batchSize": number or null,
  "overheadPct": number or null,
  "marginPct": number or null
}`;

  fetch('/api/aichat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: prompt }),
  })
    .then(r => r.json())
    .then(data => {
      try {
        const text: string = data.reply ?? '';
        const m = text.match(/\{[\s\S]*\}/);
        if (!m) throw new Error('no json');
        const p = JSON.parse(m[0]);
        let filled = 0;
        const setF = (id: string, v: unknown) => {
          if (v == null) return;
          const e = document.getElementById(id) as HTMLInputElement | null;
          if (e) { e.value = String(v); filled++; }
        };
        if (p.partName)     setF('part-name', p.partName);
        if (p.annualVolume) setF('annual-volume', p.annualVolume);
        if (p.batchSize)    setF('batch-size', p.batchSize);
        if (p.overheadPct)  setF('overhead-pct', p.overheadPct);
        if (p.marginPct)    setF('margin-pct', p.marginPct);
        // Fill commodity-specific weight
        if (p.weightKg) {
          const wtMap: Record<string, string> = {
            machining:'mach-net-wt', injection_moulding:'imm-part-wt', casting:'cast-part-wt',
            cast_and_machine:'cam-cast-wt', forging:'forge-part-wt', sheet_metal_fab:'smf-part-wt',
            sheet_metal:'sm-net-wt', blow_moulding:'bm-part-wt', thermoforming:'tf-part-wt',
            rotational_moulding:'rm-part-wt', rubber:'rub-part-wt', composites:'comp-part-wt',
          };
          const wtId = wtMap[activeCommodity];
          if (wtId) setF(wtId, p.weightKg);
        }
        showToast(`AI filled ${filled} field${filled !== 1 ? 's' : ''} — review and calculate.`, 'info');
      } catch { showToast('Could not parse AI response. Try a more specific description.', 'error'); }
    })
    .catch(() => showToast('AI autofill unavailable — check server API key.', 'error'))
    .finally(() => { if (btn) { btn.disabled = false; btn.textContent = '✦ AI Fill'; } });
}

// ─── Waterfall Chart ──────────────────────────────────────────────────────────

function renderWaterfallChart(result: PartCostResult): void {
  const canvas = document.getElementById('breakdown-waterfall') as HTMLCanvasElement | null;
  if (!canvas) return;
  if (_waterfallChart) { _waterfallChart.destroy(); _waterfallChart = null; }

  const bkd = result.breakdown;
  const items = [
    { label: 'Material',  val: bkd.rawMaterial },
    { label: 'Process',   val: bkd.process },
    { label: 'Labour',    val: bkd.labour },
    { label: 'Tooling',   val: bkd.tooling },
    { label: 'Pkg+Log',   val: bkd.packaging + bkd.logistics },
    { label: 'Overhead',  val: bkd.overhead },
    { label: 'Margin',    val: bkd.margin },
  ];
  const floatData: [number, number][] = [];
  let run = 0;
  items.forEach(it => { floatData.push([run, run + it.val]); run += it.val; });
  floatData.push([0, result.total]);

  const colours = ['#3b82f6','#6366f1','#8b5cf6','#0ea5e9','#14b8a6','#64748b','#94a3b8','#e65100'];
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const textCol = isDark ? '#94a3b8' : '#475569';
  const gridCol = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

  _waterfallChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: [...items.map(i => i.label), 'TOTAL'],
      datasets: [{ data: floatData as any, backgroundColor: colours, borderRadius: 4, borderWidth: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? '#1e293b' : '#fff',
          titleColor: isDark ? '#f0f0f0' : '#0a0a0a',
          bodyColor: textCol,
          borderColor: isDark ? '#334155' : '#e2e8f0',
          borderWidth: 1,
          callbacks: {
            label: (ctx) => {
              const d = ctx.raw as [number, number];
              return ` ${fmt(Math.abs(d[1] - d[0]))}`;
            },
          },
        },
      },
      scales: {
        y: { ticks: { callback: (v) => fmt(Number(v)), color: textCol }, grid: { color: gridCol } },
        x: { ticks: { color: textCol }, grid: { display: false } },
      },
    },
  });
}

// ─── Export Cost Card ──────────────────────────────────────────────────────────

function exportCostCard(): void {
  if (!lastResult) return;
  const r = lastResult;
  const pcts = breakdownPercentages(r);
  const commodity = activeCommodity.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const targetPrice = parseFloat((document.getElementById('target-price') as HTMLInputElement)?.value) || 0;
  const gap = targetPrice > 0 ? r.total - targetPrice : null;
  const gapPct = gap !== null && targetPrice > 0 ? (gap / targetPrice) * 100 : null;
  const ragColor = gap === null ? '#3b82f6' : Math.abs(gapPct!) <= 5 ? '#10b981' : gap > 0 ? '#e63b3b' : '#f59e0b';
  const ragLabel = gap === null ? '' : Math.abs(gapPct!) <= 5 ? '✓ ON TARGET' : gap > 0 ? `▲ OVER TARGET ${gapPct!.toFixed(0)}%` : `▼ UNDER TARGET ${Math.abs(gapPct!).toFixed(0)}%`;

  const bkts = [
    { l:'Raw Material', v:r.breakdown.rawMaterial, p:pcts.rawMaterial },
    { l:'Process',      v:r.breakdown.process,     p:pcts.process },
    { l:'Labour',       v:r.breakdown.labour,       p:pcts.labour },
    { l:'Tooling',      v:r.breakdown.tooling,      p:pcts.tooling },
    { l:'Packaging',    v:r.breakdown.packaging,    p:pcts.packaging },
    { l:'Logistics',    v:r.breakdown.logistics,    p:pcts.logistics },
    { l:'Overhead',     v:r.breakdown.overhead,     p:pcts.overhead },
    { l:'Margin',       v:r.breakdown.margin,       p:pcts.margin },
  ];
  const bktRows = bkts.map(b =>
    `<tr><td>${b.l}</td><td style="text-align:right">${fmt(b.v)}</td><td style="text-align:right;color:#888">${b.p.toFixed(1)}%</td>
     <td style="padding-left:8px"><div style="background:#3b82f6;height:8px;border-radius:4px;width:${Math.max(4,b.p*2.5)}px"></div></td></tr>`
  ).join('');

  const date = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Cost Card — ${escHtml(r.partName)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#0a0a0a;padding:32px}
@media print{body{padding:0;background:#fff}@page{size:A4;margin:20mm}}
.card{background:#fff;border-radius:12px;padding:32px;max-width:720px;margin:0 auto;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:20px;border-bottom:2px solid #f1f5f9}
.logo{font-size:1.4rem;font-weight:900;color:#2563eb;letter-spacing:-0.03em}
.date{font-size:0.75rem;color:#94a3b8}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}
.kpi{background:#f8fafc;border-radius:8px;padding:14px 16px;border:1px solid #e2e8f0}
.kpi-label{font-size:0.68rem;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:600;margin-bottom:4px}
.kpi-val{font-size:1.5rem;font-weight:800;color:#0a0a0a;letter-spacing:-0.02em}
.kpi-sub{font-size:0.72rem;color:#94a3b8;margin-top:2px}
.rag{display:inline-block;padding:5px 12px;border-radius:6px;font-weight:700;font-size:0.82rem;margin-bottom:20px;background:${ragColor}18;color:${ragColor};border:1px solid ${ragColor}}
h2{font-size:0.72rem;text-transform:uppercase;letter-spacing:0.07em;color:#64748b;font-weight:700;margin-bottom:10px}
table{width:100%;border-collapse:collapse;font-size:0.82rem;margin-bottom:20px}
td,th{padding:7px 8px;text-align:left}
th{font-size:0.65rem;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;border-bottom:1px solid #e2e8f0;padding-bottom:6px}
tr:not(:last-child) td{border-bottom:1px solid #f1f5f9}
.total-row td{font-weight:700;border-top:2px solid #e2e8f0;padding-top:10px}
.footer{margin-top:24px;padding-top:16px;border-top:1px solid #f1f5f9;font-size:0.68rem;color:#94a3b8;display:flex;justify-content:space-between}
</style></head><body>
<div class="card">
  <div class="header">
    <div><div class="logo">CostVision</div><div style="font-size:0.8rem;color:#64748b;margin-top:3px">Should-Cost Analysis</div></div>
    <div style="text-align:right"><div style="font-weight:700;font-size:1.05rem">${escHtml(r.partName)}</div><div style="font-size:0.8rem;color:#64748b">${escHtml(commodity)}</div><div class="date">${date}</div></div>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="kpi-label">Total Should-Cost</div><div class="kpi-val">${fmt(r.total)}</div><div class="kpi-sub">per part</div></div>
    <div class="kpi"><div class="kpi-label">Factory Cost</div><div class="kpi-val">${fmt(r.factoryCost)}</div><div class="kpi-sub">${pcts.rawMaterial + pcts.process + pcts.labour + pcts.tooling > 0 ? (pcts.rawMaterial + pcts.process + pcts.labour + pcts.tooling).toFixed(0) : '—'}% of total</div></div>
    <div class="kpi"><div class="kpi-label">Conversion Cost</div><div class="kpi-val">${fmt(r.breakdown.process + r.breakdown.labour)}</div><div class="kpi-sub">${(pcts.process + pcts.labour).toFixed(0)}% of total</div></div>
  </div>
  ${gap !== null ? `<div class="rag">${ragLabel} — Target: ${fmt(targetPrice)} | Gap: ${fmt(Math.abs(gap))}</div>` : ''}
  <h2>Cost Breakdown</h2>
  <table>
    <thead><tr><th>Bucket</th><th style="text-align:right">Amount</th><th style="text-align:right">%</th><th>Bar</th></tr></thead>
    <tbody>
      ${bktRows}
      <tr class="total-row"><td>TOTAL SHOULD-COST</td><td style="text-align:right">${fmt(r.total)}</td><td style="text-align:right">100%</td><td></td></tr>
    </tbody>
  </table>
  <div class="footer">
    <span>Generated by CostVision • ${date}</span>
    <span>Indicative only — based on published 2025 Q2 rate benchmarks</span>
  </div>
</div>
<script>window.print();<\/script>
</body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
  else showToast('Allow pop-ups to open the cost card.', 'warning');
}

// ─── Guided Wizard ─────────────────────────────────────────────────────────────

function getWeightInputId(commodity: string): string | null {
  const wt: Record<string, string> = {
    machining:'mach-net-wt', injection_moulding:'imm-part-wt', casting:'cast-part-wt',
    forging:'forge-part-wt', sheet_metal_fab:'smf-part-wt', sheet_metal:'sm-net-wt',
    blow_moulding:'bm-part-wt', thermoforming:'tf-part-wt', rotational_moulding:'rm-part-wt',
    rubber:'rub-part-wt', composites:'comp-part-wt',
  };
  return wt[commodity] ?? null;
}

function maybeShowWizard(commodity: string): void {
  if (_wizardSeen.has(commodity)) return;
  _wizardSeen.add(commodity);
  const history = getCostingHistory();
  if (history.some(r => r.commodity === commodity)) return;
  setTimeout(() => showWizard(commodity), 400);
}

function showWizard(commodity: string): void {
  const existing = document.getElementById('wizard-overlay');
  if (existing) existing.remove();
  let step = 1;
  const overlay = document.createElement('div');
  overlay.id = 'wizard-overlay';
  overlay.className = 'wizard-overlay';

  const draw = () => {
    const dots = [1,2,3].map(n => {
      const cls = n < step ? 'done' : n === step ? 'active' : '';
      return `<div class="wizard-step-dot ${cls}">${n < step ? '✓' : n}</div>${n < 3 ? '<div class="wizard-step-line"></div>' : ''}`;
    }).join('');

    let content = '';
    let title = '';
    let sub = '';
    if (step === 1) {
      title = 'Part Basics'; sub = 'Set the key commercial parameters';
      content = `<div class="wizard-field-grid">
        <div class="field-group" style="grid-column:1/-1">
          <label>Part Name</label>
          <input type="text" id="wiz-part-name" placeholder="e.g. Upper Bracket Assembly" autocomplete="off">
        </div>
        <div class="field-group">
          <label>Annual Volume (pcs)</label>
          <input type="number" id="wiz-volume" placeholder="10000" min="1">
        </div>
        <div class="field-group">
          <label>Target Price (£/part) <span style="font-size:0.7rem;color:var(--text-muted)">optional</span></label>
          <input type="number" id="wiz-target" placeholder="e.g. 4.50" step="0.01" min="0">
        </div>
      </div>`;
    } else if (step === 2) {
      title = 'Geometry & Weight'; sub = 'Key physical parameters for cost drivers';
      content = `<div class="wizard-field-grid">
        <div class="field-group">
          <label>Part Weight (kg)</label>
          <input type="number" id="wiz-weight" placeholder="e.g. 0.35" step="0.001" min="0">
        </div>
        <div class="field-group">
          <label>Batch / Order Size (pcs)</label>
          <input type="number" id="wiz-batch" placeholder="e.g. 500" min="1">
        </div>
      </div>
      <div style="margin-top:12px;font-size:0.75rem;color:var(--text-muted)">Leave blank to use defaults. You can fine-tune in the full form.</div>`;
    } else {
      title = 'Commercial'; sub = 'Overhead and margin assumptions';
      content = `<div class="wizard-field-grid">
        <div class="field-group">
          <label>Overhead % (SG&A)</label>
          <input type="number" id="wiz-overhead" value="12" step="0.5" min="0" max="50">
        </div>
        <div class="field-group">
          <label>Supplier Margin %</label>
          <input type="number" id="wiz-margin" value="8" step="0.5" min="0" max="40">
        </div>
      </div>
      <div style="margin-top:12px;font-size:0.75rem;color:var(--text-muted)">Industry default: 12% overhead, 8–12% supplier margin. Adjust per programme.</div>`;
    }

    overlay.innerHTML = `<div class="wizard-box">
      <div class="wizard-step-header">
        <div class="wizard-step-indicator">${dots}</div>
        <div style="flex:1;margin-left:14px">
          <div class="wizard-title">${title}</div>
          <div class="wizard-subtitle">${sub}</div>
        </div>
      </div>
      ${content}
      <div class="wizard-actions">
        <button class="wizard-skip" id="wiz-skip">Skip — use full form</button>
        <div style="display:flex;gap:8px">
          ${step > 1 ? '<button class="btn btn-secondary" id="wiz-back">← Back</button>' : ''}
          <button class="btn btn-primary" id="wiz-next">${step < 3 ? 'Next →' : '✓ Done — Calculate'}</button>
        </div>
      </div>
    </div>`;

    overlay.querySelector('#wiz-skip')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#wiz-back')?.addEventListener('click', () => { step--; draw(); });
    overlay.querySelector('#wiz-next')?.addEventListener('click', () => {
      const g = (id: string) => (overlay.querySelector(`#${id}`) as HTMLInputElement | null)?.value ?? '';
      if (step === 1) {
        const name = g('wiz-part-name');
        const vol  = g('wiz-volume');
        const tgt  = g('wiz-target');
        if (name) { const e = document.getElementById('part-name') as HTMLInputElement | null; if(e) e.value = name; }
        if (vol)  { const e = document.getElementById('annual-volume') as HTMLInputElement | null; if(e) e.value = vol; }
        if (tgt)  { const e = document.getElementById('target-price') as HTMLInputElement | null; if(e) e.value = tgt; }
        step = 2; draw();
      } else if (step === 2) {
        const wt    = g('wiz-weight');
        const batch = g('wiz-batch');
        if (wt) {
          const wtId = getWeightInputId(commodity);
          if (wtId) { const e = document.getElementById(wtId) as HTMLInputElement | null; if(e) e.value = wt; }
        }
        if (batch) {
          const batchId = commodity === 'machining' ? 'mach-batch-size' : null;
          if (batchId) { const e = document.getElementById(batchId) as HTMLInputElement | null; if(e) e.value = batch; }
        }
        step = 3; draw();
      } else {
        const oh = g('wiz-overhead');
        const mg = g('wiz-margin');
        if (oh) { const e = document.getElementById('overhead-pct') as HTMLInputElement | null; if(e) e.value = oh; }
        if (mg) { const e = document.getElementById('margin-pct') as HTMLInputElement | null; if(e) e.value = mg; }
        overlay.remove();
        showToast('Form pre-filled — review inputs and click Calculate.', 'info');
      }
    });
  };

  draw();
  document.body.appendChild(overlay);
}

// ─── Input Confidence Indicators ──────────────────────────────────────────────

interface ConfRange { min: number; low: number; high: number; max: number; }

function confClass(val: number, r: ConfRange): string {
  if (val < r.min || val > r.max) return 'conf-dot--red';
  if (val < r.low || val > r.high) return 'conf-dot--amber';
  return 'conf-dot--green';
}

function attachConfDot(inputId: string, labelId: string, range: ConfRange): void {
  const inp = document.getElementById(inputId) as HTMLInputElement | null;
  const lbl = document.getElementById(labelId) ?? inp?.parentElement?.querySelector('label');
  if (!inp || !lbl) return;
  const dot = document.createElement('span');
  dot.className = 'conf-dot';
  dot.id = `conf-${inputId}`;
  lbl.appendChild(dot);
  const update = () => {
    const v = parseFloat(inp.value);
    if (!isNaN(v) && v > 0) {
      dot.className = `conf-dot ${confClass(v, range)}`;
      dot.style.display = '';
    } else {
      dot.style.display = 'none';
    }
  };
  inp.addEventListener('input', update);
  inp.addEventListener('change', update);
  update();
}

function initConfidenceIndicators(): void {
  attachConfDot('overhead-pct',  'lbl-overhead-pct',  { min:0, low:8,   high:22,     max:50      });
  attachConfDot('margin-pct',    'lbl-margin-pct',    { min:0, low:5,   high:20,     max:40      });
  attachConfDot('annual-volume', 'lbl-annual-volume', { min:1, low:500, high:500000, max:5000000 });
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
            const ragIcon = Math.abs(ppvPct) <= 5 ? '✓' : ppv > 0 ? '▲' : '▼';
            const ragLabel = Math.abs(ppvPct) <= 5 ? 'ON TARGET' : ppv > 0 ? 'OVERPRICED' : 'BELOW COST';
            return `<tr>
              <td>${q.supplierName || 'Unnamed'}</td>
              <td>${fmt(quotedGBP)}${q.currency !== 'GBP' ? ` <span style="font-size:0.7rem;color:#888">(${q.currency} ${q.quotedPriceGBP.toFixed(2)} × ${q.fxRate})</span>` : ''}</td>
              <td>${fmt(result.total)}</td>
              <td class="${ppv > 0 ? 'delta-pos' : 'delta-neg'}">${ppv >= 0 ? '+' : ''}${fmt(ppv)}</td>
              <td class="${ppv > 0 ? 'delta-pos' : 'delta-neg'}">${ppvPct >= 0 ? '+' : ''}${ppvPct.toFixed(1)}%</td>
              <td><span class="badge ${ragCls}" aria-label="${ragLabel}">${ragIcon} ${ragLabel}</span></td>
              <td><button class="btn btn-secondary btn-sm del-quote-btn" data-qi="${i}" style="font-size:0.7rem">×</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : `
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
      <button class="btn btn-secondary btn-sm" id="add-quote-btn-inline">+ Add Supplier Quote</button>
    </div>`;

  const commodityLabel = activeCommodity.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const photoHtml = partPhotoDataUrl ? `
    <div style="display:flex;gap:16px;align-items:center;background:#fafafa;border:1px solid #eee;border-radius:8px;padding:12px 16px;margin-bottom:14px">
      <img src="${partPhotoDataUrl}" style="width:130px;height:88px;object-fit:contain;border-radius:6px;border:1px solid #e0e0e0;background:#fff;padding:4px;flex-shrink:0" alt="Part photo"/>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:0.95rem;color:#1a1a1a;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(result.partName)}</div>
        <div style="font-size:0.75rem;color:#888;margin-bottom:6px">${escHtml(commodityLabel)} · Should-Cost Analysis</div>
        <div style="font-size:1.25rem;font-weight:700;color:#e65100;letter-spacing:-0.5px">${fmt(result.total)} <span style="font-size:0.76rem;font-weight:400;color:#888">/ part</span></div>
        ${result.toolingNRE !== undefined && result.toolingNRE > 0 ? `<div style="font-size:0.73rem;color:#888;margin-top:2px">+ NRE ${fmt(result.toolingNRE)} (one-time)</div>` : ''}
      </div>
    </div>` : '';

  // Target Price RAG banner
  const _tpEl = document.getElementById('target-price') as HTMLInputElement | null;
  const _tp = parseFloat(_tpEl?.value ?? '');
  let targetBannerHtml = '';
  if (!isNaN(_tp) && _tp > 0) {
    const _gap = result.total - _tp;
    const _gapPct = (_gap / _tp) * 100;
    let _bcls = 'target-banner--green';
    let _bicon = '✓';
    let _bmsg = `ON TARGET — ${fmt(Math.abs(_gap))} under target (${Math.abs(_gapPct).toFixed(1)}% headroom)`;
    if (_gapPct > 10) {
      _bcls = 'target-banner--red'; _bicon = '✗';
      _bmsg = `OVER TARGET — ${fmt(Math.abs(_gap))} above target (+${_gapPct.toFixed(1)}%)`;
    } else if (_gapPct > 0) {
      _bcls = 'target-banner--amber'; _bicon = '⚠';
      _bmsg = `CLOSE TO TARGET — ${fmt(Math.abs(_gap))} above target (+${_gapPct.toFixed(1)}%)`;
    }
    targetBannerHtml = `<div class="target-banner ${_bcls}">${_bicon} ${escHtml(_bmsg)}</div>`;
  }

  panel.innerHTML = `
    ${targetBannerHtml}
    <div id="ai-commentary-box" class="ai-commentary" style="display:none"></div>
    ${photoHtml}
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
        <div class="panel-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>Cost Mix</span>
          <div class="chart-mode-toggle">
            <button id="chart-mode-donut" class="chart-mode-btn${_chartMode === 'donut' ? ' active' : ''}">Donut</button>
            <button id="chart-mode-waterfall" class="chart-mode-btn${_chartMode === 'waterfall' ? ' active' : ''}">Waterfall</button>
          </div>
        </div>
        <div class="chart-wrap" id="donut-wrap" style="${_chartMode === 'waterfall' ? 'display:none' : ''}"><canvas id="breakdown-doughnut" width="200" height="200"></canvas></div>
        <div id="waterfall-wrap" style="width:100%;height:160px;${_chartMode === 'donut' ? 'display:none' : ''}"><canvas id="breakdown-waterfall"></canvas></div>
      </div>
    </div>

    <div>
      <div class="panel-title">Operations Detail</div>
      <table class="ops-table">
        <thead><tr><th>Operation</th><th>Machine Rate</th><th>Process Cost</th><th>Labour Rate</th><th>Labour Cost</th><th>Total</th></tr></thead>
        <tbody>
          ${result.operationDetails.map(op => `<tr>
            <td>${op.operationName}</td>
            <td>${_currFmt(op.machineRateUsed)}/hr</td><td>${fmt(op.processCost)}</td>
            <td>${_currFmt(op.labourRateUsed)}/hr</td><td>${fmt(op.labourCost)}</td>
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

  // If waterfall mode is active, render it now
  if (_chartMode === 'waterfall') {
    renderWaterfallChart(result);
  }

  // Wire chart mode toggle buttons
  document.getElementById('chart-mode-donut')?.addEventListener('click', () => {
    _chartMode = 'donut';
    const dw = document.getElementById('donut-wrap');
    const ww = document.getElementById('waterfall-wrap');
    if (dw) dw.style.display = '';
    if (ww) ww.style.display = 'none';
    document.getElementById('chart-mode-donut')?.classList.add('active');
    document.getElementById('chart-mode-waterfall')?.classList.remove('active');
  });
  document.getElementById('chart-mode-waterfall')?.addEventListener('click', () => {
    _chartMode = 'waterfall';
    const dw = document.getElementById('donut-wrap');
    const ww = document.getElementById('waterfall-wrap');
    if (dw) dw.style.display = 'none';
    if (ww) ww.style.display = '';
    document.getElementById('chart-mode-donut')?.classList.remove('active');
    document.getElementById('chart-mode-waterfall')?.classList.add('active');
    renderWaterfallChart(result);
  });

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

// ─── Render: Detail Tab ───────────────────────────────────────────────────────

function renderDetail(result: PartCostResult, input: UniversalStackInput): void {
  const panel = el('results-detail');
  const cf = _currFmt;
  const pct = (n: number) => `${n.toFixed(1)}%`;

  const mat = library.materials.find(m => m.id === input.rawMaterial.materialId);
  const grossWeight = input.rawMaterial.directCost === undefined
    ? input.rawMaterial.netWeightKg / input.rawMaterial.materialUtilization : 0;
  const scrapWeight = Math.max(0, grossWeight - input.rawMaterial.netWeightKg);

  // ── Material section
  let matSection = `
    <div class="detail-section-title">1 · Raw Material</div>
    <table class="detail-table">
      <thead><tr><th>Parameter</th><th>Value</th><th>Unit</th><th>Notes</th></tr></thead>
      <tbody>
        <tr><td>Material Grade</td><td>${mat?.grade ?? 'Direct cost'}</td><td></td><td class="detail-src">${mat?.sourceNote?.slice(0,55) ?? ''}</td></tr>
        <tr><td>Region</td><td>${mat?.region ?? '—'}</td><td></td><td></td></tr>`;

  if (input.rawMaterial.directCost !== undefined) {
    matSection += `<tr><td>Direct Material Cost</td><td class="num"><strong>${cf(input.rawMaterial.directCost)}</strong></td><td></td><td>Pre-computed — bypasses weight calculation</td></tr>`;
  } else {
    matSection += `
        <tr><td>Net (Finished) Weight</td><td class="num">${input.rawMaterial.netWeightKg.toFixed(4)}</td><td>kg</td><td>Weight in finished part</td></tr>
        <tr><td>Gross (Stock/Cast) Weight</td><td class="num">${grossWeight.toFixed(4)}</td><td>kg</td><td>= net ÷ utilisation</td></tr>
        <tr><td>Scrap Weight</td><td class="num">${scrapWeight.toFixed(4)}</td><td>kg</td><td>= gross − net</td></tr>
        <tr><td>Material Utilisation</td><td class="num">${pct(input.rawMaterial.materialUtilization * 100)}</td><td></td><td>Benchmark: 72–85% for machined parts</td></tr>
        <tr><td>Material Price</td><td class="num">${cf(mat?.pricePerKg ?? 0)}</td><td>${_displayCurrency}/kg</td><td>Source: ${mat?.sourceNote?.slice(0,40) ?? '—'}</td></tr>
        <tr><td>Scrap Recovery Price</td><td class="num">${cf(mat?.scrapRecoveryPricePerKg ?? 0)}</td><td>${_displayCurrency}/kg</td><td></td></tr>
        <tr><td>Gross Material Cost</td><td class="num">${cf(grossWeight * (mat?.pricePerKg ?? 0))}</td><td>${_displayCurrency}</td><td>= gross weight × price/kg</td></tr>
        <tr><td>Scrap Credit</td><td class="num">(${cf(scrapWeight * (mat?.scrapRecoveryPricePerKg ?? 0))})</td><td>${_displayCurrency}</td><td>= scrap weight × recovery price</td></tr>
        <tr class="total-row"><td><strong>NET MATERIAL COST</strong></td><td class="num"><strong>${cf(result.breakdown.rawMaterial)}</strong></td><td>${_displayCurrency}</td><td>${pct((result.breakdown.rawMaterial / result.total) * 100)} of total</td></tr>`;
  }
  matSection += `<tr><td>Data Confidence</td><td><span class="badge ${mat?.confidence}">${mat?.confidence ?? '—'}</span></td><td></td><td>Effective: ${mat?.effectiveDate ?? '—'}</td></tr>
      </tbody></table>`;

  // ── Operations sections
  let opsSection = '';
  for (let i = 0; i < result.operationDetails.length; i++) {
    const op = result.operationDetails[i];
    const machObj = library.machines.find(m => m.id === op.machineId);
    const labObj = library.labour.find(l => l.id === op.labourId);
    const b = machObj?.buildup;
    const effHrs = b ? b.annualAvailableHours * b.machineUtilization : 1;
    const effectiveCycleHr = op.cycleTimeHr / op.partsPerCycle / op.oee;
    const effectiveLabHr = op.manning * op.labourTimeHr / op.partsPerCycle / op.labourEfficiency;

    opsSection += `
    <div class="detail-section-title">${i + 2} · Operation: ${escHtml(op.operationName)}</div>
    <table class="detail-table">
      <thead><tr><th>Parameter</th><th>Value</th><th>Unit</th><th>Calculation / Notes</th></tr></thead>
      <tbody>
        <tr><td><strong>MACHINE</strong></td><td>${machObj?.machineClass ?? op.machineId}</td><td></td><td>${machObj?.region ?? ''}</td></tr>
        <tr><td>Machine Rate (computed)</td><td class="num">${cf(op.machineRateUsed)}</td><td>${_displayCurrency}/hr</td><td>Confidence: ${machObj?.confidence ?? '—'}</td></tr>`;

    if (b) {
      opsSection += `
        <tr class="buildup-sub"><td>&nbsp;&nbsp;↳ Depreciation</td><td class="num">${cf(b.annualDepreciation / effHrs)}</td><td>${_displayCurrency}/hr</td><td>Annual: ${cf(b.annualDepreciation)}</td></tr>
        <tr class="buildup-sub"><td>&nbsp;&nbsp;↳ Maintenance</td><td class="num">${cf(b.maintenance / effHrs)}</td><td>${_displayCurrency}/hr</td><td>Annual: ${cf(b.maintenance)}</td></tr>
        <tr class="buildup-sub"><td>&nbsp;&nbsp;↳ Energy</td><td class="num">${cf(b.energy / effHrs)}</td><td>${_displayCurrency}/hr</td><td>Annual: ${cf(b.energy)}</td></tr>
        <tr class="buildup-sub"><td>&nbsp;&nbsp;↳ Floor Space</td><td class="num">${cf(b.floorSpace / effHrs)}</td><td>${_displayCurrency}/hr</td><td>Annual: ${cf(b.floorSpace)}</td></tr>
        <tr class="buildup-sub"><td>&nbsp;&nbsp;↳ Indirect Support</td><td class="num">${cf(b.indirectSupport / effHrs)}</td><td>${_displayCurrency}/hr</td><td>Annual: ${cf(b.indirectSupport)}</td></tr>
        <tr class="buildup-sub"><td>&nbsp;&nbsp;↳ Finance Cost</td><td class="num">${cf(b.financeCost / effHrs)}</td><td>${_displayCurrency}/hr</td><td>Annual: ${cf(b.financeCost)}</td></tr>
        <tr class="buildup-sub"><td>&nbsp;&nbsp;↳ Annual Available Hours</td><td class="num">${b.annualAvailableHours.toLocaleString()}</td><td>hr/yr</td><td>Machine utilisation: ${pct(b.machineUtilization * 100)}</td></tr>`;
    }

    opsSection += `
        <tr><td>Cycle Time</td><td class="num">${op.cycleTimeHr.toFixed(4)}</td><td>hr</td><td>= ${(op.cycleTimeHr * 60).toFixed(2)} min per cycle</td></tr>
        <tr><td>Parts per Cycle</td><td class="num">${op.partsPerCycle}</td><td>parts</td><td></td></tr>
        <tr><td>OEE</td><td class="num">${pct(op.oee * 100)}</td><td></td><td>Overall Equipment Effectiveness — benchmark 85%+</td></tr>
        <tr><td>Effective Machine Time</td><td class="num">${effectiveCycleHr.toFixed(5)}</td><td>hr/part</td><td>= cycle ÷ ppc ÷ OEE</td></tr>
        <tr class="subtotal-row"><td><strong>Process Cost per Part</strong></td><td class="num"><strong>${cf(op.processCost)}</strong></td><td>${_displayCurrency}</td><td>= machine rate × effective time</td></tr>

        <tr><td><strong>LABOUR</strong></td><td>${labObj?.skillLevel ?? op.labourId}</td><td></td><td>${labObj?.region ?? ''}</td></tr>
        <tr><td>Fully Loaded Labour Rate</td><td class="num">${cf(op.labourRateUsed)}</td><td>${_displayCurrency}/hr</td><td>Incl. social costs, benefits. Confidence: ${labObj?.confidence ?? '—'}</td></tr>
        <tr><td>Manning</td><td class="num">${op.manning}</td><td>persons</td><td>Operators per machine</td></tr>
        <tr><td>Labour Time</td><td class="num">${op.labourTimeHr.toFixed(4)}</td><td>hr</td><td>= ${(op.labourTimeHr * 60).toFixed(2)} min per cycle</td></tr>
        <tr><td>Labour Efficiency</td><td class="num">${pct(op.labourEfficiency * 100)}</td><td></td><td>Productive time / paid time</td></tr>
        <tr><td>Effective Labour Time</td><td class="num">${effectiveLabHr.toFixed(5)}</td><td>hr/part</td><td>= manning × lab time ÷ ppc ÷ efficiency</td></tr>
        <tr class="subtotal-row"><td><strong>Labour Cost per Part</strong></td><td class="num"><strong>${cf(op.labourCost)}</strong></td><td>${_displayCurrency}</td><td>= labour rate × effective labour time</td></tr>
        <tr class="total-row"><td><strong>Operation Total</strong></td><td class="num"><strong>${cf(op.processCost + op.labourCost)}</strong></td><td>${_displayCurrency}</td><td>${pct(((op.processCost + op.labourCost) / result.total) * 100)} of total</td></tr>
      </tbody>
    </table>`;
  }

  // ── Tooling section
  const toolSection = `
    <div class="detail-section-title">${result.operationDetails.length + 2} · Tooling &amp; NRE</div>
    <table class="detail-table">
      <thead><tr><th>Parameter</th><th>Value</th><th>Notes</th></tr></thead>
      <tbody>
        <tr><td>Mode</td><td>${input.tooling.mode === 'amortized' ? 'Amortised into piece price' : 'One-time NRE (not in unit cost)'}</td><td></td></tr>
        <tr><td>Total Tooling Cost</td><td class="num">${cf(input.tooling.totalToolingCost)}</td><td></td></tr>
        ${input.tooling.mode === 'amortized' ? `
        <tr><td>Amortisation Volume</td><td class="num">${input.tooling.amortizationVolume.toLocaleString()} parts</td><td></td></tr>
        <tr class="total-row"><td><strong>Tooling per Part</strong></td><td class="num"><strong>${cf(result.breakdown.tooling)}</strong></td><td>= total cost ÷ volume</td></tr>
        ` : `<tr class="total-row"><td><strong>NRE (one-time)</strong></td><td class="num"><strong>${cf(result.toolingNRE ?? 0)}</strong></td><td>Not included in unit cost</td></tr>`}
      </tbody>
    </table>`;

  // ── Commercial stack
  const commSection = `
    <div class="detail-section-title">${result.operationDetails.length + 3} · Commercial Stack</div>
    <table class="detail-table">
      <thead><tr><th>Parameter</th><th>Rate</th><th>Amount</th><th>Basis</th></tr></thead>
      <tbody>
        <tr><td>Packaging</td><td></td><td class="num">${cf(input.packagingPerPart)}</td><td>Per-part fixed cost</td></tr>
        <tr><td>Logistics</td><td></td><td class="num">${cf(input.logisticsPerPart)}</td><td>Per-part fixed cost</td></tr>
        <tr class="subtotal-row"><td><strong>Factory Cost</strong></td><td></td><td class="num"><strong>${cf(result.factoryCost)}</strong></td><td>Sum of buckets 1–6</td></tr>
        <tr><td>Overhead (SG&amp;A)</td><td class="num">${pct(input.overheadPct * 100)}</td><td class="num">${cf(result.breakdown.overhead)}</td><td>Applied to factory cost</td></tr>
        <tr class="subtotal-row"><td><strong>Subtotal</strong></td><td></td><td class="num"><strong>${cf(result.subtotal)}</strong></td><td>Factory cost + overhead</td></tr>
        <tr><td>Supplier Margin</td><td class="num">${pct(input.marginPct * 100)}</td><td class="num">${cf(result.breakdown.margin)}</td><td>Applied to subtotal</td></tr>
        <tr class="total-row"><td><strong>TOTAL SHOULD COST</strong></td><td></td><td class="num"><strong>${cf(result.total)}</strong></td><td></td></tr>
      </tbody>
    </table>`;

  panel.innerHTML = `
    <div style="padding:12px 16px;overflow-y:auto">
      <div class="detail-kpi-row">
        <div class="detail-kpi"><div class="kpi-label">Total Should Cost</div><div class="kpi-value">${cf(result.total)}</div></div>
        <div class="detail-kpi"><div class="kpi-label">Raw Material</div><div class="kpi-value">${cf(result.breakdown.rawMaterial)}</div><div class="kpi-sub">${pct((result.breakdown.rawMaterial / result.total) * 100)} of total</div></div>
        <div class="detail-kpi"><div class="kpi-label">Process</div><div class="kpi-value">${cf(result.breakdown.process)}</div><div class="kpi-sub">${pct((result.breakdown.process / result.total) * 100)} of total</div></div>
        <div class="detail-kpi"><div class="kpi-label">Labour</div><div class="kpi-value">${cf(result.breakdown.labour)}</div><div class="kpi-sub">${pct((result.breakdown.labour / result.total) * 100)} of total</div></div>
        <div class="detail-kpi"><div class="kpi-label">Tooling</div><div class="kpi-value">${cf(result.breakdown.tooling)}</div><div class="kpi-sub">${pct((result.breakdown.tooling / result.total) * 100)} of total</div></div>
        <div class="detail-kpi"><div class="kpi-label">OH + Margin</div><div class="kpi-value">${cf(result.breakdown.overhead + result.breakdown.margin)}</div><div class="kpi-sub">${pct(((result.breakdown.overhead + result.breakdown.margin) / result.total) * 100)} of total</div></div>
      </div>
      ${matSection}
      ${opsSection}
      ${toolSection}
      ${commSection}
    </div>`;
}

// ─── Render: AI Insights Tab ──────────────────────────────────────────────────

function renderInsights(result: PartCostResult, input: UniversalStackInput): void {
  const panel = el('results-insights');
  const cf = _currFmt;
  const insights = generateInsights(result, input, library, activeCommodity);
  const totalSaving = totalPotentialSaving(insights);

  const typeLabel: Record<string, string> = {
    critical: 'Critical', warning: 'Warning', opportunity: 'Opportunity', benchmark: 'Benchmark', info: 'Info',
  };

  const insightCards = insights.map(ins => {
    const bmBar = ins.benchmark ? (() => {
      const maxVal = Math.max(ins.benchmark.industryHigh * 1.3, ins.benchmark.yourValue * 1.1);
      const rangeLow = (ins.benchmark.industryLow / maxVal) * 100;
      const rangeWidth = ((ins.benchmark.industryHigh - ins.benchmark.industryLow) / maxVal) * 100;
      const yourPos = (ins.benchmark.yourValue / maxVal) * 100;
      return `
        <div class="insight-benchmark-bar">
          <span style="white-space:nowrap;font-weight:600">${ins.benchmark.label}</span>
          <div class="bm-bar-track">
            <div class="bm-bar-range" style="left:${rangeLow}%;width:${rangeWidth}%" title="Industry range: ${ins.benchmark.industryLow}–${ins.benchmark.industryHigh}${ins.benchmark.unit}"></div>
            <div class="bm-bar-yours" style="left:${Math.min(97, yourPos)}%" title="Your value: ${ins.benchmark.yourValue.toFixed(1)}${ins.benchmark.unit}"></div>
          </div>
          <span style="white-space:nowrap">Yours: <strong>${ins.benchmark.yourValue.toFixed(1)}${ins.benchmark.unit}</strong></span>
          <span style="white-space:nowrap;color:#888">Benchmark: ${ins.benchmark.industryLow}–${ins.benchmark.industryHigh}${ins.benchmark.unit}</span>
        </div>`;
    })() : '';

    const actions = ins.actions.map(a => `<li>${escHtml(a)}</li>`).join('');
    const savingBadge = ins.potentialSavingPct > 0
      ? `<span class="insight-saving">~${ins.potentialSavingPct.toFixed(0)}% saving potential</span>` : '';

    return `
    <div class="insight-card ${ins.type}">
      <div class="insight-header">
        <span class="insight-badge ${ins.type}">${typeLabel[ins.type] ?? ins.type}</span>
        <span class="insight-title">${escHtml(ins.title)}</span>
        ${savingBadge}
        <span class="insight-impact ${ins.impact}">${ins.impact} Impact</span>
      </div>
      <p class="insight-finding">${escHtml(ins.finding)}</p>
      <ul class="insight-actions">${actions}</ul>
      ${bmBar}
    </div>`;
  }).join('');

  // Regional comparison detailed breakdown table (10 key regions)
  const RC_REGIONS: ManufacturingRegion[] = ['UK', 'DE', 'FR', 'ES', 'PL', 'TR', 'CN', 'IN', 'MX', 'US'];
  const ukRd = REGIONAL_DATA['UK'];
  const ukSemiSkilled = ukRd.labour.semiskilled;
  const bkd = result.breakdown;

  interface RCRow {
    code: ManufacturingRegion;
    name: string;
    currency: string;
    material: number;
    process: number;
    labour: number;
    tooling: number;
    overhead: number;
    exWorks: number;
    logistics: number;
    total: number;
  }

  // Landed cost adders: import duty + international shipping as fraction of exWorks
  const landedAdders: Partial<Record<ManufacturingRegion, { duty: number; shipping: number }>> = {
    UK: { duty: 0,     shipping: 0     },
    DE: { duty: 0,     shipping: 0.020 },
    FR: { duty: 0,     shipping: 0.022 },
    ES: { duty: 0,     shipping: 0.025 },
    PL: { duty: 0,     shipping: 0.030 },
    TR: { duty: 0.035, shipping: 0.040 },
    CN: { duty: 0.065, shipping: 0.070 },
    IN: { duty: 0.065, shipping: 0.065 },
    MX: { duty: 0.050, shipping: 0.060 },
    US: { duty: 0,     shipping: 0.045 },
  };

  const rcRows: RCRow[] = RC_REGIONS.map(code => {
    const rd = REGIONAL_DATA[code];
    if (!rd) return null as unknown as RCRow;
    const material  = bkd.rawMaterial * rd.materialMultiplier;
    const process   = bkd.process    * rd.machineRateMultiplier;
    const labour    = bkd.labour     * (rd.labour.semiskilled / ukSemiSkilled);
    const tooling   = bkd.tooling;
    const overhead  = bkd.overhead   * rd.overheadMultiplier;
    const exWorks   = material + process + labour + tooling + overhead;
    const logistics = bkd.logistics  * rd.logisticsMultiplier;
    const adder = _landedCostMode ? (landedAdders[code] ?? { duty: 0.05, shipping: 0.05 }) : { duty: 0, shipping: 0 };
    const total = exWorks + (bkd.packaging * rd.packagingMultiplier) + logistics + bkd.margin
                  + exWorks * adder.duty + exWorks * adder.shipping;
    return { code, name: rd.name, currency: rd.currency, material, process, labour, tooling, overhead, exWorks, logistics, total };
  }).filter(r => r !== null);

  type RCCol = 'material' | 'process' | 'labour' | 'overhead' | 'exWorks' | 'total';
  const rcCols: RCCol[] = ['material', 'process', 'labour', 'overhead', 'exWorks', 'total'];
  const rcMin = {} as Record<RCCol, number>;
  const rcMax = {} as Record<RCCol, number>;
  rcCols.forEach(c => {
    const vals = rcRows.map(r => r[c]);
    rcMin[c] = Math.min(...vals);
    rcMax[c] = Math.max(...vals);
  });

  const rcCell = (val: number, col: RCCol) => {
    if (rcRows.length < 2) return '';
    if (val === rcMin[col]) return 'background:#d1fae5;color:#065f46;font-weight:700';
    if (val === rcMax[col]) return 'background:#fee2e2;color:#991b1b;font-weight:700';
    return '';
  };

  const ukTotal = rcRows.find(r => r.code === 'UK')?.total ?? result.total;
  const isDarkMode = document.documentElement.getAttribute('data-theme') !== 'light';
  const thRowBg = isDarkMode ? '#1e293b' : '#f8fafc';

  const rcTableRows = rcRows.map(r => {
    const savingPct = ((ukTotal - r.total) / ukTotal) * 100;
    const isUK = r.code === 'UK';
    const rowStyle = isUK ? `background:var(--accent-light);font-weight:600` : '';
    const vsUK = isUK ? '<span style="color:#888;font-size:0.72rem">Base</span>'
      : savingPct > 0.5
        ? `<span style="color:#10b981;font-weight:700;font-size:0.75rem">▼ ${savingPct.toFixed(0)}%</span>`
        : `<span style="color:#e63b3b;font-weight:600;font-size:0.75rem">▲ ${Math.abs(savingPct).toFixed(0)}%</span>`;
    return `<tr style="${rowStyle}">
      <td style="white-space:nowrap;font-weight:${isUK ? '700' : '600'}">${r.name}<br><span style="font-size:0.63rem;color:#999;font-weight:400">${r.currency}</span></td>
      <td style="text-align:right;font-size:0.78rem;${rcCell(r.material,'material')}">${cf(r.material)}</td>
      <td style="text-align:right;font-size:0.78rem;${rcCell(r.process,'process')}">${cf(r.process)}</td>
      <td style="text-align:right;font-size:0.78rem;${rcCell(r.labour,'labour')}">${cf(r.labour)}</td>
      <td style="text-align:right;font-size:0.78rem;color:var(--text-secondary)">${cf(r.tooling)}</td>
      <td style="text-align:right;font-size:0.78rem;${rcCell(r.overhead,'overhead')}">${cf(r.overhead)}</td>
      <td style="text-align:right;font-size:0.82rem;font-weight:700;border-left:2px solid var(--border);${rcCell(r.exWorks,'exWorks')}">${cf(r.exWorks)}</td>
      <td style="text-align:right;font-size:0.78rem;color:var(--text-secondary)">${cf(r.logistics)}</td>
      <td style="text-align:right;font-size:0.85rem;font-weight:700;border-left:2px solid var(--border);${rcCell(r.total,'total')}">${cf(r.total)}</td>
      <td style="text-align:center">${vsUK}</td>
    </tr>`;
  }).join('');

  const regionalTable = `
    <div style="overflow-x:auto;margin-top:4px">
      <table class="rc-table">
        <thead>
          <tr style="background:${thRowBg}">
            <th style="text-align:left;min-width:110px">Region</th>
            <th>Material</th>
            <th>Process</th>
            <th>Labour</th>
            <th>Tooling</th>
            <th>Overhead</th>
            <th style="border-left:2px solid var(--border)">Ex-Works</th>
            <th>Logistics</th>
            <th style="border-left:2px solid var(--border)">Total</th>
            <th>vs UK</th>
          </tr>
        </thead>
        <tbody>${rcTableRows}</tbody>
      </table>
    </div>`;

  panel.innerHTML = `
    <div style="padding:12px 16px;overflow-y:auto">
      <div class="insights-summary-bar">
        <div>
          <div class="big-lbl">Combined Saving Potential</div>
          <div class="big-num">~${totalSaving.toFixed(0)}%</div>
        </div>
        <div style="flex:1;font-size:0.78rem;color:#555">
          Based on ${insights.length} insights across material, process, commercial and regional dimensions.
          Savings are illustrative — not all measures are simultaneously achievable.
        </div>
        <div style="font-size:0.72rem;color:#888;text-align:right">
          Methodology: aPriori-calibrated benchmarks<br>
          Commodity: <strong>${activeCommodity.replace(/_/g, ' ')}</strong>
        </div>
      </div>

      ${insights.length === 0
        ? '<div class="placeholder">Cost structure is within industry benchmarks. No significant optimisation opportunities identified.</div>'
        : insightCards}

      <div style="margin-top:16px">
        <div class="detail-section-title">Regional Cost Comparison — Full Breakdown</div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px">
          <span style="font-size:0.72rem;color:var(--text-muted)">
            Per-region should-cost using 2025 Q2 labour, energy and rate benchmarks.
            Green = cheapest per column, Red = highest. Tooling fixed. Indicative — confirm with RFQ.
          </span>
          <button id="landed-cost-toggle" class="btn ${_landedCostMode ? 'btn-primary' : 'btn-secondary'} btn-sm" style="flex-shrink:0">
            ${_landedCostMode ? '🚢 Landed: ON' : '🚢 Landed Cost'}
          </button>
        </div>
        ${regionalTable}
      </div>
    </div>`;

  panel.querySelector('#landed-cost-toggle')?.addEventListener('click', () => {
    _landedCostMode = !_landedCostMode;
    if (lastResult && lastInput) renderInsights(lastResult, lastInput);
  });
}

// ─── Render: DFM / DFA Tab ────────────────────────────────────────────────────

function renderDFMDFA(result: PartCostResult, input: UniversalStackInput): void {
  const panel = el('results-dfm');
  if (!result || !input) { panel.innerHTML = '<div class="placeholder">Run a calculation first.</div>'; return; }

  panel.innerHTML = '<div class="placeholder">Analysing design for manufacture…</div>';

  setTimeout(() => {
    try {
      const dfmResult = generateDFMDFA(result, input, activeCommodity);

      const severityColor: Record<string, string> = {
        critical: '#e63b3b',
        major: '#f59e0b',
        minor: '#3b82f6',
        opportunity: '#10b981',
      };

      const severityLabel: Record<string, string> = {
        critical: 'Critical',
        major: 'Major',
        minor: 'Minor',
        opportunity: 'Opportunity',
      };

      const riskColor = (r: string) => r === 'High' ? '#e63b3b' : r === 'Medium' ? '#f59e0b' : '#10b981';

      const issueCard = (issue: DFMIssue) => `
        <div style="border-left:3px solid ${severityColor[issue.severity]};background:var(--surface-elevated);border-radius:6px;padding:10px 14px;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
            <span style="font-size:0.7rem;font-weight:700;color:${severityColor[issue.severity]};text-transform:uppercase;border:1px solid ${severityColor[issue.severity]};border-radius:4px;padding:1px 6px">${severityLabel[issue.severity]}</span>
            <span style="font-weight:600;font-size:0.85rem">${escHtml(issue.title)}</span>
            ${issue.savingPct > 0 ? `<span style="margin-left:auto;font-size:0.72rem;color:#10b981;font-weight:700">~${issue.savingPct}% saving</span>` : ''}
          </div>
          <p style="font-size:0.78rem;color:var(--text-secondary);margin:0 0 6px 0">${escHtml(issue.description)}</p>
          <div style="font-size:0.75rem;background:var(--surface);border-radius:4px;padding:5px 8px;color:var(--text-primary)">
            <strong>Recommendation:</strong> ${escHtml(issue.recommendation)}
            <span style="float:right;color:${riskColor(issue.risk)};font-weight:600">Risk: ${issue.risk}</span>
          </div>
        </div>`;

      const optimCard = (opt: CostOptimisation) => `
        <div style="background:var(--surface-elevated);border-radius:6px;padding:10px 14px;margin-bottom:8px;border:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
            <span style="font-weight:600;font-size:0.85rem">${escHtml(opt.title)}</span>
            <span style="font-size:0.72rem;color:#10b981;font-weight:700;margin-left:auto">~${opt.expectedSavingPct.toFixed(1)}% saving</span>
            <span style="font-size:0.7rem;background:${opt.timeframe === 'Quick Win' ? '#10b981' : opt.timeframe === 'Medium Term' ? '#f59e0b' : '#6366f1'};color:#fff;border-radius:4px;padding:1px 6px">${opt.timeframe}</span>
          </div>
          <p style="font-size:0.78rem;color:var(--text-secondary);margin:0 0 5px 0">${escHtml(opt.description)}</p>
          <p style="font-size:0.73rem;color:#888;margin:0;font-style:italic">${escHtml(opt.technicalJustification)}</p>
        </div>`;

      const scoreBar = (score: number, label: string) => {
        const pct = (score / 10) * 100;
        const col = score >= 8 ? '#10b981' : score >= 6 ? '#f59e0b' : '#e63b3b';
        return `
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-weight:600;font-size:0.83rem">${label}</span>
              <span style="font-weight:700;color:${col};font-size:0.9rem">${score}/10</span>
            </div>
            <div style="height:8px;background:var(--surface);border-radius:4px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${col};border-radius:4px;transition:width 0.4s"></div>
            </div>
          </div>`;
      };

      const dfmIssuesHtml = dfmResult.dfm.issues.map(issueCard).join('') || '<p style="color:#888;font-size:0.82rem">No DFM issues detected.</p>';
      const dfaIssuesHtml = dfmResult.dfa.issues.map(issueCard).join('') || '<p style="color:#888;font-size:0.82rem">No DFA issues detected.</p>';
      const optimHtml = dfmResult.costOptimisations.map(optimCard).join('');

      const quickWinBadges = dfmResult.quickWins.map(w => `<span style="background:var(--surface-elevated);border:1px solid #10b981;color:#10b981;border-radius:4px;padding:2px 8px;font-size:0.73rem;display:inline-block;margin:2px">${escHtml(w)}</span>`).join('');
      const ltBadges = dfmResult.longTermChanges.map(w => `<span style="background:var(--surface-elevated);border:1px solid #6366f1;color:#6366f1;border-radius:4px;padding:2px 8px;font-size:0.73rem;display:inline-block;margin:2px">${escHtml(w)}</span>`).join('');

      panel.innerHTML = `
        <div style="padding:12px 16px;overflow-y:auto">

          <!-- Summary banner -->
          <div style="display:flex;gap:12px;flex-wrap:wrap;background:var(--surface-elevated);border-radius:8px;padding:14px 16px;margin-bottom:16px;align-items:center">
            <div style="text-align:center;min-width:80px">
              <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase">Total Saving</div>
              <div style="font-size:1.6rem;font-weight:800;color:#10b981">~${dfmResult.totalPotentialSavingPct.toFixed(1)}%</div>
            </div>
            <div style="flex:1;min-width:200px">
              ${scoreBar(dfmResult.dfm.score, 'Manufacturability (DFM)')}
              ${scoreBar(dfmResult.dfa.score, 'Assembly Efficiency (DFA)')}
            </div>
            <div style="min-width:160px;font-size:0.75rem;color:var(--text-muted)">
              Commodity: <strong>${activeCommodity.replace(/_/g, ' ')}</strong><br>
              DFM issues: <strong>${dfmResult.dfm.issues.length}</strong> &nbsp;|&nbsp; DFA issues: <strong>${dfmResult.dfa.issues.length}</strong><br>
              Cost levers: <strong>${dfmResult.costOptimisations.length}</strong>
            </div>
          </div>

          <!-- DFM Section -->
          <div style="margin-bottom:20px">
            <div class="detail-section-title" style="margin-bottom:6px">Design for Manufacture (DFM)</div>
            <p style="font-size:0.78rem;color:var(--text-secondary);margin:0 0 10px 0">${escHtml(dfmResult.dfm.summary)}</p>
            ${dfmIssuesHtml}
          </div>

          <!-- DFA Section -->
          <div style="margin-bottom:20px">
            <div class="detail-section-title" style="margin-bottom:6px">Design for Assembly (DFA)</div>
            <p style="font-size:0.78rem;color:var(--text-secondary);margin:0 0 10px 0">${escHtml(dfmResult.dfa.summary)}</p>
            ${dfaIssuesHtml}
          </div>

          <!-- Cost Optimisations -->
          <div style="margin-bottom:20px">
            <div class="detail-section-title" style="margin-bottom:6px">Cost Optimisation Levers</div>
            ${optimHtml}
          </div>

          <!-- Quick wins / long term -->
          ${dfmResult.quickWins.length > 0 ? `
          <div style="margin-bottom:12px">
            <div style="font-weight:600;font-size:0.82rem;margin-bottom:5px;color:#10b981">Quick Wins (Low Risk)</div>
            <div>${quickWinBadges}</div>
          </div>` : ''}

          ${dfmResult.longTermChanges.length > 0 ? `
          <div style="margin-bottom:16px">
            <div style="font-weight:600;font-size:0.82rem;margin-bottom:5px;color:#6366f1">Long-Term Strategic Changes</div>
            <div>${ltBadges}</div>
          </div>` : ''}

          <!-- AI Deep Analysis Button -->
          <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:6px">
            <div style="font-weight:600;font-size:0.83rem;margin-bottom:6px">AI Deep Analysis</div>
            <p style="font-size:0.75rem;color:var(--text-muted);margin:0 0 10px 0">
              Request a deeper engineering analysis from Claude AI. Provides expert commentary on design risks,
              supplier negotiation strategy, and process alternatives specific to this commodity.
            </p>
            <button class="btn btn-primary" id="dfm-ai-btn" style="gap:6px">⚡ Run AI Deep Analysis</button>
            <div id="dfm-ai-result" style="margin-top:12px"></div>
          </div>

        </div>`;

      // Wire AI button
      document.getElementById('dfm-ai-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('dfm-ai-btn') as HTMLButtonElement;
        const aiResult = document.getElementById('dfm-ai-result')!;
        btn.disabled = true;
        btn.textContent = '⏳ Analysing…';
        aiResult.innerHTML = '<div class="placeholder">Waiting for AI analysis…</div>';
        try {
          const token = localStorage.getItem('auth_token') ?? '';
          const resp = await fetch('/api/dfm/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ result, input, commodity: activeCommodity, dfmResult }),
          });
          if (!resp.ok) throw new Error(`Server error ${resp.status}`);
          const data = await resp.json() as { analysis: string };
          aiResult.innerHTML = `
            <div style="background:var(--surface-elevated);border-radius:6px;padding:14px 16px;font-size:0.8rem;line-height:1.65;color:var(--text-primary);white-space:pre-wrap;border-left:3px solid var(--accent)">${escHtml(data.analysis)}</div>`;
        } catch (err) {
          aiResult.innerHTML = `<div style="color:#e63b3b;font-size:0.78rem">AI analysis failed: ${escHtml(String(err))}. Ensure the server is running and ANTHROPIC_API_KEY is set.</div>`;
        } finally {
          btn.disabled = false;
          btn.textContent = '⚡ Run AI Deep Analysis';
        }
      });

    } catch (err) {
      panel.innerHTML = `<div class="placeholder" style="color:#e63b3b">DFM/DFA analysis failed: ${escHtml(String(err))}</div>`;
    }
  }, 50);
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
      panel.innerHTML = `<div class="placeholder" style="color:var(--red)">Sensitivity error: ${escHtml(err instanceof Error ? err.message : String(err))}</div>`;
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
    if (!id1 || !id2) { showToast('Select two scenarios to compare.', 'warning'); return; }
    if (id1 === id2) { showToast('Select two different scenarios to compare.', 'warning'); return; }
    try {
      const comp = compareScenarios(id1, id2, library);
      renderCompareResult(comp);
    } catch (err) {
      el('compare-result').innerHTML = `<span style="color:var(--red)">${escHtml(err instanceof Error ? err.message : String(err))}</span>`;
    }
  });

  el('export-sc-btn')?.addEventListener('click', () => {
    const blob = new Blob([exportScenarios({ version: library.version, lastModified: library.lastModified })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `scenarios-v${library.version}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });

  el('import-sc-file')?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { imported, errors, meta } = importScenarios(ev.target?.result as string);
      if (meta && meta.version !== 'unknown' && meta.version !== library.version) {
        showToast(`Imported scenarios were computed with rate library v${meta.version}; current library is v${library.version}. Results may differ — recompute scenarios to update.`, 'warning');
      }
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
  if (!lastResult || !lastInput) return;
  const blob = exportToExcelBlob(lastResult, lastInput, library, _displayCurrency, _displayFxRate);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `should-cost-${lastResult.partName.replace(/\s+/g, '-')}.xlsx`;
  a.click();
}

function openPDF(): void {
  if (!lastResult || !lastInput) return;
  printPDF(lastResult, lastInput, library, _displayCurrency, _displayFxRate, activeCommodity);
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

// ─── SUV Demo Loader ──────────────────────────────────────────────────────────

function loadSUVDemo(commodity: string, slot: number): void {
  // Switch commodity tab first
  const tabBtn = document.querySelector<HTMLElement>(`.ctab[data-commodity="${commodity}"]`);
  if (tabBtn) tabBtn.click();

  const switchToInsights = () => {
    const insightsTab = document.querySelector<HTMLElement>('.rtab[data-panel="insights"]');
    if (insightsTab) insightsTab.click();
  };

  setTimeout(() => {
    switch (commodity) {

      case 'machining': {
        if (slot === 1) {
          (el<HTMLInputElement>('part-name')).value = 'BMW X7 Rear Suspension Knuckle';
          const matEl = el<HTMLSelectElement>('mach-mat');
          if (matEl) { const o = Array.from(matEl.options).find(x => x.value === 'mat-al6061'); if (o) matEl.value = o.value; }
          (el<HTMLInputElement>('mach-net-wt')).value = '1.85';
          (el<HTMLInputElement>('mach-stock-wt')).value = '2.40';
          (el<HTMLInputElement>('mach-mat-util')).value = '0';
          (el<HTMLInputElement>('mach-setup-time')).value = '0.75';
          (el<HTMLInputElement>('mach-batch-size')).value = '25';
          (el<HTMLInputElement>('mach-tooling')).value = '25000';
          (el<HTMLInputElement>('mach-amort')).value = '50000';
          (el<HTMLInputElement>('mach-prog-nre')).value = '3500';
          (el<HTMLInputElement>('packaging')).value = '0.35';
          (el<HTMLInputElement>('logistics')).value = '0.85';
          (el<HTMLInputElement>('overhead-pct')).value = '14';
          (el<HTMLInputElement>('margin-pct')).value = '10';
          el('mach-ops-container').innerHTML = ''; machOpCount = 0;
          addMachOp({ name: 'CNC Turning — Datum Faces', type: 'turning', machineId: 'mach-lathe-cnc', labourId: 'lab-uk-skilled', cycleTimeHr: 0.08, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.08, labourEfficiency: 0.92 });
          addMachOp({ name: '5-Axis Milling — Profile', type: 'milling_5ax', machineId: 'mach-vmc5', labourId: 'lab-uk-skilled', cycleTimeHr: 0.35, partsPerCycle: 1, oee: 0.82, manning: 1, labourTimeHr: 0.35, labourEfficiency: 0.90 });
          addMachOp({ name: 'CNC Drilling — Ball Joint Bores', type: 'drilling', machineId: 'mach-drill', labourId: 'lab-uk-skilled', cycleTimeHr: 0.07, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.07, labourEfficiency: 0.92 });
        } else if (slot === 2) {
          (el<HTMLInputElement>('part-name')).value = 'Range Rover Velar Steering Rack Housing';
          const matEl = el<HTMLSelectElement>('mach-mat');
          if (matEl) { const o = Array.from(matEl.options).find(x => x.value === 'mat-al6061'); if (o) matEl.value = o.value; }
          (el<HTMLInputElement>('mach-net-wt')).value = '2.10';
          (el<HTMLInputElement>('mach-stock-wt')).value = '2.80';
          (el<HTMLInputElement>('mach-mat-util')).value = '0';
          (el<HTMLInputElement>('mach-setup-time')).value = '1.0';
          (el<HTMLInputElement>('mach-batch-size')).value = '20';
          (el<HTMLInputElement>('mach-tooling')).value = '18000';
          (el<HTMLInputElement>('mach-amort')).value = '40000';
          (el<HTMLInputElement>('mach-prog-nre')).value = '2800';
          (el<HTMLInputElement>('packaging')).value = '0.45';
          (el<HTMLInputElement>('logistics')).value = '1.20';
          (el<HTMLInputElement>('overhead-pct')).value = '14';
          (el<HTMLInputElement>('margin-pct')).value = '10';
          el('mach-ops-container').innerHTML = ''; machOpCount = 0;
          addMachOp({ name: 'CNC Turning — OD Profile', type: 'turning', machineId: 'mach-lathe-cnc', labourId: 'lab-uk-skilled', cycleTimeHr: 0.12, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.12, labourEfficiency: 0.92 });
          addMachOp({ name: '3-Axis Milling — Rack Bore', type: 'milling_3ax', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled', cycleTimeHr: 0.45, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.45, labourEfficiency: 0.92 });
          addMachOp({ name: 'Drilling — Mounting Holes', type: 'drilling', machineId: 'mach-drill', labourId: 'lab-uk-skilled', cycleTimeHr: 0.08, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.08, labourEfficiency: 0.92 });
        } else {
          (el<HTMLInputElement>('part-name')).value = 'Toyota Land Cruiser 300 Rear Hub Carrier';
          const matEl3 = el<HTMLSelectElement>('mach-mat');
          if (matEl3) { const o = Array.from(matEl3.options).find(x => x.value === 'mat-al6061'); if (o) matEl3.value = o.value; }
          (el<HTMLInputElement>('mach-net-wt')).value = '2.45';
          (el<HTMLInputElement>('mach-stock-wt')).value = '3.20';
          (el<HTMLInputElement>('mach-mat-util')).value = '0';
          (el<HTMLInputElement>('mach-setup-time')).value = '0.75';
          (el<HTMLInputElement>('mach-batch-size')).value = '20';
          (el<HTMLInputElement>('mach-tooling')).value = '22000';
          (el<HTMLInputElement>('mach-amort')).value = '50000';
          (el<HTMLInputElement>('mach-prog-nre')).value = '4000';
          (el<HTMLInputElement>('packaging')).value = '0.45';
          (el<HTMLInputElement>('logistics')).value = '1.00';
          (el<HTMLInputElement>('overhead-pct')).value = '14';
          (el<HTMLInputElement>('margin-pct')).value = '10';
          el('mach-ops-container').innerHTML = ''; machOpCount = 0;
          addMachOp({ name: '5-Axis Profile Mill — Hub Body', type: 'milling_5ax', machineId: 'mach-dmg-dmu50', labourId: 'lab-uk-skilled', cycleTimeHr: 0.22, partsPerCycle: 1, oee: 0.82, manning: 1, labourTimeHr: 0.22, labourEfficiency: 0.90 });
          addMachOp({ name: 'CNC Boring — Hub + Stub Axle Bores', type: 'boring', machineId: 'mach-lathe-cnc', labourId: 'lab-uk-skilled', cycleTimeHr: 0.12, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.12, labourEfficiency: 0.92 });
          addMachOp({ name: 'CNC Drilling — 12-Hole Bolt Circle', type: 'drilling', machineId: 'mach-drill', labourId: 'lab-uk-skilled', cycleTimeHr: 0.08, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.08, labourEfficiency: 0.92 });
          addMachOp({ name: 'CNC Milling — ABS Ring Flange', type: 'milling_3ax', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled', cycleTimeHr: 0.07, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.07, labourEfficiency: 0.92 });
        }
        compute();
        setTimeout(switchToInsights, 300);
        break;
      }

      case 'sheet_metal': {
        if (slot === 1) {
          (el<HTMLInputElement>('part-name')).value = 'Porsche Cayenne Door Outer Panel';
          const matEl = el<HTMLSelectElement>('sm-mat');
          if (matEl) { const o = Array.from(matEl.options).find(x => x.value === 'mat-aa5182'); if (o) matEl.value = o.value; }
          (el<HTMLInputElement>('sm-net-wt')).value = '2.20';
          (el<HTMLInputElement>('sm-blank-l')).value = '1200';
          (el<HTMLInputElement>('sm-blank-w')).value = '900';
          (el<HTMLInputElement>('sm-thick')).value = '1.0';
          (el<HTMLInputElement>('sm-perim')).value = '4200';
          (el<HTMLInputElement>('sm-shear')).value = '1200';
          (el<HTMLInputElement>('sm-strip-w')).value = '920';
          (el<HTMLInputElement>('sm-pitch')).value = '1210';
          (el<HTMLInputElement>('sm-pps')).value = '1';
          (el<HTMLInputElement>('sm-spm')).value = '20';
          (el<HTMLInputElement>('sm-oee')).value = '0.80';
          (el<HTMLInputElement>('sm-manning')).value = '0.5';
          (el<HTMLInputElement>('sm-lab-eff')).value = '0.92';
          (el<HTMLInputElement>('sm-num-ops')).value = '2';
          (el<HTMLInputElement>('sm-die-cost')).value = '180000';
          (el<HTMLInputElement>('sm-die-life')).value = '200000';
          (el<HTMLInputElement>('sm-amort')).value = '80000';
          (el<HTMLInputElement>('packaging')).value = '1.50';
          (el<HTMLInputElement>('logistics')).value = '2.50';
          (el<HTMLInputElement>('overhead-pct')).value = '10';
          (el<HTMLInputElement>('margin-pct')).value = '8';
        } else if (slot === 2) {
          (el<HTMLInputElement>('part-name')).value = 'Mercedes GLE B-Pillar Reinforcement';
          const matEl = el<HTMLSelectElement>('sm-mat');
          if (matEl) { const o = Array.from(matEl.options).find(x => x.value === 'mat-dp600'); if (o) matEl.value = o.value; }
          (el<HTMLInputElement>('sm-net-wt')).value = '3.20';
          (el<HTMLInputElement>('sm-blank-l')).value = '900';
          (el<HTMLInputElement>('sm-blank-w')).value = '200';
          (el<HTMLInputElement>('sm-thick')).value = '1.8';
          (el<HTMLInputElement>('sm-perim')).value = '2200';
          (el<HTMLInputElement>('sm-shear')).value = '600';
          (el<HTMLInputElement>('sm-strip-w')).value = '210';
          (el<HTMLInputElement>('sm-pitch')).value = '910';
          (el<HTMLInputElement>('sm-pps')).value = '1';
          (el<HTMLInputElement>('sm-spm')).value = '35';
          (el<HTMLInputElement>('sm-oee')).value = '0.82';
          (el<HTMLInputElement>('sm-manning')).value = '0.5';
          (el<HTMLInputElement>('sm-lab-eff')).value = '0.95';
          (el<HTMLInputElement>('sm-num-ops')).value = '1';
          (el<HTMLInputElement>('sm-die-cost')).value = '120000';
          (el<HTMLInputElement>('sm-die-life')).value = '500000';
          (el<HTMLInputElement>('sm-amort')).value = '200000';
          (el<HTMLInputElement>('packaging')).value = '0.80';
          (el<HTMLInputElement>('logistics')).value = '1.80';
          (el<HTMLInputElement>('overhead-pct')).value = '10';
          (el<HTMLInputElement>('margin-pct')).value = '7';
        } else {
          (el<HTMLInputElement>('part-name')).value = 'Ford Bronco Sport Floor Cross-Member';
          const matEl3 = el<HTMLSelectElement>('sm-mat');
          if (matEl3) { const o = Array.from(matEl3.options).find(x => x.value === 'mat-dp600'); if (o) matEl3.value = o.value; }
          (el<HTMLInputElement>('sm-net-wt')).value = '4.20';
          (el<HTMLInputElement>('sm-blank-l')).value = '900';
          (el<HTMLInputElement>('sm-blank-w')).value = '420';
          (el<HTMLInputElement>('sm-thick')).value = '2.0';
          (el<HTMLInputElement>('sm-perim')).value = '2640';
          (el<HTMLInputElement>('sm-shear')).value = '480';
          (el<HTMLInputElement>('sm-strip-w')).value = '435';
          (el<HTMLInputElement>('sm-pitch')).value = '915';
          (el<HTMLInputElement>('sm-pps')).value = '1';
          (el<HTMLInputElement>('sm-spm')).value = '30';
          (el<HTMLInputElement>('sm-oee')).value = '0.82';
          (el<HTMLInputElement>('sm-manning')).value = '0.5';
          (el<HTMLInputElement>('sm-lab-eff')).value = '0.95';
          (el<HTMLInputElement>('sm-num-ops')).value = '3';
          (el<HTMLInputElement>('sm-die-cost')).value = '138000';
          (el<HTMLInputElement>('sm-die-life')).value = '800000';
          (el<HTMLInputElement>('sm-amort')).value = '300000';
          (el<HTMLInputElement>('packaging')).value = '0.90';
          (el<HTMLInputElement>('logistics')).value = '2.00';
          (el<HTMLInputElement>('overhead-pct')).value = '10';
          (el<HTMLInputElement>('margin-pct')).value = '8';
        }
        compute();
        setTimeout(switchToInsights, 300);
        break;
      }

      case 'sheet_metal_fab': {
        if (slot === 3) {
          (el<HTMLInputElement>('part-name')).value = 'Volvo XC60 Rear Subframe Mount Bracket';
          const matEl3 = el<HTMLSelectElement>('smf-mat');
          if (matEl3) { const o = Array.from(matEl3.options).find(x => x.value === 'mat-dc01'); if (o) matEl3.value = o.value; }
          (el<HTMLInputElement>('smf-part-wt')).value = '2.80';
          (el<HTMLInputElement>('smf-mat-util')).value = '0.80';
          (el<HTMLInputElement>('smf-tolerance')).value = '0.50';
          const blankMeth3 = el<HTMLSelectElement>('smf-blank-method');
          if (blankMeth3) blankMeth3.value = 'laser';
          (el<HTMLInputElement>('smf-blank-ct')).value = '95';
          const blankMach3 = el<HTMLSelectElement>('smf-blank-mach');
          if (blankMach3) { const o = Array.from(blankMach3.options).find(x => x.value === 'laser-trumpf-3030'); if (o) blankMach3.value = o.value; }
          const blankLab3 = el<HTMLSelectElement>('smf-blank-lab');
          if (blankLab3) { const o = Array.from(blankLab3.options).find(x => x.value === 'lab-uk-skilled'); if (o) blankLab3.value = o.value; }
          (el<HTMLInputElement>('smf-bends')).value = '5';
          (el<HTMLInputElement>('smf-bend-t')).value = '55';
          const brakeMach3 = el<HTMLSelectElement>('smf-brake-mach');
          if (brakeMach3) { const o = Array.from(brakeMach3.options).find(x => x.value === 'brake-amada-hfe100'); if (o) brakeMach3.value = o.value; }
          const brakeLab3 = el<HTMLSelectElement>('smf-brake-lab');
          if (brakeLab3) { const o = Array.from(brakeLab3.options).find(x => x.value === 'lab-uk-skilled'); if (o) brakeLab3.value = o.value; }
          (el<HTMLInputElement>('smf-oee')).value = '0.82';
          (el<HTMLInputElement>('smf-manning')).value = '1';
          (el<HTMLInputElement>('smf-lab-eff')).value = '0.92';
          (el<HTMLInputElement>('smf-reject')).value = '0.015';
          // Spot weld only
          (el<HTMLInputElement>('smf-sw-count')).value = '6';
          (el<HTMLInputElement>('smf-sw-t')).value = '4';
          const swMach3 = el<HTMLSelectElement>('smf-sw-mach');
          if (swMach3) { const o = Array.from(swMach3.options).find(x => x.value === 'robot-spotweld-kuka'); if (o) swMach3.value = o.value; }
          const swLab3 = el<HTMLSelectElement>('smf-sw-lab');
          if (swLab3) { const o = Array.from(swLab3.options).find(x => x.value === 'lab-uk-skilled'); if (o) swLab3.value = o.value; }
          (el<HTMLInputElement>('smf-mig-len')).value = '0';
          (el<HTMLInputElement>('smf-tooling')).value = '3500';
          (el<HTMLInputElement>('smf-amort')).value = '12000';
          (el<HTMLInputElement>('packaging')).value = '0.55';
          (el<HTMLInputElement>('logistics')).value = '1.20';
          (el<HTMLInputElement>('overhead-pct')).value = '10';
          (el<HTMLInputElement>('margin-pct')).value = '8';
        } else {
          (el<HTMLInputElement>('part-name')).value = slot === 1 ? 'Audi Q7 Side Sill Bracket' : 'BMW X5 Engine Undertray Bracket';
          const matEl = el<HTMLSelectElement>('smf-mat');
          if (matEl) { const o = Array.from(matEl.options).find(x => x.value === 'mat-dc01'); if (o) matEl.value = o.value; }
          (el<HTMLInputElement>('smf-part-wt')).value = slot === 1 ? '1.85' : '0.95';
          (el<HTMLInputElement>('smf-mat-util')).value = slot === 1 ? '0.82' : '0.85';
          (el<HTMLInputElement>('smf-tolerance')).value = '0.5';
          const blankMeth = el<HTMLSelectElement>('smf-blank-method');
          if (blankMeth) blankMeth.value = 'laser';
          (el<HTMLInputElement>('smf-blank-ct')).value = slot === 1 ? '120' : '75';
          const blankMach = el<HTMLSelectElement>('smf-blank-mach');
          if (blankMach) { const o = Array.from(blankMach.options).find(x => x.value === (slot === 1 ? 'laser-trumpf-3030' : 'laser-bystronic-3015')); if (o) blankMach.value = o.value; }
          const blankLab = el<HTMLSelectElement>('smf-blank-lab');
          if (blankLab) { const o = Array.from(blankLab.options).find(x => x.value === 'lab-uk-skilled'); if (o) blankLab.value = o.value; }
          (el<HTMLInputElement>('smf-bends')).value = slot === 1 ? '4' : '3';
          (el<HTMLInputElement>('smf-bend-t')).value = slot === 1 ? '60' : '45';
          const brakeMach = el<HTMLSelectElement>('smf-brake-mach');
          if (brakeMach) { const o = Array.from(brakeMach.options).find(x => x.value === 'brake-amada-hfe100'); if (o) brakeMach.value = o.value; }
          const brakeLab = el<HTMLSelectElement>('smf-brake-lab');
          if (brakeLab) { const o = Array.from(brakeLab.options).find(x => x.value === 'lab-uk-skilled'); if (o) brakeLab.value = o.value; }
          (el<HTMLInputElement>('smf-oee')).value = slot === 1 ? '0.80' : '0.82';
          (el<HTMLInputElement>('smf-manning')).value = '1';
          (el<HTMLInputElement>('smf-lab-eff')).value = '0.92';
          (el<HTMLInputElement>('smf-reject')).value = '0.01';
          if (slot === 1) {
            // MIG weld
            (el<HTMLInputElement>('smf-mig-len')).value = '0.60';
            (el<HTMLInputElement>('smf-mig-spd')).value = '0.30';
            const migMach = el<HTMLSelectElement>('smf-mig-mach');
            if (migMach) { const o = Array.from(migMach.options).find(x => x.value === 'mig-welder-manual'); if (o) migMach.value = o.value; }
            const migLab = el<HTMLSelectElement>('smf-mig-lab');
            if (migLab) { const o = Array.from(migLab.options).find(x => x.value === 'lab-uk-skilled'); if (o) migLab.value = o.value; }
            (el<HTMLInputElement>('smf-mig-cons')).value = '0.40';
            (el<HTMLInputElement>('smf-sw-count')).value = '0';
          } else {
            // Spot weld
            (el<HTMLInputElement>('smf-sw-count')).value = '8';
            (el<HTMLInputElement>('smf-sw-t')).value = '3';
            const swMach = el<HTMLSelectElement>('smf-sw-mach');
            if (swMach) { const o = Array.from(swMach.options).find(x => x.value === 'robot-spotweld-kuka'); if (o) swMach.value = o.value; }
            const swLab = el<HTMLSelectElement>('smf-sw-lab');
            if (swLab) { const o = Array.from(swLab.options).find(x => x.value === 'lab-uk-skilled'); if (o) swLab.value = o.value; }
            (el<HTMLInputElement>('smf-mig-len')).value = '0';
          }
          (el<HTMLInputElement>('smf-tooling')).value = slot === 1 ? '3000' : '2500';
          (el<HTMLInputElement>('smf-amort')).value = slot === 1 ? '10000' : '15000';
          (el<HTMLInputElement>('packaging')).value = '0.35';
          (el<HTMLInputElement>('logistics')).value = '0.75';
          (el<HTMLInputElement>('overhead-pct')).value = '10';
          (el<HTMLInputElement>('margin-pct')).value = '8';
        }
        compute();
        setTimeout(switchToInsights, 300);
        break;
      }

      case 'injection_moulding': {
        if (slot === 3) {
          (el<HTMLInputElement>('part-name')).value = 'Toyota RAV4 Rear Bumper Fascia';
          const matEl3 = el<HTMLSelectElement>('imm-mat');
          if (matEl3) { const o = Array.from(matEl3.options).find(x => x.value === 'mat-pp'); if (o) matEl3.value = o.value; }
          (el<HTMLInputElement>('imm-part-wt')).value = '1.85';
          const runnerSys3 = el<HTMLSelectElement>('imm-runner-sys');
          if (runnerSys3) runnerSys3.value = 'cold';
          (el<HTMLInputElement>('imm-runner-wt')).value = '0.28';
          (el<HTMLInputElement>('imm-regrind')).value = '0.3';
          (el<HTMLInputElement>('imm-cav')).value = '2';
          (el<HTMLInputElement>('imm-area')).value = '750';
          (el<HTMLInputElement>('imm-cav-press')).value = '35';
          (el<HTMLInputElement>('imm-wall')).value = '3.0';
          (el<HTMLInputElement>('imm-cool-f')).value = '3.16';
          (el<HTMLInputElement>('imm-fill')).value = '2.5';
          (el<HTMLInputElement>('imm-pack')).value = '4.0';
          (el<HTMLInputElement>('imm-eject')).value = '3';
          const immMach3 = el<HTMLSelectElement>('imm-mach');
          if (immMach3) { const o = Array.from(immMach3.options).find(x => x.value === 'imm-800t') || Array.from(immMach3.options).find(x => x.value === 'imm-400t'); if (o) immMach3.value = o.value; }
          const immLab3 = el<HTMLSelectElement>('imm-lab');
          if (immLab3) { const o = Array.from(immLab3.options).find(x => x.value === 'lab-uk-skilled'); if (o) immLab3.value = o.value; }
          (el<HTMLInputElement>('imm-oee')).value = '0.85';
          (el<HTMLInputElement>('imm-manning')).value = '0.5';
          (el<HTMLInputElement>('imm-lab-eff')).value = '0.95';
          (el<HTMLInputElement>('imm-tolerance')).value = '0.5';
          const immFinish3 = el<HTMLSelectElement>('imm-finish');
          if (immFinish3) immFinish3.value = 'textured';
          (el<HTMLInputElement>('imm-mould-cost')).value = '72000';
          (el<HTMLInputElement>('imm-mould-life')).value = '500000';
          (el<HTMLInputElement>('imm-amort')).value = '80000';
          (el<HTMLInputElement>('packaging')).value = '0.65';
          (el<HTMLInputElement>('logistics')).value = '1.50';
          (el<HTMLInputElement>('overhead-pct')).value = '10';
          (el<HTMLInputElement>('margin-pct')).value = '8';
        } else {
          (el<HTMLInputElement>('part-name')).value = slot === 1 ? 'Range Rover Sport Grille Housing' : 'Bentley Bentayga Centre Console Trim';
          const matEl = el<HTMLSelectElement>('imm-mat');
          if (matEl) { const o = Array.from(matEl.options).find(x => x.value === (slot === 1 ? 'mat-abs' : 'mat-pc-abs')); if (o) matEl.value = o.value; }
          (el<HTMLInputElement>('imm-part-wt')).value = slot === 1 ? '0.45' : '0.38';
          const runnerSys = el<HTMLSelectElement>('imm-runner-sys');
          if (runnerSys) runnerSys.value = slot === 1 ? 'cold' : 'hot';
          (el<HTMLInputElement>('imm-runner-wt')).value = slot === 1 ? '0.08' : '0';
          (el<HTMLInputElement>('imm-regrind')).value = slot === 1 ? '0.2' : '0';
          (el<HTMLInputElement>('imm-cav')).value = slot === 1 ? '2' : '1';
          (el<HTMLInputElement>('imm-area')).value = slot === 1 ? '180' : '220';
          (el<HTMLInputElement>('imm-cav-press')).value = slot === 1 ? '25' : '30';
          (el<HTMLInputElement>('imm-wall')).value = slot === 1 ? '2.5' : '2.8';
          (el<HTMLInputElement>('imm-cool-f')).value = slot === 1 ? '3.16' : '2.2';
          (el<HTMLInputElement>('imm-fill')).value = slot === 1 ? '2' : '3';
          (el<HTMLInputElement>('imm-pack')).value = slot === 1 ? '4' : '5';
          (el<HTMLInputElement>('imm-eject')).value = '3';
          const immMach = el<HTMLSelectElement>('imm-mach');
          if (immMach) { const o = Array.from(immMach.options).find(x => x.value === 'imm-400t'); if (o) immMach.value = o.value; }
          const immLab = el<HTMLSelectElement>('imm-lab');
          if (immLab) { const o = Array.from(immLab.options).find(x => x.value === 'lab-uk-skilled'); if (o) immLab.value = o.value; }
          (el<HTMLInputElement>('imm-oee')).value = '0.85';
          (el<HTMLInputElement>('imm-manning')).value = '0.25';
          (el<HTMLInputElement>('imm-lab-eff')).value = '0.95';
          (el<HTMLInputElement>('imm-tolerance')).value = slot === 1 ? '0.3' : '0.1';
          const immFinish = el<HTMLSelectElement>('imm-finish');
          if (immFinish) immFinish.value = slot === 1 ? 'textured' : 'high_gloss';
          (el<HTMLInputElement>('imm-mould-cost')).value = slot === 1 ? '55000' : '95000';
          (el<HTMLInputElement>('imm-mould-life')).value = slot === 1 ? '500000' : '300000';
          (el<HTMLInputElement>('imm-amort')).value = slot === 1 ? '100000' : '50000';
          (el<HTMLInputElement>('packaging')).value = '0.20';
          (el<HTMLInputElement>('logistics')).value = '0.45';
          (el<HTMLInputElement>('overhead-pct')).value = '11';
          (el<HTMLInputElement>('margin-pct')).value = '9';
        }
        compute();
        setTimeout(switchToInsights, 300);
        break;
      }

      case 'blow_moulding': {
        if (slot === 3) {
          (el<HTMLInputElement>('part-name')).value = 'Volvo XC90 Windscreen Washer Fluid Reservoir';
          const matEl3 = el<HTMLSelectElement>('bm-mat');
          if (matEl3) { const o = Array.from(matEl3.options).find(x => x.value === 'mat-hdpe'); if (o) matEl3.value = o.value; }
          (el<HTMLInputElement>('bm-part-wt')).value = '0.48';
          (el<HTMLInputElement>('bm-flash-wt')).value = '0.05';
          (el<HTMLInputElement>('bm-wall')).value = '2.2';
          (el<HTMLInputElement>('bm-cool-f')).value = '3.5';
          (el<HTMLInputElement>('bm-blow-t')).value = '7';
          (el<HTMLInputElement>('bm-open-close')).value = '6';
          (el<HTMLInputElement>('bm-cav')).value = '2';
          const bmMach3 = el<HTMLSelectElement>('bm-mach');
          if (bmMach3) { const o = Array.from(bmMach3.options).find(x => x.value === 'blow-ebm-100l'); if (o) bmMach3.value = o.value; }
          const bmLab3 = el<HTMLSelectElement>('bm-lab');
          if (bmLab3) { const o = Array.from(bmLab3.options).find(x => x.value === 'lab-uk-skilled'); if (o) bmLab3.value = o.value; }
          (el<HTMLInputElement>('bm-oee')).value = '0.82';
          (el<HTMLInputElement>('bm-manning')).value = '0.5';
          (el<HTMLInputElement>('bm-lab-eff')).value = '0.95';
          (el<HTMLInputElement>('bm-mould-cost')).value = '12000';
          (el<HTMLInputElement>('bm-mould-life')).value = '800000';
          (el<HTMLInputElement>('bm-amort')).value = '150000';
          (el<HTMLInputElement>('packaging')).value = '0.10';
          (el<HTMLInputElement>('logistics')).value = '0.25';
          (el<HTMLInputElement>('overhead-pct')).value = '10';
          (el<HTMLInputElement>('margin-pct')).value = '8';
        } else {
          (el<HTMLInputElement>('part-name')).value = slot === 1 ? 'BMW X7 Washer Fluid Reservoir' : 'Land Rover Defender Coolant Tank';
          const matEl = el<HTMLSelectElement>('bm-mat');
          if (matEl) { const o = Array.from(matEl.options).find(x => x.value === 'mat-hdpe'); if (o) matEl.value = o.value; }
          (el<HTMLInputElement>('bm-part-wt')).value = slot === 1 ? '0.35' : '0.55';
          (el<HTMLInputElement>('bm-flash-wt')).value = slot === 1 ? '0.04' : '0.06';
          (el<HTMLInputElement>('bm-wall')).value = slot === 1 ? '2.0' : '2.5';
          (el<HTMLInputElement>('bm-cool-f')).value = '3.5';
          (el<HTMLInputElement>('bm-blow-t')).value = slot === 1 ? '6' : '7';
          (el<HTMLInputElement>('bm-open-close')).value = slot === 1 ? '5' : '6';
          (el<HTMLInputElement>('bm-cav')).value = slot === 1 ? '2' : '1';
          const bmMach = el<HTMLSelectElement>('bm-mach');
          if (bmMach) { const o = Array.from(bmMach.options).find(x => x.value === 'blow-ebm-100l'); if (o) bmMach.value = o.value; }
          const bmLab = el<HTMLSelectElement>('bm-lab');
          if (bmLab) { const o = Array.from(bmLab.options).find(x => x.value === 'lab-uk-skilled'); if (o) bmLab.value = o.value; }
          (el<HTMLInputElement>('bm-oee')).value = slot === 1 ? '0.82' : '0.80';
          (el<HTMLInputElement>('bm-manning')).value = '0.5';
          (el<HTMLInputElement>('bm-lab-eff')).value = '0.95';
          (el<HTMLInputElement>('bm-mould-cost')).value = slot === 1 ? '14000' : '18000';
          (el<HTMLInputElement>('bm-mould-life')).value = slot === 1 ? '1000000' : '800000';
          (el<HTMLInputElement>('bm-amort')).value = slot === 1 ? '200000' : '100000';
          (el<HTMLInputElement>('packaging')).value = '0.12';
          (el<HTMLInputElement>('logistics')).value = '0.30';
          (el<HTMLInputElement>('overhead-pct')).value = '10';
          (el<HTMLInputElement>('margin-pct')).value = '8';
        }
        compute();
        setTimeout(switchToInsights, 300);
        break;
      }

      case 'extrusion': {
        if (slot === 3) {
          (el<HTMLInputElement>('part-name')).value = 'BMW X5 M Rear Bumper Rubber Trim Profile';
          const matEl3 = el<HTMLSelectElement>('ext-mat');
          if (matEl3) { const o = Array.from(matEl3.options).find(x => x.value === 'mat-epdm') || Array.from(matEl3.options).find(x => x.value === 'mat-fpvc'); if (o) matEl3.value = o.value; }
          (el<HTMLInputElement>('ext-kg-per-m')).value = '0.22';
          (el<HTMLInputElement>('ext-length')).value = '1.60';
          (el<HTMLInputElement>('ext-rate')).value = '90';
          (el<HTMLInputElement>('ext-scrap')).value = '0.04';
          const extMach3 = el<HTMLSelectElement>('ext-mach');
          if (extMach3) { const o = Array.from(extMach3.options).find(x => x.value === 'extruder-75mm'); if (o) extMach3.value = o.value; }
          const extLab3 = el<HTMLSelectElement>('ext-lab');
          if (extLab3) { const o = Array.from(extLab3.options).find(x => x.value === 'lab-uk-skilled'); if (o) extLab3.value = o.value; }
          (el<HTMLInputElement>('ext-oee')).value = '0.80';
          (el<HTMLInputElement>('ext-manning')).value = '1';
          (el<HTMLInputElement>('ext-lab-eff')).value = '0.95';
          (el<HTMLInputElement>('ext-die-cost')).value = '2800';
          (el<HTMLInputElement>('ext-amort')).value = '30000';
          (el<HTMLInputElement>('packaging')).value = '0.06';
          (el<HTMLInputElement>('logistics')).value = '0.12';
          (el<HTMLInputElement>('overhead-pct')).value = '9';
          (el<HTMLInputElement>('margin-pct')).value = '7';
        } else {
          (el<HTMLInputElement>('part-name')).value = slot === 1 ? 'Rolls-Royce Cullinan Door Seal Profile' : 'Range Rover Vogue Weatherstrip Profile';
          const matEl = el<HTMLSelectElement>('ext-mat');
          if (matEl) { const o = Array.from(matEl.options).find(x => x.value === 'mat-fpvc'); if (o) matEl.value = o.value; }
          (el<HTMLInputElement>('ext-kg-per-m')).value = slot === 1 ? '0.18' : '0.12';
          (el<HTMLInputElement>('ext-length')).value = slot === 1 ? '2.4' : '3.2';
          (el<HTMLInputElement>('ext-rate')).value = slot === 1 ? '120' : '150';
          (el<HTMLInputElement>('ext-scrap')).value = slot === 1 ? '0.04' : '0.03';
          const extMach = el<HTMLSelectElement>('ext-mach');
          if (extMach) { const o = Array.from(extMach.options).find(x => x.value === 'extruder-75mm'); if (o) extMach.value = o.value; }
          const extLab = el<HTMLSelectElement>('ext-lab');
          if (extLab) { const o = Array.from(extLab.options).find(x => x.value === 'lab-uk-skilled'); if (o) extLab.value = o.value; }
          (el<HTMLInputElement>('ext-oee')).value = '0.82';
          (el<HTMLInputElement>('ext-manning')).value = '1';
          (el<HTMLInputElement>('ext-lab-eff')).value = '0.95';
          (el<HTMLInputElement>('ext-die-cost')).value = slot === 1 ? '3500' : '4500';
          (el<HTMLInputElement>('ext-amort')).value = slot === 1 ? '50000' : '80000';
          (el<HTMLInputElement>('packaging')).value = '0.08';
          (el<HTMLInputElement>('logistics')).value = '0.15';
          (el<HTMLInputElement>('overhead-pct')).value = '9';
          (el<HTMLInputElement>('margin-pct')).value = '7';
        }
        compute();
        setTimeout(switchToInsights, 300);
        break;
      }

      case 'thermoforming': {
        if (slot === 3) {
          (el<HTMLInputElement>('part-name')).value = 'Land Rover Defender Spare Wheel Carrier Cover';
          const matEl3 = el<HTMLSelectElement>('tf-mat');
          if (matEl3) { const o = Array.from(matEl3.options).find(x => x.value === 'mat-abs'); if (o) matEl3.value = o.value; }
          (el<HTMLInputElement>('tf-sheet-wt')).value = '2.10';
          (el<HTMLInputElement>('tf-part-wt')).value = '1.15';
          (el<HTMLInputElement>('tf-pps')).value = '1';
          const tfMeth3 = el<HTMLSelectElement>('tf-method');
          if (tfMeth3) tfMeth3.value = 'vacuum';
          (el<HTMLInputElement>('tf-heat')).value = '55';
          (el<HTMLInputElement>('tf-form')).value = '18';
          (el<HTMLInputElement>('tf-trim')).value = '28';
          (el<HTMLInputElement>('tf-index')).value = '12';
          const tfMach3 = el<HTMLSelectElement>('tf-mach');
          if (tfMach3) { const o = Array.from(tfMach3.options).find(x => x.value === 'thermoform-large'); if (o) tfMach3.value = o.value; }
          const tfLab3 = el<HTMLSelectElement>('tf-lab');
          if (tfLab3) { const o = Array.from(tfLab3.options).find(x => x.value === 'lab-uk-skilled'); if (o) tfLab3.value = o.value; }
          (el<HTMLInputElement>('tf-oee')).value = '0.80';
          (el<HTMLInputElement>('tf-manning')).value = '1';
          (el<HTMLInputElement>('tf-lab-eff')).value = '0.92';
          (el<HTMLInputElement>('tf-tool-cost')).value = '9500';
          (el<HTMLInputElement>('tf-amort')).value = '15000';
          (el<HTMLInputElement>('packaging')).value = '0.55';
          (el<HTMLInputElement>('logistics')).value = '1.00';
          (el<HTMLInputElement>('overhead-pct')).value = '10';
          (el<HTMLInputElement>('margin-pct')).value = '8';
        } else {
          (el<HTMLInputElement>('part-name')).value = slot === 1 ? 'Mercedes GLS Boot / Cargo Liner' : 'Porsche Cayenne Dashboard Lower Cover';
          const matEl = el<HTMLSelectElement>('tf-mat');
          if (matEl) { const o = Array.from(matEl.options).find(x => x.value === (slot === 1 ? 'mat-hips' : 'mat-abs')); if (o) matEl.value = o.value; }
          (el<HTMLInputElement>('tf-sheet-wt')).value = slot === 1 ? '2.80' : '1.85';
          (el<HTMLInputElement>('tf-part-wt')).value = slot === 1 ? '0.92' : '0.65';
          (el<HTMLInputElement>('tf-pps')).value = '1';
          const tfMeth = el<HTMLSelectElement>('tf-method');
          if (tfMeth) tfMeth.value = slot === 1 ? 'vacuum' : 'pressure';
          (el<HTMLInputElement>('tf-heat')).value = slot === 1 ? '60' : '45';
          (el<HTMLInputElement>('tf-form')).value = slot === 1 ? '15' : '12';
          (el<HTMLInputElement>('tf-trim')).value = slot === 1 ? '30' : '25';
          (el<HTMLInputElement>('tf-index')).value = slot === 1 ? '12' : '10';
          const tfMach = el<HTMLSelectElement>('tf-mach');
          if (tfMach) { const o = Array.from(tfMach.options).find(x => x.value === 'thermoform-large'); if (o) tfMach.value = o.value; }
          const tfLab = el<HTMLSelectElement>('tf-lab');
          if (tfLab) { const o = Array.from(tfLab.options).find(x => x.value === 'lab-uk-skilled'); if (o) tfLab.value = o.value; }
          (el<HTMLInputElement>('tf-oee')).value = '0.80';
          (el<HTMLInputElement>('tf-manning')).value = '1';
          (el<HTMLInputElement>('tf-lab-eff')).value = '0.92';
          (el<HTMLInputElement>('tf-tool-cost')).value = slot === 1 ? '8000' : '12000';
          (el<HTMLInputElement>('tf-amort')).value = slot === 1 ? '20000' : '15000';
          (el<HTMLInputElement>('packaging')).value = slot === 1 ? '0.45' : '0.30';
          (el<HTMLInputElement>('logistics')).value = slot === 1 ? '0.80' : '0.60';
          (el<HTMLInputElement>('overhead-pct')).value = '10';
          (el<HTMLInputElement>('margin-pct')).value = '8';
        }
        compute();
        setTimeout(switchToInsights, 300);
        break;
      }

      case 'rotational_moulding': {
        if (slot === 3) {
          (el<HTMLInputElement>('part-name')).value = 'Jeep Grand Cherokee Air Intake Snorkel Box';
          const matEl3 = el<HTMLSelectElement>('rm-mat');
          if (matEl3) { const o = Array.from(matEl3.options).find(x => x.value === 'mat-lldpe'); if (o) matEl3.value = o.value; }
          (el<HTMLInputElement>('rm-part-wt')).value = '2.80';
          (el<HTMLInputElement>('rm-powder-adder')).value = '0.25';
          (el<HTMLInputElement>('rm-parts-per-arm')).value = '2';
          (el<HTMLInputElement>('rm-heat')).value = '1100';
          (el<HTMLInputElement>('rm-cool')).value = '1300';
          (el<HTMLInputElement>('rm-load')).value = '210';
          const rmMach3 = el<HTMLSelectElement>('rm-mach');
          if (rmMach3) { const o = Array.from(rmMach3.options).find(x => x.value === 'rotomould-biaxial'); if (o) rmMach3.value = o.value; }
          const rmLab3 = el<HTMLSelectElement>('rm-lab');
          if (rmLab3) { const o = Array.from(rmLab3.options).find(x => x.value === 'lab-uk-skilled'); if (o) rmLab3.value = o.value; }
          (el<HTMLInputElement>('rm-oee')).value = '0.78';
          (el<HTMLInputElement>('rm-manning')).value = '2';
          (el<HTMLInputElement>('rm-lab-eff')).value = '0.90';
          (el<HTMLInputElement>('rm-mould-cost')).value = '18000';
          (el<HTMLInputElement>('rm-mould-life')).value = '120000';
          (el<HTMLInputElement>('rm-amort')).value = '25000';
          (el<HTMLInputElement>('packaging')).value = '0.60';
          (el<HTMLInputElement>('logistics')).value = '1.10';
          (el<HTMLInputElement>('overhead-pct')).value = '11';
          (el<HTMLInputElement>('margin-pct')).value = '9';
        } else {
          (el<HTMLInputElement>('part-name')).value = slot === 1 ? 'Land Rover Defender Fuel Tank (40L)' : 'Mercedes G-Class Roof Storage Box';
          const matEl = el<HTMLSelectElement>('rm-mat');
          if (matEl) { const o = Array.from(matEl.options).find(x => x.value === 'mat-lldpe'); if (o) matEl.value = o.value; }
          (el<HTMLInputElement>('rm-part-wt')).value = slot === 1 ? '3.80' : '6.50';
          (el<HTMLInputElement>('rm-powder-adder')).value = slot === 1 ? '0.28' : '0.30';
          (el<HTMLInputElement>('rm-parts-per-arm')).value = '1';
          (el<HTMLInputElement>('rm-heat')).value = slot === 1 ? '1200' : '1500';
          (el<HTMLInputElement>('rm-cool')).value = slot === 1 ? '1500' : '1800';
          (el<HTMLInputElement>('rm-load')).value = slot === 1 ? '240' : '300';
          const rmMach = el<HTMLSelectElement>('rm-mach');
          if (rmMach) { const o = Array.from(rmMach.options).find(x => x.value === 'rotomould-biaxial'); if (o) rmMach.value = o.value; }
          const rmLab = el<HTMLSelectElement>('rm-lab');
          if (rmLab) { const o = Array.from(rmLab.options).find(x => x.value === 'lab-uk-skilled'); if (o) rmLab.value = o.value; }
          (el<HTMLInputElement>('rm-oee')).value = '0.75';
          (el<HTMLInputElement>('rm-manning')).value = '2';
          (el<HTMLInputElement>('rm-lab-eff')).value = '0.90';
          (el<HTMLInputElement>('rm-mould-cost')).value = slot === 1 ? '22000' : '28000';
          (el<HTMLInputElement>('rm-mould-life')).value = slot === 1 ? '100000' : '80000';
          (el<HTMLInputElement>('rm-amort')).value = slot === 1 ? '20000' : '10000';
          (el<HTMLInputElement>('packaging')).value = slot === 1 ? '0.80' : '1.20';
          (el<HTMLInputElement>('logistics')).value = slot === 1 ? '1.50' : '2.00';
          (el<HTMLInputElement>('overhead-pct')).value = '11';
          (el<HTMLInputElement>('margin-pct')).value = '9';
        }
        compute();
        setTimeout(switchToInsights, 300);
        break;
      }

      case 'casting': {
        if (slot === 3) {
          (el<HTMLInputElement>('part-name')).value = 'Toyota Hilux Rear Differential Carrier (Sand Cast)';
          const subEl3 = el<HTMLSelectElement>('cast-subtype');
          if (subEl3) { subEl3.value = 'sand'; subEl3.dispatchEvent(new Event('change')); }
          const matEl3 = el<HTMLSelectElement>('cast-mat');
          if (matEl3) { const o = Array.from(matEl3.options).find(x => x.value === 'mat-gjl350') || Array.from(matEl3.options).find(x => x.value === 'mat-gjl250'); if (o) matEl3.value = o.value; }
          (el<HTMLInputElement>('cast-part-wt')).value = '8.50';
          (el<HTMLInputElement>('cast-yield')).value = '0.78';
          (el<HTMLInputElement>('cast-reject')).value = '0.03';
          const castLab3 = el<HTMLSelectElement>('cast-lab');
          if (castLab3) { const o = Array.from(castLab3.options).find(x => x.value === 'lab-uk-foundry'); if (o) castLab3.value = o.value; }
          (el<HTMLInputElement>('cast-oee')).value = '0.78';
          (el<HTMLInputElement>('cast-manning')).value = '2';
          (el<HTMLInputElement>('cast-lab-eff')).value = '0.90';
          (el<HTMLInputElement>('cast-amort')).value = '50000';
          const sandCt3 = el<HTMLInputElement>('cast-sand-ct');
          if (sandCt3) sandCt3.value = '0.575';
          const sandPat3 = el<HTMLInputElement>('cast-sand-pat-cost');
          if (sandPat3) sandPat3.value = '28000';
          const sandPatLife3 = el<HTMLInputElement>('cast-sand-pat-life');
          if (sandPatLife3) sandPatLife3.value = '8000';
          (el<HTMLInputElement>('packaging')).value = '1.20';
          (el<HTMLInputElement>('logistics')).value = '2.80';
          (el<HTMLInputElement>('overhead-pct')).value = '11';
          (el<HTMLInputElement>('margin-pct')).value = '9';
        } else {
          (el<HTMLInputElement>('part-name')).value = slot === 1 ? 'Bentley Bentayga Differential Housing (HPDC)' : 'Rolls-Royce Cullinan Brake Caliper (HPDC)';
          const subEl = el<HTMLSelectElement>('cast-subtype');
          if (subEl) { subEl.value = 'hpdc'; subEl.dispatchEvent(new Event('change')); }
          const matEl = el<HTMLSelectElement>('cast-mat');
          if (matEl) { const o = Array.from(matEl.options).find(x => x.value === (slot === 1 ? 'mat-adc12' : 'mat-a380')); if (o) matEl.value = o.value; }
          (el<HTMLInputElement>('cast-part-wt')).value = slot === 1 ? '4.80' : '3.20';
          (el<HTMLInputElement>('cast-yield')).value = slot === 1 ? '0.65' : '0.62';
          (el<HTMLInputElement>('cast-reject')).value = slot === 1 ? '0.025' : '0.02';
          const castLab = el<HTMLSelectElement>('cast-lab');
          if (castLab) { const o = Array.from(castLab.options).find(x => x.value === 'lab-uk-foundry'); if (o) castLab.value = o.value; }
          (el<HTMLInputElement>('cast-oee')).value = '0.80';
          (el<HTMLInputElement>('cast-manning')).value = '2';
          (el<HTMLInputElement>('cast-lab-eff')).value = '0.92';
          (el<HTMLInputElement>('cast-amort')).value = slot === 1 ? '100000' : '80000';
          const hpdcMach = el<HTMLSelectElement>('cast-hpdc-mach');
          if (hpdcMach) { const o = Array.from(hpdcMach.options).find(x => x.value === 'hpdc-800t'); if (o) hpdcMach.value = o.value; }
          (el<HTMLInputElement>('cast-hpdc-ct')).value = slot === 1 ? '75' : '60';
          (el<HTMLInputElement>('cast-hpdc-cav')).value = '1';
          (el<HTMLInputElement>('cast-hpdc-die-cost')).value = slot === 1 ? '180000' : '140000';
          (el<HTMLInputElement>('cast-hpdc-die-life')).value = slot === 1 ? '150000' : '180000';
          (el<HTMLInputElement>('packaging')).value = slot === 1 ? '0.80' : '0.60';
          (el<HTMLInputElement>('logistics')).value = slot === 1 ? '1.80' : '1.40';
          (el<HTMLInputElement>('overhead-pct')).value = '10';
          (el<HTMLInputElement>('margin-pct')).value = '8';
        }
        compute();
        setTimeout(switchToInsights, 300);
        break;
      }

      case 'forging': {
        if (slot === 3) {
          (el<HTMLInputElement>('part-name')).value = 'Jeep Wrangler Front Axle Shaft Flange (Steel Forging)';
          const matEl3 = el<HTMLSelectElement>('forge-mat');
          if (matEl3) { const o = Array.from(matEl3.options).find(x => x.value === 'mat-steel4340'); if (o) matEl3.value = o.value; }
          (el<HTMLInputElement>('forge-part-wt')).value = '4.20';
          (el<HTMLInputElement>('forge-flash')).value = '0.48';
          (el<HTMLInputElement>('forge-yield')).value = '0.90';
          const forgeMach3 = el<HTMLSelectElement>('forge-mach');
          if (forgeMach3) { const o = Array.from(forgeMach3.options).find(x => x.value === 'forge-hammer-5t'); if (o) forgeMach3.value = o.value; }
          const forgeLab3 = el<HTMLSelectElement>('forge-lab');
          if (forgeLab3) { const o = Array.from(forgeLab3.options).find(x => x.value === 'lab-uk-skilled'); if (o) forgeLab3.value = o.value; }
          (el<HTMLInputElement>('forge-strokes')).value = '6';
          (el<HTMLInputElement>('forge-time-per-blow')).value = '10';
          (el<HTMLInputElement>('forge-ct')).value = '0';
          (el<HTMLInputElement>('forge-oee')).value = '0.78';
          (el<HTMLInputElement>('forge-manning')).value = '2';
          (el<HTMLInputElement>('forge-lab-eff')).value = '0.90';
          (el<HTMLInputElement>('forge-heat-energy')).value = '0.50';
          (el<HTMLInputElement>('forge-die-cost')).value = '88000';
          (el<HTMLInputElement>('forge-die-life')).value = '80000';
          (el<HTMLInputElement>('forge-amort')).value = '80000';
          (el<HTMLInputElement>('forge-ht-cost')).value = '1.20';
          (el<HTMLInputElement>('forge-descale')).value = '0.30';
          (el<HTMLInputElement>('packaging')).value = '0.80';
          (el<HTMLInputElement>('logistics')).value = '1.80';
          (el<HTMLInputElement>('overhead-pct')).value = '12';
          (el<HTMLInputElement>('margin-pct')).value = '9';
        } else {
          (el<HTMLInputElement>('part-name')).value = slot === 1 ? 'BMW X7 Front Lower Control Arm (Al Forging)' : 'Range Rover Vogue 4WD Drive Shaft Yoke (Steel Forging)';
          const matEl = el<HTMLSelectElement>('forge-mat');
          if (matEl) { const o = Array.from(matEl.options).find(x => x.value === (slot === 1 ? 'mat-aa6082-sheet' : 'mat-steel4340')); if (o) matEl.value = o.value; }
          (el<HTMLInputElement>('forge-part-wt')).value = slot === 1 ? '1.85' : '2.80';
          (el<HTMLInputElement>('forge-flash')).value = slot === 1 ? '0.28' : '0.55';
          (el<HTMLInputElement>('forge-yield')).value = slot === 1 ? '0.87' : '0.84';
          const forgeMach = el<HTMLSelectElement>('forge-mach');
          if (forgeMach) { const o = Array.from(forgeMach.options).find(x => x.value === (slot === 1 ? 'forge-press-500t' : 'forge-hammer-5t')); if (o) forgeMach.value = o.value; }
          const forgeLab = el<HTMLSelectElement>('forge-lab');
          if (forgeLab) { const o = Array.from(forgeLab.options).find(x => x.value === 'lab-uk-skilled'); if (o) forgeLab.value = o.value; }
          (el<HTMLInputElement>('forge-strokes')).value = slot === 1 ? '4' : '5';
          (el<HTMLInputElement>('forge-time-per-blow')).value = slot === 1 ? '8' : '12';
          (el<HTMLInputElement>('forge-ct')).value = '0';
          (el<HTMLInputElement>('forge-oee')).value = slot === 1 ? '0.82' : '0.78';
          (el<HTMLInputElement>('forge-manning')).value = '2';
          (el<HTMLInputElement>('forge-lab-eff')).value = slot === 1 ? '0.92' : '0.90';
          (el<HTMLInputElement>('forge-heat-energy')).value = slot === 1 ? '0.30' : '0.50';
          (el<HTMLInputElement>('forge-die-cost')).value = slot === 1 ? '95000' : '75000';
          (el<HTMLInputElement>('forge-die-life')).value = slot === 1 ? '100000' : '80000';
          (el<HTMLInputElement>('forge-amort')).value = slot === 1 ? '150000' : '100000';
          (el<HTMLInputElement>('forge-ht-cost')).value = slot === 1 ? '0' : '0.85';
          (el<HTMLInputElement>('forge-descale')).value = slot === 1 ? '0' : '0.20';
          (el<HTMLInputElement>('packaging')).value = slot === 1 ? '0.40' : '0.65';
          (el<HTMLInputElement>('logistics')).value = slot === 1 ? '1.00' : '1.50';
          (el<HTMLInputElement>('overhead-pct')).value = '12';
          (el<HTMLInputElement>('margin-pct')).value = '8';
        }
        compute();
        setTimeout(switchToInsights, 300);
        break;
      }

      case 'painting': {
        if (slot === 3) {
          (el<HTMLInputElement>('part-name')).value = 'Toyota Land Cruiser 300 Tailgate (OEM 4-Coat Paint System)';
          (el<HTMLInputElement>('paint-area')).value = '2.80';
          const paintLine3 = el<HTMLSelectElement>('paint-line');
          if (paintLine3) { const o = Array.from(paintLine3.options).find(x => x.value === 'paint-line-std'); if (o) paintLine3.value = o.value; }
          const paintLab3 = el<HTMLSelectElement>('paint-lab');
          if (paintLab3) { const o = Array.from(paintLab3.options).find(x => x.value === 'lab-uk-skilled'); if (o) paintLab3.value = o.value; }
          (el<HTMLInputElement>('paint-line-rate')).value = '18';
          (el<HTMLInputElement>('paint-oee')).value = '0.85';
          (el<HTMLInputElement>('paint-manning')).value = '5';
          (el<HTMLInputElement>('paint-lab-eff')).value = '0.92';
          (el<HTMLInputElement>('paint-rework')).value = '0.04';
          (el<HTMLInputElement>('paint-tooling')).value = '8000';
          (el<HTMLInputElement>('paint-amort')).value = '40000';
          (el<HTMLInputElement>('packaging')).value = '0.80';
          (el<HTMLInputElement>('logistics')).value = '1.80';
          (el<HTMLInputElement>('overhead-pct')).value = '9';
          (el<HTMLInputElement>('margin-pct')).value = '7';
        } else {
          (el<HTMLInputElement>('part-name')).value = slot === 1 ? 'Lamborghini Urus Body Panel (OEM Paint System)' : 'Aston Martin DBX Instrument Panel (Premium Paint)';
          (el<HTMLInputElement>('paint-area')).value = slot === 1 ? '8.5' : '0.65';
          const paintLine = el<HTMLSelectElement>('paint-line');
          if (paintLine) { const o = Array.from(paintLine.options).find(x => x.value === 'paint-line-std'); if (o) paintLine.value = o.value; }
          const paintLab = el<HTMLSelectElement>('paint-lab');
          if (paintLab) { const o = Array.from(paintLab.options).find(x => x.value === 'lab-uk-skilled'); if (o) paintLab.value = o.value; }
          (el<HTMLInputElement>('paint-line-rate')).value = slot === 1 ? '15' : '60';
          (el<HTMLInputElement>('paint-oee')).value = slot === 1 ? '0.85' : '0.88';
          (el<HTMLInputElement>('paint-manning')).value = slot === 1 ? '6' : '4';
          (el<HTMLInputElement>('paint-lab-eff')).value = slot === 1 ? '0.92' : '0.95';
          (el<HTMLInputElement>('paint-rework')).value = slot === 1 ? '0.05' : '0.03';
          (el<HTMLInputElement>('paint-tooling')).value = slot === 1 ? '12000' : '5000';
          (el<HTMLInputElement>('paint-amort')).value = slot === 1 ? '50000' : '30000';
          (el<HTMLInputElement>('packaging')).value = slot === 1 ? '1.50' : '0.40';
          (el<HTMLInputElement>('logistics')).value = slot === 1 ? '3.00' : '0.80';
          (el<HTMLInputElement>('overhead-pct')).value = '8';
          (el<HTMLInputElement>('margin-pct')).value = '6';
        }
        compute();
        setTimeout(switchToInsights, 300);
        break;
      }

      case 'biw_assembly': {
        el('biw-stations-container').innerHTML = ''; stationCount = 0;
        if (slot === 3) {
          (el<HTMLInputElement>('part-name')).value = 'Volkswagen Touareg Front Door Inner Assembly';
          (el<HTMLInputElement>('biw-sub-cost')).value = '62.00';
          (el<HTMLInputElement>('biw-tooling')).value = '280000';
          (el<HTMLInputElement>('biw-amort')).value = '60000';
          addBIWStation({ stationName: 'Robot Framing Jig', machineId: 'robot-weld-station', labourId: 'lab-uk-skilled', cycleTimeHr: 1/60, oee: 0.85, manning: 1, labourEfficiency: 0.92 });
          addBIWStation({ stationName: 'Robot Spot Weld Array (28 welds)', machineId: 'robot-weld-station', labourId: 'lab-uk-skilled', cycleTimeHr: 1.8/60, oee: 0.85, manning: 1, labourEfficiency: 0.92 });
          addBIWStation({ stationName: 'MIG Seam Weld — Inner Frame', machineId: 'mig-welder-manual', labourId: 'lab-uk-skilled', cycleTimeHr: 1.5/60, oee: 0.80, manning: 1, labourEfficiency: 0.90 });
          addBIWStation({ stationName: 'Quality Inspection Station', machineId: 'bench-assembly', labourId: 'lab-uk-inspector', cycleTimeHr: 0.5/60, oee: 0.90, manning: 1, labourEfficiency: 0.95 });
          (el<HTMLInputElement>('packaging')).value = '1.80';
          (el<HTMLInputElement>('logistics')).value = '3.50';
          (el<HTMLInputElement>('overhead-pct')).value = '10';
          (el<HTMLInputElement>('margin-pct')).value = '7';
        } else {
          (el<HTMLInputElement>('part-name')).value = slot === 1 ? 'Mercedes GLS Door Inner Panel Assembly' : 'Porsche Cayenne BIW Side Frame';
          (el<HTMLInputElement>('biw-sub-cost')).value = slot === 1 ? '85.00' : '145.00';
          (el<HTMLInputElement>('biw-tooling')).value = slot === 1 ? '350000' : '600000';
          (el<HTMLInputElement>('biw-amort')).value = slot === 1 ? '80000' : '50000';
          if (slot === 1) {
            addBIWStation({ stationName: 'Robot Framing Station', machineId: 'robot-weld-station', labourId: 'lab-uk-skilled', cycleTimeHr: 1/60, oee: 0.85, manning: 1, labourEfficiency: 0.92 });
            addBIWStation({ stationName: 'Robot Spot Weld (Inner)', machineId: 'robot-weld-station', labourId: 'lab-uk-skilled', cycleTimeHr: 1.5/60, oee: 0.85, manning: 1, labourEfficiency: 0.92 });
            addBIWStation({ stationName: 'MIG Weld — Seam', machineId: 'mig-welder-manual', labourId: 'lab-uk-skilled', cycleTimeHr: 2/60, oee: 0.80, manning: 1, labourEfficiency: 0.90 });
          } else {
            addBIWStation({ stationName: 'Robot Framing Station', machineId: 'robot-weld-station', labourId: 'lab-uk-skilled', cycleTimeHr: 1.5/60, oee: 0.85, manning: 1, labourEfficiency: 0.92 });
            addBIWStation({ stationName: 'Robot Spot Weld Array', machineId: 'robot-weld-station', labourId: 'lab-uk-skilled', cycleTimeHr: 2/60, oee: 0.85, manning: 1, labourEfficiency: 0.92 });
            addBIWStation({ stationName: 'Hemming Station', machineId: 'bench-assembly', labourId: 'lab-uk-skilled', cycleTimeHr: 1/60, oee: 0.80, manning: 2, labourEfficiency: 0.90 });
            addBIWStation({ stationName: 'Quality Inspection', machineId: 'bench-assembly', labourId: 'lab-uk-inspector', cycleTimeHr: 0.5/60, oee: 0.90, manning: 1, labourEfficiency: 0.95 });
          }
          (el<HTMLInputElement>('packaging')).value = slot === 1 ? '2.50' : '4.00';
          (el<HTMLInputElement>('logistics')).value = slot === 1 ? '5.00' : '8.00';
          (el<HTMLInputElement>('overhead-pct')).value = '10';
          (el<HTMLInputElement>('margin-pct')).value = '7';
        }
        compute();
        setTimeout(switchToInsights, 300);
        break;
      }

      case 'pcb_fab': {
        if (slot === 3) {
          (el<HTMLInputElement>('part-name')).value = 'Volvo XC90 Pilot Assist Camera ECU PCB';
          const techEl3 = el<HTMLSelectElement>('pcbf-technology');
          if (techEl3) techEl3.value = 'FR4_standard';
          const qualEl3 = el<HTMLSelectElement>('pcbf-quality');
          if (qualEl3) qualEl3.value = 'auto_grade2';
          const regionEl3 = el<HTMLSelectElement>('pcbf-region');
          if (regionEl3) regionEl3.value = 'uk';
          const layersEl3 = el<HTMLSelectElement>('pcbf-layers');
          if (layersEl3) layersEl3.value = '4';
          (el<HTMLInputElement>('pcbf-board-w')).value = '85';
          (el<HTMLInputElement>('pcbf-board-h')).value = '65';
          (el<HTMLInputElement>('pcbf-panel-w')).value = '500';
          (el<HTMLInputElement>('pcbf-panel-h')).value = '600';
          (el<HTMLInputElement>('pcbf-panel-util')).value = '0.72';
          const tgEl3 = el<HTMLSelectElement>('pcbf-tg');
          if (tgEl3) tgEl3.value = '135';
          const cuEl3 = el<HTMLSelectElement>('pcbf-cu');
          if (cuEl3) cuEl3.value = '1';
          const outerCuEl3 = el<HTMLSelectElement>('pcbf-outer-cu');
          if (outerCuEl3) outerCuEl3.value = '1';
          const viaTypeEl3 = el<HTMLSelectElement>('pcbf-via-type');
          if (viaTypeEl3) viaTypeEl3.value = 'through_only';
          const hdiEl3 = el<HTMLSelectElement>('pcbf-hdi-structure');
          if (hdiEl3) hdiEl3.value = 'none';
          (el<HTMLInputElement>('pcbf-vias')).value = '280';
          (el<HTMLInputElement>('pcbf-blind-vias')).value = '0';
          (el<HTMLInputElement>('pcbf-buried-vias')).value = '0';
          (el<HTMLInputElement>('pcbf-uvias')).value = '0';
          const traceEl3 = el<HTMLSelectElement>('pcbf-trace');
          if (traceEl3) traceEl3.value = '0.15';
          const finEl3 = el<HTMLSelectElement>('pcbf-finish');
          if (finEl3) finEl3.value = 'enig';
          const smEl3 = el<HTMLSelectElement>('pcbf-solder-mask');
          if (smEl3) smEl3.value = 'green';
          const silkEl3 = el<HTMLSelectElement>('pcbf-silkscreen');
          if (silkEl3) silkEl3.value = '2';
          const impEl3 = el<HTMLInputElement>('pcbf-impedance');
          if (impEl3) impEl3.checked = true;
          const bgaEl3 = el<HTMLInputElement>('pcbf-bga');
          if (bgaEl3) bgaEl3.checked = false;
          const testMethEl3 = el<HTMLSelectElement>('pcbf-test-method');
          if (testMethEl3) testMethEl3.value = 'flying_probe';
          (el<HTMLInputElement>('pcbf-yield')).value = '0';
          (el<HTMLInputElement>('pcbf-nre')).value = '1200';
          (el<HTMLInputElement>('pcbf-amort')).value = '20000';
          (el<HTMLInputElement>('packaging')).value = '0.12';
          (el<HTMLInputElement>('logistics')).value = '0.25';
          (el<HTMLInputElement>('overhead-pct')).value = '8';
          (el<HTMLInputElement>('margin-pct')).value = '10';
        } else {
          (el<HTMLInputElement>('part-name')).value = slot === 1 ? 'BMW iX Battery Management PCB (6-Layer)' : 'Mercedes AMG ADAS Sensor PCB (8-Layer HDI)';
          const techEl = el<HTMLSelectElement>('pcbf-technology');
          if (techEl) techEl.value = slot === 1 ? 'FR4_HTg' : 'HDI_RIGID';
          const qualEl = el<HTMLSelectElement>('pcbf-quality');
          if (qualEl) qualEl.value = slot === 1 ? 'auto_grade2' : 'auto_grade1';
          const regionEl = el<HTMLSelectElement>('pcbf-region');
          if (regionEl) regionEl.value = 'uk';
          const layersEl = el<HTMLSelectElement>('pcbf-layers');
          if (layersEl) layersEl.value = slot === 1 ? '6' : '8';
          (el<HTMLInputElement>('pcbf-board-w')).value = slot === 1 ? '122' : '100';
          (el<HTMLInputElement>('pcbf-board-h')).value = slot === 1 ? '61' : '55';
          (el<HTMLInputElement>('pcbf-panel-w')).value = '500';
          (el<HTMLInputElement>('pcbf-panel-h')).value = '600';
          (el<HTMLInputElement>('pcbf-panel-util')).value = slot === 1 ? '0.72' : '0.65';
          const tgEl = el<HTMLSelectElement>('pcbf-tg');
          if (tgEl) tgEl.value = slot === 1 ? '150' : '170';
          const cuEl = el<HTMLSelectElement>('pcbf-cu');
          if (cuEl) cuEl.value = '1';
          const outerCuEl = el<HTMLSelectElement>('pcbf-outer-cu');
          if (outerCuEl) outerCuEl.value = '1';
          const viaTypeEl = el<HTMLSelectElement>('pcbf-via-type');
          if (viaTypeEl) viaTypeEl.value = slot === 1 ? 'through_only' : 'microvia_hdi';
          const hdiEl = el<HTMLSelectElement>('pcbf-hdi-structure');
          if (hdiEl) hdiEl.value = slot === 1 ? 'none' : '1plus_n_plus1';
          (el<HTMLInputElement>('pcbf-vias')).value = slot === 1 ? '450' : '320';
          (el<HTMLInputElement>('pcbf-blind-vias')).value = '0';
          (el<HTMLInputElement>('pcbf-buried-vias')).value = '0';
          (el<HTMLInputElement>('pcbf-uvias')).value = slot === 1 ? '0' : '80';
          const traceEl = el<HTMLSelectElement>('pcbf-trace');
          if (traceEl) traceEl.value = slot === 1 ? '0.15' : '0.10';
          const finEl = el<HTMLSelectElement>('pcbf-finish');
          if (finEl) finEl.value = 'enig';
          const smEl = el<HTMLSelectElement>('pcbf-solder-mask');
          if (smEl) smEl.value = 'green';
          const silkEl = el<HTMLSelectElement>('pcbf-silkscreen');
          if (silkEl) silkEl.value = '2';
          const impEl = el<HTMLInputElement>('pcbf-impedance');
          if (impEl) impEl.checked = true;
          const bgaEl = el<HTMLInputElement>('pcbf-bga');
          if (bgaEl) bgaEl.checked = slot === 2;
          const testMethEl = el<HTMLSelectElement>('pcbf-test-method');
          if (testMethEl) testMethEl.value = 'flying_probe';
          (el<HTMLInputElement>('pcbf-yield')).value = '0';
          (el<HTMLInputElement>('pcbf-nre')).value = slot === 1 ? '1500' : '3500';
          (el<HTMLInputElement>('pcbf-amort')).value = slot === 1 ? '25000' : '15000';
          (el<HTMLInputElement>('packaging')).value = '0.15';
          (el<HTMLInputElement>('logistics')).value = '0.30';
          (el<HTMLInputElement>('overhead-pct')).value = '8';
          (el<HTMLInputElement>('margin-pct')).value = '10';
        }
        compute();
        setTimeout(switchToInsights, 300);
        break;
      }

      case 'pcba': {
        if (slot === 3) {
          (el<HTMLInputElement>('part-name')).value = 'Toyota RAV4 Hybrid HV Battery Monitoring PCBA';
          const cxEl3 = el<HTMLSelectElement>('pcba-complexity');
          if (cxEl3) cxEl3.value = 'high';
          const qEl3 = el<HTMLSelectElement>('pcba-quality');
          if (qEl3) qEl3.value = 'auto_grade2';
          (el<HTMLInputElement>('pcba-pcb-cost')).value = '4.80';
          const smtMach3 = el<HTMLSelectElement>('pcba-smt-mach');
          if (smtMach3) { const o = Array.from(smtMach3.options).find(x => x.value === 'smt-high-speed-line'); if (o) smtMach3.value = o.value; }
          const smtLab3 = el<HTMLSelectElement>('pcba-smt-lab');
          if (smtLab3) { const o = Array.from(smtLab3.options).find(x => x.value === 'lab-uk-electronics'); if (o) smtLab3.value = o.value; }
          (el<HTMLInputElement>('pcba-smt-lines')).value = '1';
          (el<HTMLInputElement>('pcba-smt-rate')).value = '25000';
          (el<HTMLInputElement>('pcba-smt-oee')).value = '0.85';
          const sidesEl3 = el<HTMLSelectElement>('pcba-smt-sides');
          if (sidesEl3) sidesEl3.value = '2';
          (el<HTMLInputElement>('pcba-th-count')).value = '12';
          (el<HTMLInputElement>('pcba-man-count')).value = '0';
          (el<HTMLInputElement>('pcba-bga-count')).value = '1';
          (el<HTMLInputElement>('pcba-ict-time')).value = '90';
          const xrayMach3 = el<HTMLSelectElement>('pcba-xray-mach');
          if (xrayMach3) { const o = Array.from(xrayMach3.options).find(x => x.value === 'xray-bga-inspection'); if (o) xrayMach3.value = o.value; }
          const ictMach3 = el<HTMLSelectElement>('pcba-ict-mach');
          if (ictMach3) { const o = Array.from(ictMach3.options).find(x => x.value === 'ict-automotive'); if (o) ictMach3.value = o.value; }
          (el<HTMLInputElement>('pcba-yield')).value = '0.97';
          (el<HTMLInputElement>('pcba-rework-cost')).value = '10.00';
          (el<HTMLInputElement>('pcba-test-cost')).value = '0';
          (el<HTMLInputElement>('pcba-amort')).value = '6000';
          (el<HTMLInputElement>('pcba-coat-area')).value = '0';
          (el<HTMLInputElement>('pcba-coat-price')).value = '0.005';
          (el<HTMLInputElement>('pcba-nre-cost')).value = '2000';
          (el<HTMLInputElement>('pcba-nre-amort')).value = '6000';
          (el<HTMLInputElement>('packaging')).value = '0.20';
          (el<HTMLInputElement>('logistics')).value = '0.40';
          (el<HTMLInputElement>('overhead-pct')).value = '8';
          (el<HTMLInputElement>('margin-pct')).value = '10';
        } else {
          (el<HTMLInputElement>('part-name')).value = slot === 1 ? 'Range Rover Adaptive Cruise Control ECU' : 'Porsche Taycan Engine Control Unit (PCBA)';
          const cxEl = el<HTMLSelectElement>('pcba-complexity');
          if (cxEl) cxEl.value = slot === 1 ? 'high' : 'very_high';
          const qEl = el<HTMLSelectElement>('pcba-quality');
          if (qEl) qEl.value = slot === 1 ? 'auto_grade2' : 'auto_grade1';
          (el<HTMLInputElement>('pcba-pcb-cost')).value = slot === 1 ? '6.50' : '9.80';
          const smtMach = el<HTMLSelectElement>('pcba-smt-mach');
          if (smtMach) { const o = Array.from(smtMach.options).find(x => x.value === 'smt-high-speed-line'); if (o) smtMach.value = o.value; }
          const smtLab = el<HTMLSelectElement>('pcba-smt-lab');
          if (smtLab) { const o = Array.from(smtLab.options).find(x => x.value === 'lab-uk-electronics'); if (o) smtLab.value = o.value; }
          (el<HTMLInputElement>('pcba-smt-lines')).value = slot === 1 ? '1' : '2';
          (el<HTMLInputElement>('pcba-smt-rate')).value = '25000';
          (el<HTMLInputElement>('pcba-smt-oee')).value = '0.85';
          const sidesEl = el<HTMLSelectElement>('pcba-smt-sides');
          if (sidesEl) sidesEl.value = '2';
          (el<HTMLInputElement>('pcba-th-count')).value = slot === 1 ? '8' : '12';
          (el<HTMLInputElement>('pcba-man-count')).value = slot === 1 ? '0' : '2';
          (el<HTMLInputElement>('pcba-bga-count')).value = slot === 1 ? '1' : '3';
          (el<HTMLInputElement>('pcba-ict-time')).value = slot === 1 ? '120' : '180';
          const xrayMach = el<HTMLSelectElement>('pcba-xray-mach');
          if (xrayMach) { const o = Array.from(xrayMach.options).find(x => x.value === 'xray-bga-inspection'); if (o) xrayMach.value = o.value; }
          const ictMach = el<HTMLSelectElement>('pcba-ict-mach');
          if (ictMach) { const o = Array.from(ictMach.options).find(x => x.value === 'ict-automotive'); if (o) ictMach.value = o.value; }
          (el<HTMLInputElement>('pcba-yield')).value = slot === 1 ? '0.97' : '0.96';
          (el<HTMLInputElement>('pcba-rework-cost')).value = slot === 1 ? '12.00' : '18.00';
          (el<HTMLInputElement>('pcba-test-cost')).value = '0';
          (el<HTMLInputElement>('pcba-amort')).value = slot === 1 ? '8000' : '5000';
          (el<HTMLInputElement>('pcba-coat-area')).value = slot === 1 ? '0' : '50';
          (el<HTMLInputElement>('pcba-coat-price')).value = '0.005';
          (el<HTMLInputElement>('pcba-nre-cost')).value = slot === 1 ? '2500' : '5000';
          (el<HTMLInputElement>('pcba-nre-amort')).value = slot === 1 ? '8000' : '5000';
          (el<HTMLInputElement>('packaging')).value = '0.25';
          (el<HTMLInputElement>('logistics')).value = '0.50';
          (el<HTMLInputElement>('overhead-pct')).value = '8';
          (el<HTMLInputElement>('margin-pct')).value = '10';
        }
        compute();
        setTimeout(switchToInsights, 300);
        break;
      }

      case 'cast_and_machine': {
        if (slot === 3) {
          (el<HTMLInputElement>('part-name')).value = 'Volkswagen Touareg Engine Mount Bracket (HPDC + Machine)';
          const matEl3 = el<HTMLSelectElement>('cam-mat');
          if (matEl3) { const o = Array.from(matEl3.options).find(x => x.value === 'mat-adc12'); if (o) matEl3.value = o.value; }
          (el<HTMLInputElement>('cam-cast-wt')).value = '2.80';
          (el<HTMLInputElement>('cam-finish-wt')).value = '2.35';
          (el<HTMLInputElement>('cam-cast-yield')).value = '0.68';
          (el<HTMLInputElement>('cam-reject')).value = '0.025';
          (el<HTMLInputElement>('cam-cast-oee')).value = '0.82';
          (el<HTMLInputElement>('cam-cast-manning')).value = '1';
          (el<HTMLInputElement>('cam-cast-lab-eff')).value = '0.92';
          const camSubtype3 = el<HTMLSelectElement>('cam-cast-subtype');
          if (camSubtype3) { camSubtype3.value = 'hpdc'; camSubtype3.dispatchEvent(new Event('change')); }
          const hpdcMach3 = el<HTMLSelectElement>('cam-hpdc-mach');
          if (hpdcMach3) { const o = Array.from(hpdcMach3.options).find(x => x.value === 'hpdc-800t'); if (o) hpdcMach3.value = o.value; }
          (el<HTMLInputElement>('cam-hpdc-ct')).value = '55';
          (el<HTMLInputElement>('cam-hpdc-cav')).value = '2';
          (el<HTMLInputElement>('cam-hpdc-die-cost')).value = '95000';
          (el<HTMLInputElement>('cam-hpdc-die-life')).value = '180000';
          const camSetupMach3 = el<HTMLSelectElement>('cam-mach-setup-mach');
          if (camSetupMach3) { const o = Array.from(camSetupMach3.options).find(x => x.value === 'mach-haas-vf2'); if (o) camSetupMach3.value = o.value; }
          (el<HTMLInputElement>('cam-mach-setup-time')).value = '0.42';
          (el<HTMLInputElement>('cam-mach-batch-size')).value = '30';
          (el<HTMLInputElement>('cam-mach-tooling')).value = '6500';
          (el<HTMLInputElement>('cam-mach-prog-nre')).value = '2200';
          (el<HTMLInputElement>('cam-amort')).value = '50000';
          const camOpsContainer3 = el('cam-mach-ops-container');
          if (camOpsContainer3) { camOpsContainer3.innerHTML = ''; camMachOpCount = 0; }
          addCAMMachOp({ name: '3-Axis Mill — Mounting Faces', type: 'milling_3ax', machineId: 'mach-haas-vf2', labourId: 'lab-uk-skilled', cycleTimeHr: 0.15, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.15, labourEfficiency: 0.92 });
          addCAMMachOp({ name: 'CNC Drilling — Stud Holes ×6', type: 'drilling', machineId: 'mach-drill', labourId: 'lab-uk-skilled', cycleTimeHr: 0.05, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.05, labourEfficiency: 0.92 });
          (el<HTMLInputElement>('packaging')).value = '0.50';
          (el<HTMLInputElement>('logistics')).value = '1.10';
          (el<HTMLInputElement>('overhead-pct')).value = '12';
          (el<HTMLInputElement>('margin-pct')).value = '9';
        } else {
          (el<HTMLInputElement>('part-name')).value = slot === 1 ? 'Porsche Cayenne Aluminium Brake Caliper (Cast+Machine)' : 'BMW X5 Transfer Case Housing (Cast+Machine)';
          const matEl = el<HTMLSelectElement>('cam-mat');
          if (matEl) { const o = Array.from(matEl.options).find(x => x.value === 'mat-adc12'); if (o) matEl.value = o.value; }
          (el<HTMLInputElement>('cam-cast-wt')).value = slot === 1 ? '3.20' : '5.80';
          (el<HTMLInputElement>('cam-finish-wt')).value = slot === 1 ? '2.65' : '4.90';
          (el<HTMLInputElement>('cam-cast-yield')).value = slot === 1 ? '0.65' : '0.62';
          (el<HTMLInputElement>('cam-reject')).value = slot === 1 ? '0.025' : '0.03';
          (el<HTMLInputElement>('cam-cast-oee')).value = '0.80';
          (el<HTMLInputElement>('cam-cast-manning')).value = '2';
          (el<HTMLInputElement>('cam-cast-lab-eff')).value = '0.92';
          const hpdcMach = el<HTMLSelectElement>('cam-hpdc-mach');
          if (hpdcMach) { const o = Array.from(hpdcMach.options).find(x => x.value === (slot === 1 ? 'hpdc-800t' : 'hpdc-1600t')); if (o) hpdcMach.value = o.value; }
          (el<HTMLInputElement>('cam-hpdc-ct')).value = slot === 1 ? '60' : '90';
          (el<HTMLInputElement>('cam-hpdc-cav')).value = '1';
          (el<HTMLInputElement>('cam-hpdc-die-cost')).value = slot === 1 ? '120000' : '280000';
          (el<HTMLInputElement>('cam-hpdc-die-life')).value = slot === 1 ? '180000' : '150000';
          const camMach = el<HTMLSelectElement>('cam-mach-setup-mach');
          if (camMach) { const o = Array.from(camMach.options).find(x => x.value === (slot === 1 ? 'mach-haas-vf2' : 'mach-dmg-dmu50')); if (o) camMach.value = o.value; }
          (el<HTMLInputElement>('cam-mach-setup-time')).value = slot === 1 ? '0.5' : '0.75';
          (el<HTMLInputElement>('cam-mach-batch-size')).value = slot === 1 ? '25' : '15';
          (el<HTMLInputElement>('cam-mach-tooling')).value = slot === 1 ? '8000' : '18000';
          (el<HTMLInputElement>('cam-mach-prog-nre')).value = slot === 1 ? '3000' : '6000';
          (el<HTMLInputElement>('cam-amort')).value = slot === 1 ? '60000' : '40000';
          (el<HTMLInputElement>('packaging')).value = slot === 1 ? '0.60' : '1.20';
          (el<HTMLInputElement>('logistics')).value = slot === 1 ? '1.40' : '2.50';
          (el<HTMLInputElement>('overhead-pct')).value = '12';
          (el<HTMLInputElement>('margin-pct')).value = '9';
        }
        compute();
        setTimeout(switchToInsights, 300);
        break;
      }

      case 'rubber': {
        if (slot === 3) {
          (el<HTMLInputElement>('part-name')).value = 'BMW X5 Anti-Vibration Engine Mount Bush (NR Bonded)';
          const matEl3 = el<HTMLSelectElement>('rub-mat');
          if (matEl3) { const o = Array.from(matEl3.options).find(x => x.value === 'mat-nr') || Array.from(matEl3.options).find(x => x.value === 'mat-nbr'); if (o) matEl3.value = o.value; }
          const procEl3 = el<HTMLSelectElement>('rub-process');
          if (procEl3) procEl3.value = 'compression_mould';
          const rubMach3 = el<HTMLSelectElement>('rub-mach');
          if (rubMach3) { const o = Array.from(rubMach3.options).find(x => x.value === 'compression-mould-std'); if (o) rubMach3.value = o.value; }
          const rubLab3 = el<HTMLSelectElement>('rub-lab');
          if (rubLab3) { const o = Array.from(rubLab3.options).find(x => x.value === 'lab-uk-skilled'); if (o) rubLab3.value = o.value; }
          (el<HTMLInputElement>('rub-part-wt')).value = '0.380';
          (el<HTMLInputElement>('rub-flash-wt')).value = '0.035';
          (el<HTMLInputElement>('rub-cycle-sec')).value = '210';
          (el<HTMLInputElement>('rub-cavities')).value = '2';
          (el<HTMLInputElement>('rub-oee')).value = '0.80';
          (el<HTMLInputElement>('rub-manning')).value = '1';
          (el<HTMLInputElement>('rub-lab-eff')).value = '0.90';
          (el<HTMLInputElement>('rub-reject')).value = '0.025';
          (el<HTMLInputElement>('rub-cure-sec')).value = '0';
          (el<HTMLInputElement>('rub-mould-cost')).value = '12000';
          (el<HTMLInputElement>('rub-mould-life')).value = '150000';
          (el<HTMLInputElement>('rub-amort')).value = '60000';
          (el<HTMLInputElement>('rub-primer')).value = '0.45';
          (el<HTMLInputElement>('packaging')).value = '0.12';
          (el<HTMLInputElement>('logistics')).value = '0.30';
          (el<HTMLInputElement>('overhead-pct')).value = '11';
          (el<HTMLInputElement>('margin-pct')).value = '9';
        } else {
          (el<HTMLInputElement>('part-name')).value = slot === 1 ? 'Range Rover Door Seal (Moulded EPDM)' : 'Mercedes GLE Engine Mount Anti-Vibration Pad';
          const matEl = el<HTMLSelectElement>('rub-mat');
          if (matEl) { const o = Array.from(matEl.options).find(x => x.value === (slot === 1 ? 'mat-epdm' : 'mat-nbr')); if (o) matEl.value = o.value; }
          const procEl = el<HTMLSelectElement>('rub-process');
          if (procEl) procEl.value = slot === 1 ? 'compression_mould' : 'transfer_mould';
          const rubMach = el<HTMLSelectElement>('rub-mach');
          if (rubMach) { const o = Array.from(rubMach.options).find(x => x.value === (slot === 1 ? 'compression-mould-std' : 'transfer-mould-std')); if (o) rubMach.value = o.value; }
          const rubLab = el<HTMLSelectElement>('rub-lab');
          if (rubLab) { const o = Array.from(rubLab.options).find(x => x.value === 'lab-uk-skilled'); if (o) rubLab.value = o.value; }
          (el<HTMLInputElement>('rub-part-wt')).value = slot === 1 ? '0.120' : '0.280';
          (el<HTMLInputElement>('rub-flash-wt')).value = slot === 1 ? '0.015' : '0.030';
          (el<HTMLInputElement>('rub-cycle-sec')).value = slot === 1 ? '180' : '240';
          (el<HTMLInputElement>('rub-cavities')).value = slot === 1 ? '4' : '2';
          (el<HTMLInputElement>('rub-oee')).value = '0.80';
          (el<HTMLInputElement>('rub-manning')).value = '1';
          (el<HTMLInputElement>('rub-lab-eff')).value = '0.90';
          (el<HTMLInputElement>('rub-reject')).value = '0.03';
          (el<HTMLInputElement>('rub-cure-sec')).value = '0';
          (el<HTMLInputElement>('rub-mould-cost')).value = slot === 1 ? '8000' : '15000';
          (el<HTMLInputElement>('rub-mould-life')).value = slot === 1 ? '200000' : '150000';
          (el<HTMLInputElement>('rub-amort')).value = slot === 1 ? '80000' : '50000';
          (el<HTMLInputElement>('rub-primer')).value = slot === 1 ? '0' : '0.35';
          (el<HTMLInputElement>('packaging')).value = slot === 1 ? '0.08' : '0.15';
          (el<HTMLInputElement>('logistics')).value = slot === 1 ? '0.20' : '0.40';
          (el<HTMLInputElement>('overhead-pct')).value = '11';
          (el<HTMLInputElement>('margin-pct')).value = '9';
        }
        compute();
        setTimeout(switchToInsights, 300);
        break;
      }

      case 'composites': {
        if (slot === 3) {
          (el<HTMLInputElement>('part-name')).value = 'BMW X7 M Sport Front Lip Splitter (CFRP Prepreg)';
          const procEl3 = el<HTMLSelectElement>('comp-process');
          if (procEl3) procEl3.value = 'prepreg_layup';
          (el<HTMLInputElement>('comp-part-wt')).value = '2.40';
          (el<HTMLInputElement>('comp-fibre-price')).value = '32.00';
          (el<HTMLInputElement>('comp-resin-price')).value = '0';
          (el<HTMLInputElement>('comp-fibre-frac')).value = '0.60';
          (el<HTMLInputElement>('comp-waste-frac')).value = '0.20';
          (el<HTMLInputElement>('comp-area')).value = '0.85';
          (el<HTMLInputElement>('comp-plies')).value = '10';
          const layupLab3 = el<HTMLSelectElement>('comp-layup-lab');
          if (layupLab3) { const o = Array.from(layupLab3.options).find(x => x.value === 'lab-uk-skilled'); if (o) layupLab3.value = o.value; }
          (el<HTMLInputElement>('comp-layup-time')).value = '4.50';
          (el<HTMLInputElement>('comp-oee')).value = '0.78';
          (el<HTMLInputElement>('comp-manning')).value = '2';
          (el<HTMLInputElement>('comp-lab-eff')).value = '0.90';
          (el<HTMLInputElement>('comp-reject')).value = '0.04';
          const cureMach3 = el<HTMLSelectElement>('comp-cure-mach');
          if (cureMach3) { const o = Array.from(cureMach3.options).find(x => x.value === 'autoclave-1200mm'); if (o) cureMach3.value = o.value; }
          const cureLab3 = el<HTMLSelectElement>('comp-cure-lab');
          if (cureLab3) { const o = Array.from(cureLab3.options).find(x => x.value === 'lab-uk-skilled'); if (o) cureLab3.value = o.value; }
          (el<HTMLInputElement>('comp-cure-time')).value = '3.00';
          (el<HTMLInputElement>('comp-cure-batch')).value = '6';
          const trimMach3 = el<HTMLSelectElement>('comp-trim-mach');
          if (trimMach3) { const o = Array.from(trimMach3.options).find(x => x.value === 'waterjet-5ax-composite'); if (o) trimMach3.value = o.value; }
          const trimLab3 = el<HTMLSelectElement>('comp-trim-lab');
          if (trimLab3) { const o = Array.from(trimLab3.options).find(x => x.value === 'lab-uk-skilled'); if (o) trimLab3.value = o.value; }
          (el<HTMLInputElement>('comp-trim-time')).value = '0.60';
          (el<HTMLInputElement>('comp-ndi')).value = '32.00';
          (el<HTMLInputElement>('comp-tool-cost')).value = '32000';
          (el<HTMLInputElement>('comp-tool-life')).value = '350';
          (el<HTMLInputElement>('comp-amort')).value = '2500';
          (el<HTMLInputElement>('packaging')).value = '2.00';
          (el<HTMLInputElement>('logistics')).value = '3.50';
          (el<HTMLInputElement>('overhead-pct')).value = '14';
          (el<HTMLInputElement>('margin-pct')).value = '10';
        } else {
          (el<HTMLInputElement>('part-name')).value = slot === 1 ? 'Lamborghini Urus Active Rear Spoiler (CFRP Prepreg)' : 'McLaren GT Front Bonnet Panel (CFRP Prepreg)';
          const procEl = el<HTMLSelectElement>('comp-process');
          if (procEl) procEl.value = 'prepreg_layup';
          (el<HTMLInputElement>('comp-part-wt')).value = slot === 1 ? '1.80' : '3.20';
          (el<HTMLInputElement>('comp-fibre-price')).value = '32.00';
          (el<HTMLInputElement>('comp-resin-price')).value = '0';
          (el<HTMLInputElement>('comp-fibre-frac')).value = '0.60';
          (el<HTMLInputElement>('comp-waste-frac')).value = slot === 1 ? '0.18' : '0.22';
          (el<HTMLInputElement>('comp-area')).value = slot === 1 ? '0.65' : '1.20';
          (el<HTMLInputElement>('comp-plies')).value = slot === 1 ? '8' : '12';
          const layupLab = el<HTMLSelectElement>('comp-layup-lab');
          if (layupLab) { const o = Array.from(layupLab.options).find(x => x.value === 'lab-uk-skilled'); if (o) layupLab.value = o.value; }
          (el<HTMLInputElement>('comp-layup-time')).value = slot === 1 ? '3.50' : '6.00';
          (el<HTMLInputElement>('comp-oee')).value = '0.78';
          (el<HTMLInputElement>('comp-manning')).value = '2';
          (el<HTMLInputElement>('comp-lab-eff')).value = '0.90';
          (el<HTMLInputElement>('comp-reject')).value = '0.04';
          const cureMach = el<HTMLSelectElement>('comp-cure-mach');
          if (cureMach) { const o = Array.from(cureMach.options).find(x => x.value === 'autoclave-1200mm'); if (o) cureMach.value = o.value; }
          const cureLab = el<HTMLSelectElement>('comp-cure-lab');
          if (cureLab) { const o = Array.from(cureLab.options).find(x => x.value === 'lab-uk-skilled'); if (o) cureLab.value = o.value; }
          (el<HTMLInputElement>('comp-cure-time')).value = slot === 1 ? '3.50' : '4.00';
          (el<HTMLInputElement>('comp-cure-batch')).value = slot === 1 ? '4' : '2';
          const trimMach = el<HTMLSelectElement>('comp-trim-mach');
          if (trimMach) { const o = Array.from(trimMach.options).find(x => x.value === 'waterjet-5ax-composite'); if (o) trimMach.value = o.value; }
          const trimLab = el<HTMLSelectElement>('comp-trim-lab');
          if (trimLab) { const o = Array.from(trimLab.options).find(x => x.value === 'lab-uk-skilled'); if (o) trimLab.value = o.value; }
          (el<HTMLInputElement>('comp-trim-time')).value = slot === 1 ? '0.50' : '0.75';
          (el<HTMLInputElement>('comp-ndi')).value = slot === 1 ? '28.00' : '40.00';
          (el<HTMLInputElement>('comp-tool-cost')).value = slot === 1 ? '25000' : '45000';
          (el<HTMLInputElement>('comp-tool-life')).value = slot === 1 ? '400' : '300';
          (el<HTMLInputElement>('comp-amort')).value = slot === 1 ? '2000' : '1500';
          (el<HTMLInputElement>('packaging')).value = slot === 1 ? '1.50' : '3.00';
          (el<HTMLInputElement>('logistics')).value = slot === 1 ? '2.50' : '4.50';
          (el<HTMLInputElement>('overhead-pct')).value = '14';
          (el<HTMLInputElement>('margin-pct')).value = '10';
        }
        compute();
        setTimeout(switchToInsights, 300);
        break;
      }

      case 'wiring_harness': {
        const wireRows = document.querySelectorAll<HTMLElement>('.wire-row');
        const connRows = document.querySelectorAll<HTMLElement>('.conn-row');
        if (slot === 3) {
          (el<HTMLInputElement>('part-name')).value = 'Toyota Land Cruiser 300 Engine Bay Control Harness';
          const gauges3 = ['0.75', '1.50', '4.00'];
          const lengths3 = ['4.50', '2.80', '0.80'];
          const prices3 = ['0.12', '0.20', '0.42'];
          wireRows.forEach((row, i) => {
            const gEl = row.querySelector<HTMLInputElement>('.wire-gauge');
            const lEl = row.querySelector<HTMLInputElement>('.wire-length');
            const pEl = row.querySelector<HTMLInputElement>('.wire-price');
            if (gEl && gauges3[i]) gEl.value = gauges3[i];
            if (lEl && lengths3[i]) lEl.value = lengths3[i];
            if (pEl && prices3[i]) pEl.value = prices3[i];
          });
          const counts3 = ['5', '3']; const costs3 = ['1.40', '3.20']; const circuits3 = ['8', '10']; const termTimes3 = ['10', '12'];
          connRows.forEach((row, i) => {
            const cn = row.querySelector<HTMLInputElement>('.conn-count');
            const cc = row.querySelector<HTMLInputElement>('.conn-cost');
            const ci = row.querySelector<HTMLInputElement>('.conn-circuits');
            const ct = row.querySelector<HTMLInputElement>('.conn-term-time');
            if (cn && counts3[i]) cn.value = counts3[i];
            if (cc && costs3[i]) cc.value = costs3[i];
            if (ci && circuits3[i]) ci.value = circuits3[i];
            if (ct && termTimes3[i]) ct.value = termTimes3[i];
          });
          (el<HTMLInputElement>('harn-splices')).value = '8';
          (el<HTMLInputElement>('harn-splice-cost')).value = '0.08';
          (el<HTMLInputElement>('harn-conduit-len')).value = '2.80';
          (el<HTMLInputElement>('harn-conduit-price')).value = '0.35';
          (el<HTMLInputElement>('harn-tape-m')).value = '7.00';
          (el<HTMLInputElement>('harn-tape-price')).value = '0.12';
          const asmLab3 = el<HTMLSelectElement>('harn-asm-lab');
          if (asmLab3) { const o = Array.from(asmLab3.options).find(x => x.value === 'lab-uk-skilled'); if (o) asmLab3.value = o.value; }
          (el<HTMLInputElement>('harn-asm-time')).value = '0.65';
          (el<HTMLInputElement>('harn-oee')).value = '0.85';
          (el<HTMLInputElement>('harn-manning')).value = '1';
          (el<HTMLInputElement>('harn-lab-eff')).value = '0.90';
          (el<HTMLInputElement>('harn-reject')).value = '0.02';
          const testMach3 = el<HTMLSelectElement>('harn-test-mach');
          if (testMach3) { const o = Array.from(testMach3.options).find(x => x.value === 'harness-test-sys'); if (o) testMach3.value = o.value; }
          const testLab3 = el<HTMLSelectElement>('harn-test-lab');
          if (testLab3) { const o = Array.from(testLab3.options).find(x => x.value === 'lab-uk-skilled'); if (o) testLab3.value = o.value; }
          (el<HTMLInputElement>('harn-test-time')).value = '0.06';
          (el<HTMLInputElement>('harn-board-cost')).value = '1000';
          (el<HTMLInputElement>('harn-board-life')).value = '20000';
          (el<HTMLInputElement>('packaging')).value = '0.30';
          (el<HTMLInputElement>('logistics')).value = '0.70';
          (el<HTMLInputElement>('overhead-pct')).value = '10';
          (el<HTMLInputElement>('margin-pct')).value = '8';
        } else {
          (el<HTMLInputElement>('part-name')).value = slot === 1 ? 'Rolls-Royce Ghost Door Wiring Harness' : 'Bentley Bentayga Engine Bay Harness';
          if (slot === 1) {
            const gauges = ['0.50', '1.50', '2.50'];
            const lengths = ['3.20', '1.80', '0.60'];
            const prices = ['0.10', '0.18', '0.28'];
            wireRows.forEach((row, i) => {
              const gEl = row.querySelector<HTMLInputElement>('.wire-gauge');
              const lEl = row.querySelector<HTMLInputElement>('.wire-length');
              const pEl = row.querySelector<HTMLInputElement>('.wire-price');
              if (gEl && gauges[i]) gEl.value = gauges[i];
              if (lEl && lengths[i]) lEl.value = lengths[i];
              if (pEl && prices[i]) pEl.value = prices[i];
            });
          } else {
            const gauges = ['0.50', '1.50', '4.00'];
            const lengths = ['6.50', '4.20', '1.30'];
            const prices = ['0.10', '0.18', '0.40'];
            wireRows.forEach((row, i) => {
              const gEl = row.querySelector<HTMLInputElement>('.wire-gauge');
              const lEl = row.querySelector<HTMLInputElement>('.wire-length');
              const pEl = row.querySelector<HTMLInputElement>('.wire-price');
              if (gEl && gauges[i]) gEl.value = gauges[i];
              if (lEl && lengths[i]) lEl.value = lengths[i];
              if (pEl && prices[i]) pEl.value = prices[i];
            });
          }
          if (slot === 1) {
            const counts = ['4', '2']; const costs = ['1.20', '2.80']; const circuits = ['6', '8']; const termTimes = ['10', '10'];
            connRows.forEach((row, i) => {
              const cn = row.querySelector<HTMLInputElement>('.conn-count');
              const cc = row.querySelector<HTMLInputElement>('.conn-cost');
              const ci = row.querySelector<HTMLInputElement>('.conn-circuits');
              const ct = row.querySelector<HTMLInputElement>('.conn-term-time');
              if (cn && counts[i]) cn.value = counts[i];
              if (cc && costs[i]) cc.value = costs[i];
              if (ci && circuits[i]) ci.value = circuits[i];
              if (ct && termTimes[i]) ct.value = termTimes[i];
            });
          } else {
            const counts = ['6', '4']; const costs = ['1.80', '3.50']; const circuits = ['10', '12']; const termTimes = ['10', '12'];
            connRows.forEach((row, i) => {
              const cn = row.querySelector<HTMLInputElement>('.conn-count');
              const cc = row.querySelector<HTMLInputElement>('.conn-cost');
              const ci = row.querySelector<HTMLInputElement>('.conn-circuits');
              const ct = row.querySelector<HTMLInputElement>('.conn-term-time');
              if (cn && counts[i]) cn.value = counts[i];
              if (cc && costs[i]) cc.value = costs[i];
              if (ci && circuits[i]) ci.value = circuits[i];
              if (ct && termTimes[i]) ct.value = termTimes[i];
            });
          }
          (el<HTMLInputElement>('harn-splices')).value = slot === 1 ? '6' : '12';
          (el<HTMLInputElement>('harn-splice-cost')).value = '0.08';
          (el<HTMLInputElement>('harn-conduit-len')).value = slot === 1 ? '2.00' : '4.50';
          (el<HTMLInputElement>('harn-conduit-price')).value = '0.35';
          (el<HTMLInputElement>('harn-tape-m')).value = slot === 1 ? '5.00' : '11.00';
          (el<HTMLInputElement>('harn-tape-price')).value = '0.12';
          const asmLab = el<HTMLSelectElement>('harn-asm-lab');
          if (asmLab) { const o = Array.from(asmLab.options).find(x => x.value === 'lab-uk-skilled'); if (o) asmLab.value = o.value; }
          (el<HTMLInputElement>('harn-asm-time')).value = slot === 1 ? '0.45' : '0.90';
          (el<HTMLInputElement>('harn-oee')).value = '0.85';
          (el<HTMLInputElement>('harn-manning')).value = '1';
          (el<HTMLInputElement>('harn-lab-eff')).value = '0.90';
          (el<HTMLInputElement>('harn-reject')).value = '0.02';
          const testMach = el<HTMLSelectElement>('harn-test-mach');
          if (testMach) { const o = Array.from(testMach.options).find(x => x.value === 'harness-test-sys'); if (o) testMach.value = o.value; }
          const testLab = el<HTMLSelectElement>('harn-test-lab');
          if (testLab) { const o = Array.from(testLab.options).find(x => x.value === 'lab-uk-skilled'); if (o) testLab.value = o.value; }
          (el<HTMLInputElement>('harn-test-time')).value = slot === 1 ? '0.05' : '0.08';
          (el<HTMLInputElement>('harn-board-cost')).value = slot === 1 ? '800' : '1500';
          (el<HTMLInputElement>('harn-board-life')).value = '20000';
          (el<HTMLInputElement>('packaging')).value = slot === 1 ? '0.20' : '0.45';
          (el<HTMLInputElement>('logistics')).value = slot === 1 ? '0.50' : '1.00';
          (el<HTMLInputElement>('overhead-pct')).value = '10';
          (el<HTMLInputElement>('margin-pct')).value = '8';
        }
        compute();
        setTimeout(switchToInsights, 300);
        break;
      }
    }
  }, 50);
}

// Expose to global scope for HTML onclick
(window as unknown as Record<string, unknown>).loadSUVDemo = loadSUVDemo;

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
        <span>Description</span><span>Qty</span><span>Unit Cost (${CURRENCY_SYMBOL[_displayCurrency] ?? _displayCurrency})</span><span>Unit Wt kg</span><span>Ext Cost</span><span>Ext Wt</span><span></span>
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
    <span class="asm-ext-cost" style="font-size:0.77rem;color:#555;text-align:right">${_currFmt(0)}</span>
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
      <thead><tr><th>ID</th><th>Grade</th><th>${_displayCurrency}/kg</th><th>Scrap ${_displayCurrency}/kg</th><th>Region</th><th>Conf.</th></tr></thead>
      <tbody>${library.materials.map(m => `<tr>
        <td style="font-family:monospace">${m.id}</td><td>${m.grade}</td>
        <td><input type="number" step="0.01" value="${m.pricePerKg}" data-update="material.${m.id}.pricePerKg" style="width:65px;padding:2px 4px;border:1px solid #ddd;border-radius:3px"/></td>
        <td><input type="number" step="0.01" value="${m.scrapRecoveryPricePerKg}" data-update="material.${m.id}.scrapRecoveryPricePerKg" style="width:65px;padding:2px 4px;border:1px solid #ddd;border-radius:3px"/></td>
        <td>${m.region}</td><td><span class="badge ${m.confidence}">${m.confidence}</span></td>
      </tr>`).join('')}</tbody>
    </table>
    <div class="panel-title" style="margin-bottom:8px">Machine Rates</div>
    <table class="breakdown-table" style="margin-bottom:16px;font-size:0.76rem">
      <thead><tr><th>ID</th><th>Class</th><th>Rate (${_displayCurrency}/hr)</th><th>Deprec.</th><th>Maint.</th><th>Energy</th><th>Hrs/yr</th><th>Util.</th></tr></thead>
      <tbody>${library.machines.map(m => `<tr>
        <td style="font-family:monospace">${m.id}</td><td>${m.machineClass}</td>
        <td style="font-weight:700">${_currFmt(m.computedRatePerHr)}</td>
        <td><input type="number" step="100" value="${m.buildup.annualDepreciation}" data-update="machine.${m.id}.annualDepreciation" style="width:62px;padding:2px 4px;border:1px solid #ddd;border-radius:3px"/></td>
        <td><input type="number" step="100" value="${m.buildup.maintenance}" data-update="machine.${m.id}.maintenance" style="width:62px;padding:2px 4px;border:1px solid #ddd;border-radius:3px"/></td>
        <td><input type="number" step="100" value="${m.buildup.energy}" data-update="machine.${m.id}.energy" style="width:62px;padding:2px 4px;border:1px solid #ddd;border-radius:3px"/></td>
        <td><input type="number" step="100" value="${m.buildup.annualAvailableHours}" data-update="machine.${m.id}.annualAvailableHours" style="width:55px;padding:2px 4px;border:1px solid #ddd;border-radius:3px"/></td>
        <td><input type="number" step="0.01" max="1" value="${m.buildup.machineUtilization}" data-update="machine.${m.id}.machineUtilization" style="width:50px;padding:2px 4px;border:1px solid #ddd;border-radius:3px"/></td>
      </tr>`).join('')}</tbody>
    </table>
    <div class="panel-title" style="margin-bottom:8px">Labour Rates</div>
    <table class="breakdown-table" style="font-size:0.76rem">
      <thead><tr><th>ID</th><th>Region</th><th>Skill</th><th>${_displayCurrency}/hr</th><th>Conf.</th></tr></thead>
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
  // M11: Surface IndexedDB failures to the user
  setScenarioErrorHandler(msg => showToast(msg, 'warning'));

  // Theme toggle
  const savedTheme = localStorage.getItem('sc-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.textContent = savedTheme === 'dark' ? '🌙' : '☀️';
    themeBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('sc-theme', next);
      themeBtn.textContent = next === 'dark' ? '🌙' : '☀️';
    });
  }

  // Init IndexedDB scenario store (migrates from localStorage automatically)
  await initScenarioStore();

  // M13: Warn if rate library data is stale (> 90 days)
  const lastMod = library.lastModified ? new Date(library.lastModified) : null;
  if (lastMod && !isNaN(lastMod.getTime())) {
    const ageDays = (Date.now() - lastMod.getTime()) / 86_400_000;
    if (ageDays > 90) {
      showToast(`Rate library data is ${Math.round(ageDays)} days old (last updated ${lastMod.toLocaleDateString('en-GB')}). Consider refreshing material and machine rates for accurate results.`, 'warning');
    }
  }

  // Commodity tabs
  document.querySelectorAll<HTMLElement>('.ctab').forEach(tab => {
    tab.addEventListener('click', () => {
      const type = tab.dataset.commodity;
      if (type === 'ai_agent') {
        document.querySelectorAll<HTMLElement>('.ctab').forEach(t => t.classList.toggle('active', t === tab));
        switchCommodity('ai_agent' as CommodityType);
        return;
      }
      // Use .onclick exclusively to avoid duplicate listeners when tab is clicked multiple times
      el('calc-btn').onclick = type === 'assembly' ? computeAssembly : compute;
      el('calc-btn').style.display = '';
      el('universal-costs').style.display = '';
      switchCommodity(type as CommodityType);
    });
  });

  // Results tabs
  document.querySelectorAll<HTMLElement>('.rtab').forEach(tab => {
    tab.addEventListener('click', () => switchResultTab(tab.dataset.panel!));
  });

  // Currency selector
  const _applyCurrency = (cur: string) => {
    _displayCurrency = cur;
    _displayFxRate = FX_TO_GBP[cur] !== undefined ? 1 / FX_TO_GBP[cur] : 1;
    const sym = CURRENCY_SYMBOL[cur] ?? cur;
    const pkgLabel = document.getElementById('lbl-packaging');
    const logLabel = document.getElementById('lbl-logistics');
    if (pkgLabel) pkgLabel.textContent = `Packaging (${sym}/part)`;
    if (logLabel) logLabel.textContent = `Logistics (${sym}/part)`;
    const tpSym = document.getElementById('target-price-sym');
    if (tpSym) tpSym.textContent = sym;
    // Update smart filter cost-range labels (thresholds remain in GBP; labels show display-currency equivalent)
    const costRangeEl = el<HTMLSelectElement>('filter-cost-range');
    if (costRangeEl) {
      const lo = _currFmt(10);
      const hi = _currFmt(100);
      if (costRangeEl.options[1]) costRangeEl.options[1].text = `Low (<${lo})`;
      if (costRangeEl.options[2]) costRangeEl.options[2].text = `Medium (${lo}–${hi})`;
      if (costRangeEl.options[3]) costRangeEl.options[3].text = `High (>${hi})`;
    }
    if (lastResult && lastInput) {
      renderBreakdown(lastResult);
      const activePanel = document.querySelector<HTMLElement>('.rtab.active')?.dataset.panel;
      if (activePanel === 'detail') renderDetail(lastResult, lastInput);
      if (activePanel === 'insights') renderInsights(lastResult, lastInput);
    }
  };
  el<HTMLSelectElement>('currency-selector')?.addEventListener('change', e => {
    _applyCurrency((e.target as HTMLSelectElement).value);
  });

  // Country for Costing bar — rebuilds library, updates currency, overhead default, auto-recalculates
  const _applyCountry = (code: string) => {
    const region = code as ManufacturingRegion;
    _mfgRegion = region;
    if (region === 'UK') {
      library = recomputeMachineRates(getLibraryFromStorage());
    } else {
      library = buildRegionalLibrary(recomputeMachineRates(getLibraryFromStorage()), region);
    }
    const rd = REGIONAL_DATA[region];
    if (rd) {
      // Update overhead-pct to country-scaled default (base 12% × overheadMultiplier)
      const ohPct = Math.round(12 * rd.overheadMultiplier);
      const ohEl = el<HTMLInputElement>('overhead-pct');
      if (ohEl) {
        const prevOh = Number(ohEl.value);
        ohEl.value = String(ohPct);
        if (Math.abs(prevOh - ohPct) >= 1) {
          showToast(`Overhead updated to ${ohPct}% (${rd.name} regional default). Adjust if needed.`, 'info');
        }
      }
      // Scale packaging and logistics to regional defaults
      const pkgEl = el<HTMLInputElement>('packaging-cost');
      const logEl = el<HTMLInputElement>('logistics-cost');
      if (pkgEl) pkgEl.value = (0.15 * rd.packagingMultiplier).toFixed(2);
      if (logEl) logEl.value = (0.25 * rd.logisticsMultiplier).toFixed(2);
      // Update display currency
      const cur = rd.currency;
      const curSel = el<HTMLSelectElement>('currency-selector');
      if (curSel && Array.from(curSel.options).some(o => o.value === cur)) {
        curSel.value = cur;
      }
      _applyCurrency(cur);
      // Sync header region selector (without triggering its 'change' event)
      const regionSel = el<HTMLSelectElement>('mfg-region-selector');
      if (regionSel && Array.from(regionSel.options).some(o => o.value === code)) {
        regionSel.value = code;
      }
      // Update info label
      const infoEl = document.getElementById('country-bar-info');
      if (infoEl) {
        const sym = CURRENCY_SYMBOL[cur] ?? cur;
        const matDelta = (rd.materialMultiplier - 1) * 100;
        const labRatio = rd.labour.semiskilled / REGIONAL_DATA['UK'].labour.semiskilled;
        const labDelta = (labRatio - 1) * 100;
        const sign = (n: number) => n >= 0 ? '+' : '';
        infoEl.textContent = `${rd.name} · ${sym} ${cur} · Mat ${sign(matDelta)}${matDelta.toFixed(0)}% · Labour ${sign(labDelta)}${labDelta.toFixed(0)}%`;
      }
    }
    // Refresh select option labels to reflect new regional rates
    populateSelects();
    // Auto-recalculate if results exist
    if (lastResult && lastInput) el('calc-btn')?.click();
  };
  el<HTMLSelectElement>('costing-country-sel')?.addEventListener('change', e => {
    _applyCountry((e.target as HTMLSelectElement).value);
  });

  // Manufacturing region selector — rebuilds rate library and auto-switches display currency
  const _regionSel = el<HTMLSelectElement>('mfg-region-selector');
  if (_regionSel) _regionSel.value = _mfgRegion;
  _regionSel?.addEventListener('change', e => {
    const region = (e.target as HTMLSelectElement).value as ManufacturingRegion;
    _mfgRegion = region;
    if (region === 'UK') {
      library = recomputeMachineRates(getLibraryFromStorage());
    } else {
      library = buildRegionalLibrary(recomputeMachineRates(getLibraryFromStorage()), region);
    }
    // Auto-switch display currency to region's native currency
    const nativeCur = REGIONAL_DATA[region]?.currency;
    const curSel = el<HTMLSelectElement>('currency-selector');
    if (nativeCur && curSel && Array.from(curSel.options).some(o => o.value === nativeCur)) {
      curSel.value = nativeCur;
      _applyCurrency(nativeCur);
    }
    // Sync country bar selector to match region (best-effort, only when code matches)
    const countrySel = el<HTMLSelectElement>('costing-country-sel');
    if (countrySel && Array.from(countrySel.options).some(o => o.value === region)) {
      countrySel.value = region;
      const infoEl = document.getElementById('country-bar-info');
      if (infoEl) {
        const rd = REGIONAL_DATA[region];
        if (rd) infoEl.textContent = `${rd.name} · ${nativeCur ?? region}`;
      }
    }
    // Auto-recalculate so results reflect new regional rates
    if (lastResult && lastInput) el('calc-btn')?.click();
    // Refresh dashboard if it's visible
    if (document.getElementById('home-view')?.style.display !== 'none') renderDashboard();
    // Refresh populateSelects in case UI is open
    if (typeof populateSelects === 'function') populateSelects();
  });

  // Part photo upload
  el<HTMLInputElement>('part-photo-input')?.addEventListener('change', () => {
    const file = el<HTMLInputElement>('part-photo-input').files?.[0];
    if (file) _processPhotoFile(file);
  });
  el('part-photo-clear')?.addEventListener('click', () => {
    partPhotoDataUrl = null;
    partPhotoName = null;
    (el<HTMLInputElement>('part-photo-input')).value = '';
    _updatePhotoUI();
  });
  const zone = el('part-photo-zone');
  zone?.addEventListener('click', () => el<HTMLInputElement>('part-photo-input').click());
  zone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.style.borderColor = '#e65100';
    zone.style.borderStyle = 'solid';
  });
  zone?.addEventListener('dragleave', () => {
    if (!partPhotoDataUrl) { zone.style.borderColor = '#ddd'; zone.style.borderStyle = 'dashed'; }
  });
  zone?.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = (e as DragEvent).dataTransfer?.files[0];
    if (file) _processPhotoFile(file);
    else if (!partPhotoDataUrl) { zone.style.borderColor = '#ddd'; zone.style.borderStyle = 'dashed'; }
  });

  // Action buttons — use .onclick so tab switching can override without stacking listeners
  el('calc-btn').onclick = compute;
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

  // Learning curve: disable inputs when checkbox is unchecked
  function syncLCInputs(): void {
    const enabled = (el<HTMLInputElement>('lc-enabled')).checked;
    ['annual-volume', 'learning-curve-pct', 'reference-volume'].forEach(id => {
      const inp = document.getElementById(id) as HTMLInputElement | null;
      if (inp) { inp.disabled = !enabled; inp.style.opacity = enabled ? '' : '0.4'; }
    });
  }
  el<HTMLInputElement>('lc-enabled')?.addEventListener('change', syncLCInputs);
  syncLCInputs(); // enforce initial disabled state

  // Start on machining
  switchCommodity('machining');

  // ─── Home dashboard wiring ────────────────────────────────────────────────

  // Home navigation
  document.getElementById('home-btn')?.addEventListener('click', showHome);
  document.getElementById('logo-home-btn')?.addEventListener('click', showHome);

  // New Costing button → commodity picker
  document.getElementById('new-costing-btn')?.addEventListener('click', showCommodityPicker);

  // ─── Demo Gallery modal ──────────────────────────────────────────────────────
  const demoModal = document.getElementById('demo-modal');
  const openDemoModal = () => { if (demoModal) demoModal.style.display = 'flex'; };
  const closeDemoModal = () => { if (demoModal) demoModal.style.display = 'none'; };

  document.getElementById('demo-btn')?.addEventListener('click', openDemoModal);
  document.getElementById('close-demo-modal')?.addEventListener('click', closeDemoModal);
  demoModal?.addEventListener('click', e => { if (e.target === demoModal) closeDemoModal(); });

  document.querySelectorAll<HTMLElement>('#demo-gallery-body .demo-card').forEach(card => {
    card.addEventListener('click', () => {
      const commodity = card.dataset.commodity ?? '';
      const slot = parseInt(card.dataset.slot ?? '1', 10);
      closeDemoModal();
      loadSUVDemo(commodity, slot);
    });
  });

  // Commodity picker — back button
  document.getElementById('cpicker-back-btn')?.addEventListener('click', showHome);

  // Commodity picker — tile clicks → workflow panel
  document.querySelectorAll('#commodity-picker-view .cpicker-tile[data-commodity]').forEach(tile => {
    tile.addEventListener('click', () => {
      showWorkflowPanel((tile as HTMLElement).dataset.commodity ?? 'machining');
    });
  });

  // Picker backdrop click → close panel
  document.getElementById('picker-backdrop')?.addEventListener('click', closeWorkflowPanel);

  // Panel header close button
  document.getElementById('wf-panel-close')?.addEventListener('click', closeWorkflowPanel);

  // Escape key closes panel/modals when open
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (document.body.classList.contains('cv-new-costing')) {
      closeWorkflowPanel();
    } else if (document.getElementById('costing-view')?.classList.contains('wf-panel')) {
      closeWorkflowPanel();
    }
    const demoModalEsc = document.getElementById('demo-modal');
    if (demoModalEsc?.style.display === 'flex') { demoModalEsc.style.display = 'none'; return; }
    const rateModal = el('rate-modal');
    if (rateModal?.style.display === 'flex') { rateModal.style.display = 'none'; return; }
    const scenarioModal = el('scenario-modal');
    if (scenarioModal?.style.display === 'flex') { scenarioModal.style.display = 'none'; return; }
  });

  // Dashboard filter chips
  function initFilterChips(groupId: string, key: keyof typeof _dashFilters): void {
    document.getElementById(groupId)?.querySelectorAll('.dchip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById(groupId)?.querySelectorAll('.dchip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        (_dashFilters as any)[key] = (btn as HTMLElement).dataset.val ?? '';
        renderDashboard();
      });
    });
  }
  initFilterChips('filter-vehicle', 'vehicle');
  initFilterChips('filter-commodity', 'commodity');
  initFilterChips('filter-system', 'system');

  document.getElementById('filter-cost-range')?.addEventListener('change', e => {
    _dashFilters.costRange = (e.target as HTMLSelectElement).value;
    renderDashboard();
  });
  document.getElementById('filter-region')?.addEventListener('change', e => {
    _dashFilters.region = (e.target as HTMLSelectElement).value;
    renderDashboard();
  });
  document.getElementById('filter-confidence')?.addEventListener('change', e => {
    _dashFilters.confidence = (e.target as HTMLSelectElement).value;
    renderDashboard();
  });
  document.getElementById('dash-filter-reset')?.addEventListener('click', () => {
    _dashFilters = { vehicle: '', commodity: '', system: '', costRange: '', region: '', confidence: '' };
    document.querySelectorAll('.dchip').forEach(b => {
      const grp = b.closest('.dash-filter-chips');
      if (grp) b.classList.toggle('active', (b as HTMLElement).dataset.val === '');
    });
    (document.getElementById('filter-cost-range') as HTMLSelectElement).value = '';
    (document.getElementById('filter-region') as HTMLSelectElement).value = '';
    (document.getElementById('filter-confidence') as HTMLSelectElement).value = '';
    renderDashboard();
  });

  // Clear history
  document.getElementById('dash-clear-hist')?.addEventListener('click', () => {
    if (confirm('Clear all costing history? This cannot be undone.')) {
      localStorage.removeItem('cv-history');
      renderDashboard();
    }
  });

  // Quick action tiles (commodity-specific shortcuts)
  document.getElementById('tile-casting')?.addEventListener('click', () => showCosting('casting'));
  document.getElementById('tile-sheet-metal')?.addEventListener('click', () => showCosting('sheet_metal'));
  document.getElementById('tile-plastic')?.addEventListener('click', () => showCosting('injection_moulding'));
  document.getElementById('tile-cad')?.addEventListener('click', () => showCosting('cad_analysis'));
  document.getElementById('tile-pcb-image')?.addEventListener('click', () => showCosting('pcb_fab'));
  document.getElementById('tile-ai-agent')?.addEventListener('click', () => showCosting('ai_agent'));
  // legacy ids from Phase 1 (kept for safety)
  document.getElementById('tile-new-costing')?.addEventListener('click', () => showCosting('machining'));
  document.getElementById('tile-assembly')?.addEventListener('click', () => showCosting('assembly'));
  document.getElementById('tile-scenarios')?.addEventListener('click', () => {
    showCosting('machining');
    setTimeout(() => document.querySelector<HTMLButtonElement>('.rtab[data-panel="scenarios"]')?.click(), 200);
  });

  // Re-open record from table
  document.getElementById('dash-recent-tbody')?.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest('.dash-reopen-btn');
    if (btn) {
      const recordId = (btn as HTMLElement).dataset.recordId;
      const record = getCostingHistory().find(r => r.id === recordId);
      if (record) showCosting(record.commodity);
      else showCosting();
    }
  });

  // Compare bar
  document.getElementById('compare-btn')?.addEventListener('click', () => renderComparePanel());
  document.getElementById('compare-cancel-btn')?.addEventListener('click', () => {
    _compareSelected.clear();
    updateCompareBar();
    const panel = document.getElementById('compare-panel');
    if (panel) panel.style.display = 'none';
    renderDashboard();
  });

  // AI Chat FAB
  document.getElementById('ai-chat-fab')?.addEventListener('click', toggleChat);
  document.getElementById('ai-chat-close')?.addEventListener('click', toggleChat);
  document.getElementById('ai-chat-send')?.addEventListener('click', () => { void sendChatMessage(); });
  document.getElementById('ai-chat-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendChatMessage(); }
  });

  // Sidebar collapse toggle
  document.getElementById('sidebar-toggle-btn')?.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('sidebar-collapsed');
    const btn = document.getElementById('sidebar-toggle-btn');
    if (btn) btn.textContent = collapsed ? '›' : '‹';
  });

  // AI Autofill
  document.getElementById('ai-autofill-btn')?.addEventListener('click', handleAIAutofill);
  document.getElementById('ai-autofill-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAIAutofill();
  });

  // Share Card export
  document.getElementById('export-card-btn')?.addEventListener('click', exportCostCard);

  // Input confidence indicators
  initConfidenceIndicators();

  // Initial view: show home on load
  showHome();
}

document.addEventListener('DOMContentLoaded', () => { void init(); });
