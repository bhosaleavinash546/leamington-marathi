// ─────────────────────────────────────────────────────────────────────────────
// Canonical commodity taxonomy — SINGLE SOURCE OF TRUTH
// Maps free-text `system` strings (used by Analyze, Marketplace, seed data and
// the knowledge bases) to a stable set of commodity groups. Any module that
// needs to group/filter by commodity must import from here rather than redefine
// its own list, so cross-module filtering stays consistent.
// ─────────────────────────────────────────────────────────────────────────────

export type CommodityColor =
  | 'slate' | 'blue' | 'violet' | 'green' | 'teal' | 'orange' | 'amber' | 'sky' | 'indigo';

export interface CommodityGroup {
  label: string;
  key: string;
  color: CommodityColor;
  /** Canonical `system` strings that belong to this commodity. */
  systems: string[];
}

export const COMMODITY_GROUPS: CommodityGroup[] = [
  { label: 'All Commodities', key: 'All', color: 'slate', systems: [] },
  {
    label: 'Battery & BMS', key: 'Battery', color: 'blue',
    systems: [
      'Battery Pack', 'Battery Pack Assembly', 'Battery Modules', 'Battery Cells',
      'Pack Thermal Management', 'Battery Management System', 'Pack Safety & Protection',
      'Pack Structural & NVH', 'HV Distribution',
    ],
  },
  {
    label: 'Electric Drive (EDU)', key: 'EDU', color: 'violet',
    systems: [
      'EDU / Electric Drive Unit', 'EDU Housing Assembly', 'Electric Motor Stator',
      'Electric Motor Rotor', 'Motor Cooling', 'Inverter Assembly',
      'Gearbox & Reduction Drive', 'EDU Lubrication', 'EDU Thermal Management',
      'EDU HV Interfaces', 'Control & Sensing', '800V System Level', 'EDU Rotor',
    ],
  },
  { label: 'Chassis', key: 'Chassis', color: 'green', systems: ['Chassis'] },
  { label: 'Driveline', key: 'Driveline', color: 'teal', systems: ['Driveline'] },
  { label: 'BIW / Body Structure', key: 'BIW', color: 'orange', systems: ['Body Structure'] },
  { label: 'Interior', key: 'Interior', color: 'amber', systems: ['Interior', 'Acoustic / NVH'] },
  { label: 'Exterior', key: 'Exterior', color: 'sky', systems: ['Exterior', 'Lighting', 'Sealing / Glazing'] },
  { label: 'Electrical', key: 'Electrical', color: 'indigo', systems: ['Electrical Architecture', 'Thermal Management'] },
];

// Tailwind colour classes — complete strings (no dynamic construction so purge keeps them)
export const COLOR_TAB_ACTIVE: Record<CommodityColor, string> = {
  slate:  'bg-slate-500/20 text-slate-200 border-slate-400/40',
  blue:   'bg-blue-500/20 text-blue-400 border-blue-500/40',
  violet: 'bg-violet-500/20 text-violet-400 border-violet-500/40',
  green:  'bg-green-500/20 text-green-400 border-green-500/40',
  teal:   'bg-teal-500/20 text-teal-400 border-teal-500/40',
  orange: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  amber:  'bg-amber-500/20 text-amber-400 border-amber-500/40',
  sky:    'bg-sky-500/20 text-sky-400 border-sky-500/40',
  indigo: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40',
};

export const COLOR_BADGE: Record<CommodityColor, string> = {
  slate:  'bg-slate-500/10 text-slate-400 border-slate-500/20',
  blue:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
  violet: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  green:  'bg-green-500/10 text-green-400 border-green-500/20',
  teal:   'bg-teal-500/10 text-teal-400 border-teal-500/20',
  orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  amber:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  sky:    'bg-sky-500/10 text-sky-400 border-sky-500/20',
  indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
};

/** Resolve the commodity group for a given canonical system string. */
export function getCommodityForSystem(system: string): CommodityGroup | null {
  for (const grp of COMMODITY_GROUPS) {
    if (grp.key !== 'All' && grp.systems.includes(system)) return grp;
  }
  return null;
}
