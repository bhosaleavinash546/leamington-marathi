export type ProvenanceTone = 'confirmed' | 'contradicted' | 'none';
export interface EngineVerdict { label: string; tone: ProvenanceTone; text: string }
export interface VerificationTally {
  total: number;
  confirmed: number;
  contradicted: number;
  unchecked: number;
  evidenceVerified: number;
}

/** Minimal shape these helpers read — any richer idea type is assignable. */
export interface ProvenanceIdea {
  engineCheck?: {
    direction?: string;
    baselineEur?: number;
    proposedEur?: number;
    savingPct?: number;
    referenceCase?: string;
    basis?: string;
  } | null;
  confidenceLevel?: string;
  validationFlags?: string[];
  evidenceSources?: { title?: string; year?: string | number }[];
  evidenceUnverified?: boolean;
}

export const AI_ESTIMATED_CAUTION: string;
export const OUTBOUND_DISCLAIMER: string;

export function evidenceIsVerified(idea: ProvenanceIdea | null | undefined): boolean;
export function engineVerdict(idea: ProvenanceIdea | null | undefined): EngineVerdict;
export function evidenceLine(idea: ProvenanceIdea | null | undefined, maxSources?: number): string;
export function verificationCell(idea: ProvenanceIdea | null | undefined): string;
export function needsValidation(idea: ProvenanceIdea | null | undefined): boolean;
export function notableFlags(idea: ProvenanceIdea | null | undefined): string[];
export function verificationTally(ideas: ProvenanceIdea[] | null | undefined): VerificationTally;
