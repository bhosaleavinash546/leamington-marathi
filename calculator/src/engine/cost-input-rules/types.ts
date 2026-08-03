/**
 * Deterministic cost-input rules — the contract.
 *
 * These types exist so a should-cost can be produced from measured geometry with
 * NO AI call. The design constraint that shapes everything here: a rule either
 * produces a value it can justify, or it refuses and asks the engineer. It never
 * guesses quietly.
 *
 * Pure types + pure functions. `tests/architecture-invariants.test.ts` scans
 * `src/engine/**` and will fail the build if anything in here reaches for the
 * LLM SDK, the AI client, or the network — which is the mechanical guarantee
 * behind "deterministic by default".
 */
import type { OCCTGeometry } from '../ai-analysis.js';

/** Where a value came from. Ordered loosely by how much we trust it. */
export type ValueSource =
  /** Measured off the CAD by the geometry kernel. Ground truth. */
  | 'geometry'
  /** Computed by a closed-form rule from measured inputs. */
  | 'rule'
  /** Produced by an existing commodity advisor (casting/forging/sheet-metal/...). */
  | 'advisor'
  /** Looked up in the rate library or a reference table. */
  | 'library'
  /** Answered by the engineer in response to a Decision. */
  | 'engineer'
  /** Supplied by the model. Only ever present on the optional AI path. */
  | 'ai';

/** A value with its justification attached. */
export interface Decided<T> {
  value: T;
  /** 0–1. Feeds `fieldConfidences` on the analysis result unchanged. */
  confidence: number;
  source: ValueSource;
  /** Stable rule identifier, e.g. `casting.hpdc.cycleTimeSec`. */
  ruleId: string;
  /** Human-readable derivation, e.g. "45 + 3 × 3.0 mm mean wall = 54 s".
   *  This is what gets shown in the trace drawer and printed on the report —
   *  a number nobody can explain is not usable in a supplier meeting. */
  basis: string;
  /** Decision ids this value rests on, so answering one can invalidate it. */
  dependsOn?: string[];
}

export interface DecisionOption<V = string> {
  value: V;
  label: string;
  /** What choosing this actually does to the cost — shown next to the option. */
  consequence?: string;
  /** The engine's hunch. Displayed, never preselected: preselecting a hunch is
   *  how a guess becomes a silent default. */
  leaning?: boolean;
}

/**
 * A question only a person can answer.
 *
 * Emitted when geometry and rules genuinely cannot decide — not when they are
 * merely uncertain. The canonical case is material family: the same solid is
 * ~2.9x heavier in steel than aluminium, so the CAD file alone cannot tell you
 * which it is, and getting it wrong is the single largest documented source of
 * cost error in this tool.
 */
export interface Decision<V = string> {
  id: string;
  kind:
    | 'material_family' | 'material_grade'
    | 'pressure_tight' | 'tolerance_class' | 'safety_critical'
    | 'commodity' | 'barrier_wall' | 'joining' | 'ply_count'
    /** A container's nominal capacity — a void is not a solid, so it is not measured. */
    | 'capacity'
    /** The kernel could not measure something it normally does; type it in. */
    | 'geometry_gap';
  question: string;
  /** Why geometry cannot answer this. Shown to the engineer so the ask reads as
   *  a limit of physics rather than a limit of the software. */
  why: string;
  options: DecisionOption<V>[];
  /** Form field ids left empty until this is answered. */
  blockedFieldIds: string[];
  blockedRuleIds: string[];
  /** `blocking` stops the costing; `advisory` flags but lets it proceed. */
  severity: 'blocking' | 'advisory';
}

export type RuleOutcome<T> =
  | { ok: true; decided: Decided<T> }
  | { ok: false; decision: Decision };

/** Everything a rule is allowed to look at. */
export interface RuleContext {
  geo: OCCTGeometry;
  /** How much of the geometry is real. `stl` and `text` have no wall thickness,
   *  no draft, no tooling estimates — rules must degrade rather than invent. */
  geometryQuality: 'occt' | 'stl' | 'text';
  commodity: string;
  /**
   * Did a person choose this commodity, or did we infer it from the shape?
   *
   * It decides whether the sheet-metal/plastic stop is worth asking. An engineer
   * who picked "Injection Moulding" off the tile has already answered it, and
   * asking again is the decision fatigue that kills throughput. Absent means
   * inferred — the conservative reading, because that is the case where getting
   * it wrong has actually cost money.
   */
  commoditySource?: 'inferred' | 'engineer';
  /**
   * Resolve unanswered service-context questions to their visible `leaning`
   * instead of blocking.
   *
   * Off by default, and it must stay off wherever an engineer is present — the
   * whole point of a blocking decision is that a person answers it.
   *
   * It exists for the AI path, where nobody is at the screen and the honest
   * alternative is not "an engineer decides" but "the model guesses, invisibly,
   * and nothing records that it did". A stated assumption with reduced
   * confidence and a basis that reads "assumed — confirm before quoting" beats
   * a hidden one. It never applies to the material family: that is the
   * documented dominant failure mode, and assuming it is precisely the
   * lightest-metal trap this project exists to close.
   */
  assumeLeanings?: boolean;
  annualVolume: number;
  filename: string;
  /** Answers already given, keyed by Decision id. */
  answers: Readonly<Record<string, unknown>>;
}

/**
 * One rule: how to compute a value, and how to say it in the prompt.
 *
 * Both renderers walk the same array and call the same `evaluate`, which is what
 * makes prompt/engine divergence structurally impossible rather than a thing we
 * promise to remember.
 */
export interface RuleDef<T = number | string | boolean> {
  id: string;
  /** Dot path into `costInputSuggestions`, e.g. `casting.cycleTimeHpdcSec`. */
  path: string;
  /** Costing-form field id, e.g. `cast-hpdc-ct`. Absent for non-form values. */
  fieldId?: string;
  label: string;
  /** Skip this rule entirely when false (e.g. a subtype-specific rule). */
  appliesWhen?: (ctx: RuleContext) => boolean;
  evaluate: (ctx: RuleContext) => RuleOutcome<T>;
  /** Override the default prompt line. Use sparingly — the default keeps the
   *  rendered value and the computed value provably identical. */
  promptLine?: (outcome: RuleOutcome<T>, ctx: RuleContext) => string;
}

export interface CommodityRuleSpec {
  commodity: string;
  /** The block header, e.g. "CASTING COST INPUT RULES:". */
  header: string;
  rules: RuleDef[];
}

export interface CostInputRuleResult {
  status: 'complete' | 'needs_decision';
  commodity: Decided<string>;
  /** Same shape `applyCADToForm` already consumes; partial when blocked. */
  suggestions: Record<string, unknown>;
  /** Keyed by form field id — the provenance trail behind every filled field. */
  provenance: Record<string, Decided<unknown>>;
  /**
   * Keyed by rule id — the same trail, for every decided rule.
   *
   * `provenance` only covers rules that own a form field, which is most of them
   * but not all: a cycle time or an operation list is costed and reported
   * without having a box to sit in. Those were coming through with an empty
   * basis, which defeats the point of carrying one.
   */
  byRule: Record<string, Decided<unknown>>;
  fieldConfidences: Record<string, number>;
  decisions: Decision[];
  answers: Record<string, unknown>;
  notes: string[];
  /** Bumped when a rule changes, so the analysis cache cannot serve stale
   *  results the way it would if only CAD_PROMPT_VERSION were keyed. */
  engineVersion: number;
}

/** Bump on any rule change. Part of the analysis cache key. */
export const RULE_ENGINE_VERSION = 1;

// ─── helpers used by every commodity module ─────────────────────────────────

export function decided<T>(
  ruleId: string, value: T, source: ValueSource, basis: string,
  confidence = 1, dependsOn?: string[],
): RuleOutcome<T> {
  return { ok: true, decided: { value, confidence, source, ruleId, basis, dependsOn } };
}

export function ask(decision: Decision): RuleOutcome<never> {
  return { ok: false, decision };
}

/**
 * Format a number the same way everywhere.
 *
 * Shared deliberately: the prompt and the engine must render a value
 * identically or the byte-exact baseline check is meaningless.
 */
export function fmt(n: number, decimals = 2): string {
  return Number.isFinite(n) ? n.toFixed(decimals) : '?';
}
