/**
 * A commodity pack — DATA: which drawing parameters a route expects, and which existing engine question each
 * confirmed parameter can answer (offline 2D drawing intelligence, Layer 3).
 *
 * A pack holds no logic and no cost. Adding a commodity is adding a pack and registering it (`registerCommodityPack`);
 * neither reconcile.ts nor the adapter's core changes (tests/engineering-data-packs.test.ts proves it with a pack
 * defined in the test).
 */

/**
 * The named value readers of the adapter (to-costing.ts::ANSWER_CODECS). Each turns a parameter value into the exact
 * answer the engine's question takes and refuses anything the question does not accept.
 */
export type AnswerCodec =
  | 'yesNo' | 'toleranceClass' | 'materialFamily' | 'gradeInScope' | 'resinInScope' | 'elastomerInScope' | 'laminateSystem'
  | 'alAlloy' | 'alTemper' | 'alFinish' | 'finishRoute'
  | 'gearHelix' | 'gearQualityClass' | 'gearHardening' | 'gearCaseDepth' | 'positiveNumber' | 'positiveInteger';

/** One parameter → one existing Decision. */
export interface DecisionBinding {
  /** Dictionary name of the parameter that carries the answer. */
  parameter: string;
  /** The id of the EXISTING engine question (a `*_DECISION_ID` constant of the rule engine). */
  decisionId: string;
  /** A named reader of the adapter … */
  codec?: AnswerCodec;
  /** … or a plain option list: the answer is the parameter's text when it is one of these, and nothing otherwise. */
  options?: readonly string[];
  /**
   * True for a question the engine asks only when the kernel could not measure the figure (the gear's tooth count,
   * module and face width). The answer is passed only while that question is actually open — the caller hands the
   * adapter the engine's open decisions.
   */
  onlyWhenAsked?: boolean;
}

/** A value that reaches the costing through a FORM FIELD, because no Decision exists for it (finish thickness, masks). */
export interface FormFieldBinding {
  parameter: string;
  /** The costing-form field id suffix after the commodity's finish prefix ("sf-um" → "cast-sf-um"). */
  fieldSuffix: string;
  why: string;
}

/** A parameter a drawing of this commodity is expected to state. Found in no source → listed as missing. */
export interface ExpectedParameter {
  name: string;
  /** Other names that state the same fact (a casting grade instead of a general tolerance). */
  alternatives?: readonly string[];
  why: string;
}

export interface CommodityPack {
  /** A rule-pack commodity (cost-input-rules/index.ts::DETERMINISTIC_COMMODITIES) — or a new one. */
  commodity: string;
  expected: readonly ExpectedParameter[];
  bindings: readonly DecisionBinding[];
  formFields?: readonly FormFieldBinding[];
}
