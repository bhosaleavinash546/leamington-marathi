// Prism vision + function stage (3 Oct 2026): the contract around the images
// and the deterministic function model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVisionImages, buildVisionContent, normaliseVisionRead, visionObservationLines,
  functionModelFromDraft, VISION_SYSTEM, VISION_SCHEMA, MAX_VISION_IMAGES,
} from '../part360-vision.mjs';
import { buildDossier, dossierToPromptBlock, LENSES } from '../part360.mjs';

const JPEG = 'data:image/jpeg;base64,' + 'A'.repeat(200);

test('only base64 JPEG/PNG/WebP views are accepted, bounded in count and size', () => {
  const ok = parseVisionImages([{ view: 'iso', dataUrl: JPEG }, { view: 'front', dataUrl: JPEG.replace('jpeg', 'png') }]);
  assert.equal(ok.images.length, 2);
  assert.deepEqual(ok.images.map(i => i.mediaType), ['image/jpeg', 'image/png']);
  assert.match(parseVisionImages([]).error, /at least one/);
  assert.match(parseVisionImages([{ dataUrl: 'https://x/y.png' }]).error, /not a base64/);
  assert.match(parseVisionImages([{ dataUrl: 'data:image/svg+xml;base64,AAAA' }]).error, /not a base64/);
  assert.match(parseVisionImages(Array(MAX_VISION_IMAGES + 1).fill({ dataUrl: JPEG })).error, /At most/);
  assert.match(parseVisionImages([{ dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(2_000_001) }]).error, /too large/);
  assert.equal(parseVisionImages([{ view: 'evil', dataUrl: JPEG }]).images[0].view, 'view 1', 'unknown view names are not passed through');
});

test('each image is labelled with its view; measured lines are the only numbers; user text is framed as untrusted', () => {
  const { images } = parseVisionImages([{ view: 'iso', dataUrl: JPEG }, { view: 'top', dataUrl: JPEG }]);
  const c = buildVisionContent({ images, partName: 'Cover', material: 'A380', process: 'HPDC', partContext: 'seals oil', measuredLines: ['Wall median 2.41 mm.'] });
  assert.deepEqual(c.filter(b => b.type === 'image').length, 2);
  assert.equal(c[0].text, 'View: iso');
  const text = c.at(-1).text;
  assert.match(text, /UNTRUSTED/);
  assert.match(text, /Wall median 2\.41 mm/);
  assert.match(VISION_SYSTEM, /Never estimate a dimension/);
  assert.match(VISION_SYSTEM, /red = .*UNDERCUT/);
  assert.ok(VISION_SCHEMA.required.includes('cannotTell'), 'saying what cannot be told is required');
});

test('the read is normalised: unknown enums fall back, empties are dropped, strings bounded', () => {
  const r = normaliseVisionRead({
    partIdentity: { name: 'Side cover', confidence: 'certain', basis: 'flange [iso]' },
    functionSummary: 'x'.repeat(1000),
    functions: [{ verbNoun: 'seal oil', evidence: 'rim [top]', confidence: 'high' }, { verbNoun: '' }],
    interfaces: [{ feature: 'rim', role: 'teleport', functional: 'yes', view: 'top', evidence: 'e' }],
    overDesign: [], cannotTell: ['loads'],
  });
  assert.equal(r.partIdentity.confidence, 'low');
  assert.equal(r.functionSummary.length, 400);
  assert.equal(r.functions.length, 1);
  assert.equal(r.interfaces[0].role, 'unknown');
  assert.equal(r.interfaces[0].functional, false, 'only a literal true marks a surface functional');
  const lines = visionObservationLines(r);
  assert.ok(lines.some(l => l.kind === 'cannot-tell' && /loads/.test(l.text)));
  assert.ok(lines.some(l => /Non-functional unknown surface: rim \[top\]/.test(l.text)));
});

test('the function model is costed against the engine total by the deterministic cores', () => {
  const draft = { components: [{ name: 'shell', costSharePct: 60 }, { name: 'bosses', costSharePct: 15 }, { name: 'flange', costSharePct: 25 }],
    functions: [{ name: 'enclose gears', worthPct: 20 }, { name: 'locate shaft', worthPct: 60 }, { name: 'seal oil', worthPct: 20 }],
    alloc: [[80, 10, 10], [0, 100, 0], [0, 0, 100]] };
  const { functionModel, matrix } = functionModelFromDraft(draft, 10);
  assert.ok(Math.abs(matrix.functions.reduce((a, f) => a + f.cost, 0) - 10) < 0.05, 'function costs add up to the engine total');
  assert.deepEqual(functionModel.poorValue.map(f => f.name), ['enclose gears', 'seal oil'], 'cost 48% for 20% worth (VI 0.42) and 31% for 20% (VI 0.65) are poor value');
  assert.match(functionModel.allLines[0], /engine total split by the confirmed shares/);
  assert.ok(functionModel.trimQuestions.length > 0);
  assert.match(functionModel.trimQuestions[0], /take over "enclose gears"/, 'the verb-noun function is quoted whole, not de-pluralised');
  assert.match(functionModelFromDraft({ ...draft, alloc: [[50, 10, 10], [0, 100, 0], [0, 0, 100]] }, 10).error, /sums to 70%/);
  assert.match(functionModelFromDraft(draft, 0).error, /engine total/);
});

test('the dossier carries confirmed observations and the function model to the lenses that use them', () => {
  const part = { partName: 'Cover', material: 'Aluminium A380 / ADC12 (die-cast)', process: 'Die Casting (Aluminium)', weightKg: 0.9, annualVolume: 80000, region: 'Germany' };
  const { functionModel } = functionModelFromDraft({ components: [{ name: 'shell', costSharePct: 100 }], functions: [{ name: 'enclose gears', worthPct: 100 }], alloc: [[100]] }, 5);
  const d = buildDossier({ part, visionLines: ['FUNCTIONAL sealing surface: flange rim [top]'], functionModel });
  const vave = dossierToPromptBlock(d, 'vave');
  assert.match(vave, /Seen in the rendered 3D views[\s\S]*FUNCTIONAL sealing surface/);
  assert.match(vave, /enclose gears: 100% of cost/);
  assert.match(dossierToPromptBlock(d, 'spec'), /FUNCTIONAL sealing surface/);
  for (const id of ['vave', 'material', 'spec', 'process']) assert.ok(LENSES.find(l => l.id === id).sections.includes('vision'), id);
  // A refused draft says why instead of vanishing.
  const bad = buildDossier({ part, functionModel: null, functionModelError: 'alloc row for "shell" sums to 60% — must sum to 100%' });
  assert.match(dossierToPromptBlock(bad, 'vave'), /Function model not used: alloc row for "shell" sums to 60%/);
  // Without a read, the absence is stated.
  assert.match(dossierToPromptBlock(buildDossier({ part }), 'vave'), /No AI vision read confirmed/);
});
