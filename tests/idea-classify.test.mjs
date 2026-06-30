import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyIdeaText, classifyIdea, POWERTRAINS, VOLTAGES } from '../src/data/idea-classify.mjs';

test('explicit powertrain tags classify correctly', () => {
  assert.deepEqual(classifyIdeaText('[BEV] skateboard pack').powertrains, ['BEV']);
  const m = classifyIdeaText('[ICE,MHEV] 48V belt starter').powertrains.sort();
  assert.deepEqual(m, ['ICE', 'MHEV']);
  assert.ok(classifyIdeaText('Powertrain: PHEV reinforced transfer case').powertrains.includes('PHEV'));
});

test('800V implies BEV; 400V does not', () => {
  const a = classifyIdeaText('800V architecture');
  assert.deepEqual(a.voltages, ['800V']);
  assert.ok(a.powertrains.includes('BEV'));
  const b = classifyIdeaText('400V system');
  assert.deepEqual(b.voltages, ['400V']);
  assert.ok(!b.powertrains.includes('BEV'));
});

test('H1 regression: voltage tokens have a left digit boundary', () => {
  // these must NOT match 400V/800V/BEV
  for (const s of ['1400V battery', '2400V rail', '4800V test rig', '11400V bus', '800VA supply']) {
    const r = classifyIdeaText(s);
    assert.deepEqual(r.voltages, [], `${s} should yield no voltage, got ${r.voltages}`);
    assert.ok(!r.powertrains.includes('BEV'), `${s} should not be BEV`);
  }
});

test('word-boundary keywords do not false-match inside words', () => {
  // 'beveled', 'device', 'iceberg' must not trip BEV/ICE
  const r = classifyIdeaText('beveled device on iceberg');
  assert.ok(!r.powertrains.includes('BEV'));
  assert.ok(!r.powertrains.includes('ICE'));
});

test('classifyIdea parses ideaData and merges text', () => {
  const idea = {
    title: 'Cold plate',
    description: 'roll-bonded plate',
    ideaData: JSON.stringify({ technicalDescription: 'BEV applicability: 800-V battery pack', materialGrade: '3003 Al' }),
  };
  const r = classifyIdea(idea);
  assert.ok(r.powertrains.includes('BEV'));
  assert.deepEqual(r.voltages, ['800V']);
});

test('classifyIdea tolerates malformed ideaData', () => {
  const r = classifyIdea({ title: 'x', description: 'y', ideaData: '{not json' });
  assert.ok(Array.isArray(r.powertrains));
});

test('catalogue arrays are well-formed', () => {
  assert.deepEqual(POWERTRAINS, ['ICE', 'MHEV', 'PHEV', 'BEV']);
  assert.deepEqual(VOLTAGES, ['400V', '800V']);
});
