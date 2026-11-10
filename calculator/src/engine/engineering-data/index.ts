/**
 * The unified engineering data layer — public surface (offline 2D drawing intelligence, Layer 3).
 *
 *   OCCTGeometry ──cadToParameters──┐
 *   DrawingExtraction ──────────────┼─ consolidate ─→ ConsolidatedEngineeringData ─ (engineer: overrides) ─┐
 *   manual entries ─────────────────┘                                                                      │
 *                                             answersFromEngineeringData ←─────────────────────────────────┘
 *                                                       │  confirmed parameters only
 *                                                       ▼
 *                                        RuleContext.answers of the EXISTING cost engine
 *
 * Nothing in this folder computes a cost or calls costing code.
 */
export * from './model.js';
export { PARAMETER_DEFS, parameterDef, isKnownParameter, type ParameterDef } from './dictionary.js';
export { cadToParameters, cadHoleFeatureId } from './from-cad.js';
export {
  parseNumber, canonicalUnit, convertUnit, normaliseRoughness, canonicalText, comparisonKey, designationKey, normaliseParameter,
  type RoughnessValue,
} from './normalise.js';
export { holeOf, threadOf, rangeOf, flagOf, type HoleValue, type ThreadValue, type RangeValue } from './values.js';
export {
  interpretParameters, INTERPRETS, gradeNamed, toleranceClassOf, coatingRouteOf, coatingThicknessOf, alTemperOf, hardeningRouteOf, gearQualityOf,
  type Interpretation, type InterpretOptions, type Unresolved,
} from './interpret.js';
export * from './interpret-tables.js';
export * from './precedence.js';
export { consolidate, computeMissing, computeNotCosted, sameValue, NOT_COSTED_REASON, NOT_COSTED_UNREAD, notCostedOnRoute, type ConsolidateInput } from './reconcile.js';
export { alignVocabulary, inEngineVocabulary, ENGINE_VOCABULARY_NAMES } from './vocabulary.js';
export { confirm, correct, reject, resolveConflict, reopen, supply, OverrideError, type Who, type OverrideOptions } from './overrides.js';
export {
  answersFromEngineeringData, ANSWER_CODECS,
  type CostingAnswers, type AnswerEvidence, type CostingLeaning, type DroppedAnswer, type FormFieldValue, type NotCostedItem, type AdapterOptions,
} from './to-costing.js';
export {
  parseReviewState, replayReview, applyReviewOp, reviewStateKey, EMPTY_REVIEW, MAX_REVIEW_OPS,
  type ReviewOp, type DrawingReviewState, type SkippedOp,
} from './review-state.js';
export {
  statusWord, sourceWord, parameterLabel, valueText, codeLabel, methodText, locationText, whereText, rootOf, exactlyRead, reviewGroupOf, reviewCounts, REVIEW_GROUPS,
  type StatusWord, type SourceWord, type ReviewGroupKey,
} from './present.js';
export { packFor, allPacks, registerCommodityPack, type CommodityPack, type DecisionBinding, type ExpectedParameter, type FormFieldBinding, type AnswerCodec } from './commodity/index.js';
