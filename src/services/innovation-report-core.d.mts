export type VerdictTone = 'confirmed' | 'contradicted' | 'other' | 'none';
export interface Verdict { label: string; tone: VerdictTone; detail: string }
export interface Table { headers: string[]; rows: string[][] }

export function prettify(s: unknown): string;
export function verdictOf(idea: {
  engineCheck?: { direction?: string; savingPct?: number; status?: string; verdict?: string; note?: string } | null;
} | null | undefined): Verdict;
export function tabulate(v: unknown, key?: string): Table | null;
export function columnWidths(t: Table, total: number): number[];
export function safeName(s: string): string;
export function sheetName(key: string): string;
