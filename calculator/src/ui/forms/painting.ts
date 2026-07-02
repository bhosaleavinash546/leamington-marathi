import { el, num, sel, getUniversalTail } from '../helpers.js';
import * as state from '../state.js';
import { computePaintingDrivers } from '../../engine/modules/painting.js';
import type { CoatType } from '../../engine/modules/painting.js';
import type { UniversalStackInput } from '../../engine/types.js';

export function renderPaintingForm(): string {
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

export function addCoatRow(d?: {coatType?: CoatType; materialId?: string; dftMicrons?: number; solidsPct?: number; transferEfficiency?: number; paintDensityKgPerL?: number; pricePerL?: number}): void {
  state.setCoatCount(state.coatCount + 1);
  const id = `coat${state.coatCount}`;
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

export function collectPaintingInput(): UniversalStackInput {
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
