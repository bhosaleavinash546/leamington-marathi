/**
 * CostVision — Active rate library (process-wide singleton)
 * ------------------------------------------------------------------
 * Holds the company's currently-active rate library (built-in defaults merged
 * with the admin's custom overrides). Shared by the admin routes (which set it)
 * and the should-cost routes (which read it).
 */
import { mergeLibrary, librarySummary } from './cost-library.mjs';

let _custom = {};
let _merged = mergeLibrary({});   // built-in defaults until a custom library is set
let _meta = { updatedAt: null, updatedBy: null };

export function setActiveLibrary(custom, meta = {}) {
  _custom = custom && typeof custom === 'object' ? custom : {};
  _merged = mergeLibrary(_custom);
  _meta = { updatedAt: meta.updatedAt ?? null, updatedBy: meta.updatedBy ?? null };
}

export function getActiveLibrary() { return _merged; }       // { MATERIALS, PROCESSES, REGIONS, constants }
export function getActiveCustom() { return _custom; }

export function isCustomActive() {
  const s = librarySummary(_custom);
  return (s.materials + s.processes + s.regions + s.constants) > 0;
}

export function getActiveMeta() {
  return { ..._meta, custom: isCustomActive(), summary: librarySummary(_custom) };
}
