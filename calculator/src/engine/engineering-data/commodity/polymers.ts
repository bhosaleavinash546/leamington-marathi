import type { CommodityPack } from './types.js';
import { RESIN, PRESSURE_TIGHT, EXPECT_MATERIAL, EXPECT_VOLUME } from './shared.js';

const EXPECT_RESIN = { ...EXPECT_MATERIAL, why: 'the resin sets the weight, the £/kg and the cooling time — no source states it' };

/** Injection moulding: the resin. */
export const INJECTION_MOULDING_PACK: CommodityPack = { commodity: 'injection_moulding', expected: [EXPECT_VOLUME, EXPECT_RESIN], bindings: [RESIN] };
/** Thermoforming: the sheet resin. */
export const THERMOFORMING_PACK: CommodityPack = { commodity: 'thermoforming', expected: [EXPECT_VOLUME, EXPECT_RESIN], bindings: [RESIN] };
/** Blow moulding: the resin and (advisory) leak-tightness. Capacity and barrier wall are not drawing readings the dictionary holds. */
export const BLOW_MOULDING_PACK: CommodityPack = { commodity: 'blow_moulding', expected: [EXPECT_VOLUME, EXPECT_RESIN], bindings: [RESIN, PRESSURE_TIGHT] };
/** Rotational moulding: the powder and (advisory) leak-tightness. */
export const ROTATIONAL_MOULDING_PACK: CommodityPack = { commodity: 'rotational_moulding', expected: [EXPECT_VOLUME, EXPECT_RESIN], bindings: [RESIN, PRESSURE_TIGHT] };
/** Polymer extrusion: the compound and (advisory) the pressure test. */
export const EXTRUSION_PACK: CommodityPack = { commodity: 'extrusion', expected: [EXPECT_VOLUME, EXPECT_RESIN], bindings: [RESIN, PRESSURE_TIGHT] };
