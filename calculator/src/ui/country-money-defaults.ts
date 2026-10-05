/**
 * The £ DEFAULTS on the commodity forms follow the manufacturing country.
 *
 * WHY. The all-commodity country audit (Oct 2026) costed every form on its
 * defaults in the UK and in India. Every labour, machine, material and energy rate
 * the forms charged was India's — but the £ fields kept their UK defaults: a
 * £120,000 HPDC die, a £5,000 pattern, £1.50 cores, £2,000 programming, a £25 C-scan,
 * £0.25/kg toll grinding. Those are toolroom, engineering and service prices, and
 * in India they are India's.
 *
 * THE RULE. Each £ field states its COUNTRY BASIS (engine: regional-services.ts),
 * the same basis the CAD rules use for the same figure. The HTML default is its UK
 * value; while the field still shows the value this module last wrote, it shows
 * UK value × `countryFactor(basis, country)` and follows every country switch.
 * Anything else — a figure the engineer typed, a draft restored, a CAD rule value
 * (already priced in the country by the server) — is a quote and is never touched.
 * A field whose basis is `'global'` (inserts, catalogue hardware, electronic
 * components, rivets) or `'quote'` (a bought-in price only a supplier can give) is
 * listed so the table is complete, and left as typed.
 */
import { countryFactor, type CountryBasis } from '../engine/regional-services.js';
import type { ManufacturingRegion } from '../engine/regional-rates.js';

/** A form's £ figure that only a supplier can state — not scaled, listed for completeness. */
type FieldBasis = CountryBasis | 'quote';

/** A tool, die, mould, pattern or fixture: ~20% steel and bought-outs (traded), the rest toolroom. ESTIMATE split. */
const TOOL: CountryBasis = { globalShare: 0.2, rest: 'toolroom' };
/** A sand core: ~30% sand and binder (traded), the rest core-shop labour and machine. Same as the CAD rule. */
const CORE: CountryBasis = { globalShare: 0.3, rest: 'process' };
/** Investment wax and shell: ~35% wax and slurry (traded), the rest dipping / injection labour. Same as the CAD rule. */
const INVEST: CountryBasis = { globalShare: 0.35, rest: 'process' };

/** Every £ input on the commodity forms, by id. Row fields are matched by `ROW_BASIS`. */
export const FIELD_BASIS: Record<string, FieldBasis> = {
  // Tools, dies, moulds, patterns, fixtures
  'imm-mould-cost': TOOL, 'smf-tooling': TOOL, 'mach-tooling': TOOL, 'forge-die-cost': TOOL,
  'cast-hpdc-die-cost': TOOL, 'cast-sand-pat-cost': TOOL, 'cast-grav-mould-cost': TOOL,
  'cam-hpdc-die-cost': TOOL, 'cam-sand-pat-cost': TOOL, 'cam-grav-mould-cost': TOOL, 'cam-inv-wax-die': TOOL,
  'cam-mach-tooling': TOOL, 'rub-mould-cost': TOOL, 'comp-tool-cost': TOOL, 'harn-board-cost': TOOL,
  'sm-die-cost': TOOL, 'ext-die-cost': TOOL, 'bm-mould-cost': TOOL, 'tf-tool-cost': TOOL, 'rm-mould-cost': TOOL,
  'biw-tooling': TOOL, 'paint-tooling': TOOL,
  // Engineering NRE
  'mach-prog-nre': 'engineer', 'cam-mach-prog-nre': 'engineer', 'pcbf-nre': 'engineer', 'pcba-nre-cost': 'engineer',
  // Heat treatment
  'cast-ht-cost': 'heatTreat', 'forge-ht-cost': 'heatTreat', 'cam-ht-cost': 'heatTreat', 'gear-ht-min-charge': 'heatTreat',
  // Inspection and test
  'cast-ndt': 'inspection', 'forge-ndt': 'inspection', 'cam-ndt': 'inspection', 'comp-ndi': 'inspection',
  'rub-inspect': 'inspection', 'pcba-test-cost': 'inspection',
  // Bought-in process services
  'cast-shot-blast': 'process', 'cast-impreg': 'process', 'cam-shot-blast': 'process', 'cam-impreg': 'process',
  'cam-fettle': 'process', 'forge-descale': 'process', 'forge-coining': 'process', 'imm-secondary-cost': 'process',
  'pcba-rework-cost': 'process', 'rm-powder-adder': 'process', 'paint-colour-cost': 'process',
  // Cores, wax, shell
  'cast-sand-core': CORE, 'cam-sand-core': CORE,
  'cast-inv-wax': INVEST, 'cast-inv-shell': INVEST, 'cam-inv-wax': INVEST, 'cam-inv-shell': INVEST,
  // Process chemicals
  'pcba-coat-price': 'chemical', 'rub-primer': 'chemical',
  // Library materials (the form's default is that grade's UK price)
  'gear-blank-cost': { material: 'mat-steel-20mncr5' },
  'comp-fibre-price': { material: 'mat-cf-dry-3k' },
  'comp-resin-price': { material: 'mat-epoxy-infusion' },
  // Traded goods — the same £ everywhere (stated, not scaled)
  'imm-insert-cost': 'global', 'smf-mig-cons': 'global', 'smf-tig-cons': 'global',
  'mach-tool-wear': 'global', 'cam-tool-wear': 'global',
  'harn-splice-cost': 'global', 'harn-conduit-price': 'global', 'harn-tape-price': 'global',
  'bm-masterbatch': 'global', 'rm-masterbatch': 'global',
  // A supplier's price for a bought-in item
  'biw-sub-cost': 'quote', 'pcba-pcb-cost': 'quote', 'bm-preform-cost': 'quote',
  // The engineer's target price — an input to compare against, not a cost default
  'wiz-target': 'quote',
};

/** Row fields added by "+ Add" buttons. */
export const ROW_BASIS: Array<[RegExp, FieldBasis]> = [
  [/^coat\d+-price$/, 'chemical'],          // paint £/L
  [/^bom\d+-price$/, 'global'],             // electronic components
  [/^join\d+-cost$/, 'global'],             // rivets, adhesive, weld consumables
  [/^(sm|smf)-hw\d+-cost$/, 'global'],      // catalogue hardware
];

export function basisFor(id: string): FieldBasis | undefined {
  if (id in FIELD_BASIS) return FIELD_BASIS[id];
  return ROW_BASIS.find(([re]) => re.test(id))?.[1];
}

const UK_ATTR = 'data-cv-uk';     // the UK default, as the form rendered it
const AUTO_ATTR = 'data-cv-auto'; // the value this module last wrote

const fmt = (v: number, ref: string): string => {
  const dp = Math.max(2, (ref.split('.')[1] ?? '').length + 1);   // one place finer than the default, so £0.005 × 0.9 shows
  const r = Math.round(v * 10 ** dp) / 10 ** dp;
  return Math.abs(r) >= 100 ? String(Math.round(r)) : String(r);
};

/**
 * Bring every £ default under `root` to `region`. Idempotent; call after a form
 * renders, after rows are added, and on every country switch.
 */
export function applyCountryMoneyDefaults(root: ParentNode, region: ManufacturingRegion): number {
  let changed = 0;
  root.querySelectorAll<HTMLInputElement>('input[type="number"][id]').forEach(inp => {
    const basis = basisFor(inp.id);
    if (!basis || basis === 'quote' || basis === 'global') return;
    if (!inp.hasAttribute(UK_ATTR)) {
      // First sight: the rendered default IS the UK value.
      inp.setAttribute(UK_ATTR, inp.value);
      inp.setAttribute(AUTO_ATTR, inp.value);
    }
    // Typed, restored or CAD-filled — a quote; leave it.
    if (inp.value !== inp.getAttribute(AUTO_ATTR)) return;
    const uk = Number(inp.getAttribute(UK_ATTR));
    if (!Number.isFinite(uk) || uk === 0 || inp.getAttribute(UK_ATTR) === '') return;
    const next = fmt(uk * countryFactor(basis, region), inp.getAttribute(UK_ATTR)!);
    if (next !== inp.value) { inp.value = next; changed++; }
    inp.setAttribute(AUTO_ATTR, next);
    inp.title = region === 'UK' ? '' : `UK default £${inp.getAttribute(UK_ATTR)} in this country (${typeof basis === 'string' ? basis : 'mixed'} basis) — type a quote to replace it`;
  });
  return changed;
}

/** Keep rows added later ("+ Add coat", "+ Add BOM line") in the country too. */
export function watchCountryMoneyDefaults(root: HTMLElement, region: () => ManufacturingRegion): MutationObserver {
  const obs = new MutationObserver(muts => {
    if (muts.some(m => m.addedNodes.length)) applyCountryMoneyDefaults(root, region());
  });
  obs.observe(root, { childList: true, subtree: true });
  return obs;
}

/**
 * Write a UK-basis £ DEFAULT into a field — a process-type switch that resets the
 * mould cost, say — shown in `region` and tracked like a rendered default.
 */
export function setCountryDefault(inp: HTMLInputElement | null, ukValue: number, region: ManufacturingRegion): void {
  if (!inp) return;
  inp.setAttribute(UK_ATTR, String(ukValue));
  inp.setAttribute(AUTO_ATTR, inp.value = String(ukValue));
  applyCountryMoneyDefaults({ querySelectorAll: () => [inp] } as unknown as ParentNode, region);
}

/**
 * The value a £ field WOULD show in `region`, without touching it — null when the
 * field is not a tracked default (typed, restored, CAD-filled, traded or a quote).
 * The comparison table re-collects the form per country with these (country-recost.ts).
 * Factors that read the rate book (a library material) read the ACTIVE book, so call
 * it with `region`'s book active.
 */
export function countryDefaultValue(inp: HTMLInputElement, region: ManufacturingRegion): string | null {
  const basis = basisFor(inp.id);
  if (!basis || basis === 'quote' || basis === 'global') return null;
  const ukText = inp.getAttribute(UK_ATTR);
  if (ukText === null || ukText === '' || inp.value !== inp.getAttribute(AUTO_ATTR)) return null;
  const uk = Number(ukText);
  if (!Number.isFinite(uk) || uk === 0) return null;
  return fmt(uk * countryFactor(basis, region), ukText);
}
