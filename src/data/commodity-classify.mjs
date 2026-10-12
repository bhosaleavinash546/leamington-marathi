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
// Off-Road Features sub-systems → the ENGINEERING commodity of the hardware
// they act on. The marketplace files these ideas under Off-Road Features by
// ideaData.commodity; analysis, coverage and Horizon keep this mapping.
const OFF_ROAD_SYSTEMS = {
  'Locking Differentials': 'Driveline', 'Low Range & Transfer': 'Driveline', 'Torque Vectoring & Tank Turn': 'Chassis',
  'Terrain Management': 'Electrical', 'Off-Road Driver Assist': 'Chassis', 'Off-Road HMI & Software': 'Electrical',
  'Off-Road Air Suspension': 'Chassis', 'Articulation & Anti-Roll Disconnect': 'Chassis', 'Off-Road Wheels & Tyres': 'Chassis',
  'Underbody Protection': 'BIW', 'Battery Armour (BEV)': 'Battery', 'Recovery & Towing': 'BIW',
  'Wading & Water Management': 'Exterior', 'Off-Road Vision': 'Electrical',
  'Off-Road Geometry & Bumpers': 'Exterior', 'Roof Load & Expedition': 'Exterior', 'Off-Road Thermal Management': 'Electrical',
};
const EXACT_LOOKUP = {};
for (const [key, arr] of Object.entries(EXACT)) for (const s of arr) EXACT_LOOKUP[s] = key;
Object.assign(EXACT_LOOKUP, OFF_ROAD_SYSTEMS);

// Ordered keyword rules — FIRST match wins, so more specific domains come first.
const RULES = [
  ['Driveline', /transfer case|differential|half[\s-]?shaft|propeller|prop shaft|driveline|drivetrain|\baxles?\b|cv joint|reduction drive|automatic gearbox|transmission|gearbox/],
  ['EDU', /\be-?motor\b|e-?axle|\bedu\b|inverter|stator|rotor|electric drive|electric powertrain|motor cooling|power electronics|control & sensing|800v|on-board charger|\bobc\b|dc[- ]?link|\bcapacitors?\b/],
  ['Battery', /battery|\bbms\b|\bcell\b|charging|\bhv\b|pack thermal|pack structure|bev architecture/],
  ['Powertrain', /powertrain|engine|exhaust|fuel|hybrid|reev|combustion|canister|emission|evap|\bmhev\b|\bphev\b/],
  ['Chassis', /suspension|brak(e|ing)|steering|knuckle|\bhub\b|wheel|\btyre\b|\btire\b|damper|spring|control arm|wishbone|subframe|chassis|torque vector|\bride\b|off-?road/],
  ['Interior', /interior|\bseat|cockpit|instrument panel|console|\btrim\b|display|infotainment|hvac|climate|visor/],
  ['Exterior', /exterior|lighting|\blamp|glazing|sealing|bumper|fascia|grille|closure|\bdoor\b|wheel arch|\baero\b|mirror|wiper|washer|\broof\b/],
  ['BIW', /body|biw|pillar|rocker|sill|crash|underbody|floor|structure|front end|load floor|fender|cowl|cross-?member/],
  ['Electrical', /electrical|harness|wiring|\becu\b|connector|e\/e|electronic|software|\badas\b|sensor|connectivity|\bfuse|relay|\busb\b|antenna|domain controller|nvh|cooling/],
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

// ── Marketplace commodity (DECISIONS 127) ─────────────────────────────────────
// "Off-Road Features" is a MARKETPLACE commodity, not an engineering one: its
// ideas act on hardware that also belongs to another commodity (a skid plate is
// BIW, a locker is Driveline), and Horizon's BOM tree spans COMMODITY_KEYS. So
// the shared key list is left alone and the marketplace adds one key on top.
// An idea is filed there by an explicit `ideaData.commodity`, never by a
// keyword guess, so no existing idea moves unless its data says so.
export const OFF_ROAD_KEY = 'OffRoad';
export const OFF_ROAD_LABEL = 'Off-Road Features';
export const MARKETPLACE_COMMODITY_KEYS = [...COMMODITY_KEYS, OFF_ROAD_KEY];
export const OFF_ROAD_SYSTEM_NAMES = Object.keys(OFF_ROAD_SYSTEMS);

/**
 * The marketplace commodity of an idea (seed object or DB row with ideaData as
 * a JSON string): the explicit Off-Road Features filing first, else the
 * system-based commodity.
 */
export function marketplaceCommodityOf(idea) {
  let d = idea?.ideaData;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
  const c = d && typeof d === 'object' ? d.commodity : null;
  if (c === OFF_ROAD_LABEL || c === OFF_ROAD_KEY) return OFF_ROAD_KEY;
  return inferCommodityKey(idea?.system);
}
