import { IMPREGNATION_DECISION_ID } from '../../cost-input-rules/derive/service-questions.js';
import { AL_HEAT_TREAT_DECISION_ID } from '../../cost-input-rules/commodities/casting.js';
import { AL_CASTING_TEMPERS } from '../interpret-tables.js';
import type { CommodityPack } from './types.js';
import { FAMILY, GRADE, PRESSURE_TIGHT, SAFETY_CRITICAL, TOLERANCE_CLASS, FINISH, FINISH_FORM_FIELDS, EXPECT_MATERIAL, EXPECT_VOLUME } from './shared.js';

/** Casting: the route that asks the most of a drawing — material, the three service facts, heat treatment, finish. */
export const CASTING_PACK: CommodityPack = {
  commodity: 'casting',
  expected: [
    EXPECT_VOLUME, EXPECT_MATERIAL,
    { name: 'tolerance.general', alternatives: ['tolerance.castingGrade'], why: 'the tolerance class decides investment v sand on ferrous parts — the drawing states none' },
  ],
  bindings: [
    FAMILY, GRADE, PRESSURE_TIGHT, TOLERANCE_CLASS, SAFETY_CRITICAL, FINISH,
    { parameter: 'quality.impregnationRequired', decisionId: IMPREGNATION_DECISION_ID, codec: 'yesNo' },
    // The aluminium casting temper: T6 / T5 / F, the question's three options.
    { parameter: 'material.condition', decisionId: AL_HEAT_TREAT_DECISION_ID, options: AL_CASTING_TEMPERS },
  ],
  formFields: FINISH_FORM_FIELDS,
};

/** Cast + machine asks exactly what casting asks (it is the casting rule set plus the machining half). */
export const CAST_AND_MACHINE_PACK: CommodityPack = { ...CASTING_PACK, commodity: 'cast_and_machine' };
