// Single source of truth for the tool suite: every surface that lists tools
// (Sidebar, Header mobile menu, MobileNav launcher, Dashboard toolkit grid)
// renders from THIS registry, so the nav can never drift out of sync again
// (previously five hand-rolled lists disagreed and /idea-studio was orphaned).
import type { LucideIcon } from 'lucide-react';
import {
  Zap, Lightbulb, Target, Sparkles, GitCompare, Calculator, Box, CircuitBoard,
  Layers, GitMerge, ClipboardList, Store, TrendingUp, HelpCircle, Link2, Database,
  Telescope, ShieldCheck, Cable, KeyRound, Users,
} from 'lucide-react';
import PrismIcon from '../components/icons/PrismIcon';

export type ToolCategory = 'generate' | 'cost' | 'track' | 'learn';

export interface Tool {
  id: string;
  label: string;
  route: string;
  icon: LucideIcon;
  description: string;
  category: ToolCategory;
}

export const TOOLS: Tool[] = [
  // ── Generate ideas ──────────────────────────────────────────────────────
  { id: 'analyze',     label: 'Analyze',           route: '/analyze',      icon: Zap,          category: 'generate', description: 'AI cost-reduction ideas for any vehicle system' },
  { id: 'innovate',    label: 'Innovation Studio', route: '/innovate',     icon: Lightbulb,    category: 'generate', description: 'Eight structured methods, engine-checked' },
  { id: 'triz',        label: 'TRIZ Studio',       route: '/triz',         icon: Target,       category: 'generate', description: 'Resolve trade-offs with inventive principles' },
  { id: 'idea-studio', label: 'Idea Studio',       route: '/idea-studio',  icon: Sparkles,     category: 'generate', description: 'Ideas from a part photo or CAD file' },
  { id: 'cad-diff',    label: 'CAD Diff',          route: '/cad-diff',     icon: GitCompare,   category: 'generate', description: 'Cost ideas from design revisions' },
  { id: 'part-360',    label: 'Prism',             route: '/prism',        icon: PrismIcon,    category: 'generate', description: 'One part in, the whole cost truth out — entitlement waterfall, quote forensics, grounded ideas' },
  // ── Cost & analyze ──────────────────────────────────────────────────────
  { id: 'should-cost', label: 'Should-Cost',       route: '/should-cost',  icon: Calculator,   category: 'cost', description: 'Deterministic bottom-up piece price' },
  { id: 'cad-to-cost', label: 'CAD → Cost',        route: '/cad-to-cost',  icon: Box,          category: 'cost', description: 'Geometry-driven cost from a CAD file' },
  { id: 'pcb-bom',     label: 'PCB → BOM → Cost',  route: '/pcb-bom-cost', icon: CircuitBoard, category: 'cost', description: 'Board photo to BOM to cost' },
  { id: 'bom-batch',   label: 'BOM Batch',         route: '/bom-analysis', icon: Layers,       category: 'cost', description: 'Analyse a full BOM in one run' },
  { id: 'dfm-studio',  label: 'DFM / DFA Studio',  route: '/dfm-studio',   icon: ShieldCheck,  category: 'cost', description: 'Manufacturability from 3D CAD and/or a 2D drawing' },
  { id: 'harness',     label: 'Wiring Harness',    route: '/harness-cost', icon: Cable,        category: 'cost', description: 'Copper, connectors and assembly minutes' },
  // ── Track & decide ──────────────────────────────────────────────────────
  { id: 'pipeline',    label: 'Pipeline',          route: '/pipeline',     icon: GitMerge,      category: 'track', description: 'Ideas from proposal to confirmed saving' },
  { id: 'vave',        label: 'VAVE Tracker',      route: '/vave-tracker', icon: ClipboardList, category: 'track', description: 'Track approved ideas to realisation' },
  { id: 'marketplace', label: 'Idea Marketplace',  route: '/marketplace',  icon: Store,         category: 'track', description: 'Proven, benchmarked idea library' },
  // ── Learn ───────────────────────────────────────────────────────────────
  { id: 'horizon',     label: 'Horizon',           route: '/horizon',      icon: Telescope,    category: 'learn', description: 'Predict future technologies for any part' },
  { id: 'trends',      label: 'Trends',            route: '/trends',       icon: TrendingUp,   category: 'learn', description: 'Domain cost trends and levers' },
  { id: 'help',        label: 'Help',              route: '/help',         icon: HelpCircle,   category: 'learn', description: 'How-to guides and FAQs' },
];

export const TOOL_GROUPS: Array<{ id: ToolCategory; label: string; tools: Tool[] }> = [
  { id: 'generate', label: 'Generate', tools: TOOLS.filter(t => t.category === 'generate') },
  { id: 'cost',     label: 'Cost',     tools: TOOLS.filter(t => t.category === 'cost') },
  { id: 'track',    label: 'Track',    tools: TOOLS.filter(t => t.category === 'track') },
  { id: 'learn',    label: 'Learn',    tools: TOOLS.filter(t => t.category === 'learn') },
];

// Account/administration links (avatar menu + sidebar footer), not tools.
export const SETTINGS_LINKS: Array<{ id: string; label: string; route: string; icon: LucideIcon }> = [
  { id: 'api-key',      label: 'API Key',      route: '/settings/api-key',  icon: KeyRound },
  { id: 'team',         label: 'Team',         route: '/team',              icon: Users },
  { id: 'integrations', label: 'Integrations', route: '/integrations',       icon: Link2 },
  { id: 'rate-library', label: 'Rate Library', route: '/admin/rate-library', icon: Database },
];

// Routes that use the marketing layout (no sidebar).
export function isAppRoute(pathname: string): boolean {
  if (pathname === '/' || pathname === '/auth') return false;
  if (pathname.startsWith('/shared') || pathname.startsWith('/legal')) return false;
  return true;
}
