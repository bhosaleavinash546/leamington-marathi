/**
 * The parameter dictionary — the canonical names every source uses (offline 2D drawing intelligence, Nov 2026).
 *
 * A source never invents a name: it emits one of these, so the unified layer can compare a CAD value with a drawing
 * value without knowing who produced either. Adding a name is adding a row here — nothing else in the layer changes.
 *
 * `multiple: true` names repeat (one per hole, per dimension, per note) and are matched by `appliesTo`, never merged.
 */
export interface ParameterDef {
  name: string;
  label: string;
  /** Normalised unit the value is held in. */
  unit?: string;
  valueType: 'text' | 'number' | 'flag' | 'object';
  multiple?: boolean;
  group: 'identity' | 'material' | 'geometry' | 'tolerance' | 'finish' | 'heat-treatment' | 'joining'
    | 'feature' | 'quality' | 'gear' | 'note';
}

const d = (name: string, label: string, group: ParameterDef['group'], valueType: ParameterDef['valueType'] = 'text',
  unit?: string, multiple?: boolean): ParameterDef => ({ name, label, group, valueType, ...(unit ? { unit } : {}), ...(multiple ? { multiple } : {}) });

export const PARAMETER_DEFS: readonly ParameterDef[] = [
  // ── Identity (title block) ──
  d('title.partNumber', 'Part number', 'identity'),
  d('title.partName', 'Part name', 'identity'),
  d('title.drawingNumber', 'Drawing number', 'identity'),
  d('title.revision', 'Revision / issue', 'identity'),
  d('title.date', 'Drawing date', 'identity'),
  d('title.scale', 'Scale', 'identity'),
  d('title.sheet', 'Sheet', 'identity'),
  d('title.units', 'Drawing units', 'identity'),
  d('title.projection', 'Projection method', 'identity'),
  d('title.company', 'Company / owner', 'identity'),
  // ── Material ──
  d('material.designation', 'Material as written', 'material'),
  d('material.standard', 'Material standard', 'material'),
  d('material.specCode', 'Company specification code', 'material', 'text', undefined, true),
  d('material.family', 'Material family', 'material'),
  d('material.grade', 'Material grade (rate book)', 'material'),
  d('material.condition', 'Temper / delivery condition', 'material'),
  d('material.stockThickness', 'Stock / sheet thickness', 'material', 'number', 'mm'),
  d('material.density', 'Density', 'material', 'number', 'g/cm3'),
  // ── Geometry (mostly CAD) ──
  d('part.volume', 'Volume', 'geometry', 'number', 'cm3'),
  d('part.surfaceArea', 'Surface area', 'geometry', 'number', 'cm2'),
  d('part.mass', 'Mass', 'geometry', 'number', 'kg'),
  d('part.envelope', 'Envelope L × W × H', 'geometry', 'object', 'mm'),
  d('part.wallThickness', 'Wall / section thickness', 'geometry', 'number', 'mm'),
  // ── Tolerances ──
  d('tolerance.general', 'General tolerance as written', 'tolerance'),
  d('tolerance.generalClass', 'General tolerance class', 'tolerance'),
  d('tolerance.castingGrade', 'Casting tolerance grade', 'tolerance'),
  d('tolerance.tightest', 'Tightest toleranced dimension', 'tolerance', 'object'),
  d('dimension', 'Dimension', 'feature', 'object', 'mm', true),
  d('gdt.frame', 'Geometric tolerance', 'tolerance', 'object', 'mm', true),
  d('gdt.datum', 'Datum', 'tolerance', 'text', undefined, true),
  // ── Features ──
  d('hole.diameter', 'Hole diameter', 'feature', 'object', 'mm', true),
  d('thread', 'Thread', 'feature', 'object', undefined, true),
  d('feature.count.holes', 'Holes (count)', 'feature', 'number'),
  d('feature.count.threads', 'Threaded holes (count)', 'feature', 'number'),
  // ── Surface finish and coating ──
  d('finish.roughnessGeneral', 'General surface roughness', 'finish', 'object', 'µm'),
  d('finish.roughness', 'Surface roughness', 'finish', 'object', 'µm', true),
  d('finish.coating', 'Coating / plating / paint', 'finish', 'text', undefined, true),
  d('finish.coatingRoute', 'Coating route', 'finish'),
  d('finish.coatingThickness', 'Coating thickness', 'finish', 'object', 'µm'),
  d('finish.maskedFeatures', 'Masked features', 'finish', 'number'),
  // ── Heat treatment ──
  d('heatTreat.process', 'Heat treatment', 'heat-treatment', 'text', undefined, true),
  d('heatTreat.hardness', 'Hardness', 'heat-treatment', 'object', undefined, true),
  d('heatTreat.caseDepth', 'Case depth', 'heat-treatment', 'object', 'mm'),
  // ── Joining ──
  d('weld.note', 'Welding note', 'joining', 'text', undefined, true),
  d('weld.symbol', 'Weld symbol', 'joining', 'object', undefined, true),
  d('weld.standard', 'Welding standard / class', 'joining'),
  // ── Quality and service ──
  d('quality.safetyCritical', 'Safety / critical characteristic marking', 'quality', 'flag'),
  d('quality.pressureTight', 'Leak / pressure test requirement', 'quality', 'flag'),
  d('quality.leakTestSpec', 'Leak test as written', 'quality'),
  d('quality.ndt', 'Non-destructive test requirement', 'quality', 'text', undefined, true),
  d('quality.inspection', 'Inspection requirement', 'quality', 'text', undefined, true),
  d('quality.cleanliness', 'Cleanliness requirement', 'quality'),
  d('quality.impregnation', 'Impregnation requirement', 'quality'),
  d('quality.marking', 'Part marking', 'quality'),
  // ── Gear data table ──
  d('gear.teeth', 'Number of teeth', 'gear', 'number'),
  d('gear.module', 'Normal module', 'gear', 'number', 'mm'),
  d('gear.pressureAngle', 'Pressure angle', 'gear', 'number', 'deg'),
  d('gear.helixAngle', 'Helix angle', 'gear', 'number', 'deg'),
  d('gear.faceWidth', 'Face width', 'gear', 'number', 'mm'),
  d('gear.qualityClass', 'Gear quality class', 'gear'),
  // ── Notes ──
  d('note.manufacturing', 'Manufacturing note', 'note', 'text', undefined, true),
  d('note.general', 'General note', 'note', 'text', undefined, true),
];

const BY_NAME = new Map(PARAMETER_DEFS.map(p => [p.name, p]));

/** The definition of a canonical name, or undefined for a name that is not in the dictionary. */
export function parameterDef(name: string): ParameterDef | undefined { return BY_NAME.get(name); }

export function isKnownParameter(name: string): boolean { return BY_NAME.has(name); }
