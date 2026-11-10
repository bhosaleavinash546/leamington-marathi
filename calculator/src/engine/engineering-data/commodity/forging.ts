import type { CommodityPack } from './types.js';
import { FAMILY, GRADE, SAFETY_CRITICAL, TOLERANCE_CLASS, FINISH, FINISH_FORM_FIELDS, EXPECT_MATERIAL, EXPECT_VOLUME } from './shared.js';

/** Forging: material and grade, tolerance class, safety-critical, finish. It does not ask leak-tightness. */
export const FORGING_PACK: CommodityPack = {
  commodity: 'forging',
  expected: [
    EXPECT_VOLUME, EXPECT_MATERIAL,
    { name: 'tolerance.general', why: 'the tolerance class decides precision v closed-die forging — the drawing states none' },
  ],
  bindings: [FAMILY, GRADE, TOLERANCE_CLASS, SAFETY_CRITICAL, FINISH],
  formFields: FINISH_FORM_FIELDS,
};
