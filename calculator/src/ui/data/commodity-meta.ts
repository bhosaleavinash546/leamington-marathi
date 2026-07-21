/**
 * Commodity presentation metadata — pure lookup tables shared across the UI.
 * Extracted from main.ts (no behaviour, data only) so the labels/colours/icons
 * live in one obvious place. Keyed by CommodityType id.
 */

/** Short human label per commodity id. */
export const COMMODITY_LABELS: Record<string, string> = {
  machining: 'Machining', casting: 'Casting', sheet_metal: 'Sheet Metal',
  sheet_metal_fab: 'SM Fab', injection_moulding: 'Injection', blow_moulding: 'Blow Moulding',
  extrusion: 'Extrusion', thermoforming: 'Thermoforming', rotational_moulding: 'Rotomoulding',
  forging: 'Forging', painting: 'Painting', biw_assembly: 'BIW/Assembly',
  pcb_fab: 'PCB Fab', pcba: 'PCBA', cast_and_machine: 'Cast+Machine',
  rubber: 'Rubber', composites: 'Composites', wiring_harness: 'Harness',
  assembly: 'Assembly', ai_agent: 'AI Agent', cad_analysis: 'CAD Analysis',
  automotive_software: 'Auto SW Cost',
};

/** Unique hue per commodity — used for coloured badges throughout the dashboard. */
export const COMMODITY_BADGE_COLOURS: Record<string, { bg: string; color: string; border: string }> = {
  machining:           { bg: 'rgba(59,130,246,0.13)',  color: '#3b82f6', border: 'rgba(59,130,246,0.28)' },
  casting:             { bg: 'rgba(249,115,22,0.13)',  color: '#f97316', border: 'rgba(249,115,22,0.28)' },
  sheet_metal:         { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', border: 'rgba(148,163,184,0.32)' },
  sheet_metal_fab:     { bg: 'rgba(6,182,212,0.13)',   color: '#06b6d4', border: 'rgba(6,182,212,0.28)' },
  injection_moulding:  { bg: 'rgba(139,92,246,0.13)',  color: '#8b5cf6', border: 'rgba(139,92,246,0.28)' },
  blow_moulding:       { bg: 'rgba(20,184,166,0.13)',  color: '#14b8a6', border: 'rgba(20,184,166,0.28)' },
  extrusion:           { bg: 'rgba(234,179,8,0.13)',   color: '#ca8a04', border: 'rgba(234,179,8,0.28)' },
  thermoforming:       { bg: 'rgba(236,72,153,0.13)',  color: '#ec4899', border: 'rgba(236,72,153,0.28)' },
  rotational_moulding: { bg: 'rgba(99,102,241,0.13)',  color: '#818cf8', border: 'rgba(99,102,241,0.28)' },
  forging:             { bg: 'rgba(239,68,68,0.13)',   color: '#f87171', border: 'rgba(239,68,68,0.28)' },
  painting:            { bg: 'rgba(132,204,22,0.13)',  color: '#65a30d', border: 'rgba(132,204,22,0.28)' },
  biw_assembly:        { bg: 'rgba(245,158,11,0.13)',  color: '#d97706', border: 'rgba(245,158,11,0.28)' },
  pcb_fab:             { bg: 'rgba(16,185,129,0.13)',  color: '#10b981', border: 'rgba(16,185,129,0.28)' },
  pcba:                { bg: 'rgba(5,150,105,0.13)',   color: '#059669', border: 'rgba(5,150,105,0.28)' },
  cast_and_machine:    { bg: 'rgba(251,146,60,0.13)',  color: '#fb923c', border: 'rgba(251,146,60,0.28)' },
  rubber:              { bg: 'rgba(34,197,94,0.13)',   color: '#16a34a', border: 'rgba(34,197,94,0.28)' },
  composites:          { bg: 'rgba(14,165,233,0.13)',  color: '#0ea5e9', border: 'rgba(14,165,233,0.28)' },
  wiring_harness:      { bg: 'rgba(167,139,250,0.13)', color: '#7c3aed', border: 'rgba(167,139,250,0.28)' },
  assembly:            { bg: 'rgba(244,63,94,0.13)',   color: '#f43f5e', border: 'rgba(244,63,94,0.28)' },
  ai_agent:            { bg: 'rgba(168,85,247,0.13)',  color: '#a855f7', border: 'rgba(168,85,247,0.28)' },
  cad_analysis:        { bg: 'rgba(34,211,238,0.13)',  color: '#0891b2', border: 'rgba(34,211,238,0.28)' },
  automotive_software: { bg: 'rgba(37,99,235,0.13)',   color: '#2563eb', border: 'rgba(37,99,235,0.28)' },
};

/** Icon + display name for the commodity picker tiles. */
export const CPICKER_META: Record<string, { icon: string; name: string }> = {
  injection_moulding: { icon: '🧪', name: 'Plastics' },
  sheet_metal_fab:    { icon: '✂️', name: 'Sheet Metal Fab' },
  sheet_metal:        { icon: '🔩', name: 'Sheet Metal' },
  casting:            { icon: '🔥', name: 'Castings' },
  machining:          { icon: '⚙️', name: 'Machining' },
  forging:            { icon: '🔨', name: 'Forgings' },
  rubber:             { icon: '🔶', name: 'Rubber' },
  composites:         { icon: '🧵', name: 'Composites' },
  pcb_fab:            { icon: '🖥️', name: 'PCB Fabrication' },
  pcba:               { icon: '🔌', name: 'PCBA Assembly' },
  wiring_harness:     { icon: '🔋', name: 'Wiring Harness' },
  cast_and_machine:   { icon: '🏭', name: 'Cast + Machine' },
  assembly:           { icon: '🔧', name: 'Assemblies' },
  extrusion:          { icon: '🧱', name: 'Extrusion' },
  blow_moulding:      { icon: '🫧', name: 'Blow Moulding' },
  thermoforming:      { icon: '🥡', name: 'Thermoforming' },
  rotational_moulding:{ icon: '🛢️', name: 'Rotomoulding' },
  biw_assembly:       { icon: '🔩', name: 'BIW / Assembly' },
  painting:           { icon: '🎨', name: 'Painting' },
  ai_agent:            { icon: '✦',  name: 'AI Agent' },
  cad_analysis:        { icon: '📐', name: 'CAD-to-Cost' },
  automotive_software: { icon: '🚗', name: 'Auto SW Cost' },
};
