import { AL_ALLOY_DECISION_ID, AL_TEMPER_DECISION_ID, AL_FINISH_DECISION_ID } from '../../cost-input-rules/commodities/aluminium-extrusion.js';
import type { CommodityPack } from './types.js';
import { SAFETY_CRITICAL, EXPECT_MATERIAL, EXPECT_VOLUME } from './shared.js';

/**
 * Aluminium extrusion: the alloy (blocking), its temper and the finish (advisory), safety-critical (advisory).
 * The finish question here has its OWN vocabulary (mill / anodise / powder / e-coat) — the `alFinish` reader maps the
 * interpreted finish route onto it. Route (direct / indirect …) and stretch bends are not drawing readings the
 * dictionary holds.
 */
export const ALUMINIUM_EXTRUSION_PACK: CommodityPack = {
  commodity: 'aluminium_extrusion',
  expected: [EXPECT_VOLUME, { ...EXPECT_MATERIAL, why: 'the alloy sets the billet price and the press speed — no source states it' }],
  bindings: [
    { parameter: 'material.alloy', decisionId: AL_ALLOY_DECISION_ID, codec: 'alAlloy' },
    { parameter: 'material.condition', decisionId: AL_TEMPER_DECISION_ID, codec: 'alTemper' },
    { parameter: 'finish.coatingRoute', decisionId: AL_FINISH_DECISION_ID, codec: 'alFinish' },
    SAFETY_CRITICAL,
  ],
};
