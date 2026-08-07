/**
 * The findings panel, against real engine output.
 *
 * The panel had been rendering five of the fields the engine put on the wire.
 * The rest — the measured range against the threshold, the fix, the cost basis
 * or the stated reason there is none, and the "what was not checked" list —
 * were dropped, so the engineer holding a printed review pack had more to judge
 * from than the engineer sitting in front of the live tool.
 *
 * These tests drive `analyseGeometricDFM` and render whatever it returns, rather
 * than a hand-written fixture. A fixture I wrote to match my own panel proves
 * only that I am consistent with myself; if the engine renames a field, the
 * fixture keeps passing and the panel silently goes blank.
 *
 * The two states asserted hardest are the ones that mislead rather than fail:
 * "no pack for this commodity" and "pack ran, nothing fired". Both must be
 * distinguishable from "we checked and the part is clean".
 */
import { describe, it, expect } from 'vitest';
import { analyseGeometricDFM } from '../src/engine/dfm-geometry/index.js';
import { buildGeometricDFMPanel, dfmHighlightHint, dfmMoney } from '../src/ui/dfm-geometry-panel.js';
import type { PartContext, ManufacturingFeature } from '../src/engine/dfm-geometry/types.js';
import type { ManufacturingFeatureSet } from '../src/engine/ai-analysis.js';
import type { GeometricDFMMeta } from '../src/export/pdf.js';

const featureSet = (features: ManufacturingFeature[],
                    over: Partial<ManufacturingFeatureSet> = {}): ManufacturingFeatureSet => ({
  available: true, features, wallAnalysisValid: true, adjacencyAvailable: true,
  medianThicknessMm: 4, hotSpots: [], fillRatio: 0.4, ...over,
});

/**
 * A hole small enough and deep enough to trip the two machining rules that ARE
 * priced, so the cost-basis branch is exercised on a real pricer rather than a
 * number typed into a fixture.
 */
const deepHole: ManufacturingFeature = {
  id: 'H1', kind: 'hole', faceIds: [7, 8], diaMm: 4.9, depthMm: 40, ldRatio: 8.16,
  areaMm2: 615, positionMm: [0, 0, 0],
};

/** The engine result IS the wire shape — the server sends `job.result` verbatim. */
const run = (over: Partial<PartContext> = {}): GeometricDFMMeta => analyseGeometricDFM({
  commodity: 'machining',
  bboxMm: { x: 120, y: 80, z: 40 },
  medianWallMm: 4,
  materialFamily: 'aluminium',
  cost: { annualVolume: 50_000, machineRatePerHr: 60, labourRatePerHr: 25 },
  ...over,
  featureSet: featureSet([deepHole], (over.featureSet ?? {}) as Partial<ManufacturingFeatureSet>),
}) as unknown as GeometricDFMMeta;

describe('the panel renders what the engine actually returned', () => {
  it('shows the measured range, the threshold, the fix and the citation', () => {
    const g = run();
    expect(g.grouped.length).toBeGreaterThan(0);
    const html = buildGeometricDFMPanel(g);

    for (const x of g.grouped) {
      expect(html, `title missing for ${x.ruleId}`).toContain(x.title);
      // The threshold is the only thing that makes a measured value a FINDING.
      expect(html, `threshold missing for ${x.ruleId}`)
        .toContain(`${x.threshold.value}${x.threshold.unit}`);
      expect(html, `recommendation missing for ${x.ruleId}`).toContain(x.recommendation);
      expect(html, `source missing for ${x.ruleId}`).toContain(x.source.standard);
      expect(html, `face count missing for ${x.ruleId}`)
        .toContain(`${x.faceIds.length} face(s)`);
    }
  });

  it('prints the cost basis for a priced finding and the reason for an unpriced one', () => {
    const g = run();
    const html = buildGeometricDFMPanel(g);
    const priced = g.grouped.filter(x => (x.totalCostGBP ?? 0) > 0);
    expect(priced.length, 'fixture should trip at least one PRICED rule').toBeGreaterThan(0);

    for (const x of priced) {
      expect(x.worst.costImpact, `${x.ruleId} is priced but carries no basis`).toBeDefined();
      expect(html).toContain(x.worst.costImpact!.basis);
    }
    for (const x of g.grouped.filter(x => !((x.totalCostGBP ?? 0) > 0))) {
      // Unpriced must never read as free: it states which model is missing.
      expect(x.costNotModelled, `${x.ruleId} is unpriced and says nothing`).toBeTruthy();
      expect(html).toContain(x.costNotModelled!);
    }
  });

  it('never shows both a £ figure and a reason there is no figure for one issue', () => {
    for (const x of run().grouped) {
      const hasMoney = (x.totalCostGBP ?? 0) > 0;
      expect(hasMoney && !!x.costNotModelled,
        `${x.ruleId} carries a price AND a not-priced reason`).toBe(false);
    }
  });

  it('keeps sub-penny findings visible instead of rounding them to £0.00', () => {
    expect(dfmMoney(0.003)).toBe('£0.0030');
    expect(dfmMoney(2.5)).toBe('£2.50');
  });
});

describe('the states that mislead rather than fail', () => {
  it('says a commodity has NO rule pack rather than rendering nothing', () => {
    // extrusion has no geometric pack; rendering an empty panel would look
    // exactly like a clean part.
    const g = run({ commodity: 'extrusion' });
    expect(g.packAvailable).toBe(false);
    const html = buildGeometricDFMPanel(g);
    expect(html).not.toBe('');
    expect(html).toMatch(/no geometry checks ran/i);
    expect(html).toMatch(/not a clean bill of health/i);
  });

  it('says "the checks that ran found nothing" when the pack fires no rule', () => {
    // A hole with a preferred diameter and a shallow L/D trips nothing.
    const clean = analyseGeometricDFM({
      commodity: 'machining',
      bboxMm: { x: 120, y: 80, z: 40 },
      medianWallMm: 4,
      materialFamily: 'aluminium',
      featureSet: featureSet([{
        id: 'H1', kind: 'hole', faceIds: [3], diaMm: 5, depthMm: 10, ldRatio: 2,
        areaMm2: 157, positionMm: [0, 0, 0],
      }]),
    }) as unknown as GeometricDFMMeta;
    expect(clean.packAvailable).toBe(true);
    expect(clean.grouped.length).toBe(0);
    const html = buildGeometricDFMPanel(clean);
    expect(html).toMatch(/No rule in the pack fired/i);
    expect(html).toMatch(/not that the part is clean/i);
  });

  it('always carries the "what was not checked" list alongside the findings', () => {
    const g = run();
    expect(g.limitations.length).toBeGreaterThan(0);
    const html = buildGeometricDFMPanel(g);
    expect(html).toMatch(/not<\/strong> checked/);
    for (const l of g.limitations) expect(html).toContain(l);
  });

  it('renders nothing at all only when there is no report', () => {
    expect(buildGeometricDFMPanel(null)).toBe('');
  });
});

describe('clicking a finding always says what happened', () => {
  it('confirms the highlight when the viewer is open', () => {
    expect(dfmHighlightHint([1, 2, 3], true)).toBe('Highlighted 3 face(s) in the 3D viewer.');
  });

  it('names the faces when the viewer is closed, instead of failing silently', () => {
    const hint = dfmHighlightHint([4, 9, 12], false);
    expect(hint).toMatch(/Open the 3D viewer/);
    expect(hint).toContain('4, 9, 12');
  });

  it('truncates a long face list rather than printing sixty ids', () => {
    const hint = dfmHighlightHint(Array.from({ length: 60 }, (_, i) => i + 1), false);
    expect(hint).toContain('and 48 more');
    expect(hint).not.toContain('60,');
  });
});

describe('escaping', () => {
  it('escapes engine text rather than injecting it as markup', () => {
    const g = run();
    const poisoned: GeometricDFMMeta = {
      ...g,
      grouped: [{ ...g.grouped[0], title: '<img src=x onerror=alert(1)>' }],
    };
    const html = buildGeometricDFMPanel(poisoned);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
});
