// Prism R3 (photos / teardown) and R4 (DFA in Prism).
//
// What is protected: a material marking is decoded by the table, never by the
// model, and an unknown symbol says so; an unticked observation never reaches
// a comparison; counts stay "visible floors"; the DFA lines withhold design
// efficiency until every part is answered; the consolidation lens exists only
// with DFA evidence; the new dossier sections reach the right lenses.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeMaterialMark, parsePhotos, photoObservations, attributesFromObservations, teardownComparison, buildPhotoContent,
} from '../part360-photo.mjs';
import { joiningEvidenceLines } from '../part360-evidence.mjs';
import { TIME_MODEL } from '../dfa-time-model.mjs';
import { analyseDfa } from '../dfa-engine.mjs';
import { dfaEvidenceLines, assemblyEvidence, ASSEMBLY_LENSES, numberSections, assemblyPromptBlock } from '../prism-assembly.mjs';
import { buildDossier, LENSES, dossierToPromptBlock } from '../part360.mjs';

const PX = 'data:image/png;base64,iVBORw0KGgo=';

const OURS_READ = {
  identity: { name: 'side cover', confidence: 'medium', basis: 'photo 1' },
  fasteners: [{ type: 'screw', visibleCount: 4, photo: 'photo 1', confidence: 'clear' }],
  joining: [{ method: 'screwed', where: 'flange', photo: 'photo 1', confidence: 'clear' }],
  materialMarks: [], surfaceFinish: [], processEvidence: [], cannotTell: ['underside'],
};
const BENCH_READ = {
  identity: { name: 'rival cover', confidence: 'medium', basis: 'photo 1' },
  fasteners: [{ type: 'screw', visibleCount: 1, photo: 'photo 1', confidence: 'clear' }],
  joining: [{ method: 'snap-fit', where: 'rim hooks', photo: 'photo 1', confidence: 'clear' }],
  materialMarks: [{ verbatim: '>PA66-GF30<', photo: 'photo 1' }],
  surfaceFinish: [], processEvidence: [{ observation: 'gate vestige', suggests: 'injection moulded', photo: 'photo 1', confidence: 'clear' }],
  cannotTell: [],
};

test('material markings are decoded by the ISO 1043 table, and unknown symbols say so', () => {
  assert.equal(decodeMaterialMark('>PA66-GF30<').text, 'polyamide 66, 30% glass fibre');
  assert.equal(decodeMaterialMark('>PP-T20<').text, 'polypropylene, 20% talc');
  assert.match(decodeMaterialMark('>PC+ABS<').text, /polycarbonate \+ acrylonitrile-butadiene-styrene blend/);
  assert.match(decodeMaterialMark('>PA6-GF30 FR(52)<').text, /flame-retardant \(ISO 1043-4 code 52\)/);
  const bad = decodeMaterialMark('>UNOBTAINIUM<');
  assert.equal(bad.recognised, false);
  assert.match(bad.text, /not in the ISO 1043 symbol table/);
});

test('photo parsing refuses non-images and too many photos; content frames a benchmark as untrusted', () => {
  assert.match(parsePhotos([]).error, /at least one photo/);
  assert.match(parsePhotos([{ dataUrl: 'data:application/pdf;base64,AAAA' }]).error, /not a base64/);
  assert.match(parsePhotos(Array(7).fill({ dataUrl: PX })).error, /At most 6/);
  const ok = parsePhotos([{ dataUrl: PX }, { dataUrl: PX }]);
  assert.deepEqual(ok.images.map(i => i.label), ['photo 1', 'photo 2']);
  const c = buildPhotoContent({ images: ok.images, subject: 'benchmark', subjectLabel: 'Rival', partName: 'cover', material: 'A380', process: 'HPDC' });
  assert.equal(c.filter(x => x.type === 'image').length, 2);
  assert.match(c.at(-1).text, /COMPETITOR \/ BENCHMARK item \(user label, UNTRUSTED\): Rival/);
});

test('observations state counts as visible floors, and only TICKED attrs reach the attributes', () => {
  const obs = photoObservations(BENCH_READ);
  assert.ok(obs.some(o => o.text === 'At least 1 visible screw [photo 1, clear]'));
  assert.ok(obs.some(o => /decoded \(ISO 1043\): polyamide 66, 30% glass fibre/.test(o.text)));
  const all = attributesFromObservations(obs);
  assert.deepEqual(all.map(a => a.name), ['visible fasteners', 'joining methods', 'material']);
  // Untick the marking: the material attribute disappears.
  const noMark = attributesFromObservations(obs.filter(o => o.kind !== 'material-mark'));
  assert.ok(!noMark.some(a => a.name === 'material'));
  // A forged attr with an unrecognised marking is not decoded into a material.
  assert.deepEqual(attributesFromObservations([{ attr: { type: 'marking', verbatim: '>NOPE<' } }]), []);
  // An out-of-range count is refused.
  assert.deepEqual(attributesFromObservations([{ attr: { type: 'fasteners', count: 9999, fastener: 'screw' } }]), []);
});

test('teardown comparison runs the deterministic delta and labels the stated-material fallback', () => {
  const { lines, delta } = teardownComparison({
    oursTicked: photoObservations(OURS_READ), benchTicked: photoObservations(BENCH_READ),
    benchLabel: 'Rival cover', statedMaterial: 'Aluminium A380',
  });
  assert.equal(delta.significantCount, 3);
  assert.ok(lines.some(l => /^visible fasteners: ours 4 vs Rival cover 1 \(Δ \+3, \+300%\) — the benchmark shows fewer\. Both counts are visible-in-photo floors/.test(l)));
  assert.ok(lines.some(l => /material differs: ours Aluminium A380 vs Rival cover PA66-GF30 \(our material is the STATED material/.test(l)));
  assert.ok(lines.some(l => /whether it meets OUR duty is for the idea to argue/.test(l)));
  // Nothing confirmed on the benchmark: no comparison, with the reason.
  const none = teardownComparison({ oursTicked: [], benchTicked: [], benchLabel: 'Rival' });
  assert.equal(none.delta, null);
  assert.match(none.lines[0], /No comparable attribute was confirmed/);
});

test('joining evidence: measured candidates, the time model\'s seconds, photo floors at the labour rate', () => {
  assert.deepEqual(joiningEvidenceLines({ counts: {}, timeModel: TIME_MODEL }), []);
  const lines = joiningEvidenceLines({
    counts: { boss: 2, counterbore: 4, fillet: 9 }, photoFasteners: [{ fastener: 'screw', count: 4 }, { fastener: 'clip', count: 3 }],
    labourEurPerHr: 36, region: 'Germany', timeModel: TIME_MODEL,
  });
  assert.match(lines[0], /2 × boss, 4 × counterbore — the geometry shows where fasteners COULD go, not how many are fitted/);
  assert.match(lines[1], /screw 5 s, bolt \+ nut 8\.5 s, rivet 4 s, snap-fit 0\.9 s; at Germany labour €36\/h securing one screw joint costs €0\.050 against €0\.009 for one snap-fit/);
  // 4 screws × 5 s = 20 s; clips have no securing time in the model, so they are not timed.
  assert.match(lines[2], /at least 4 screws \(engineer-confirmed\): at least 20 s of securing time = €0\.200 per assembly/);
});

const DECOMP = {
  status: 'success', solidCount: 3, distinctPartTypes: 2,
  parts: [
    { index: 0, name: 'bracket', volumeMm3: 40000, maxDimMm: 80, midDimMm: 50, minDimMm: 10, symmetry: { totalDeg: 360, continuous: false } },
    { index: 1, name: 'pin-a', volumeMm3: 1256.64, maxDimMm: 25, midDimMm: 8, minDimMm: 8, symmetry: { totalDeg: 180, continuous: true } },
    { index: 2, name: 'pin-b', volumeMm3: 1256.64, maxDimMm: 25, midDimMm: 8, minDimMm: 8, symmetry: { totalDeg: 180, continuous: true } },
  ],
  instanceGroups: [{ signature: 'pin', count: 2, partIndices: [1, 2] }, { signature: 'plate', count: 1, partIndices: [0] }],
  contacts: [[0, 1], [0, 2]],
};

test('DFA evidence lines withhold efficiency until answered, then name candidates and the labour', () => {
  const partial = dfaEvidenceLines(analyseDfa(DECOMP, { labourRateEurPerHr: 36 }));
  assert.match(partial[0], /3 parts, 2 distinct types, .* s total handling \+ insertion = €.* assembly labour per unit at €36\/h — assembly labour is NOT in the BOM total/);
  assert.match(partial[1], /^Design efficiency withheld: 3 of 3 parts have unanswered DFA questions/);
  assert.ok(partial.some(l => /mass assumes steel/.test(l)));
  const answered = analyseDfa(DECOMP, {
    labourRateEurPerHr: 36, densityByIndex: { 0: 7.85, 1: 7.85, 2: 7.85 },
    answers: { 0: { moves: false, differentMaterial: false, mustSeparate: true }, 1: { moves: false, differentMaterial: false, mustSeparate: false }, 2: { moves: false, differentMaterial: false, mustSeparate: false } },
    securingByIndex: { 1: 'screw', 2: 'screw' },
  });
  const lines = dfaEvidenceLines(answered);
  assert.match(lines[1], /^Theoretical minimum 1 parts against 3 actual .* design efficiency \d/);
  assert.ok(lines.some(l => l.startsWith('Consolidation candidate: "pin-a"')));
  assert.ok(lines.some(l => /"pin-a": .* securing: screw \+5 s/.test(l)));
  assert.ok(lines.some(l => /^Suspected fasteners .*: 2 — "pin-a" \(\w+\), "pin-b" \(\w+\)\.$/.test(l)), 'every suspect listed with its confidence');
  assert.ok(!lines.some(l => /mass assumes steel/.test(l)));
});

test('assembly dossier: DFA section and the consolidation lens see it', () => {
  const rollUp = { totalEur: 10, partCount: 3, totalMassKg: 1, costedPct: 100, caveat: 'ok', subassemblies: [], uncosted: [] };
  const secs = numberSections(assemblyEvidence({ assemblyName: 'A', rollUp, dfaLines: ['DFA line one'] }));
  assert.ok(secs.some(s => s.id === 'dfa' && s.lines[0].text === 'DFA line one'));
  const lens = ASSEMBLY_LENSES.find(l => l.id === 'consolidation');
  assert.ok(lens && lens.sections.includes('dfa'));
  assert.match(assemblyPromptBlock(secs, lens), /Design for assembly[\s\S]*DFA line one/);
  // No DFA lines → no section.
  assert.ok(!numberSections(assemblyEvidence({ assemblyName: 'A', rollUp })).some(s => s.id === 'dfa'));
});

test('single-part dossier: photo, teardown-delta and joining sections reach the right lenses', () => {
  const d = buildDossier({
    part: { partName: 'cover', material: 'A380', process: 'HPDC', weightKg: 0.2, annualVolume: 1000, region: 'Germany' },
    photoLines: ['[our part] At least 4 visible screws [photo 1, clear]'],
    teardownDeltaLines: ['visible fasteners: ours 4 vs Rival 1'],
    joiningLines: ['Joint-candidate features measured on the 3D model: 2 × boss'],
  });
  for (const id of ['photo', 'teardown-delta', 'joining']) assert.ok(d.sections.find(s => s.id === id)?.present, id);
  const bench = dossierToPromptBlock(d, 'benchmark');
  assert.match(bench, /Teardown comparison[\s\S]*ours 4 vs Rival 1/);
  assert.match(bench, /Observed in photos/);
  assert.match(dossierToPromptBlock(d, 'vave'), /Joining & assembly/);
  assert.ok(LENSES.find(l => l.id === 'material').sections.includes('teardown-delta'));
  // Absent photos are stated, and no comparison section is invented.
  const bare = buildDossier({ part: { partName: 'x' } });
  assert.equal(bare.sections.find(s => s.id === 'photo').present, false);
  assert.ok(!bare.sections.some(s => s.id === 'teardown-delta' || s.id === 'joining'));
});
