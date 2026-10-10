/**
 * Labour ROLES — one entry per job, priced in the country being costed.
 *
 * The library carries two kinds of labour id:
 *  - roles, `lab-uk-<role>` (skilled, semiskilled, engineer, foundry, …): the
 *    rules, modules and forms ask for these; `buildRegionalLibrary` prices each
 *    at the selected country's rate for its category;
 *  - older country-PINNED grades, `lab-<cc>-<role>` (lab-de-skilled,
 *    lab-cn-skilled, …), from before the country rebuild existed.
 * A pinned grade either mixed another country's labour into a costing (a UK
 * costing with lab-cn-skilled) or, rebuilt for a country, became a duplicate of
 * the role — the labour drop-down in Vietnam listed "Skilled Machinist (Vietnam)"
 * ten times. Countries are chosen with the country picker, never per operation,
 * so the screens offer roles only and a pinned id resolves to its role.
 */
import type { LabourRate, RateLibrary } from './types.js';

/** True for an old country-pinned grade (lab-de-skilled), false for a role (lab-uk-skilled) or a company id. */
export function isCountryPinnedLabour(id: string): boolean {
  return /^lab-(?!uk-)[a-z]{2}-[a-z-]+$/.test(id);
}

/** The role a labour id stands for — a pinned grade maps to `lab-uk-<role>`; anything else is returned unchanged. */
export function labourRoleId(id: string): string {
  return isCountryPinnedLabour(id) ? id.replace(/^lab-[a-z]{2}-/, 'lab-uk-') : id;
}

/** The labour entries a screen should offer: roles (and company ids), never pinned grades. */
export function labourRoles(lib: RateLibrary): LabourRate[] {
  return lib.labour.filter(l => !isCountryPinnedLabour(l.id));
}

/**
 * What a report prints for a labour id: the ROLE, never the library key. `lab-uk-skilled` is the skilled-machinist role
 * priced in the costed country, but an India report printed "lab-uk-skilled" beside an India rate (casting 360 review,
 * Oct 2026). Company ids are printed as given.
 */
export function labourRoleLabel(id: string): string {
  const m = /^lab-(?:[a-z]{2}-)?([a-z][a-z-]*)$/.exec(labourRoleId(id));
  return m ? `${m[1].replace(/-/g, ' ')} (role)` : id;
}
