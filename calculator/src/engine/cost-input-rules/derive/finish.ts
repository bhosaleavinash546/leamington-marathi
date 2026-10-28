/**
 * The finish question — D4 of CAD to COST v2 (decided 28 Oct 2026; docs/ui/cad-to-cost-redesign-2026-10.md).
 *
 * A coating is a drawing note, not a shape: nothing in the B-rep says whether a knuckle is e-coated. It was not asked,
 * so a coated part was costed bare and the cost card listed it under "Not included". Now it is an ADVISORY question on
 * the routes whose module carries a finish (casting, cast + machine, forging, sheet metal — stamped or fabricated):
 * unanswered, the part is costed bare and says so; answered, the route is priced by the surface-treatment model on the
 * measured surface (`computeSurfaceFinishing`: stages by line, chemistry per m², deposited metal, line time on the
 * coating line's rate). No leaning — a bare part is costed until someone says otherwise.
 */
import { decided, ask, fmt, type Decision, type RuleContext, type RuleDef } from '../types.js';
import { materialFacts } from './material.js';
import { gradedMaterialFacts } from './grade.js';
import {
  finishOptionsFor, finishLoading, measuredFinishAreaM2, SURFACE_ROUTE_LABELS,
} from '../../surface-finish-routes.js';

export const FINISH_DECISION_ID = 'service.finish';

/** The route the engineer chose, when it is one this commodity and metal offer; else '' (bare). */
export function answeredFinish(ctx: RuleContext): string | null {
  const v = ctx.answers[FINISH_DECISION_ID];
  if (v === undefined || v === null) return null;
  const s = String(v);
  if (s === 'none' || s === '') return '';
  return finishOptionsFor(ctx.commodity, materialFacts(ctx).family).includes(s) ? s : '';
}

/** Parts a load from the measured surface and the costed grade's mass (surface-finish-routes.ts::finishLoading). */
function loadingFor(ctx: RuleContext) {
  const route = answeredFinish(ctx);
  const mass = gradedMaterialFacts(ctx).massKg ?? 0;
  return route ? finishLoading(route, measuredFinishAreaM2(ctx.geo.surfaceArea?.cm2), mass) : null;
}

export function finishDecision(ctx: RuleContext): Decision | null {
  const routes = finishOptionsFor(ctx.commodity, materialFacts(ctx).family);
  if (!routes.length) return null;
  return {
    id: FINISH_DECISION_ID,
    kind: 'process_choice',
    question: 'Is the part coated or surface-treated?',
    why: 'A finish is a drawing note, not a shape. It is priced per m² of the measured surface on the line the route '
      + 'runs on, with the parts a load sized from the measured surface and mass (published line capacities — confirm '
      + 'the hanging with the coater). Unanswered, the part is costed bare.',
    options: [
      { value: 'none', label: 'None — bare part', consequence: 'no finishing cost', costed: true },
      ...routes.map(r => ({ value: r, label: SURFACE_ROUTE_LABELS[r] ?? r, consequence: 'priced on the measured surface' })),
    ],
    blockedFieldIds: [],
    blockedRuleIds: [],
    severity: 'advisory',
  };
}

/**
 * The three finish rules for one commodity pack. `ns` is the pack's path namespace ('casting', 'forging',
 * 'sheetMetal'); `prefix` its form's field-id prefix. Paths land on `costInputSuggestions.surfaceFinish` (apply.ts).
 */
export function finishRules(ns: string, prefix: string): RuleDef[] {
  return [
    {
      id: `${ns}.q.finish`, path: `${ns}.q.finish`, label: 'finish question',
      evaluate: (ctx) => {
        // The material question is the material rules' to ask (and the process question comes before it on a shell):
        // the finish waits quietly until the metal is known — its options follow the metal.
        if (materialFacts(ctx).decision) return decided(`${ns}.q.finish`, 'none', 'rule', 'pending the material answer', 0.1);
        const a = answeredFinish(ctx);
        if (a !== null) return decided(`${ns}.q.finish`, a || 'none', 'engineer', 'answered', 1, [FINISH_DECISION_ID]);
        const d = finishDecision(ctx);
        return d ? ask(d) : decided(`${ns}.q.finish`, 'none', 'rule', 'no finish offered on this route', 1);
      },
    },
    {
      id: `${ns}.finishRoute`, path: `${ns}.finishRoute`, fieldId: `${prefix}-sf-route`, label: 'finishRoute',
      evaluate: (ctx) => {
        const a = answeredFinish(ctx);
        if (a) {
          return decided(`${ns}.finishRoute`, a, 'engineer',
            `${SURFACE_ROUTE_LABELS[a]} — answered; priced on the measured surface`,
            1, [FINISH_DECISION_ID]);
        }
        return decided(`${ns}.finishRoute`, '', a === '' ? 'engineer' : 'rule',
          a === '' ? 'answered: bare part' : 'not asked yet — costed bare (answer "Is the part coated?" to price a finish)',
          a === '' ? 1 : 0.5, [FINISH_DECISION_ID]);
      },
    },
    {
      id: `${ns}.finishPartsPerRack`, path: `${ns}.finishPartsPerRack`, fieldId: `${prefix}-sf-rack`, label: 'finishPartsPerRack',
      appliesWhen: (ctx) => !!answeredFinish(ctx),
      evaluate: (ctx) => {
        const l = loadingFor(ctx);
        return l ? decided(`${ns}.finishPartsPerRack`, l.partsPerRack, 'rule', l.basis, 0.5, [FINISH_DECISION_ID])
          : decided(`${ns}.finishPartsPerRack`, 1, 'rule', 'no measured surface or mass — one part a load, the pessimistic reading', 0.2, [FINISH_DECISION_ID]);
      },
    },
    {
      id: `${ns}.finishRacksPerHour`, path: `${ns}.finishRacksPerHour`, fieldId: `${prefix}-sf-racks`, label: 'finishRacksPerHour',
      appliesWhen: (ctx) => !!answeredFinish(ctx),
      evaluate: (ctx) => {
        const l = loadingFor(ctx);
        return decided(`${ns}.finishRacksPerHour`, l?.racksPerHour ?? 1, 'rule', l ? l.basis : 'no measured surface or mass', l ? 0.5 : 0.2, [FINISH_DECISION_ID]);
      },
    },
    {
      id: `${ns}.finishAreaM2`, path: `${ns}.finishAreaM2`, fieldId: `${prefix}-sf-area`, label: 'finishAreaM2',
      appliesWhen: (ctx) => measuredFinishAreaM2(ctx.geo.surfaceArea?.cm2) > 0,
      evaluate: (ctx) => {
        const m2 = measuredFinishAreaM2(ctx.geo.surfaceArea?.cm2);
        return decided(`${ns}.finishAreaM2`, m2, 'geometry',
          `measured surface ${fmt(ctx.geo.surfaceArea?.cm2 ?? 0, 1)} cm² = ${fmt(m2, 4)} m² — the whole wetted surface; `
          + 'a masked or machined-after-coating face is in it', 0.9);
      },
    },
  ];
}
