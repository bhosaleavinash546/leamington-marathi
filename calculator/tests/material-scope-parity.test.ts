/**
 * Every grade the rules pick must be one the screen's form can show.
 *
 * The rules choose a representative grade per commodity and material family
 * (derive/material.ts) and the headless path costs it as chosen. The screen
 * writes it into the form's material drop-down — which only offers the grades
 * its scope admits (src/ui/material-scope.ts) and silently keeps its FIRST
 * option when handed one it does not list. A steel casting got the wrought bar
 * mat-steel1045 from the rules: accepted headless at £0.95/kg, refused by the
 * cast-and-machine drop-down, which stayed on the aluminium die-cast alloy
 * ADC12 — so the screen priced 2.5 kg of steel at an aluminium rate and the two
 * paths disagreed 3.4x on the Casting Bracket's material (2 Oct 2026).
 */
import { describe, it, expect } from 'vitest';
import { representativeMaterialId } from '../src/engine/cost-input-rules/derive/material.js';
import { MATERIAL_SCOPE_BY_SELECT } from '../src/ui/material-scope.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { MaterialFamily } from '../src/engine/material-family.js';

/** The commodity forms whose material drop-down the rules fill, by select id. */
const FORM_SELECT: Record<string, string> = {
  machining: 'mach-mat',
  forging: 'forge-mat',
  casting: 'cast-mat',
  cast_and_machine: 'cam-mat',
  sheet_metal: 'sm-mat',
  sheet_metal_fab: 'smf-mat',
};
const FAMILIES: MaterialFamily[] = ['steel', 'aluminium', 'cast iron', 'magnesium', 'titanium', 'copper alloy', 'plastic'];

describe('the rules never pick a grade the form cannot show', () => {
  for (const [commodity, select] of Object.entries(FORM_SELECT)) {
    for (const family of FAMILIES) {
      const id = representativeMaterialId(commodity, family);
      if (!id) continue;
      it(`${commodity} / ${family} → ${id} is offered by #${select}`, () => {
        const m = DEFAULT_RATE_LIBRARY.materials.find(x => x.id === id);
        expect(m, `${id} is not in the rate library`).toBeDefined();
        const scope = MATERIAL_SCOPE_BY_SELECT[select];
        if (scope) expect(scope.test(m!.category), `#${select} does not offer "${m!.category}" (${id})`).toBe(true);
      });
    }
  }

  it('a steel casting is priced as cast steel, not as bar stock', () => {
    for (const c of ['casting', 'cast_and_machine']) {
      const m = DEFAULT_RATE_LIBRARY.materials.find(x => x.id === representativeMaterialId(c, 'steel'))!;
      expect(m.category, c).toMatch(/Cast/);
    }
  });
});
