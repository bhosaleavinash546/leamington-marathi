import { el, num, sel, getUniversalTail } from '../helpers.js';
import * as state from '../state.js';
import { populateSelects } from '../populate.js';
import { computeBIWDrivers } from '../../engine/modules/biw-assembly.js';
import type { JoiningType } from '../../engine/modules/biw-assembly.js';
import type { UniversalStackInput } from '../../engine/types.js';

export function renderBIWForm(): string {
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

export function addJoinRow(d?: {type?: JoiningType; count?: number; costPerJoint?: number}): void {
  state.setJoinCount(state.joinCount + 1);
  const id = `join${state.joinCount}`;
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

export function addBIWStation(d?: {stationName?: string; machineId?: string; labourId?: string; cycleTimeHr?: number; oee?: number; manning?: number; labourEfficiency?: number}): void {
  state.setStationCount(state.stationCount + 1);
  const id = `sta${state.stationCount}`;
  const c = el('biw-stations-container');
  if (!c) return;
  const div = document.createElement('div');
  div.className = 'op-card'; div.dataset.stationId = id;
  div.innerHTML = `
    <div class="op-title">Station ${state.stationCount}
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

export function collectBIWInput(): UniversalStackInput {
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
