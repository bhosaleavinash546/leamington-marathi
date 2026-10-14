/**
 * Software costing SCENARIOS (cockpit round 2, Oct 2026): compare programmes against a pinned baseline. Every figure is
 * `computeSWProgram` on that scenario's own inputs — this module only runs the engine, lines the results up and says
 * which inputs differ. It never prices anything itself.
 */

import { computeSWProgram, swModuleDefs, type SWProgramInputs, type SWProgramResult, type DevSource, type SWReuse, type SWRegion } from './sw-should-cost.js';
import { swUnitEconomics } from './sw-cockpit.js';
import { SW_HUB_RATES } from './sw-country-rates.js';

export interface SWScenarioIn { id: string; name: string; inputs: SWProgramInputs; kind: 'baseline' | 'current' | 'saved' | 'generated' }

export interface SWScenarioFigures {
  total: number; perVehicle: number; nre: number; lifecycle: number;
  perVehicleBuilt: number; perVehicleYear: number; p90: number; effortPM: number;
}

export interface SWScenarioRow {
  id: string; name: string; kind: SWScenarioIn['kind'];
  figures?: SWScenarioFigures;
  /** Signed difference to the baseline, per figure (absent for the baseline itself or a failed scenario). */
  delta?: SWScenarioFigures;
  /** The inputs that differ from the baseline, in words. */
  differs: string[];
  /** Why this scenario could not be costed (the engine's own validation message). */
  error?: string;
}

/** The figures a scenario is compared on, read off the engine result. */
export function scenarioFigures(r: SWProgramResult): SWScenarioFigures {
  const s = r.summary;
  const u = swUnitEconomics(r);
  return {
    total: s.grandTotal, perVehicle: s.perVehicle, nre: s.nreTotal,
    lifecycle: s.totalMaintenance + s.totalCloud + s.totalLicensing,
    perVehicleBuilt: u.perVehicleBuilt, perVehicleYear: u.perVehicleYear,
    p90: r.monteCarlo.p90, effortPM: s.totalEffortPersonMonths,
  };
}

const SOURCE_LABEL: Record<DevSource, string> = { OEM_Internal: 'in-house', Tier1_Supplier: 'Tier-1 supplier', Startup_OSS: 'start-up / OSS' };
const hub = (id: string) => SW_HUB_RATES[id as keyof typeof SW_HUB_RATES]?.label ?? id;
const num = (n: number | undefined | null, unit = '') => n == null ? 'not set' : `${n.toLocaleString('en-GB')}${unit}`;

/** What differs between two programmes, in words an engineer reads ("hub United Kingdom → India"). */
export function diffInputs(base: SWProgramInputs, s: SWProgramInputs): string[] {
  const out: string[] = [];
  const field = (label: string, a: unknown, b: unknown, show: (v: never) => string = v => String(v)) => {
    if ((a ?? null) !== (b ?? null)) out.push(`${label} ${show(a as never)} → ${show(b as never)}`);
  };
  field('hub', base.region, s.region, hub);
  field('source', base.devSource, s.devSource, (v: DevSource) => SOURCE_LABEL[v] ?? v);
  field('powertrain', base.powertrain, s.powertrain, (v: string | undefined) => v ?? 'as configured');
  field('volume', base.annualProductionVolume, s.annualProductionVolume, (v: number) => `${num(v)} / yr`);
  field('life', base.programLifeYears, s.programLifeYears, (v: number) => `${v} yr`);
  field('platform volume', base.platformAnnualVolume, s.platformAnnualVolume, (v: number | undefined) => v ? `${num(v)} / yr` : 'this variant only');
  field('overhead', base.overheadMultiplier, s.overheadMultiplier, (v: number) => `×${v}`);
  field('senior share', base.teamSeniorFraction, s.teamSeniorFraction, (v: number) => `${Math.round(v * 100)} %`);
  field('typed rate', base.baseRateGBP, s.baseRateGBP, (v: number | undefined) => v ? `£${num(v)} / PM` : 'hub book');
  field('effort calibration', base.effortCalibration, s.effortCalibration, (v: number | undefined) => v ? `×${v}` : 'none');
  field('development', base.developmentMonths, s.developmentMonths, (v: number | undefined) => v ? `${v} months` : 'default');
  field('connected vehicles', base.connectedVehicleShare, s.connectedVehicleShare, (v: number | undefined) => v == null ? '100 %' : `${Math.round(v * 100)} %`);
  field('maintenance', base.includeMaintenanceCost, s.includeMaintenanceCost, (v: boolean) => v ? 'included' : 'excluded');
  field('cloud', base.includeCloudCost, s.includeCloudCost, (v: boolean) => v ? 'included' : 'excluded');
  field('discount rate', base.discountRatePct, s.discountRatePct, (v: number | undefined) => `${v ?? 0} %`);
  field('connected service', base.connectedServiceYears, s.connectedServiceYears, (v: number | undefined) => v == null ? 'default' : `${v} yr`);
  field('map subscription', base.subscriptionYears, s.subscriptionYears, (v: number | undefined) => v == null ? 'default' : `${v} yr`);
  field('support after last build', base.postProductionSupportYears, s.postProductionSupportYears, (v: number | undefined) => v == null ? 'default' : `${v} yr`);
  field('support share', base.postProductionSupportShare, s.postProductionSupportShare, (v: number | undefined) => v == null ? 'default' : `${Math.round(v * 100)} %`);

  const byId = new Map(base.modules.map(m => [m.moduleId, m]));
  const defs = swModuleDefs(s);
  const name = (id: string) => defs.get(id)?.shortName ?? id;
  const added: string[] = [], removed: string[] = [];
  let asil = 0, comp = 0, reuse = 0, size = 0;
  for (const m of s.modules) {
    const b = byId.get(m.moduleId);
    const on = m.enabled, was = b?.enabled ?? false;
    if (on && !was) added.push(name(m.moduleId));
    if (!on && was) removed.push(name(m.moduleId));
    if (!on || !b || !was) continue;
    if (m.asil !== b.asil) asil++;
    if (m.complexity !== b.complexity) comp++;
    if (m.reuse !== b.reuse) reuse++;
    if ((m.customPersonMonths ?? null) !== (b.customPersonMonths ?? null) || (m.sizeKSLOC ?? null) !== (b.sizeKSLOC ?? null) || (m.cal ?? null) !== (b.cal ?? null)) size++;
  }
  const list = (xs: string[]) => xs.length <= 3 ? xs.join(', ') : `${xs.slice(0, 3).join(', ')} +${xs.length - 3}`;
  if (added.length) out.push(`+${added.length} module${added.length === 1 ? '' : 's'} (${list(added)})`);
  if (removed.length) out.push(`−${removed.length} module${removed.length === 1 ? '' : 's'} (${list(removed)})`);
  if (asil) out.push(`ASIL changed on ${asil} module${asil === 1 ? '' : 's'}`);
  const mods = (n: number) => `${n} module${n === 1 ? '' : 's'}`;
  if (comp) out.push(`complexity changed on ${mods(comp)}`);
  if (reuse) out.push(`reuse changed on ${mods(reuse)}`);
  if (size) out.push(`size, custom PM or CAL changed on ${mods(size)}`);
  return out;
}

/** Cost every scenario in its own inputs and line it up against the baseline (the first `baseline` entry, else the
 *  first scenario). A scenario the engine refuses keeps its row with the reason. */
export function compareScenarios(list: SWScenarioIn[]): SWScenarioRow[] {
  const base = list.find(x => x.kind === 'baseline') ?? list[0];
  if (!base) return [];
  let baseFig: SWScenarioFigures | undefined;
  try { baseFig = scenarioFigures(computeSWProgram(base.inputs)); } catch { /* reported on its own row */ }
  return list.map(sc => {
    const row: SWScenarioRow = { id: sc.id, name: sc.name, kind: sc.kind, differs: sc === base ? [] : diffInputs(base.inputs, sc.inputs) };
    try {
      row.figures = sc === base && baseFig ? baseFig : scenarioFigures(computeSWProgram(sc.inputs));
      if (sc !== base && baseFig) {
        const f = row.figures, d = {} as SWScenarioFigures;
        for (const k of Object.keys(f) as (keyof SWScenarioFigures)[]) d[k] = f[k] - baseFig[k];
        row.delta = d;
      }
    } catch (err) {
      row.error = (err as Error).message;
    }
    return row;
  });
}

const clone = (p: SWProgramInputs): SWProgramInputs => ({ ...p, modules: p.modules.map(m => ({ ...m })) });

/** The three development sources on the current inputs. */
export function devSourceSet(p: SWProgramInputs): SWScenarioIn[] {
  return (['OEM_Internal', 'Tier1_Supplier', 'Startup_OSS'] as DevSource[])
    .map(d => ({ id: `gen-src-${d}`, name: SOURCE_LABEL[d], kind: 'generated' as const, inputs: { ...clone(p), devSource: d } }));
}

/** Representative hubs — one from each region where most automotive software is written — plus the current one. */
export const SCENARIO_HUBS: SWRegion[] = ['UK', 'DE', 'PL', 'RO', 'IN', 'CN', 'US-MI', 'MX'] as SWRegion[];
export function hubSet(p: SWProgramInputs): SWScenarioIn[] {
  const ids = [p.region, ...SCENARIO_HUBS.filter(h => h !== p.region)];
  // A typed rate is the CURRENT hub's figure — never carried to another hub.
  return ids.map(h => ({ id: `gen-hub-${h}`, name: hub(h), kind: 'generated' as const,
    inputs: { ...clone(p), region: h, baseRateGBP: h === p.region ? p.baseRateGBP : undefined } }));
}

/** Every in-scope module at one reuse level. */
export function reuseSet(p: SWProgramInputs): SWScenarioIn[] {
  return (['Fresh', 'Light', 'Medium', 'Heavy', 'Platform'] as SWReuse[]).map(r => {
    const q = clone(p);
    q.modules = q.modules.map(m => ({ ...m, reuse: r }));
    return { id: `gen-reuse-${r}`, name: `${r} reuse`, kind: 'generated' as const, inputs: q };
  });
}
