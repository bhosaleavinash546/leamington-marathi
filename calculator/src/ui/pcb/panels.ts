/**
 * PCB image-analysis result panels: pure functions from the analysis to HTML.
 *
 * Second slice of splitting src/ui/main.ts (L12), moved verbatim. Anything
 * that reads main.ts state or the live DOM stays there; these only read `r`.
 */
import type { PCBImageAnalysis, VolumeCurvePoint } from './types.js';
import { escHtml } from '../toast.js';
import { PCB_COUNTRY_META } from '../data/pcb-country-meta.js';

export function buildCostDriverChart(r: PCBImageAnalysis): string {
  if (!r.bom || r.bom.length === 0) return '';
  const groups = new Map<string, number>();
  for (const item of r.bom) {
    const key = item.componentType.replace(/_/g, ' ');
    groups.set(key, (groups.get(key) ?? 0) + item.qty * item.unitPriceGBP);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return '';
  const bars = sorted.map(([label, val]) => {
    const pct = Math.max((val / total) * 100, 1);
    const colorMap: Record<string, string> = { 'ic bga': '#dc2626', 'ic tqfp': '#ea580c', 'ic qfn': '#d97706', 'ic soic': '#ca8a04', 'power module': '#7c3aed', 'connector smt': '#2563eb', 'through hole': '#0891b2', 'passive 0402': '#16a34a', 'passive 0603': '#15803d', 'passive 0805': '#166534' };
    const color = colorMap[label] ?? '#6b7280';
    return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
      <div style="width:90px;font-size:0.62rem;text-align:right;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</div>
      <div style="flex:1;background:var(--border);border-radius:3px;height:12px;overflow:hidden">
        <div style="width:${pct.toFixed(1)}%;background:${color};height:100%;border-radius:3px;transition:width 0.3s"></div>
      </div>
      <div style="width:50px;font-size:0.62rem;font-weight:600;color:var(--text)">£${val.toFixed(2)}</div>
      <div style="width:34px;font-size:0.60rem;color:var(--text-muted)">${pct.toFixed(0)}%</div>
    </div>`;
  }).join('');
  return `<div class="pcb-analysis-section">
    <div class="pcb-analysis-section-title">Cost Driver Breakdown</div>
    <div style="padding:8px 4px">${bars}</div>
  </div>`;
}

export function buildNPISection(r: PCBImageAnalysis): string {
  if (!r._npiBreakdown) return '';
  const n = r._npiBreakdown;
  return `<div class="pcb-analysis-section">
    <div class="pcb-analysis-section-title">NPI vs Production Cost</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;padding:8px 4px">
      <div style="padding:8px;background:rgba(220,38,38,0.07);border-radius:6px;border:1px solid rgba(220,38,38,0.2)">
        <div style="font-size:0.62rem;color:var(--text-muted);margin-bottom:4px">NPI / Prototype Run (50 units)</div>
        <div style="font-size:1rem;font-weight:700;color:#dc2626">£${n.unitCostNPI.toFixed(2)}</div>
        <div style="font-size:0.6rem;color:var(--text-muted)">per unit</div>
        <div style="font-size:0.6rem;color:var(--text-muted);margin-top:4px">includes £${n.setupPerUnit50.toFixed(2)}/unit NRE amortisation</div>
      </div>
      <div style="padding:8px;background:rgba(22,163,74,0.07);border-radius:6px;border:1px solid rgba(22,163,74,0.2)">
        <div style="font-size:0.62rem;color:var(--text-muted);margin-bottom:4px">Production (this volume)</div>
        <div style="font-size:1rem;font-weight:700;color:#16a34a">£${n.unitCostProd.toFixed(2)}</div>
        <div style="font-size:0.6rem;color:var(--text-muted)">per unit</div>
        <div style="font-size:0.6rem;color:var(--text-muted);margin-top:4px">${((n.unitCostNPI/n.unitCostProd-1)*100).toFixed(0)}% saving vs NPI rate</div>
      </div>
      <div style="padding:8px;background:var(--card-bg);border-radius:6px;border:1px solid var(--border)">
        <div style="font-size:0.62rem;color:var(--text-muted);margin-bottom:4px">One-time NRE Costs</div>
        <div style="font-size:1rem;font-weight:700">£${n.toolingTotal.toFixed(0)}</div>
        <div style="font-size:0.6rem;color:var(--text-muted)">Stencil £${n.stencilCost} + First article £${n.firstArticleCost}</div>
      </div>
    </div>
  </div>`;
}

export function buildConfidenceRoadmap(r: PCBImageAnalysis): string {
  const cb = r._confidenceBand;
  if (!cb || cb.overallLabel === 'High') return '';
  const steps: string[] = [];
  if (!r._livePriceHits || r._livePriceHits === 0) steps.push('Attach a BOM file (.csv/.xml) — eliminates all AI guesswork on part numbers and pricing');
  if (cb.unconfirmedHighValueCount > 0) steps.push(`${cb.unconfirmedHighValueCount} high-value IC${cb.unconfirmedHighValueCount > 1 ? 's are' : ' is'} unconfirmed — upload a close-up image of those chips or edit their prices manually`);
  if (cb.fabConfidenceLabel === 'Low') steps.push('OCR quality was low — upload a higher-resolution image or a top-side close-up to improve fab spec extraction');
  if (cb.weightedBOMConfidence < 0.70) steps.push('Many BOM lines have low AI confidence — enter the Re-analyze flow and correct any misidentified components');
  if (r._volumeMultiplier && r._volumeMultiplier > 3) steps.push(`Volume is very low (${r._volumeMultiplier.toFixed(1)}× cost uplift vs 100K) — prices at this volume are distributor-dependent; request actual supplier quotes`);
  if (steps.length === 0) return '';
  return `<div class="pcb-analysis-section">
    <div class="pcb-analysis-section-title">How to Improve Confidence</div>
    <div style="padding:8px 4px">
      <ol style="margin:0;padding-left:18px;font-size:0.72rem;color:var(--text-secondary)">
        ${steps.map(s => `<li style="margin-bottom:6px">${s}</li>`).join('')}
      </ol>
    </div>
  </div>`;
}

export function buildSanityWarningsBanner(r: PCBImageAnalysis): string {
  const warns = r._sanityWarnings;
  if (!warns || warns.length === 0) return '';
  const items = warns.map(w => `<div style="display:flex;gap:6px;align-items:flex-start;margin-bottom:4px">
    <span style="font-size:0.75rem">${w.severity === 'error' ? '<svg class="ic" aria-hidden="true" style="color:#ef4444"><use href="#i-dot"/></svg>' : '<svg class="ic" aria-hidden="true" style="color:#eab308"><use href="#i-dot"/></svg>'}</span>
    <span style="font-size:0.68rem;color:var(--text-secondary)">${w.message}</span>
  </div>`).join('');
  return `<div style="margin-top:8px;padding:10px 12px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:8px">
    <div style="font-size:0.72rem;font-weight:600;color:#d97706;margin-bottom:6px">⚠ AI Sanity Checks</div>
    ${items}
  </div>`;
}

export function buildASILBadge(r: PCBImageAnalysis): string {
  const level = r._asilLevel;
  if (!level || level === 'Unknown') return '';
  const colors: Record<string, string> = {
    'QM': '#6b7280', 'ASIL-A': '#2563eb', 'ASIL-B': '#d97706', 'ASIL-C': '#ea580c', 'ASIL-D': '#dc2626',
  };
  const color = colors[level] ?? '#6b7280';
  const functions = r._asilSafetyFunctions ?? [];
  const fnList = functions.length > 0
    ? `<div style="margin-top:6px;font-size:0.62rem;color:var(--text-secondary)">Safety functions: ${functions.join(', ')}</div>`
    : '';
  const rationale = r._asilRationale ? `<div style="margin-top:4px;font-size:0.62rem;color:var(--text-muted);font-style:italic">${r._asilRationale}</div>` : '';
  return `<div style="margin-top:8px;padding:10px 12px;background:${color}18;border:1px solid ${color}55;border-radius:8px">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="background:${color};color:#fff;font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:4px">${level}</span>
      <span style="font-size:0.72rem;font-weight:600;color:${color}">ISO 26262 Safety Integrity Level</span>
    </div>
    ${rationale}${fnList}
  </div>`;
}

export function buildAutomotiveNRESection(r: PCBImageAnalysis): string {
  const nre = r._automotiveNRE;
  if (!nre || nre.totalNRE === 0) return '';
  const fmt = (n: number) => `£${n.toLocaleString('en-GB')}`;
  const enforced = r._automotiveGradeEnforcedCount ?? 0;
  const enforcedBadge = enforced > 0
    ? `<div style="margin-top:6px;padding:4px 8px;background:rgba(220,38,38,0.08);border:1px solid rgba(220,38,38,0.3);border-radius:4px;font-size:0.62rem;color:#dc2626">
        ⚠ ${enforced} component${enforced > 1 ? 's' : ''} had pricing enforced to AEC-Q automotive grade
      </div>`
    : '';
  const coating = r._conformalCoatingCost ?? 0;
  const coatingRow = coating > 0
    ? `<tr><td style="padding:3px 6px;font-size:0.68rem">Conformal coating</td><td style="padding:3px 6px;text-align:right;font-size:0.68rem;font-weight:600">${fmt(coating)}</td><td style="padding:3px 6px;font-size:0.62rem;color:var(--text-muted)">Selective UV acrylic / polyurethane</td></tr>`
    : '';
  return `<div style="margin-top:8px;padding:10px 12px;background:rgba(234,88,12,0.06);border:1px solid rgba(234,88,12,0.25);border-radius:8px">
    <div style="font-size:0.72rem;font-weight:600;color:#ea580c;margin-bottom:8px">Automotive NRE Qualification Costs (${nre.asilLevel})</div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th style="padding:3px 6px;text-align:left;font-size:0.62rem;color:var(--text-muted)">Activity</th>
        <th style="padding:3px 6px;text-align:right;font-size:0.62rem;color:var(--text-muted)">Estimated cost</th>
        <th style="padding:3px 6px;text-align:left;font-size:0.62rem;color:var(--text-muted)">Scope</th>
      </tr></thead>
      <tbody>
        <tr><td style="padding:3px 6px;font-size:0.68rem">PPAP (Production Part Approval)</td><td style="padding:3px 6px;text-align:right;font-size:0.68rem;font-weight:600">${fmt(nre.ppapCost)}</td><td style="padding:3px 6px;font-size:0.62rem;color:var(--text-muted)">18 PPAP elements, control plan</td></tr>
        <tr><td style="padding:3px 6px;font-size:0.68rem">FMEA (Failure Mode Analysis)</td><td style="padding:3px 6px;text-align:right;font-size:0.68rem;font-weight:600">${fmt(nre.fmeaCost)}</td><td style="padding:3px 6px;font-size:0.62rem;color:var(--text-muted)">D-FMEA + P-FMEA per AIAG-VDA</td></tr>
        <tr><td style="padding:3px 6px;font-size:0.68rem">DVP&R (Validation & Reporting)</td><td style="padding:3px 6px;text-align:right;font-size:0.68rem;font-weight:600">${fmt(nre.dvprCost)}</td><td style="padding:3px 6px;font-size:0.62rem;color:var(--text-muted)">Environmental, EMC, vibration tests</td></tr>
        ${nre.asilAuditCost > 0 ? `<tr><td style="padding:3px 6px;font-size:0.68rem">ISO 26262 Safety Audit</td><td style="padding:3px 6px;text-align:right;font-size:0.68rem;font-weight:600">${fmt(nre.asilAuditCost)}</td><td style="padding:3px 6px;font-size:0.62rem;color:var(--text-muted)">ASIL classification, safety case review</td></tr>` : ''}
        ${coatingRow}
        <tr style="border-top:1px solid var(--border)"><td style="padding:4px 6px;font-size:0.72rem;font-weight:700">Total Automotive NRE</td><td style="padding:4px 6px;text-align:right;font-size:0.72rem;font-weight:700;color:#ea580c">${fmt(nre.totalNRE + coating)}</td><td></td></tr>
      </tbody>
    </table>
    ${enforcedBadge}
  </div>`;
}

export function buildSingleSourceWarnings(r: PCBImageAnalysis): string {
  const warns = r._singleSourceWarnings;
  if (!warns || warns.length === 0) return '';
  const rows = warns.map(w => `<tr>
    <td style="padding:3px 6px;font-size:0.68rem;font-family:monospace">${w.refDes}</td>
    <td style="padding:3px 6px;font-size:0.62rem;color:var(--text-secondary)">${w.vendor}</td>
    <td style="padding:3px 6px;text-align:right;font-size:0.68rem">${(w.premium * 100).toFixed(0)}%</td>
    <td style="padding:3px 6px;text-align:right;font-size:0.68rem;font-weight:600">+£${w.premiumAmountGBP.toFixed(2)}</td>
  </tr>`).join('');
  return `<div style="margin-top:8px;padding:10px 12px;background:rgba(220,38,38,0.06);border:1px solid rgba(220,38,38,0.3);border-radius:8px">
    <div style="font-size:0.72rem;font-weight:600;color:#dc2626;margin-bottom:6px">⚠ Single-Source Risk Components (${warns.length})</div>
    <div style="font-size:0.62rem;color:var(--text-muted);margin-bottom:6px">These ICs have limited qualified alternatives. Supply risk premium applied to unit prices:</div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th style="padding:3px 6px;text-align:left;font-size:0.62rem;color:var(--text-muted)">Ref</th>
        <th style="padding:3px 6px;text-align:left;font-size:0.62rem;color:var(--text-muted)">Sole vendor / rationale</th>
        <th style="padding:3px 6px;text-align:right;font-size:0.62rem;color:var(--text-muted)">Premium</th>
        <th style="padding:3px 6px;text-align:right;font-size:0.62rem;color:var(--text-muted)">Cost add</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

export function buildAutomotiveAssemblySection(r: PCBImageAnalysis): string {
  const ac = r._automotiveAssemblyCost;
  if (!ac || ac.totalAutomotiveAssemblyGBP === 0) return '';
  const fmt = (n: number) => `£${n.toFixed(2)}`;
  const rows = [
    { label: 'Base SMT assembly', val: ac.baseAssemblyGBP, note: 'IPC-A-610 Class 2 baseline' },
    { label: 'IATF 16949 line premium (+20%)', val: ac.iatfPremiumGBP, note: 'Certified automotive assembly line overhead' },
    ac.axiCostGBP > 0 ? { label: 'AXI X-ray inspection', val: ac.axiCostGBP, note: 'Mandatory for BGA solder verification' } : null,
    { label: 'Serialisation / traceability', val: ac.serialisationGBP, note: 'Laser marking + batch database entry' },
    ac.ipcClass3GBP > 0 ? { label: 'IPC-A-610 Class 3 re-inspect', val: ac.ipcClass3GBP, note: 'Tighter defect accept/reject criteria' } : null,
    ac.burnInGBP > 0 ? { label: 'Burn-in / HALT test', val: ac.burnInGBP, note: 'ASIL-mandated reliability screening' } : null,
  ].filter(Boolean) as Array<{ label: string; val: number; note: string }>;
  const tableRows = rows.map(row => `<tr><td style="padding:3px 6px;font-size:0.68rem">${row.label}</td><td style="padding:3px 6px;text-align:right;font-size:0.68rem;font-weight:600">${fmt(row.val)}</td><td style="padding:3px 6px;font-size:0.62rem;color:var(--text-muted)">${row.note}</td></tr>`).join('');
  return `<div style="margin-top:8px;padding:10px 12px;background:rgba(37,99,235,0.05);border:1px solid rgba(37,99,235,0.2);border-radius:8px">
    <div style="font-size:0.72rem;font-weight:600;color:#2563eb;margin-bottom:8px">Automotive Assembly Cost Model (IATF 16949) — +${ac.premiumPctOverStandard}% vs standard</div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th style="padding:3px 6px;text-align:left;font-size:0.62rem;color:var(--text-muted)">Cost element</th>
        <th style="padding:3px 6px;text-align:right;font-size:0.62rem;color:var(--text-muted)">Per board</th>
        <th style="padding:3px 6px;text-align:left;font-size:0.62rem;color:var(--text-muted)">Rationale</th>
      </tr></thead>
      <tbody>${tableRows}
        <tr style="border-top:1px solid var(--border)"><td style="padding:4px 6px;font-size:0.72rem;font-weight:700">Total automotive assembly</td><td style="padding:4px 6px;text-align:right;font-size:0.72rem;font-weight:700;color:#2563eb">${fmt(ac.totalAutomotiveAssemblyGBP)}</td><td></td></tr>
      </tbody>
    </table>
  </div>`;
}

export function buildAutomotiveFabSection(r: PCBImageAnalysis): string {
  const fa = r._automotiveFabAdjustment;
  if (!fa || fa.premiumPctOverStandard === 0) return '';
  const fmt = (n: number) => `£${n.toFixed(2)}`;
  return `<div style="margin-top:8px;padding:10px 12px;background:rgba(22,163,74,0.05);border:1px solid rgba(22,163,74,0.2);border-radius:8px">
    <div style="font-size:0.72rem;font-weight:600;color:#16a34a;margin-bottom:8px">Automotive PCB Fabrication Adjustment (IATF 16949 + AEC-Q laminate) — +${fa.premiumPctOverStandard}% vs standard FR4</div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th style="padding:3px 6px;text-align:left;font-size:0.62rem;color:var(--text-muted)">Cost element</th>
        <th style="padding:3px 6px;text-align:right;font-size:0.62rem;color:var(--text-muted)">Add-on</th>
        <th style="padding:3px 6px;text-align:left;font-size:0.62rem;color:var(--text-muted)">Rationale</th>
      </tr></thead>
      <tbody>
        <tr><td style="padding:3px 6px;font-size:0.68rem">Standard PCB fab (AI estimate)</td><td style="padding:3px 6px;text-align:right;font-size:0.68rem">${fmt(fa.standardFabGBP)}</td><td style="padding:3px 6px;font-size:0.62rem;color:var(--text-muted)">AI base estimate (generic FR4)</td></tr>
        <tr><td style="padding:3px 6px;font-size:0.68rem">IATF 16949 fab premium (+18%)</td><td style="padding:3px 6px;text-align:right;font-size:0.68rem;font-weight:600">+${fmt(fa.iatfFabPremiumGBP)}</td><td style="padding:3px 6px;font-size:0.62rem;color:var(--text-muted)">Certified automotive fab overhead</td></tr>
        <tr><td style="padding:3px 6px;font-size:0.68rem">Automotive laminate (IT-180A / Isola 370HR)</td><td style="padding:3px 6px;text-align:right;font-size:0.68rem;font-weight:600">+${fmt(fa.automotiveLaminatePremiumGBP)}</td><td style="padding:3px 6px;font-size:0.62rem;color:var(--text-muted)">35–50% material premium over standard FR4</td></tr>
        <tr><td style="padding:3px 6px;font-size:0.68rem">IPC-6012 Class 3 inspection</td><td style="padding:3px 6px;text-align:right;font-size:0.68rem;font-weight:600">+${fmt(fa.ipcClass3InspectionGBP)}</td><td style="padding:3px 6px;font-size:0.62rem;color:var(--text-muted)">Coupons + full electrical test</td></tr>
        <tr><td style="padding:3px 6px;font-size:0.68rem">Coupon testing + impedance verification</td><td style="padding:3px 6px;text-align:right;font-size:0.68rem;font-weight:600">+${fmt(fa.couponTestingGBP)}</td><td style="padding:3px 6px;font-size:0.62rem;color:var(--text-muted)">Per-panel impedance and coupon testing</td></tr>
        <tr style="border-top:1px solid var(--border)"><td style="padding:4px 6px;font-size:0.72rem;font-weight:700">Total automotive fab cost</td><td style="padding:4px 6px;text-align:right;font-size:0.72rem;font-weight:700;color:#16a34a">${fmt(fa.totalAutomotiveFabGBP)}</td><td></td></tr>
      </tbody>
    </table>
  </div>`;
}

export function buildBOMCompletenessSection(r: PCBImageAnalysis): string {
  const bc = r._bomCompleteness;
  if (!bc) return '';
  const scoreColor = bc.completenessScore >= 80 ? '#16a34a' : bc.completenessScore >= 50 ? '#d97706' : '#dc2626';
  const scoreLabel = bc.completenessScore >= 80 ? 'Good' : bc.completenessScore >= 50 ? 'Partial' : 'Incomplete';
  if (bc.estimatedMissingPassiveCount === 0 && bc.completenessScore >= 80) return '';
  return `<div style="margin-top:8px;padding:10px 12px;background:rgba(0,0,0,0.03);border:1px solid var(--border);border-radius:8px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <div style="font-size:0.72rem;font-weight:600">BOM Completeness Estimate</div>
      <span style="background:${scoreColor};color:#fff;font-size:0.6rem;padding:1px 6px;border-radius:10px;font-weight:700">${bc.completenessScore}% — ${scoreLabel}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px">
      <div style="text-align:center;padding:6px;background:rgba(0,0,0,0.04);border-radius:4px">
        <div style="font-size:0.8rem;font-weight:700">${bc.identifiedLineCount}</div>
        <div style="font-size:0.62rem;color:var(--text-muted)">BOM lines identified</div>
      </div>
      <div style="text-align:center;padding:6px;background:rgba(0,0,0,0.04);border-radius:4px">
        <div style="font-size:0.8rem;font-weight:700">${bc.identifiedICCount}</div>
        <div style="font-size:0.62rem;color:var(--text-muted)">ICs / active components</div>
      </div>
      <div style="text-align:center;padding:6px;background:rgba(220,38,38,0.08);border-radius:4px">
        <div style="font-size:0.8rem;font-weight:700;color:#dc2626">~${bc.estimatedMissingPassiveCount}</div>
        <div style="font-size:0.62rem;color:var(--text-muted)">Est. missing passives</div>
      </div>
    </div>
    ${bc.estimatedMissingPassiveCount > 0 ? `
    <div style="font-size:0.68rem;color:var(--text-secondary);margin-bottom:4px">Estimated missing passive breakdown:</div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px">
      <div style="font-size:0.62rem;padding:3px 6px;background:rgba(0,0,0,0.03);border-radius:3px">Decoupling caps: ~${bc.missingEstimateBreakdown.decouplingCaps}</div>
      <div style="font-size:0.62rem;padding:3px 6px;background:rgba(0,0,0,0.03);border-radius:3px">Pull-up/down resistors: ~${bc.missingEstimateBreakdown.pullResistors}</div>
      <div style="font-size:0.62rem;padding:3px 6px;background:rgba(0,0,0,0.03);border-radius:3px">Ferrite beads: ~${bc.missingEstimateBreakdown.ferriteBeads}</div>
      <div style="font-size:0.62rem;padding:3px 6px;background:rgba(0,0,0,0.03);border-radius:3px">ESD arrays: ~${bc.missingEstimateBreakdown.esdArrays}</div>
    </div>
    <div style="margin-top:6px;font-size:0.68rem;color:var(--text-secondary)">Estimated missing passive cost: <strong>£${bc.estimatedMissingCostGBP.toFixed(2)}</strong> (at AEC-Q grade prices)</div>
    ` : '<div style="font-size:0.68rem;color:#16a34a">Passive count looks consistent with identified IC count — BOM appears substantially complete.</div>'}
  </div>`;
}

export function buildProgramPricingSection(r: PCBImageAnalysis): string {
  const pp = r._programPricing;
  if (!pp || pp.pricingTier === 'distributor_spot' || pp.savingsPct === 0) return '';
  const tierLabels: Record<string, string> = {
    blanket_order: 'Blanket Order Pricing',
    direct_contract: 'Direct Manufacturer Contract',
    tier1_contract: 'Tier-1 Automotive Contract',
    distributor_spot: 'Distributor Spot Price',
  };
  const tierColors: Record<string, string> = {
    blanket_order: '#d97706', direct_contract: '#2563eb', tier1_contract: '#16a34a', distributor_spot: '#6b7280',
  };
  const color = tierColors[pp.pricingTier] ?? '#6b7280';
  const label = tierLabels[pp.pricingTier] ?? pp.pricingTier;
  return `<div style="margin-top:8px;padding:10px 12px;background:${color}0d;border:1px solid ${color}40;border-radius:8px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <div style="font-size:0.72rem;font-weight:600;color:${color}">Program Pricing vs Spot — ${label}</div>
      <span style="background:${color};color:#fff;font-size:0.6rem;padding:1px 6px;border-radius:10px;font-weight:700">−${pp.savingsPct}%</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
      <div style="text-align:center;padding:8px;background:rgba(0,0,0,0.04);border-radius:4px">
        <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:2px">Distributor spot BOM</div>
        <div style="font-size:0.85rem;font-weight:700;text-decoration:line-through;color:var(--text-muted)">£${pp.spotBOMTotal.toFixed(2)}</div>
      </div>
      <div style="text-align:center;padding:8px;background:${color}15;border-radius:4px;border:1px solid ${color}30">
        <div style="font-size:0.68rem;color:${color};margin-bottom:2px">Program BOM (${Math.round(pp.annualProgramVolume/1000)}K/yr)</div>
        <div style="font-size:0.85rem;font-weight:700;color:${color}">£${pp.programBOMTotal.toFixed(2)}</div>
      </div>
      <div style="text-align:center;padding:8px;background:rgba(22,163,74,0.08);border-radius:4px">
        <div style="font-size:0.68rem;color:#16a34a;margin-bottom:2px">Saving per board</div>
        <div style="font-size:0.85rem;font-weight:700;color:#16a34a">−£${pp.savingsGBP.toFixed(2)}</div>
      </div>
    </div>
    <div style="margin-top:6px;font-size:0.62rem;color:var(--text-muted)">Assumes ~${Math.round(pp.annualProgramVolume/1000)}K annual program volume (${pp.multiplier.toFixed(2)}× spot multiplier). Actual contract terms vary.</div>
  </div>`;
}

export function buildBenchmarkComparison(r: PCBImageAnalysis): string {
  const total = r.costEstimates.totalBOMCostGBP + r.costEstimates.pcbFabGBP.mid + r.costEstimates.smtAssemblyCostGBP;
  const areaCm2 = (r.boardSpec.widthMm * r.boardSpec.heightMm) / 100;
  const costPerCm2 = areaCm2 > 0 ? total / areaCm2 : 0;
  const costPerPlacement = r.assembly.smtPlacements > 0 ? total / r.assembly.smtPlacements : 0;
  // Reference benchmarks (from the 3 demo boards)
  const benchmarks = [
    { name: 'Automotive ECU', costPerCm2: 3.80, costPerPlacement: 0.78, domain: 'automotive_adas' },
    { name: 'ADAS Sensor', costPerCm2: 4.20, costPerPlacement: 0.92, domain: 'automotive_adas' },
    { name: 'RF/Radar Module', costPerCm2: 8.50, costPerPlacement: 1.85, domain: 'rf_microwave' },
    { name: 'Consumer IoT', costPerCm2: 1.20, costPerPlacement: 0.28, domain: 'consumer_iot' },
    { name: 'Industrial Control', costPerCm2: 2.80, costPerPlacement: 0.65, domain: 'industrial_control' },
  ];
  const domain = r.stage1Classification?.domain ?? 'general';
  const relevant = benchmarks.filter(b => b.domain === domain || domain === 'general').slice(0, 2);
  if (relevant.length === 0) return '';
  const rows = relevant.map(b => {
    const cm2Diff = costPerCm2 > 0 ? ((costPerCm2 / b.costPerCm2 - 1) * 100) : null;
    const placeDiff = costPerPlacement > 0 ? ((costPerPlacement / b.costPerPlacement - 1) * 100) : null;
    const sign = (v: number | null) => v == null ? '—' : (v > 0 ? `+${v.toFixed(0)}%` : `${v.toFixed(0)}%`);
    const color = (v: number | null) => v == null ? '' : v > 15 ? 'color:#dc2626' : v < -15 ? 'color:#16a34a' : 'color:#d97706';
    return `<tr>
      <td style="font-size:0.68rem;padding:3px 6px">${b.name}</td>
      <td style="font-size:0.68rem;padding:3px 6px;text-align:right">£${b.costPerCm2.toFixed(2)}/cm²</td>
      <td style="font-size:0.68rem;padding:3px 6px;text-align:right;${color(cm2Diff)}">${sign(cm2Diff)}</td>
      <td style="font-size:0.68rem;padding:3px 6px;text-align:right">£${b.costPerPlacement.toFixed(2)}/place</td>
      <td style="font-size:0.68rem;padding:3px 6px;text-align:right;${color(placeDiff)}">${sign(placeDiff)}</td>
    </tr>`;
  }).join('');
  return `<div class="pcb-analysis-section">
    <div class="pcb-analysis-section-title">Benchmark Comparison</div>
    <div style="font-size:0.65rem;color:var(--text-muted);margin:4px 4px 6px">This board: £${costPerCm2.toFixed(2)}/cm² · £${costPerPlacement.toFixed(2)}/placement · vs industry benchmarks for ${domain.replace(/_/g,' ')}</div>
    <table style="width:100%;border-collapse:collapse;font-size:0.68rem">
      <thead><tr style="border-bottom:1px solid var(--border)">
        <th style="padding:3px 6px;text-align:left;font-size:0.62rem;color:var(--text-muted)">Benchmark</th>
        <th style="padding:3px 6px;text-align:right;font-size:0.62rem;color:var(--text-muted)">Ref/cm²</th>
        <th style="padding:3px 6px;text-align:right;font-size:0.62rem;color:var(--text-muted)">vs this</th>
        <th style="padding:3px 6px;text-align:right;font-size:0.62rem;color:var(--text-muted)">Ref/place</th>
        <th style="padding:3px 6px;text-align:right;font-size:0.62rem;color:var(--text-muted)">vs this</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

export function buildRevisionComparison(r: PCBImageAnalysis): string {
  const prev = r._previousVersion;
  if (!prev) return '';
  const bomDelta = r.costEstimates.totalBOMCostGBP - prev.costEstimates.totalBOMCostGBP;
  const fabDelta = r.costEstimates.pcbFabGBP.mid - prev.costEstimates.pcbFabGBP.mid;
  const totalDelta = bomDelta + fabDelta;
  const sign = (v: number) => (v >= 0 ? `+£${v.toFixed(2)}` : `-£${Math.abs(v).toFixed(2)}`);
  const color = (v: number) => v > 0.5 ? '#dc2626' : v < -0.5 ? '#16a34a' : '#6b7280';
  // Compare BOM lines
  const prevBOMMap = new Map(prev.bom.map(l => [l.refDes, l]));
  const changes: string[] = [];
  for (const line of r.bom) {
    const p = prevBOMMap.get(line.refDes);
    if (!p) { changes.push(`<li style="color:#2563eb">+ ${line.refDes}: new (£${(line.qty*line.unitPriceGBP).toFixed(2)})</li>`); }
    else {
      const delta = line.qty * line.unitPriceGBP - p.qty * p.unitPriceGBP;
      if (Math.abs(delta) > 0.10) changes.push(`<li style="color:${delta>0?'#dc2626':'#16a34a'}">${line.refDes}: ${sign(delta)} (${delta>0?'more':'less'} expensive)</li>`);
    }
  }
  for (const p of prev.bom) {
    if (!r.bom.find(l => l.refDes === p.refDes)) changes.push(`<li style="color:#6b7280">- ${p.refDes}: removed</li>`);
  }
  return `<div class="pcb-analysis-section">
    <div class="pcb-analysis-section-title" style="display:flex;align-items:center;justify-content:space-between">
      <span>vs Previous Analysis</span>
      <button class="btn btn-secondary btn-sm" id="pcb-clear-revision-btn" style="font-size:0.60rem;padding:1px 6px">Clear</button>
    </div>
    <div style="display:flex;gap:12px;padding:8px 4px;font-size:0.70rem">
      <span>BOM: <strong style="color:${color(bomDelta)}">${sign(bomDelta)}</strong></span>
      <span>Fab: <strong style="color:${color(fabDelta)}">${sign(fabDelta)}</strong></span>
      <span>Total: <strong style="color:${color(totalDelta)}">${sign(totalDelta)}</strong></span>
    </div>
    ${changes.length > 0 ? `<ul style="margin:0;padding-left:18px;font-size:0.67rem;max-height:120px;overflow-y:auto">${changes.slice(0,20).join('')}</ul>` : '<div style="font-size:0.67rem;color:var(--text-muted);padding:0 4px">No significant BOM line changes</div>'}
  </div>`;
}

/** `pcbNREEnabled` is the page's NRE toggle, passed in rather than read from main.ts. */
export function buildCountryBreakdownSection(r: PCBImageAnalysis, pcbNREEnabled: boolean): string {
  const sel = r._selectedCountryBreakdown;
  const comparison = r._countryComparison ?? [];
  if (!sel && !comparison.length) return '';

  const selectedCountryId = r._selectedCountry ?? 'cn';

  // Selected country detail card
  const selectedCard = sel ? `
    <div style="margin-bottom:10px;padding:10px;background:rgba(79,142,247,0.07);border:1px solid rgba(79,142,247,0.25);border-radius:8px">
      <div style="font-weight:700;font-size:0.82rem;margin-bottom:6px">${sel.flag} ${sel.countryName} — Should Cost Breakdown</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px;font-size:0.75rem">
        <div><span style="color:var(--text-muted)">PCB Fab:</span> <strong>£${sel.pcbFabPerBoard.toFixed(2)}</strong></div>
        <div><span style="color:var(--text-muted)">Assembly:</span> <strong>£${sel.assemblyPerBoard.toFixed(2)}</strong></div>
        <div><span style="color:var(--text-muted)">Logistics:</span> <strong>£${sel.logisticsPerBoard.toFixed(2)}</strong></div>
        <div><span style="color:var(--text-muted)">BOM:</span> <strong>£${sel.bomCostPerBoard.toFixed(2)}</strong></div>
        <div><span style="color:var(--text-muted)">Lead time:</span> <strong>${sel.leadTimeWeeks}w</strong></div>
        <div><span style="color:var(--text-muted)">Quality:</span> <strong>${Math.round(sel.qualityIndex * 100)}%</strong></div>
      </div>
      <div style="margin-top:8px;padding:8px;background:var(--card-bg);border-radius:6px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="font-size:0.72rem;font-weight:700;color:var(--text-secondary)">Total per board:</span>
          <span style="font-size:1.1rem;font-weight:800;color:var(--accent)">£${sel.totalPerBoard.toFixed(2)}</span>
        </div>
        <div style="font-size:0.68rem;color:var(--text-muted)">Breakdown: PCB base £${sel.breakdown.pcbBase.toFixed(2)} + layers £${sel.breakdown.pcbLayers.toFixed(2)} + surface £${sel.breakdown.pcbSurface.toFixed(2)} + vias £${sel.breakdown.pcbVias.toFixed(2)} + HDI £${sel.breakdown.pcbHDI.toFixed(2)} + setup £${sel.breakdown.pcbSetup.toFixed(2)} | assembly £${sel.breakdown.smtAssembly.toFixed(2)} | test £${sel.breakdown.aoi.toFixed(2)} | logistics £${sel.breakdown.logistics.toFixed(2)} + duty £${sel.breakdown.importDuty.toFixed(2)}</div>
      </div>
      ${sel.panelInfo ? `<div style="margin-top:6px;padding:6px 8px;background:var(--card-bg);border-radius:6px;font-size:0.68rem;color:var(--text-muted)">Panelisation: <strong style="color:var(--text-secondary)">${sel.panelInfo.boardsPerPanel}-up</strong> on ${sel.panelInfo.panelW}×${sel.panelInfo.panelH}mm panel · utilisation <strong style="color:var(--text-secondary)">${Math.round(sel.panelInfo.utilisation * 100)}%</strong> (waste amortised into PCB base cost)</div>` : ''}
      ${pcbNREEnabled && PCB_COUNTRY_META[selectedCountryId]?.nre ? `<div style="margin-top:6px;padding:6px 8px;background:var(--card-bg);border-radius:6px;font-size:0.68rem;color:var(--text-muted)">Automotive NRE (one-time/programme): PPAP £${PCB_COUNTRY_META[selectedCountryId].nre.ppapGBP.toLocaleString()} + FMEA £${PCB_COUNTRY_META[selectedCountryId].nre.fmeaGBP.toLocaleString()} + DVP&amp;R £${PCB_COUNTRY_META[selectedCountryId].nre.dvprGBP.toLocaleString()} + FAI £${PCB_COUNTRY_META[selectedCountryId].nre.firstArticleGBP.toLocaleString()} + IATF £${PCB_COUNTRY_META[selectedCountryId].nre.iatfAuditGBP.toLocaleString()} = <strong style="color:var(--text-secondary)">£${PCB_COUNTRY_META[selectedCountryId].nre.totalGBP.toLocaleString()}</strong></div>` : ''}
      <div style="margin-top:4px;font-size:0.68rem;color:var(--text-muted)">Best for: ${escHtml(sel.bestFor)}</div>
    </div>` : '';

  // Country comparison table
  const maxTotal = Math.max(...comparison.map(c => c.totalPerBoard), 0.01);
  const orderQtyVal = (document.getElementById('pcb-order-qty') as HTMLInputElement)?.value;
  const nreQty = parseInt(orderQtyVal ?? '', 10) || 5000;
  const compRows = comparison.map(c => {
    const isSelected = c.countryId === selectedCountryId;
    const barW = Math.round((c.totalPerBoard / maxTotal) * 100);
    const qualityStars = '★'.repeat(Math.round(c.qualityIndex * 5)) + '☆'.repeat(5 - Math.round(c.qualityIndex * 5));
    const meta = PCB_COUNTRY_META[c.countryId];
    const trend = meta?.trend;
    const trendCell = trend ? (() => {
      const arrow = trend.direction === 'rising' ? '↑' : trend.direction === 'falling' ? '↓' : '→';
      const colour = trend.direction === 'rising' ? '#ef4444' : trend.direction === 'falling' ? '#16a34a' : 'var(--text-muted)';
      const sign = trend.pctChange6m > 0 ? '+' : '';
      return `<td style="color:${colour};white-space:nowrap" title="${escHtml(trend.note)}">${arrow} ${sign}${trend.pctChange6m}%</td>`;
    })() : '<td>—</td>';
    const nreCell = pcbNREEnabled
      ? `<td style="white-space:nowrap" title="One-time programme NRE">£${((meta?.nre?.totalGBP ?? 0) / 1000).toFixed(1)}k</td>`
      : '';
    const delta = r._costDeltas?.[c.countryId];
    const deltaCell = delta !== undefined
      ? `<td style="font-size:0.68rem;white-space:nowrap;color:${delta > 0 ? '#ef4444' : delta < 0 ? '#16a34a' : 'var(--text-muted)'}">${delta > 0 ? '↑' : delta < 0 ? '↓' : '→'}£${Math.abs(delta).toFixed(2)}</td>`
      : (r._costDeltas ? '<td>—</td>' : '');
    return `<tr style="${isSelected ? 'background:rgba(79,142,247,0.10);font-weight:700' : ''}">
      <td style="white-space:nowrap">${c.flag} ${c.countryName.split(' (')[0]}</td>
      <td>£${c.pcbFabPerBoard.toFixed(2)}</td>
      <td>£${c.assemblyPerBoard.toFixed(2)}</td>
      <td>£${c.logisticsPerBoard.toFixed(2)}</td>
      <td style="color:var(--accent);font-weight:700">£${c.totalPerBoard.toFixed(2)}</td>
      ${deltaCell}
      <td>
        <div style="display:flex;align-items:center;gap:4px">
          <div style="flex:1;height:6px;background:var(--border);border-radius:3px;min-width:40px">
            <div style="height:100%;width:${barW}%;background:${isSelected ? 'var(--accent)' : 'var(--text-muted)'};border-radius:3px"></div>
          </div>
        </div>
      </td>
      <td style="white-space:nowrap">${c.leadTimeWeeks}w</td>
      ${trendCell}
      ${nreCell}
      <td style="font-size:0.65rem;color:#f59e0b" title="${Math.round(c.qualityIndex * 100)}% quality">${qualityStars}</td>
    </tr>`;
  }).join('');

  return comparison.length === 0 ? selectedCard : `
    ${selectedCard}
    <div class="pcb-analysis-section">
      <div class="pcb-analysis-section-title">Global Manufacturing Cost Comparison (${comparison.length} countries · 2026 data)</div>
      <div style="overflow-x:auto">
        <table class="pcb-bom-table" style="font-size:0.72rem;white-space:nowrap">
          <thead>
            <tr>
              <th>Country</th>
              <th>PCB Fab</th>
              <th>Assembly</th>
              <th>Logistics</th>
              <th>Total/Board</th>
              ${r._costDeltas ? '<th>&#916; vs orig</th>' : ''}
              <th style="min-width:60px">Cost bar</th>
              <th>Lead time</th>
              <th title="6-month should-cost trend">Trend</th>
              ${pcbNREEnabled ? '<th title="One-time automotive NRE per programme">NRE</th>' : ''}
              <th>Quality</th>
            </tr>
          </thead>
          <tbody>${compRows}</tbody>
        </table>
      </div>
      <div style="margin-top:4px;font-size:0.65rem;color:var(--text-muted)">
        Prices include PCB fabrication + SMT/THT assembly + logistics/import duty to UK. BOM component cost (£${(comparison[0]?.bomCostPerBoard ?? 0).toFixed(2)}) is the same for all countries. Data calibrated to Jan 2026 market rates.
        ${pcbNREEnabled ? `<br/>NRE costs are one-time per programme. At ${(nreQty / 1000).toFixed(nreQty % 1000 === 0 ? 0 : 1)}k units, ${selectedCountryId.toUpperCase()} NRE adds £${(((PCB_COUNTRY_META[selectedCountryId]?.nre?.totalGBP ?? 0) / nreQty)).toFixed(2)}/board.` : ''}
      </div>
    </div>`;
}

// ─── Feature: Volume sensitivity chart (Priority 3) ────────────────────────
export function buildVolumeCurveSection(r: PCBImageAnalysis): string {
  if (!r._volumeCurves || Object.keys(r._volumeCurves).length === 0) return '';
  const curves = r._volumeCurves;
  const selId = r._selectedCountry ?? 'cn';
  const orderQty = parseInt((document.getElementById('pcb-order-qty') as HTMLInputElement)?.value ?? '5000', 10) || 5000;

  // Crossover insight: compare cheapest vs UK at the user's nearest volume break.
  const ids = Object.keys(curves);
  const cheapestId = ids.find(id => id !== 'gb' && id !== selId) ?? ids[0];
  const gbCurve = curves.gb ?? curves[ids[0]];
  const cheapCurve = curves[cheapestId] ?? gbCurve;
  const pointAt = (curve: VolumeCurvePoint[]): VolumeCurvePoint => {
    let best = curve[0];
    for (const p of curve) if (Math.abs(p.qty - orderQty) < Math.abs(best.qty - orderQty)) best = p;
    return best;
  };
  const cheapPt = pointAt(cheapCurve);
  const gbPt = pointAt(gbCurve);
  const saving = gbPt.totalPerBoard - cheapPt.totalPerBoard;
  const fullRun = saving * orderQty;
  const cheapName = PCB_COUNTRY_META[cheapestId] ? cheapestId.toUpperCase() : cheapestId.toUpperCase();
  const insight = saving > 0
    ? `At your volume (${orderQty.toLocaleString()}), ${cheapName} saves £${saving.toFixed(2)}/board vs UK (£${Math.round(fullRun).toLocaleString()} on the full run).`
    : `At your volume (${orderQty.toLocaleString()}), UK is within £${Math.abs(saving).toFixed(2)}/board of the cheapest option.`;

  return `
    <div class="pcb-analysis-section">
      <div class="pcb-analysis-section-title">Volume Sensitivity — Cost per Board vs Order Quantity</div>
      <div style="position:relative;height:240px;background:var(--card-bg);border-radius:6px;padding:8px">
        <canvas id="pcb-volume-chart"></canvas>
      </div>
      <div style="margin-top:6px;font-size:0.68rem;color:var(--text-muted)">${escHtml(insight)}</div>
    </div>`;
}

