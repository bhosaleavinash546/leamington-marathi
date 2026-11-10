import {
  GEAR_HELIX_DECISION_ID, GEAR_QUALITY_DECISION_ID, GEAR_HARDENING_DECISION_ID, GEAR_CASE_DEPTH_DECISION_ID,
  GEAR_TEETH_DECISION_ID, GEAR_MODULE_DECISION_ID, GEAR_FACE_DECISION_ID,
} from '../../cost-input-rules/commodities/gear.js';
import type { CommodityPack } from './types.js';
import { SAFETY_CRITICAL, EXPECT_MATERIAL } from './shared.js';

/**
 * Gear: the drawing's gear data table. Helix, quality class, hardening route and case depth are drawing figures the
 * engine asks for. Teeth, module and face width are MEASURED when the kernel finds a gear; their questions exist only
 * when it did not, so those bindings are `onlyWhenAsked`.
 *
 * Not bound: `gear.materialClass` (case-hardening v through-hardening steel …). No existing matcher reads that class
 * off a designation, and writing one here would be a new rule — it stays the engineer's answer.
 */
export const GEAR_PACK: CommodityPack = {
  commodity: 'gear',
  expected: [
    EXPECT_MATERIAL,
    { name: 'gear.teeth', why: 'the tooth count — neither counted on a model nor read off a gear data table' },
    { name: 'gear.module', why: 'the normal module — neither derived from a model nor read off a gear data table' },
    { name: 'gear.helixAngle', why: 'the helix angle is never taken from a model — the gear data table states none' },
    { name: 'gear.qualityClass', why: 'the flank tolerance class decides the finishing route — the gear data table states none' },
    { name: 'heatTreat.process', why: 'the hardening route changes the operation list — the drawing states none' },
  ],
  bindings: [
    { parameter: 'gear.helixAngle', decisionId: GEAR_HELIX_DECISION_ID, codec: 'gearHelix' },
    { parameter: 'gear.qualityClassIso', decisionId: GEAR_QUALITY_DECISION_ID, codec: 'gearQualityClass' },
    { parameter: 'heatTreat.route', decisionId: GEAR_HARDENING_DECISION_ID, codec: 'gearHardening' },
    { parameter: 'heatTreat.caseDepth', decisionId: GEAR_CASE_DEPTH_DECISION_ID, codec: 'gearCaseDepth' },
    { parameter: 'gear.teeth', decisionId: GEAR_TEETH_DECISION_ID, codec: 'positiveInteger', onlyWhenAsked: true },
    { parameter: 'gear.module', decisionId: GEAR_MODULE_DECISION_ID, codec: 'positiveNumber', onlyWhenAsked: true },
    { parameter: 'gear.faceWidth', decisionId: GEAR_FACE_DECISION_ID, codec: 'positiveNumber', onlyWhenAsked: true },
    SAFETY_CRITICAL,
  ],
};
