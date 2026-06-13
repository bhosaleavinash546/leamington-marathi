export interface AssemblyLine {
  id: string;
  description: string;
  qty: number;
  unitCostGBP: number;
  unitWeightKg: number;
  notes: string;
}

export interface Assembly {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  lines: AssemblyLine[];
  overheadPct: number;
  marginPct: number;
}

export interface AssemblyRollupResult {
  assembly: Assembly;
  lineSubtotals: Array<{ line: AssemblyLine; extendedCost: number; extendedWeight: number }>;
  totalPartsCost: number;
  overhead: number;
  subtotal: number;
  margin: number;
  total: number;
  totalWeightKg: number;
}

export function computeAssemblyRollup(assembly: Assembly): AssemblyRollupResult {
  const lineSubtotals = assembly.lines.map(line => ({
    line,
    extendedCost: line.qty * line.unitCostGBP,
    extendedWeight: line.qty * line.unitWeightKg,
  }));
  const totalPartsCost = lineSubtotals.reduce((s, l) => s + l.extendedCost, 0);
  const totalWeightKg = lineSubtotals.reduce((s, l) => s + l.extendedWeight, 0);
  const overhead = totalPartsCost * (assembly.overheadPct / 100);
  const subtotal = totalPartsCost + overhead;
  const margin = subtotal * (assembly.marginPct / 100);
  const total = subtotal + margin;
  return { assembly, lineSubtotals, totalPartsCost, overhead, subtotal, margin, total, totalWeightKg };
}

const ASSEMBLY_KEY = 'shouldCostAssemblies';

export function listAssemblies(): Assembly[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ASSEMBLY_KEY);
    return raw ? (JSON.parse(raw) as Assembly[]) : [];
  } catch {
    return [];
  }
}

export function saveAssembly(a: Assembly): void {
  if (typeof localStorage === 'undefined') return;
  const list = listAssemblies().filter(x => x.id !== a.id);
  list.push(a);
  localStorage.setItem(ASSEMBLY_KEY, JSON.stringify(list));
}

export function deleteAssembly(id: string): void {
  if (typeof localStorage === 'undefined') return;
  const list = listAssemblies().filter(x => x.id !== id);
  localStorage.setItem(ASSEMBLY_KEY, JSON.stringify(list));
}

export function newAssembly(name: string): Assembly {
  return {
    id: `asm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    description: '',
    createdAt: new Date().toISOString(),
    lines: [],
    overheadPct: 12,
    marginPct: 8,
  };
}
