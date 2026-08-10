export interface DfmActionRow {
  n: number;
  ruleId: string;
  severity: 'high' | 'medium' | 'low';
  finding: string;
  action: string;
  change: string;
  /** A ROLE, never a person — the tool does not know who works here. */
  owner: string;
  decision: string;
  /** Always empty. A due date this tool invented would be its least credible column. */
  due: string;
  annualEur: number | null;
}

export function buildActions(
  analysis: unknown,
  opts?: { max?: number },
): {
  rows: DfmActionRow[];
  omitted: number;
  byOwner: Array<{ owner: string; actions: number; annualEur: number; high: number }>;
};
