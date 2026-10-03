// ─────────────────────────────────────────────────────────────────────────────
// Prism evidence builders — what the 3D measurement, the DFM rules, the route
// comparison and the 2D drawing actually found, as citable evidence lines.
//
// WHY (Prism review, 3 Oct 2026). A live run on a die-cast housing measured
// 472 wall rays, 30.9% releasing draft, 28.4% undercut, 2 ribs at 6.97× the
// wall, 9 undercut regions and 28 process routes — and the generation prompt
// received: a bounding box, a solidity, one wall figure, "2× boss ⌀8, 2× hole
// ⌀4", five finding TITLES each followed by "engine-priced €0.00/part" (they
// were unpriced), and "Route comparison needs the 3D geometry" (it had it).
// The model cannot attack what it is not shown. These builders carry the
// measurement through, with its numbers, its thresholds and its sources —
// still only measurements; nothing here estimates anything. Pure.
// ─────────────────────────────────────────────────────────────────────────────

const n = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
const r1 = (v) => Math.round(v * 10) / 10;
const clip = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Measured-geometry lines from the DFM analysis geometry (+ its `dfm` block).
 * Every line is a measurement with its unit; absent measures are omitted.
 */
export function geometryEvidenceLines(geo) {
  if (!geo || typeof geo !== 'object') return [];
  const d = geo.dfm && typeof geo.dfm === 'object' ? geo.dfm : {};
  const out = [];
  const bb = geo.boundingBox;
  if (bb && n(bb.xMm)) out.push(`Bounding box ${bb.xMm} × ${bb.yMm} × ${bb.zMm} mm.`);
  const vol = n(geo.volume?.cm3), area = n(geo.surfaceArea?.cm2);
  if (vol) out.push(`Volume ${r1(vol)} cm³${area ? `, surface area ${r1(area)} cm²` : ''}${n(geo.fillRatio) != null ? `, solidity ${Math.round(geo.fillRatio * 100)}% of the bounding box (${geo.fillRatio > 0.75 ? 'largely solid — a shelled or ribbed redesign is a mass lever' : 'already shell-like'})` : ''}.`);
  const w = d.wallThickness || geo.wallThickness || {};
  if (n(w.p50Mm)) out.push(`Wall thickness measured by ${n(w.samples) ?? '?'} rays: p5 ${w.p5Mm} mm, median ${w.p50Mm} mm, p95 ${w.p95Mm} mm${n(w.minMm) != null ? `, thinnest ${w.minMm} mm` : ''}${n(w.p95Mm) && n(w.p50Mm) && w.p95Mm / w.p50Mm > 1.5 ? ' — non-uniform wall (heavy sections drive cycle time and porosity)' : ''}.`);
  const counts = d.features?.counts;
  if (counts && Object.keys(counts).length) out.push(`Recognised features: ${Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => `${v} × ${k}`).join(', ')}.`);
  const ft = Array.isArray(geo.featureTable) ? geo.featureTable : [];
  const holes = ft.filter(f => /hole|bore|boss/.test(f.kind)).slice(0, 6)
    .map(f => `${f.count ?? 1} × ${f.kind} ⌀${f.diaMm}${n(f.depthMm) ? ` × ${f.depthMm} deep` : ''}${f.through === true ? ' (through)' : ''}`);
  if (holes.length) out.push(`Hole/boss detail: ${holes.join('; ')}.`);
  const ribs = Array.isArray(d.features?.ribs) ? d.features.ribs : [];
  if (ribs.length) out.push(`Ribs: ${ribs.slice(0, 4).map(r => `${n(r.thicknessMm) ?? '?'} mm thick × ${n(r.heightMm) ?? '?'} mm high`).join('; ')}.`);
  const dr = d.draft?.areaPct;
  if (dr && n(dr.releasing) != null) out.push(`Draft along the best pull direction: ${dr.releasing}% of wall area releases, ${n(dr.zeroDraft) ?? '?'}% has zero draft, ${n(dr.undercut) ?? '?'}% is undercut${n(d.draft?.undercutFaceCount) ? ` (${d.draft.undercutFaceCount} undercut faces)` : ''}.`);
  const setups = d.setups;
  if (setups && n(setups.count ?? setups.setupCount) != null) out.push(`Machining access: ${setups.count ?? setups.setupCount} set-up direction(s) needed to reach every machined feature.`);
  const sm = d.sheetMetal;
  if (sm?.isSheetMetal) out.push(`Folded sheet: ${sm.bendCount} bends, sheet ${sm.thicknessMm} mm${n(sm.minBendRadiusMm) != null ? `, tightest bend radius ${sm.minBendRadiusMm} mm` : ''}.`);
  const axi = n(d.revolution?.axisymmetricAreaPct);
  if (axi != null) out.push(`${axi}% of the surface is a body of revolution${axi >= 90 ? ' — a turned/spun/flow-formed route is geometrically open' : ''}.`);
  return out;
}

/**
 * DFM finding lines WITH their measurement, threshold and fix. A finding the
 * engine could not price says so — it is never printed as "€0.00".
 */
export function dfmFindingLines(findings, max = 10) {
  return (Array.isArray(findings) ? findings : []).slice(0, max).map(f => {
    const meas = f.measured != null && f.measured !== '' ? `measured ${f.measured}${f.unit ? ` ${f.unit}` : ''}` : null;
    const thr = f.thresholdText ? `limit ${f.thresholdText}` : null;
    const priced = n(f.deltaEur) != null && f.deltaEur !== 0 ? `engine-priced ${f.deltaEur > 0 ? '+' : ''}€${Number(f.deltaEur).toFixed(2)}/part` : 'not engine-priceable';
    return `[${f.severity}] ${clip(f.title, 160)}${meas || thr ? ` — ${[meas, thr].filter(Boolean).join(' vs ')}` : ''}; ${priced}${f.fix ? `. Rule's fix: ${clip(f.fix, 180)}` : ''}${f.source ? ` (source: ${clip(f.source, 80)})` : ''}`;
  });
}

/**
 * Route lines: the current route and the alternatives a switch could honestly
 * be argued for (recommendableRoutes), on the SAME measured geometry.
 */
export function routeEvidenceLines(routes, recommendable, max = 4) {
  const rows = Array.isArray(routes) ? routes : [];
  const chosen = rows.find(r => r.isChosen);
  const out = [];
  const fmt = (v) => (n(v) != null ? `€${Number(v).toFixed(2)}` : '—');
  if (chosen) out.push(`Current route ${chosen.process}: ${fmt(chosen.piecePriceEur)}/part, DFM ${chosen.score ?? '—'} over ${chosen.evaluatedCount ?? '?'}/${chosen.ruleCount ?? '?'} rules, tooling ${fmt(chosen.toolingEur)}.`);
  const alts = (Array.isArray(recommendable) ? recommendable : []).slice().sort((a, b) => (a.piecePriceEur ?? Infinity) - (b.piecePriceEur ?? Infinity)).slice(0, max);
  for (const r of alts) {
    out.push(`${r.process}: ${fmt(r.piecePriceEur)}/part${n(r.deltaPieceEur) != null ? ` (${r.deltaPieceEur <= 0 ? '' : '+'}${fmt(r.deltaPieceEur)} vs current)` : ''}, DFM ${r.score ?? '—'} over ${r.evaluatedCount}/${r.ruleCount} rules, tooling ${fmt(r.toolingEur)}${r.topFindings?.[0] ? `; worst finding: ${clip(r.topFindings[0].title, 90)}` : ''}. ${clip(r.shapeBasis, 140)}`);
  }
  const excluded = rows.filter(r => !r.isChosen && r.shapeEstablished === false).length;
  if (excluded) out.push(`${excluded} other routes were NOT offered: nothing measured shows they can form this shape without a redesign.`);
  return out;
}

/**
 * Drawing lines from the AI drawing extraction — what the drawing SAYS.
 * Labelled as read by AI from the drawing: the user confirms the spec fields.
 */
export function drawingEvidenceLines(drawing) {
  if (!drawing || typeof drawing !== 'object') return [];
  const out = [];
  const tb = drawing.titleBlock || {};
  const head = [tb.title && `title "${clip(tb.title, 80)}"`, tb.drawingNumber && `drawing ${clip(tb.drawingNumber, 40)}${tb.revision ? ` rev ${clip(tb.revision, 10)}` : ''}`, tb.material && `material callout "${clip(tb.material, 80)}"`, tb.generalToleranceNote && `general tolerance "${clip(tb.generalToleranceNote, 60)}"`].filter(Boolean);
  if (head.length) out.push(`Title block: ${head.join('; ')}.`);
  const dims = Array.isArray(drawing.dimensions) ? drawing.dimensions : [];
  const tol = dims.filter(d => d.toleranced);
  if (dims.length) {
    const band = (d) => n(d.totalBand) ?? ((n(d.plus) ?? 0) + (n(d.minus) ?? 0));
    const tight = tol.map(d => ({ d, b: band(d) })).filter(x => x.b > 0).sort((a, b) => a.b - b.b).slice(0, 5);
    out.push(`${dims.length} dimensions read, ${tol.length} individually toleranced${tight.length ? `; tightest: ${tight.map(x => `"${clip(x.d.sourceText, 30)}" (band ${r1(x.b * 1000) / 1000})`).join(', ')}` : ''}.`);
  }
  const gdt = Array.isArray(drawing.gdt) ? drawing.gdt : [];
  if (gdt.length) out.push(`GD&T frames: ${gdt.slice(0, 8).map(g => `${g.symbol}${n(g.tolerance) != null ? ` ${g.tolerance}` : ''}${g.datums?.length ? ` |${g.datums.join('|')}` : ''}`).join('; ')}.`);
  const ra = Array.isArray(drawing.roughness) ? drawing.roughness : [];
  if (ra.length) out.push(`Surface finish callouts: ${ra.slice(0, 6).map(x => `${x.raUm != null ? `Ra ${x.raUm} µm` : clip(x.sourceText, 20)}${x.scope ? ` on ${clip(x.scope, 40)}` : ''}`).join('; ')}.`);
  const notes = Array.isArray(drawing.notes) ? drawing.notes : [];
  for (const nt of notes.slice(0, 6)) out.push(`Drawing note: "${clip(nt, 160)}"`);
  if (drawing.readability && drawing.readability !== 'good') out.push(`Drawing legibility was "${drawing.readability}" — callouts may be missing.`);
  return out;
}

// ── Joining evidence for a single part (Prism R4) ────────────────────────────
// A single part has no assembly to run DFA on, but its geometry shows where it
// is JOINED: bosses, counterbores and countersinks are where fasteners go. The
// geometry cannot say how many are fitted, so the lines say "candidates". The
// per-joint times are the DFA time model's own coefficients (calibratable,
// cited by version) and the money is those seconds at the region's labour
// rate — arithmetic, never an estimate. Photo-confirmed fastener counts, when
// the engineer ticked them, turn candidates into a floor.
const SECURING_FOR = { screw: 'screw', bolt: 'boltNut', rivet: 'rivet' };

export function joiningEvidenceLines({ counts = null, photoFasteners = [], labourEurPerHr = null, region = null, timeModel } = {}) {
  if (!timeModel) return [];
  const c = counts && typeof counts === 'object' ? counts : {};
  const joints = ['boss', 'counterbore', 'countersink', 'through-hole', 'blind-hole']
    .map(k => [k, n(c[k])]).filter(([, v]) => v > 0);
  const photo = (Array.isArray(photoFasteners) ? photoFasteners : []).filter(f => Number.isInteger(f?.count) && f.count > 0);
  if (!joints.length && !photo.length) return [];
  const out = [];
  if (joints.length) {
    out.push(`Joint-candidate features measured on the 3D model: ${joints.map(([k, v]) => `${v} × ${k}`).join(', ')} — the geometry shows where fasteners COULD go, not how many are fitted.`);
  }
  const sec = timeModel.securing;
  const rate = n(labourEurPerHr);
  const eur = (s) => (rate ? `€${((s / 3600) * rate).toFixed(3)}` : null);
  out.push(`DFA time model (${timeModel.version}, calibratable): securing per joint — screw ${sec.screw} s, bolt + nut ${sec.boltNut} s, rivet ${sec.rivet} s, snap-fit ${sec.snapFit} s${rate ? `; at ${region ?? 'the stated region'} labour €${rate}/h securing one screw joint costs ${eur(sec.screw)} against ${eur(sec.snapFit)} for one snap-fit, before handling the fastener itself` : ''}.`);
  const timed = photo.filter(f => SECURING_FOR[f.fastener]);
  if (timed.length) {
    const s = timed.reduce((acc, f) => acc + f.count * sec[SECURING_FOR[f.fastener]], 0);
    out.push(`Photos of our part show at least ${timed.map(f => `${f.count} ${f.fastener}${f.count === 1 ? '' : 's'}`).join(' and ')} (engineer-confirmed): at least ${Math.round(s * 10) / 10} s of securing time${rate ? ` = ${eur(s)} per assembly at the time-model rates` : ''} — each joint deleted or turned into a snap-fit releases its share.`);
  }
  return out;
}
