import type { KnowledgeCase } from './part-similarity.js';

/**
 * Autonomous drift monitor — the unattended agent.
 *
 * Runs in the background (server scheduler) over the knowledge base and OPENS
 * FINDINGS on its own — no user action required:
 *   • renegotiation  — the supplier's actual price sits above should-cost →
 *                      quantified £/yr recovery opportunity
 *   • underwater     — the actual sits below should-cost → supply/quality risk
 *                      (unsustainable pricing or scope mismatch)
 *   • stale-estimate — an analysis is old and never validated with an actual →
 *                      confidence decays; nudge to refresh or log a quote
 *
 * Deterministic and fully explainable: every finding carries its arithmetic.
 */

export type DriftKind = 'renegotiation' | 'underwater' | 'stale-estimate';

export interface DriftFinding {
  kind: DriftKind;
  partName: string;
  commodity: string;
  message: string;
  /** Absolute £/yr impact (0 for stale-estimate nudges). */
  annualImpactGBP: number;
  gapPct: number;             // (actual − shouldCost) / shouldCost × 100 (0 when no actual)
  severity: 'high' | 'medium' | 'low';
}

export interface DriftOptions {
  /** Gap (fraction) before a price difference becomes a finding. */
  gapThreshold?: number;        // default 0.08 = 8%
  /** Days after which an actual-less estimate counts as stale. */
  staleAfterDays?: number;      // default 90
  now?: number;                 // injectable clock for tests
}

const round0 = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function scanForDrift(cases: KnowledgeCase[], opts: DriftOptions = {}): DriftFinding[] {
  const gapThreshold = opts.gapThreshold ?? 0.08;
  const staleAfterDays = opts.staleAfterDays ?? 90;
  const now = opts.now ?? Date.now();
  const out: DriftFinding[] = [];

  for (const c of cases) {
    if (!(c.totalCost > 0)) continue;
    const vol = Math.max(1, c.fingerprint.annualVolume ?? 1);

    if (c.actualCost && c.actualCost > 0) {
      const gap = (c.actualCost - c.totalCost) / c.totalCost;
      const gapPct = round1(gap * 100);
      const annualImpactGBP = round0(Math.abs(c.actualCost - c.totalCost) * vol);
      if (gap >= gapThreshold) {
        out.push({
          kind: 'renegotiation', partName: c.partName, commodity: c.fingerprint.commodity,
          gapPct, annualImpactGBP,
          severity: gap >= 0.20 ? 'high' : gap >= 0.12 ? 'medium' : 'low',
          message: `Supplier price £${c.actualCost.toFixed(2)} is ${gapPct}% above should-cost £${c.totalCost.toFixed(2)} — renegotiation opportunity ≈ £${annualImpactGBP.toLocaleString()}/yr at ${vol.toLocaleString()} pcs.`,
        });
      } else if (gap <= -gapThreshold) {
        out.push({
          kind: 'underwater', partName: c.partName, commodity: c.fingerprint.commodity,
          gapPct, annualImpactGBP,
          severity: gap <= -0.20 ? 'high' : 'medium',
          message: `Supplier price £${c.actualCost.toFixed(2)} is ${Math.abs(gapPct)}% BELOW should-cost £${c.totalCost.toFixed(2)} — verify scope/quality; pricing may be unsustainable (exposure ≈ £${annualImpactGBP.toLocaleString()}/yr).`,
        });
      }
    } else {
      const ageDays = (now - c.savedAt) / 86_400_000;
      if (ageDays >= staleAfterDays) {
        out.push({
          kind: 'stale-estimate', partName: c.partName, commodity: c.fingerprint.commodity,
          gapPct: 0, annualImpactGBP: 0, severity: 'low',
          message: `Estimate is ${Math.round(ageDays)} days old and never validated against a real quote — refresh it or log an actual (🎯) to keep the model calibrated.`,
        });
      }
    }
  }

  // Biggest money first; nudges last.
  return out.sort((a, b) => b.annualImpactGBP - a.annualImpactGBP);
}
