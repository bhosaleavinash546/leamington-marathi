import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { scoreCADFeatures, aggregateCADScores, type CADPrediction, type CADTruth, type CADFeatureScore } from '../server/utils/cad-feature-accuracy.js';

/**
 * CAD golden-parts feature-detection harness — the CAD analogue of the PCB
 * golden-board runner. Turns "does the geometry engine detect the right
 * features?" from a hand check into a measured, regression-guarded number.
 *
 * Fixtures live in tests/fixtures/cad-parts/ as pairs:
 *   <part>.truth.json       — hand-verified design intent (feature counts, volume)
 *   <part>.prediction.json  — the geometry engine's recorded output for that part
 *   <part>.step             — the source model (regenerate predictions with
 *                             scripts/gen-cad-golden.py after an engine change)
 *
 * Predictions are RECORDINGS, so CI scores them without needing cadquery. Set
 * CAD_GOLDEN_MIN_F1 (e.g. 0.9) to enforce a floor.
 */

const DIR = join(__dirname, 'fixtures', 'cad-parts');

function loadPairs(): Array<{ name: string; truth: CADTruth; prediction: CADPrediction }> {
  if (!existsSync(DIR)) return [];
  const out: Array<{ name: string; truth: CADTruth; prediction: CADPrediction }> = [];
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith('.truth.json')) continue;
    const name = basename(f, '.truth.json');
    const predPath = join(DIR, `${name}.prediction.json`);
    if (!existsSync(predPath)) continue;
    out.push({
      name,
      truth: JSON.parse(readFileSync(join(DIR, f), 'utf-8')) as CADTruth,
      prediction: JSON.parse(readFileSync(predPath, 'utf-8')) as CADPrediction,
    });
  }
  return out;
}

describe('CAD golden-parts feature-detection harness', () => {
  const pairs = loadPairs();

  it(`discovers labelled parts (found: ${pairs.length})`, () => {
    expect(Array.isArray(pairs)).toBe(true);
  });

  it('scores every part and reports the aggregate', () => {
    if (pairs.length === 0) {
      console.warn('[cad-golden] No labelled parts yet — feature accuracy is UNMEASURED. See tests/fixtures/cad-parts/README.md');
      return;
    }
    const scores: CADFeatureScore[] = pairs.map(p => {
      const s = scoreCADFeatures(p.prediction, p.truth, p.name);
      const vol = s.volumeErrorPct === null ? '—' : `${s.volumeErrorPct.toFixed(2)}%`;
      console.log(`[cad-golden] ${p.name}: F1=${s.featureF1.toFixed(3)} P=${s.featurePrecision.toFixed(3)} R=${s.featureRecall.toFixed(3)} `
        + `holes=${s.byKind.hole.predicted}/${s.byKind.hole.truth} bosses=${s.byKind.boss.predicted}/${s.byKind.boss.truth} volErr=${vol}`);
      return s;
    });
    const agg = aggregateCADScores(scores);
    console.log(`[cad-golden] AGGREGATE (${pairs.length} parts): F1=${agg.featureF1.toFixed(3)} P=${agg.featurePrecision.toFixed(3)} R=${agg.featureRecall.toFixed(3)}`);

    const minF1 = Number(process.env.CAD_GOLDEN_MIN_F1 ?? 0);
    expect(agg.featureF1).toBeGreaterThanOrEqual(minF1);
  });

  it('each part measures within its stated volume tolerance', () => {
    for (const p of pairs) {
      if (typeof p.truth.volumeCm3 !== 'number') continue;
      const s = scoreCADFeatures(p.prediction, p.truth, p.name);
      const tol = p.truth.volumeTolPct ?? 5;
      expect(s.volumeErrorPct, `${p.name} volume error`).not.toBeNull();
      expect(s.volumeErrorPct as number, `${p.name} volume within ${tol}%`).toBeLessThanOrEqual(tol);
    }
  });
});
