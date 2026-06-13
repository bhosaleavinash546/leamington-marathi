import { el, val, num, sel, getUniversalTail } from '../helpers.js';
import * as state from '../state.js';
import { populateSelects } from '../populate.js';
import { computeMachiningDrivers } from '../../engine/modules/machining.js';
import type { MachiningOperation } from '../../engine/modules/machining.js';
import type { UniversalStackInput } from '../../engine/types.js';

export function renderMachiningForm(): string {
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

export function addMachOp(d?: Partial<MachiningOperation>): void {
  state.setMachOpCount(state.machOpCount + 1);
  const id = `mop${state.machOpCount}`;
  const c = el('mach-ops-container');
  if (!c) return;
  const div = document.createElement('div');
  div.className = 'op-card'; div.dataset.opId = id;
  div.innerHTML = `
    <div class="op-title">Op ${state.machOpCount}
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

export function collectMachiningInput(): UniversalStackInput {
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

// suppress unused import warning
void val;
