export type DifficultyTone = 'low' | 'medium' | 'high';

export interface ValuedIdea {
  costSavingPotential?: { annualValue?: string };
}

export interface PortfolioValue {
  stated: number;
  total: number;
  /** null — never 0 — when no idea stated a value. */
  annualTotal: number | null;
  /** null when every idea stated one. */
  note: string | null;
}

export function parseMoney(val: string | null | undefined): number;
export function difficultyTone(difficulty: string | null | undefined): DifficultyTone;
export function roiRanked<T extends ValuedIdea>(ideas: T[] | null | undefined): T[];
export function colPositions(widths: number[], ml: number): number[];
export function safeFilename(name: string | null | undefined): string;
export function portfolioValue(ideas: ValuedIdea[] | null | undefined): PortfolioValue;
