export function diffAnalyses(before: unknown, after: unknown): {
  closed: Array<Record<string, unknown>>;
  created: Array<Record<string, unknown>>;
  persisting: Array<Record<string, unknown>>;
  nowVisible: Array<Record<string, unknown>>;
  nowBlind: Array<Record<string, unknown>>;
  counts: { closed: number; created: number; persisting: number; nowVisible: number; nowBlind: number };
  score: { before: number | null; after: number | null };
  money: { closedAnnualEur: number; createdAnnualEur: number; pricedBeforeEur: number; pricedAfterEur: number };
  headline: string;
};

/** Reasons two analyses should not be compared without saying so. */
export function comparability(before: unknown, after: unknown): string[];
