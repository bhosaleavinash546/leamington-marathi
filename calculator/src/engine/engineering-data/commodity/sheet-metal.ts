import type { CommodityPack } from './types.js';
import { FAMILY, GRADE, SAFETY_CRITICAL, FINISH, FINISH_FORM_FIELDS, EXPECT_MATERIAL, EXPECT_VOLUME } from './shared.js';

/** Sheet metal (stamped): material and sheet grade, safety-critical (advisory), finish. */
export const SHEET_METAL_PACK: CommodityPack = {
  commodity: 'sheet_metal',
  expected: [
    EXPECT_VOLUME, EXPECT_MATERIAL,
    { name: 'material.stockThickness', why: 'the gauge sets the blank weight and the press force — no source states it' },
  ],
  bindings: [FAMILY, GRADE, SAFETY_CRITICAL, FINISH],
  formFields: FINISH_FORM_FIELDS,
};

/** Laser + press brake: the same measured blank and the same questions as the stamped route. */
export const SHEET_METAL_FAB_PACK: CommodityPack = { ...SHEET_METAL_PACK, commodity: 'sheet_metal_fab' };
