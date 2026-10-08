// AI CAD-to-Cost commodity + material option lists (pure data).

export const CAD_COMMODITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '— Auto-detect (from the geometry) —' },
  { value: 'machining', label: 'Machining (CNC)' },
  { value: 'gear', label: 'Gear Cutting (hands off to the Gear form)' },
  { value: 'casting', label: 'Casting (HPDC / Sand / Gravity)' },
  { value: 'cast_and_machine', label: 'Cast + Machine' },
  { value: 'forging', label: 'Forging (Closed-die)' },
  { value: 'sheet_metal', label: 'Sheet Metal (Stamping)' },
  { value: 'sheet_metal_fab', label: 'Sheet Metal Fabrication (Laser/Bend/Weld)' },
  { value: 'injection_moulding', label: 'Injection Moulding' },
  { value: 'blow_moulding', label: 'Blow Moulding' },
  { value: 'thermoforming', label: 'Thermoforming' },
  { value: 'rotational_moulding', label: 'Rotational Moulding' },
  { value: 'extrusion', label: 'Extrusion (polymer)' },
  { value: 'aluminium_extrusion', label: 'Aluminium Extrusion' },
  { value: 'composites', label: 'Composites (CFRP / GFRP)' },
  { value: 'rubber', label: 'Rubber Moulding' },
  { value: 'wiring_harness', label: 'Wiring Harness' },
  { value: 'assembly', label: 'Assembly' },
  { value: 'painting', label: 'Painting / Coating' },
  { value: 'pcb_fab', label: 'PCB Fabrication' },
  { value: 'pcba', label: 'PCBA (Electronics Assembly)' },
  { value: 'biw_assembly', label: 'BIW Assembly' },
];

import { DEFAULT_RATE_LIBRARY } from '../../engine/rate-library.js';
import { MATERIAL_SCOPE_BY_COMMODITY } from '../../engine/material-scope.js';

/**
 * Every commodity lists the library's own grades in the ENGINE's scope for it
 * (material scope review, Oct 2026); casting, cast + machine and forging first did so (casting & forging materials review, Oct 2026). The hand-written lists
 * pointed "LM25 / A356 (Gravity/Sand)" at wrought 6061 bar, "ADC12 (HPDC)" at 5052
 * sheet and every forging at machining bar — ids the casting and forging forms
 * cannot show, so a pinned grade left the form on its first option.
 */
function gradesInScope(commodity: string): Array<{ id: string; label: string }> {
  const scope = MATERIAL_SCOPE_BY_COMMODITY[commodity];
  return DEFAULT_RATE_LIBRARY.materials
    .filter(m => scope.test(m.category))
    .sort((a, b) => a.category.localeCompare(b.category) || a.pricePerKg - b.pricePerKg)
    .map(m => ({ id: m.id, label: `${m.grade} — ${m.category}` }));
}

export const CAD_MATERIALS_BY_COMMODITY: Record<string, Array<{ id: string; label: string }>> = {
  '': [],
  machining: gradesInScope('machining'),
  casting: gradesInScope('casting'),
  cast_and_machine: gradesInScope('cast_and_machine'),
  forging: gradesInScope('forging'),
  sheet_metal: gradesInScope('sheet_metal'),
  sheet_metal_fab: gradesInScope('sheet_metal_fab'),
  injection_moulding: gradesInScope('injection_moulding'),
  blow_moulding: gradesInScope('blow_moulding'),
  thermoforming: gradesInScope('thermoforming'),
  rotational_moulding: gradesInScope('rotational_moulding'),
  extrusion: gradesInScope('extrusion'),
  composites: gradesInScope('composites'),
  rubber: gradesInScope('rubber'),
  gear: gradesInScope('gear'),
  aluminium_extrusion: gradesInScope('aluminium_extrusion'),
};
