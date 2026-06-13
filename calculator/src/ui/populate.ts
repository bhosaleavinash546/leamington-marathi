import * as state from './state.js';

export function populateSelects(): void {
  const matOpts = state.library.materials.map(m =>
    `<option value="${m.id}">${m.grade} (${m.region}) — £${m.pricePerKg.toFixed(2)}/kg</option>`
  ).join('');
  const machOpts = state.library.machines.map(m =>
    `<option value="${m.id}">${m.machineClass} — £${m.computedRatePerHr.toFixed(2)}/hr</option>`
  ).join('');
  const labOpts = state.library.labour.map(l =>
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
