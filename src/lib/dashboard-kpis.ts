/**
 * THE HOME KPI TILES, AS A PURE FUNCTION.
 *
 * Stripe Home and Vercel's overview put three or four figures at the top, each
 * with an "as of" — a number without a time is a number nobody can act on.
 * The rule this file keeps is the house rule: every figure says where it came
 * from, and a figure that has no source says "—", never a stand-in.
 *
 * That rule is why "Confirmed savings" reads ONLY the pipeline's G3 gate. The
 * tile it replaced fell back to the sum of ideas a user had marked "approved"
 * in an analysis when no business case existed — a figure parsed from AI text,
 * shown under the word "Committed". Those estimates still appear, labelled as
 * estimates, beside the tiles; they never stand in for a gated number.
 */
export interface KpiProject { generatedAt: string; summary?: { totalIdeas?: number } }
export interface KpiPipeline { totalPotential: number; confirmedSaving: number; gateCount: Record<string, number>; totalCases: number }

export interface Kpi {
  id: 'pipeline' | 'confirmed' | 'month' | 'reviewed';
  label: string;
  /** Raw value; null when there is no source for it. Money in the display currency (GBP). */
  value: number | null;
  kind: 'money' | 'count' | 'percent';
  sub: string;
  source: string;
}

const monthStart = (now: Date) => new Date(now.getFullYear(), now.getMonth(), 1);

export function ideasThisMonth(projects: KpiProject[], now: Date): { ideas: number; analyses: number; since: Date } {
  const since = monthStart(now);
  let ideas = 0, analyses = 0;
  for (const p of projects) {
    const t = new Date(p.generatedAt);
    if (Number.isNaN(t.getTime()) || t < since || t > now) continue;
    analyses++;
    ideas += p.summary?.totalIdeas ?? 0;
  }
  return { ideas, analyses, since };
}

export function dashboardKpis(input: {
  pipeline: KpiPipeline | null;
  projects: KpiProject[];
  reviewed: number;
  annotated: number;
  now: Date;
}): Kpi[] {
  const { pipeline, projects, reviewed, annotated, now } = input;
  const cases = pipeline?.totalCases ?? 0;
  const month = ideasThisMonth(projects, now);
  const sinceLabel = month.since.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const g3 = pipeline?.gateCount?.G3 ?? 0;
  return [
    {
      id: 'pipeline', label: 'Pipeline value', kind: 'money',
      value: cases > 0 ? pipeline!.totalPotential : null,
      sub: cases > 0 ? `${cases} business case${cases === 1 ? '' : 's'}, G0–G3` : 'No business cases yet',
      source: 'Pipeline',
    },
    {
      id: 'confirmed', label: 'Confirmed savings', kind: 'money',
      value: cases > 0 ? pipeline!.confirmedSaving : null,
      sub: cases > 0 ? `${g3} idea${g3 === 1 ? '' : 's'} through G3` : 'Nothing has passed G3',
      source: 'Pipeline · G3 gate',
    },
    {
      id: 'month', label: 'Ideas this month', kind: 'count',
      value: month.ideas,
      sub: `${month.analyses} ${month.analyses === 1 ? 'analysis' : 'analyses'} since ${sinceLabel}`,
      source: 'Saved analyses',
    },
    {
      id: 'reviewed', label: 'Reviewed', kind: 'percent',
      value: annotated > 0 ? Math.round((reviewed / annotated) * 100) : null,
      sub: annotated > 0 ? `${reviewed} of ${annotated} ideas` : 'No ideas to review yet',
      source: 'Your annotations',
    },
  ];
}
