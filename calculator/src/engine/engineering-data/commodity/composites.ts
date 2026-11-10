import { LAMINATE_DECISION_ID } from '../../cost-input-rules/derive/laminate.js';
import type { CommodityPack } from './types.js';
import { EXPECT_MATERIAL, EXPECT_VOLUME } from './shared.js';

/** Composites: the fibre + resin + process system (one question). */
export const COMPOSITES_PACK: CommodityPack = {
  commodity: 'composites',
  expected: [EXPECT_VOLUME, { ...EXPECT_MATERIAL, why: 'the laminate system sets both materials and the ply count — no source states it' }],
  bindings: [{ parameter: 'material.laminateSystem', decisionId: LAMINATE_DECISION_ID, codec: 'laminateSystem' }],
};
