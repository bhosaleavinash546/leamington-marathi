/**
 * Binding and expectation rows shared by several commodity packs. Every decision id is the rule engine's own exported
 * constant, so a renamed question fails the build here rather than silently answering nothing.
 */
import { MATERIAL_FAMILY_DECISION_ID } from '../../cost-input-rules/derive/material.js';
import { GRADE_DECISION_ID } from '../../cost-input-rules/derive/grade.js';
import { RESIN_DECISION_ID } from '../../cost-input-rules/derive/resin.js';
import {
  PRESSURE_TIGHT_DECISION_ID, TOLERANCE_CLASS_DECISION_ID, SAFETY_CRITICAL_DECISION_ID,
} from '../../cost-input-rules/derive/service-context.js';
import { FINISH_DECISION_ID } from '../../cost-input-rules/derive/finish.js';
import type { DecisionBinding, ExpectedParameter, FormFieldBinding } from './types.js';

export const FAMILY: DecisionBinding = { parameter: 'material.family', decisionId: MATERIAL_FAMILY_DECISION_ID, codec: 'materialFamily' };
export const GRADE: DecisionBinding = { parameter: 'material.grade', decisionId: GRADE_DECISION_ID, codec: 'gradeInScope' };
export const RESIN: DecisionBinding = { parameter: 'material.grade', decisionId: RESIN_DECISION_ID, codec: 'resinInScope' };
export const PRESSURE_TIGHT: DecisionBinding = { parameter: 'quality.pressureTight', decisionId: PRESSURE_TIGHT_DECISION_ID, codec: 'yesNo' };
export const SAFETY_CRITICAL: DecisionBinding = { parameter: 'quality.safetyCritical', decisionId: SAFETY_CRITICAL_DECISION_ID, codec: 'yesNo' };
export const TOLERANCE_CLASS: DecisionBinding = { parameter: 'tolerance.generalClass', decisionId: TOLERANCE_CLASS_DECISION_ID, codec: 'toleranceClass' };
export const FINISH: DecisionBinding = { parameter: 'finish.coatingRoute', decisionId: FINISH_DECISION_ID, codec: 'finishRoute' };

/**
 * The finish thickness and the masked-feature count. No Decision exists for either: they are the surface-treatment
 * block's own fields. The adapter returns them bounded (`boundDrawingCoating`); the CAD route writes them onto the
 * finish the rules chose (`applyDrawingFinishFields`), so the screen fills its two fields and headless costs the same
 * (`BulkRunOptions.finishFields`). They never go in `answers`.
 */
export const FINISH_FORM_FIELDS: readonly FormFieldBinding[] = [
  { parameter: 'finish.coatingThickness', fieldSuffix: 'sf-um', why: 'plating deposit thickness — a form field of the surface-treatment block, not a question' },
  { parameter: 'finish.maskedFeatures', fieldSuffix: 'sf-mask', why: 'masked features — a form field of the surface-treatment block, not a question' },
];

export const EXPECT_MATERIAL: ExpectedParameter = { name: 'material.designation', alternatives: ['material.specCode'], why: 'the material sets the weight and the £/kg — no source states it' };
export const EXPECT_VOLUME: ExpectedParameter = { name: 'part.volume', why: 'the volume is the measured basis of the weight — no 3D model was measured' };
