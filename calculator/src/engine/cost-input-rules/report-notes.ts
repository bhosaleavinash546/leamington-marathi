/**
 * What a commodity's rules say about the costing that is not a form value: items the costing does NOT price ("Not
 * included", each with its reason) and a route alert. They are read off the rules' context, which only the server (and
 * a headless harness) has — the browser builds its report from the CAD response, so the response carries them as
 * `reportNotes` and the report reads them from there (report standard round, Nov 2026: the app's PDF dropped the
 * composites items because `ruleContext` never reaches the browser).
 *
 * Generic on purpose: any commodity can add its own items here. Only composites sends them now.
 */
import type { RuleContext } from './types.js';
import { withRates } from '../rate-context.js';
import { compositesNotCosted, compositesAlert } from './commodities/composites.js';

export interface RuleReportNotes {
  /** The commodity the notes were made for — a report of another commodity ignores them. */
  commodity: string;
  /** Items the costing does not price, each with its reason. */
  notCosted: Array<{ item: string; reason: string }>;
  /** A route alert (the costed route does not suit the volume), or null. */
  alert: string | null;
}

/** The commodity's report notes for this rule context, or null when the commodity has none (or its rules cannot say). */
export function ruleReportNotes(commodity: string | null | undefined, ctx: RuleContext | null | undefined): RuleReportNotes | null {
  if (!commodity || !ctx) return null;
  try {
    return withRates(ctx.rates, () => {
      switch (commodity) {
        case 'composites':
          return { commodity, notCosted: compositesNotCosted(ctx), alert: compositesAlert(ctx) };
        default:
          return null;
      }
    });
  } catch {
    return null;   // a rule still asking (laminate unanswered) — nothing to report yet
  }
}
