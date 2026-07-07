import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { scoreBom, aggregateScores, expandRefDes, type BomItem, type BomScore } from '../server/utils/pcb-vision-accuracy.js';

/**
 * Golden-board accuracy runner (audit Critical #3).
 *
 * Drop labelled boards into tests/fixtures/pcb-boards/ as pairs:
 *   <board>.truth.json       — hand-verified ground-truth BOM
 *   <board>.prediction.json  — the pipeline's output BOM for the same photo
 *     (produce it by running the analysis and saving the `bom` array)
 *
 * Every pair found is scored (precision / recall / F1 / MPN accuracy /
 * price MAPE) and the aggregate is printed, turning "accuracy" from an
 * assertion into a measured number. Set PCB_GOLDEN_MIN_F1 (e.g. 0.75) in CI
 * to enforce a floor once a golden set exists.
 */

const FIXTURE_DIR = join(__dirname, 'fixtures', 'pcb-boards');

interface TruthFile { board?: string; bom: BomItem[] }

function loadPairs(): Array<{ name: string; truth: BomItem[]; prediction: BomItem[] }> {
  if (!existsSync(FIXTURE_DIR)) return [];
  const pairs: Array<{ name: string; truth: BomItem[]; prediction: BomItem[] }> = [];
  for (const f of readdirSync(FIXTURE_DIR)) {
    if (!f.endsWith('.truth.json')) continue;
    const name = basename(f, '.truth.json');
    const predPath = join(FIXTURE_DIR, `${name}.prediction.json`);
    if (!existsSync(predPath)) continue;
    const truth = (JSON.parse(readFileSync(join(FIXTURE_DIR, f), 'utf-8')) as TruthFile).bom ?? [];
    const prediction = (JSON.parse(readFileSync(predPath, 'utf-8')) as TruthFile).bom ?? [];
    pairs.push({ name, truth, prediction });
  }
  return pairs;
}

describe('PCB golden-board accuracy harness', () => {
  const pairs = loadPairs();

  it(`discovers labelled boards (found: ${pairs.length})`, () => {
    // Zero boards is allowed (the harness must not fail before boards are
    // labelled) but the count is surfaced so CI logs show coverage honestly.
    expect(Array.isArray(pairs)).toBe(true);
  });

  it('scores every truth/prediction pair and reports the aggregate', () => {
    if (pairs.length === 0) {
      console.warn('[pcb-golden] No labelled boards yet — accuracy is UNMEASURED. See tests/fixtures/pcb-boards/README.md');
      return;
    }
    const scores: BomScore[] = pairs.map(p => {
      const s = scoreBom(p.prediction, p.truth);
      console.log(`[pcb-golden] ${p.name}: F1=${s.componentF1.toFixed(3)} recall=${s.componentRecall.toFixed(3)} MPN=${s.partNumberAccuracy.toFixed(3)} priceMAPE=${s.priceMAPE.toFixed(3)} costErr=${s.totalCostError.toFixed(3)}`);
      return s;
    });
    const agg = aggregateScores(scores);
    console.log(`[pcb-golden] AGGREGATE (${pairs.length} boards): F1=${agg.componentF1.toFixed(3)} recall=${agg.componentRecall.toFixed(3)} MPN=${agg.partNumberAccuracy.toFixed(3)} priceMAPE=${agg.priceMAPE.toFixed(3)} costErr=${agg.totalCostError.toFixed(3)}`);
    const minF1 = Number(process.env.PCB_GOLDEN_MIN_F1 ?? 0);
    if (minF1 > 0) expect(agg.componentF1).toBeGreaterThanOrEqual(minF1);
  });
});

describe('grouped refDes expansion (audit fix — scorer no longer collapses ranges)', () => {
  it('expands dash ranges, comma lists, and passes single refs through', () => {
    expect(expandRefDes('R1-R4')).toEqual(['R1', 'R2', 'R3', 'R4']);
    expect(expandRefDes('C1–C3')).toEqual(['C1', 'C2', 'C3']);      // en-dash
    expect(expandRefDes('R1-R3, C7')).toEqual(['R1', 'R2', 'R3', 'C7']);
    expect(expandRefDes('U1')).toEqual(['U1']);
    expect(expandRefDes('')).toEqual([]);
  });

  it('a grouped prediction matches individual truth lines (and vice versa)', () => {
    const truth: BomItem[] = [1, 2, 3, 4].map(n => ({ refDes: `R${n}`, componentType: 'passive_0402', qty: 1, unitPriceGBP: 0.01 }));
    const grouped: BomItem[] = [{ refDes: 'R1-R4', componentType: 'passive_0402', qty: 4, unitPriceGBP: 0.01 }];
    const s = scoreBom(grouped, truth);
    expect(s.componentRecall).toBe(1);      // all four truth refs matched
    expect(s.falseNegatives).toBe(0);
    const s2 = scoreBom(truth, grouped);    // symmetric direction
    expect(s2.componentRecall).toBe(1);
  });

  it('does not explode on malformed or absurd ranges', () => {
    expect(expandRefDes('R10-R1')).toEqual(['R10-R1']);       // inverted → raw token
    expect(expandRefDes('R1-C9')).toEqual(['R1-C9']);         // mixed prefixes → raw
    expect(expandRefDes('R1-R9999').length).toBe(1);          // >500 span → raw token
  });
});
