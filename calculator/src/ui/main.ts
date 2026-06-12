import './styles/calculator.css';
import {
  computeUniversalStack,
  validateStackInput,
  breakdownPercentages,
  DEFAULT_RATE_LIBRARY,
  recomputeMachineRates,
  getLibraryFromStorage,
  saveLibraryToStorage,
} from '../engine/index.js';
import type {
  UniversalStackInput,
  PartCostResult,
  OperationInput,
  RateLibrary,
} from '../engine/types.js';
import { exportToExcelBlob } from '../export/excel.js';

// ─── State ───────────────────────────────────────────────────────────────────

let library: RateLibrary = recomputeMachineRates(getLibraryFromStorage());
let lastResult: PartCostResult | null = null;
let opCount = 0;

// ─── DOM helpers ─────────────────────────────────────────────────────────────

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} not found`);
  return e as T;
}

function val(id: string): string {
  return (el<HTMLInputElement>(id)).value.trim();
}

function num(id: string): number {
  return parseFloat(val(id)) || 0;
}

function sel(id: string): string {
  return el<HTMLSelectElement>(id).value;
}

function fmt(n: number): string {
  return `£${n.toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

// ─── Rate Library selectors ───────────────────────────────────────────────────

function populateSelects(): void {
  const materialSelects = document.querySelectorAll<HTMLSelectElement>('.material-select');
  const machineSelects  = document.querySelectorAll<HTMLSelectElement>('.machine-select');
  const labourSelects   = document.querySelectorAll<HTMLSelectElement>('.labour-select');

  materialSelects.forEach(s => {
    const cur = s.value;
    s.innerHTML = library.materials.map(m => `<option value="${m.id}">${m.grade} (${m.region}) — £${m.pricePerKg}/kg</option>`).join('');
    if (cur) s.value = cur;
  });

  machineSelects.forEach(s => {
    const cur = s.value;
    s.innerHTML = library.machines.map(m => `<option value="${m.id}">${m.machineClass} — £${m.computedRatePerHr.toFixed(2)}/hr</option>`).join('');
    if (cur) s.value = cur;
  });

  labourSelects.forEach(s => {
    const cur = s.value;
    s.innerHTML = library.labour.map(l => `<option value="${l.id}">${l.skillLevel} (${l.region}) — £${l.fullyLoadedRatePerHr}/hr</option>`).join('');
    if (cur) s.value = cur;
  });
}

// ─── Operations ───────────────────────────────────────────────────────────────

function addOperation(defaults?: Partial<OperationInput>): void {
  opCount++;
  const id = `op-${opCount}`;
  const container = el('operations-container');

  const div = document.createElement('div');
  div.className = 'op-card';
  div.dataset.opId = id;

  div.innerHTML = `
    <div class="op-title">Operation ${opCount}</div>
    <button class="remove-op" title="Remove" data-op-id="${id}">✕</button>
    <div class="field-group" style="margin-bottom:8px">
      <label>Name</label>
      <input type="text" id="${id}-name" value="${defaults?.operationName ?? `Operation ${opCount}`}" />
    </div>
    <div class="field-row">
      <div class="field-group">
        <label>Machine</label>
        <select id="${id}-machine" class="machine-select"></select>
      </div>
      <div class="field-group">
        <label>Labour</label>
        <select id="${id}-labour" class="labour-select"></select>
      </div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group">
        <label>Cycle Time (hr)</label>
        <input type="number" id="${id}-cycle" step="0.001" min="0" value="${defaults?.cycleTimeHr ?? 0.05}" />
      </div>
      <div class="field-group">
        <label>Parts/Cycle</label>
        <input type="number" id="${id}-ppc" min="1" step="1" value="${defaults?.partsPerCycle ?? 1}" />
      </div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group">
        <label>OEE (0–1)</label>
        <input type="number" id="${id}-oee" step="0.01" min="0.01" max="1" value="${defaults?.oee ?? 0.85}" />
      </div>
      <div class="field-group">
        <label>Manning</label>
        <input type="number" id="${id}-manning" step="0.5" min="0" value="${defaults?.manning ?? 1}" />
      </div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group">
        <label>Labour Time (hr)</label>
        <input type="number" id="${id}-ltime" step="0.001" min="0" value="${defaults?.labourTimeHr ?? 0.05}" />
      </div>
      <div class="field-group">
        <label>Labour Efficiency</label>
        <input type="number" id="${id}-leff" step="0.01" min="0.01" max="1" value="${defaults?.labourEfficiency ?? 0.92}" />
      </div>
    </div>
  `;

  container.appendChild(div);
  populateSelects();

  if (defaults?.machineId) {
    const ms = div.querySelector<HTMLSelectElement>('.machine-select');
    if (ms) ms.value = defaults.machineId;
  }
  if (defaults?.labourId) {
    const ls = div.querySelector<HTMLSelectElement>('.labour-select');
    if (ls) ls.value = defaults.labourId;
  }

  div.querySelector('.remove-op')?.addEventListener('click', () => {
    div.remove();
  });
}

function collectOperations(): OperationInput[] {
  const cards = document.querySelectorAll<HTMLElement>('.op-card');
  return Array.from(cards).map(card => {
    const id = card.dataset.opId!;
    return {
      operationName: (document.getElementById(`${id}-name`) as HTMLInputElement).value,
      machineId: (document.getElementById(`${id}-machine`) as HTMLSelectElement).value,
      labourId: (document.getElementById(`${id}-labour`) as HTMLSelectElement).value,
      cycleTimeHr: parseFloat((document.getElementById(`${id}-cycle`) as HTMLInputElement).value) || 0,
      partsPerCycle: parseInt((document.getElementById(`${id}-ppc`) as HTMLInputElement).value) || 1,
      oee: parseFloat((document.getElementById(`${id}-oee`) as HTMLInputElement).value) || 0.85,
      manning: parseFloat((document.getElementById(`${id}-manning`) as HTMLInputElement).value) || 1,
      labourTimeHr: parseFloat((document.getElementById(`${id}-ltime`) as HTMLInputElement).value) || 0,
      labourEfficiency: parseFloat((document.getElementById(`${id}-leff`) as HTMLInputElement).value) || 0.92,
    };
  });
}

// ─── Compute ──────────────────────────────────────────────────────────────────

function compute(): void {
  const input: UniversalStackInput = {
    partName: val('part-name') || 'Unnamed Part',
    rawMaterial: {
      materialId: sel('material-select'),
      netWeightKg: num('net-weight'),
      materialUtilization: num('mat-util'),
    },
    operations: collectOperations(),
    tooling: {
      totalToolingCost: num('tooling-cost'),
      amortizationVolume: num('amort-vol'),
      mode: sel('tooling-mode') as 'amortized' | 'one_time_nre',
    },
    packagingPerPart: num('packaging'),
    logisticsPerPart: num('logistics'),
    overheadPct: num('overhead-pct') / 100,
    marginPct: num('margin-pct') / 100,
  };

  const validation = validateStackInput(input, library);

  const errBox = el('validation-errors');
  const warnBox = el('validation-warnings');

  if (!validation.valid) {
    errBox.style.display = 'block';
    errBox.innerHTML = `<strong>Errors:</strong><ul>${validation.errors.map(e => `<li>${e.field}: ${e.message}</li>`).join('')}</ul>`;
    renderResults(null);
    return;
  } else {
    errBox.style.display = 'none';
  }

  if (validation.warnings.length > 0) {
    warnBox.style.display = 'block';
    warnBox.innerHTML = `<strong>Warnings:</strong><ul>${validation.warnings.map(w => `<li>${w.field}: ${w.message}</li>`).join('')}</ul>`;
  } else {
    warnBox.style.display = 'none';
  }

  try {
    const result = computeUniversalStack(input, library);
    lastResult = result;
    renderResults(result);
  } catch (err) {
    errBox.style.display = 'block';
    errBox.innerHTML = `<strong>Calculation error:</strong> ${err instanceof Error ? err.message : String(err)}`;
    renderResults(null);
  }
}

// ─── Render Results ───────────────────────────────────────────────────────────

function renderResults(result: PartCostResult | null): void {
  const panel = el('results-output');

  if (!result) {
    panel.innerHTML = '<div class="placeholder">Fill in inputs and click Calculate.</div>';
    el('export-btn').style.display = 'none';
    return;
  }

  el('export-btn').style.display = 'inline-flex';

  const pcts = breakdownPercentages(result);

  const buckets = [
    { label: '1. Raw Material', value: result.breakdown.rawMaterial, pct: pcts.rawMaterial },
    { label: '2. Process (Machine)', value: result.breakdown.process, pct: pcts.process },
    { label: '3. Direct Labour', value: result.breakdown.labour, pct: pcts.labour },
    { label: '4. Tooling', value: result.breakdown.tooling, pct: pcts.tooling },
    { label: '5. Packaging', value: result.breakdown.packaging, pct: pcts.packaging },
    { label: '6. Logistics', value: result.breakdown.logistics, pct: pcts.logistics },
  ];

  const maxPct = Math.max(...buckets.map(b => b.pct));

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
        <div class="card-label">Conversion (Process+Labour)</div>
        <div class="card-value">${fmt(result.breakdown.process + result.breakdown.labour)}</div>
        <div class="card-sub">${fmtPct(pcts.process + pcts.labour)} of total</div>
      </div>
      <div class="summary-card">
        <div class="card-label">Overhead + Margin</div>
        <div class="card-value">${fmt(result.breakdown.overhead + result.breakdown.margin)}</div>
        <div class="card-sub">${fmtPct(pcts.overhead + pcts.margin)} of total</div>
      </div>
    </div>

    <div>
      <div class="panel-title">8-Bucket Cost Breakdown</div>
      <table class="breakdown-table">
        <thead>
          <tr><th>Bucket</th><th>Amount</th><th>% of Total</th><th style="width:200px">Bar</th></tr>
        </thead>
        <tbody>
          ${buckets.map(b => `
            <tr>
              <td>${b.label}</td>
              <td>${fmt(b.value)}</td>
              <td>${fmtPct(b.pct)}</td>
              <td><div class="pct-bar"><div class="pct-fill" style="width:${Math.max(4, (b.pct / maxPct) * 180)}px"></div></div></td>
            </tr>
          `).join('')}
          <tr class="subtotal-row">
            <td>Factory Cost</td>
            <td>${fmt(result.factoryCost)}</td>
            <td>${fmtPct((result.factoryCost / result.total) * 100)}</td>
            <td></td>
          </tr>
          <tr>
            <td>7. Overhead (SG&amp;A)</td>
            <td>${fmt(result.breakdown.overhead)}</td>
            <td>${fmtPct(pcts.overhead)}</td>
            <td><div class="pct-bar"><div class="pct-fill" style="width:${Math.max(4, (pcts.overhead / maxPct) * 180)}px; opacity:0.4"></div></div></td>
          </tr>
          <tr class="subtotal-row">
            <td>Subtotal</td>
            <td>${fmt(result.subtotal)}</td>
            <td>${fmtPct((result.subtotal / result.total) * 100)}</td>
            <td></td>
          </tr>
          <tr>
            <td>8. Supplier Margin</td>
            <td>${fmt(result.breakdown.margin)}</td>
            <td>${fmtPct(pcts.margin)}</td>
            <td><div class="pct-bar"><div class="pct-fill" style="width:${Math.max(4, (pcts.margin / maxPct) * 180)}px; opacity:0.4"></div></div></td>
          </tr>
          <tr class="total-row">
            <td>TOTAL SHOULD COST</td>
            <td>${fmt(result.total)}</td>
            <td>100.0%</td>
            <td></td>
          </tr>
          ${result.toolingNRE !== undefined ? `
          <tr>
            <td>NRE / Tooling (one-time)</td>
            <td>${fmt(result.toolingNRE)}</td>
            <td>—</td>
            <td style="font-size:0.75rem;color:#888">Not in unit cost</td>
          </tr>` : ''}
        </tbody>
      </table>
    </div>

    <div>
      <div class="panel-title">Operations Detail</div>
      <table class="ops-table">
        <thead>
          <tr>
            <th>Operation</th>
            <th>Machine Rate</th>
            <th>Process Cost</th>
            <th>Labour Rate</th>
            <th>Labour Cost</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${result.operationDetails.map(op => `
            <tr>
              <td>${op.operationName}</td>
              <td>£${op.machineRateUsed.toFixed(2)}/hr</td>
              <td>${fmt(op.processCost)}</td>
              <td>£${op.labourRateUsed.toFixed(2)}/hr</td>
              <td>${fmt(op.labourCost)}</td>
              <td>${fmt(op.processCost + op.labourCost)}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td>Total</td><td></td>
            <td>${fmt(result.breakdown.process)}</td>
            <td></td>
            <td>${fmt(result.breakdown.labour)}</td>
            <td>${fmt(result.breakdown.process + result.breakdown.labour)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div>
      <div class="panel-title">Rate Traceability &amp; Assumptions</div>
      <table class="trace-table">
        <thead>
          <tr><th>Field</th><th>Value</th><th>Unit</th><th>Source</th><th>Confidence</th></tr>
        </thead>
        <tbody>
          ${result.traceability.map(t => `
            <tr>
              <td>${t.field}</td>
              <td>${t.value}</td>
              <td>${t.unit}</td>
              <td style="font-family:sans-serif;font-size:0.77rem">${t.rateSource}</td>
              <td><span class="badge ${t.confidence}">${t.confidence}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
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

// ─── Load Reference Part ─────────────────────────────────────────────────────

function loadReferencePart(): void {
  (el('part-name') as HTMLInputElement).value = 'Al6061 Bracket';
  (el('net-weight') as HTMLInputElement).value = '0.5';
  (el('mat-util') as HTMLInputElement).value = '0.65';
  el<HTMLSelectElement>('material-select').value = 'mat-al6061';
  (el('tooling-cost') as HTMLInputElement).value = '15000';
  (el('amort-vol') as HTMLInputElement).value = '50000';
  el<HTMLSelectElement>('tooling-mode').value = 'amortized';
  (el('packaging') as HTMLInputElement).value = '0.15';
  (el('logistics') as HTMLInputElement).value = '0.25';
  (el('overhead-pct') as HTMLInputElement).value = '12';
  (el('margin-pct') as HTMLInputElement).value = '8';

  el('operations-container').innerHTML = '';
  opCount = 0;

  addOperation({ operationName: 'CNC Turning', machineId: 'mach-lathe-cnc', labourId: 'lab-uk-skilled', cycleTimeHr: 0.05, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.05, labourEfficiency: 0.92 });
  addOperation({ operationName: 'CNC Milling', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled', cycleTimeHr: 0.12, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.12, labourEfficiency: 0.92 });
  addOperation({ operationName: 'CNC Drilling', machineId: 'mach-drill', labourId: 'lab-uk-skilled', cycleTimeHr: 0.03, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.03, labourEfficiency: 0.92 });

  compute();
}

// ─── Rate Library Editor ─────────────────────────────────────────────────────

function openRateLibrary(): void {
  const modal = el('rate-modal');
  modal.style.display = 'flex';
  renderRateLibraryTable();
}

function renderRateLibraryTable(): void {
  const container = el('rate-library-content');
  container.innerHTML = `
    <div class="panel-title" style="margin-bottom:8px">Materials</div>
    <table class="breakdown-table" style="margin-bottom:16px;font-size:0.78rem">
      <thead>
        <tr><th>ID</th><th>Grade</th><th>Price/kg (£)</th><th>Scrap/kg (£)</th><th>Region</th><th>Confidence</th></tr>
      </thead>
      <tbody>
        ${library.materials.map(m => `
          <tr>
            <td>${m.id}</td>
            <td>${m.grade}</td>
            <td><input type="number" step="0.01" value="${m.pricePerKg}" data-update="material.${m.id}.pricePerKg" style="width:70px;padding:2px 4px;border:1px solid #ddd;border-radius:3px" /></td>
            <td><input type="number" step="0.01" value="${m.scrapRecoveryPricePerKg}" data-update="material.${m.id}.scrapRecoveryPricePerKg" style="width:70px;padding:2px 4px;border:1px solid #ddd;border-radius:3px" /></td>
            <td>${m.region}</td>
            <td><span class="badge ${m.confidence}">${m.confidence}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="panel-title" style="margin-bottom:8px">Machine Rates</div>
    <table class="breakdown-table" style="margin-bottom:16px;font-size:0.78rem">
      <thead>
        <tr><th>ID</th><th>Class</th><th>Computed Rate (£/hr)</th><th>Depreciation</th><th>Maintenance</th><th>Energy</th><th>Hours/yr</th><th>Utilisation</th></tr>
      </thead>
      <tbody>
        ${library.machines.map(m => `
          <tr>
            <td>${m.id}</td>
            <td>${m.machineClass}</td>
            <td style="font-weight:700">£${m.computedRatePerHr.toFixed(2)}</td>
            <td><input type="number" step="100" value="${m.buildup.annualDepreciation}" data-update="machine.${m.id}.annualDepreciation" style="width:70px;padding:2px 4px;border:1px solid #ddd;border-radius:3px" /></td>
            <td><input type="number" step="100" value="${m.buildup.maintenance}" data-update="machine.${m.id}.maintenance" style="width:70px;padding:2px 4px;border:1px solid #ddd;border-radius:3px" /></td>
            <td><input type="number" step="100" value="${m.buildup.energy}" data-update="machine.${m.id}.energy" style="width:70px;padding:2px 4px;border:1px solid #ddd;border-radius:3px" /></td>
            <td><input type="number" step="100" value="${m.buildup.annualAvailableHours}" data-update="machine.${m.id}.annualAvailableHours" style="width:60px;padding:2px 4px;border:1px solid #ddd;border-radius:3px" /></td>
            <td><input type="number" step="0.01" max="1" value="${m.buildup.machineUtilization}" data-update="machine.${m.id}.machineUtilization" style="width:55px;padding:2px 4px;border:1px solid #ddd;border-radius:3px" /></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="panel-title" style="margin-bottom:8px">Labour Rates</div>
    <table class="breakdown-table" style="font-size:0.78rem">
      <thead>
        <tr><th>ID</th><th>Region</th><th>Skill Level</th><th>Rate (£/hr)</th><th>Confidence</th></tr>
      </thead>
      <tbody>
        ${library.labour.map(l => `
          <tr>
            <td>${l.id}</td>
            <td>${l.region}</td>
            <td>${l.skillLevel}</td>
            <td><input type="number" step="0.5" value="${l.fullyLoadedRatePerHr}" data-update="labour.${l.id}.fullyLoadedRatePerHr" style="width:70px;padding:2px 4px;border:1px solid #ddd;border-radius:3px" /></td>
            <td><span class="badge ${l.confidence}">${l.confidence}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function applyRateLibraryEdits(): void {
  const inputs = el('rate-library-content').querySelectorAll<HTMLInputElement>('input[data-update]');
  inputs.forEach(input => {
    const path = input.dataset.update!.split('.');
    const [type, id, field] = path;
    const value = parseFloat(input.value);
    if (isNaN(value)) return;

    if (type === 'material') {
      const mat = library.materials.find(m => m.id === id);
      if (mat) (mat as Record<string, unknown>)[field] = value;
    } else if (type === 'machine') {
      const machine = library.machines.find(m => m.id === id);
      if (machine) (machine.buildup as Record<string, unknown>)[field] = value;
    } else if (type === 'labour') {
      const labour = library.labour.find(l => l.id === id);
      if (labour) (labour as Record<string, unknown>)[field] = value;
    }
  });

  library = recomputeMachineRates(library);
  saveLibraryToStorage(library);
  populateSelects();
  el('rate-modal').style.display = 'none';
}

function resetRateLibrary(): void {
  if (!confirm('Reset rate library to defaults?')) return;
  library = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
  saveLibraryToStorage(library);
  populateSelects();
  el('rate-modal').style.display = 'none';
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init(): void {
  populateSelects();
  addOperation({ operationName: 'CNC Turning', machineId: 'mach-lathe-cnc', labourId: 'lab-uk-skilled', cycleTimeHr: 0.05, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.05, labourEfficiency: 0.92 });

  el('add-op-btn').addEventListener('click', () => addOperation());
  el('calc-btn').addEventListener('click', compute);
  el('export-btn').addEventListener('click', downloadExcel);
  el('load-ref-btn').addEventListener('click', loadReferencePart);
  el('rates-btn').addEventListener('click', openRateLibrary);
  el('close-modal-btn').addEventListener('click', () => { el('rate-modal').style.display = 'none'; });
  el('apply-rates-btn').addEventListener('click', applyRateLibraryEdits);
  el('reset-rates-btn').addEventListener('click', resetRateLibrary);

  el('rate-modal').addEventListener('click', (e) => {
    if (e.target === el('rate-modal')) el('rate-modal').style.display = 'none';
  });

  // Auto-sync labour time with cycle time for convenience
  document.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;
    if (target.id?.endsWith('-cycle')) {
      const opId = target.id.replace('-cycle', '');
      const ltimeEl = document.getElementById(`${opId}-ltime`) as HTMLInputElement | null;
      if (ltimeEl && ltimeEl.value === ltimeEl.defaultValue) {
        ltimeEl.value = (target as HTMLInputElement).value;
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
