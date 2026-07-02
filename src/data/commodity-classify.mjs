// ─────────────────────────────────────────────────────────────────────────────
// Commodity classifier (pure JS, unit-tested) — maps ANY `system` string to one
// of the canonical commodity keys, so no marketplace idea is ever "orphaned"
// (invisible under every commodity tab). Exact canonical match wins first; an
// ordered keyword fallback then catches the 100+ free-text variants in the data.
// ─────────────────────────────────────────────────────────────────────────────

export const COMMODITY_KEYS = [
  'Battery', 'EDU', 'Chassis', 'Driveline', 'BIW',
  'Interior', 'Exterior', 'Electrical', 'Powertrain',
];

// Canonical system strings → key (authoritative; mirrors COMMODITY_GROUPS).
const EXACT = {
  Battery: ['Battery Pack', 'Battery Pack Assembly', 'Battery Modules', 'Battery Cells', 'Pack Thermal Management', 'Battery Management System', 'Pack Safety & Protection', 'Pack Structural & NVH', 'HV Distribution'],
  EDU: ['EDU / Electric Drive Unit', 'EDU Housing Assembly', 'Electric Motor Stator', 'Electric Motor Rotor', 'Motor Cooling', 'Inverter Assembly', 'Gearbox & Reduction Drive', 'EDU Lubrication', 'EDU Thermal Management', 'EDU HV Interfaces', 'Control & Sensing', '800V System Level', 'EDU Rotor'],
  Chassis: ['Chassis'],
  Driveline: ['Driveline'],
  BIW: ['Body Structure'],
  Interior: ['Interior', 'Acoustic / NVH'],
  Exterior: ['Exterior', 'Lighting', 'Sealing / Glazing'],
  Electrical: ['Electrical Architecture', 'Thermal Management'],
};
const EXACT_LOOKUP = {};
for (const [key, arr] of Object.entries(EXACT)) for (const s of arr) EXACT_LOOKUP[s] = key;

// Ordered keyword rules — FIRST match wins, so more specific domains come first.
const RULES = [
  ['Driveline', /transfer case|differential|half[\s-]?shaft|propeller|prop shaft|driveline|drivetrain|\baxle\b|cv joint|reduction drive|automatic gearbox|transmission|gearbox/],
  ['EDU', /\be-?motor\b|e-?axle|\bedu\b|inverter|stator|rotor|electric drive|electric powertrain|motor cooling|power electronics|control & sensing|800v|on-board charger|\bobc\b/],
  ['Battery', /battery|\bbms\b|\bcell\b|charging|\bhv\b|pack thermal|pack structure|bev architecture/],
  ['Powertrain', /powertrain|engine|exhaust|fuel|hybrid|reev|combustion|\bmhev\b|\bphev\b/],
  ['Chassis', /suspension|brake|steering|knuckle|\bhub\b|wheel|\btyre\b|\btire\b|damper|spring|control arm|subframe|chassis|torque vector|\bride\b|off-?road/],
  ['Interior', /interior|\bseat|cockpit|instrument panel|console|\btrim\b|display|infotainment|hvac|climate/],
  ['Exterior', /exterior|lighting|\blamp|glazing|sealing|bumper|fascia|grille|closure|\bdoor\b|wheel arch|\baero\b|mirror|wiper|\broof\b/],
  ['BIW', /body|biw|pillar|rocker|sill|crash|underbody|floor|structure|front end|load floor|fender|cowl|cross-?member/],
  ['Electrical', /electrical|harness|wiring|\becu\b|connector|e\/e|electronic|software|\badas\b|sensor|connectivity|\bfuse|domain controller|nvh|cooling/],
];

/**
 * Resolve a system string to a commodity key. Returns null only for empty input.
 * @param {string} system
 * @returns {string|null}
 */
export function inferCommodityKey(system) {
  if (!system || typeof system !== 'string') return null;
  if (EXACT_LOOKUP[system]) return EXACT_LOOKUP[system];
  const h = system.toLowerCase();
  for (const [key, re] of RULES) if (re.test(h)) return key;
  return null;
}
