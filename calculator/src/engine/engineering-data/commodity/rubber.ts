import { ELASTOMER_DECISION_ID } from '../../cost-input-rules/derive/elastomer.js';
import type { CommodityPack } from './types.js';
import { EXPECT_MATERIAL, EXPECT_VOLUME } from './shared.js';

/** Rubber: the compound. */
export const RUBBER_PACK: CommodityPack = {
  commodity: 'rubber',
  expected: [EXPECT_VOLUME, { ...EXPECT_MATERIAL, why: 'the compound sets the £/kg and the cure time — no source states it' }],
  bindings: [{ parameter: 'material.grade', decisionId: ELASTOMER_DECISION_ID, codec: 'elastomerInScope' }],
};
