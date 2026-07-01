/**
 * CostVision — Custom rate library (admin-uploaded)
 * ------------------------------------------------------------------
 * Lets an admin override the engine's built-in reference data with their
 * organisation's own numbers, MERGED over the defaults (partial uploads are
 * fine — anything not provided falls back to the shipped value).
 *
 *   FIELD_SPECS                — column schema (drives the template + validation)
 *   validateLibrary(custom)    — { ok, errors, normalized }
 *   mergeLibrary(custom)       — { MATERIALS, PROCESSES, REGIONS, constants }
 *
 * Pure & dependency-free apart from the engine defaults.
 */
import { MATERIALS, PROCESSES, REGIONS, COST_CONSTANTS } from './costing-engine.mjs';

// num = positive number required for NEW rows; pct = 0..1; int = whole number.
export const FIELD_SPECS = {
  materials: {
    key: 'Material',
    fields: [
      { id: 'price',         label: 'Price (€/kg)',        type: 'num' },
      { id: 'density',       label: 'Density (g/cm³)',     type: 'num' },
      { id: 'scrapRecovery', label: 'Scrap recovery (0-1)',type: 'pct' },
      { id: 'family',        label: 'Family',              type: 'str' },
    ],
  },
  processes: {
    key: 'Process',
    fields: [
      { id: 'machineRate',     label: 'Machine rate (€/hr)',   type: 'num' },
      { id: 'operators',       label: 'Operators',             type: 'num0' },
      { id: 'cavities',        label: 'Cavities',              type: 'num' },
      { id: 'utilisation',     label: 'Utilisation (0-1)',     type: 'pct' },
      { id: 'scrapPct',        label: 'Scrap % (0-1)',         type: 'pct' },
      { id: 'setupHr',         label: 'Setup (hr/batch)',      type: 'num0' },
      { id: 'batch',           label: 'Batch (parts/setup)',   type: 'num' },
      { id: 'toolLife',        label: 'Tool life (parts)',     type: 'num' },
      { id: 'cycleBase',       label: 'Cycle base (s)',        type: 'num0' },
      { id: 'cyclePerKg',      label: 'Cycle per kg (s/kg)',   type: 'num0' },
      { id: 'toolingBase',     label: 'Tooling base (€)',      type: 'num0' },
      { id: 'toolingPerKg',    label: 'Tooling per kg (€/kg)', type: 'num0' },
      { id: 'finishPct',       label: 'Finishing % (0-1)',     type: 'pct0' },
      { id: 'setups',          label: 'Setups (#)',            type: 'num' },
      { id: 'perishablePerHr', label: 'Perishable (€/hr)',     type: 'num0' },
      { id: 'families',        label: 'Families (a|b|c)',      type: 'list' },
    ],
  },
  regions: {
    key: 'Region',
    fields: [
      { id: 'labour',      label: 'Labour (€/hr)',    type: 'num' },
      { id: 'overheadPct', label: 'Overhead (0-1)',   type: 'pct' },
      { id: 'sgaPct',      label: 'SG&A/profit (0-1)',type: 'pct' },
    ],
  },
  constants: {
    key: 'Constant',
    fields: [
      { id: 'commercialPct',    label: 'Commercial % (0-1)', type: 'pct' },
      { id: 'defaultFinishPct', label: 'Default finish % (0-1)', type: 'pct' },
    ],
  },
};

const DEFAULTS = { materials: MATERIALS, processes: PROCESSES, regions: REGIONS };

// Coerce/validate a single value against its field spec. Returns { value } or { error }.
function coerce(type, raw) {
  if (type === 'str') {
    const s = String(raw ?? '').trim();
    return s ? { value: s } : { error: 'required' };
  }
  if (type === 'list') {
    const arr = Array.isArray(raw) ? raw : String(raw ?? '').split(/[|,]/);
    const list = arr.map(s => String(s).trim().toLowerCase()).filter(Boolean);
    return list.length ? { value: list } : { error: 'required (families like "ferrous|aluminium")' };
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return { error: 'must be a number' };
  if ((type === 'num' || type === 'pct') && !(n > 0)) return { error: 'must be > 0' };
  if ((type === 'num0' || type === 'pct0') && n < 0) return { error: 'must be ≥ 0' };
  if ((type === 'pct' || type === 'pct0') && n > 1) return { error: 'must be a fraction 0–1 (e.g. 0.15, not 15)' };
  return { value: n };
}

/**
 * Validate a custom library. Existing rows may be PARTIAL (override selected
 * fields); NEW rows (keys not in the defaults) must provide every field.
 * Returns { ok, errors: [{table,row,field,message}], normalized }.
 */
export function validateLibrary(custom) {
  const errors = [];
  const normalized = { materials: {}, processes: {}, regions: {}, constants: {} };
  if (!custom || typeof custom !== 'object') return { ok: false, errors: [{ message: 'Empty or invalid library.' }], normalized };

  for (const table of ['materials', 'processes', 'regions']) {
    const spec = FIELD_SPECS[table];
    const rows = custom[table] && typeof custom[table] === 'object' ? custom[table] : {};
    for (const [name, row] of Object.entries(rows)) {
      if (!row || typeof row !== 'object') { errors.push({ table, row: name, message: 'row must be an object' }); continue; }
      const isNew = !DEFAULTS[table][name];
      const out = {};
      for (const f of spec.fields) {
        const provided = row[f.id] !== undefined && row[f.id] !== '' && row[f.id] !== null;
        if (!provided) {
          if (isNew) errors.push({ table, row: name, field: f.id, message: `required for new ${spec.key.toLowerCase()}` });
          continue;
        }
        const r = coerce(f.type, row[f.id]);
        if (r.error) errors.push({ table, row: name, field: f.id, message: r.error });
        else out[f.id] = r.value;
      }
      if (Object.keys(out).length) normalized[table][name] = out;
    }
  }

  if (custom.constants && typeof custom.constants === 'object') {
    for (const f of FIELD_SPECS.constants.fields) {
      if (custom.constants[f.id] === undefined || custom.constants[f.id] === '') continue;
      const r = coerce(f.type, custom.constants[f.id]);
      if (r.error) errors.push({ table: 'constants', field: f.id, message: r.error });
      else normalized.constants[f.id] = r.value;
    }
  }

  return { ok: errors.length === 0, errors, normalized };
}

/** Merge a (validated) custom library over the built-in defaults, per-entry. */
export function mergeLibrary(custom) {
  const c = custom || {};
  const merge = (defaults, over = {}) => {
    const out = {};
    for (const [k, v] of Object.entries(defaults)) out[k] = { ...v };
    for (const [k, v] of Object.entries(over)) out[k] = { ...(out[k] || {}), ...v };
    return out;
  };
  return {
    MATERIALS: merge(MATERIALS, c.materials),
    PROCESSES: merge(PROCESSES, c.processes),
    REGIONS:   merge(REGIONS, c.regions),
    constants: { ...COST_CONSTANTS, ...(c.constants || {}) },
  };
}

// Count of overridden/added entries, for display.
export function librarySummary(custom) {
  const c = custom || {};
  const count = (t) => Object.keys(c[t] || {}).length;
  return {
    materials: count('materials'),
    processes: count('processes'),
    regions: count('regions'),
    constants: Object.keys(c.constants || {}).length,
  };
}
