import type { CommodityPack } from './types.js';
import { FAMILY, PRESSURE_TIGHT, SAFETY_CRITICAL, EXPECT_MATERIAL, EXPECT_VOLUME } from './shared.js';

/**
 * Machining: the material family, and the two advisory service questions. It has no grade question (the family's
 * representative bar is costed), no tolerance-class question and no finish question.
 */
export const MACHINING_PACK: CommodityPack = {
  commodity: 'machining',
  expected: [EXPECT_VOLUME, EXPECT_MATERIAL],
  bindings: [FAMILY, SAFETY_CRITICAL, PRESSURE_TIGHT],
};
