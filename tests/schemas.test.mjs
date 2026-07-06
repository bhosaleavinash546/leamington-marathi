import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMAS, validate } from '../schemas.mjs';

function run(schema, body) {
  let status = 200, payload = null, nexted = false;
  const res = { status: (c) => { status = c; return res; }, json: (p) => { payload = p; return res; } };
  validate(schema)({ body }, res, () => { nexted = true; });
  return { status, payload, nexted };
}

test('valid bodies pass through untouched', () => {
  assert.ok(run(SCHEMAS.signup, { name: 'A', email: 'a@b.co', password: 'password1' }).nexted);
  assert.ok(run(SCHEMAS.shouldCost, { partName: 'x', material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 2, annualVolume: 1000 }).nexted);
  // unknown keys tolerated (loose)
  assert.ok(run(SCHEMAS.shouldCost, { partName: 'x', material: 'm', process: 'p', weightKg: 1, annualVolume: 1, extraField: true }).nexted);
});

test('malformed shapes get field-level 400s', () => {
  const r = run(SCHEMAS.signup, { name: 123, email: 'x', password: 'short' });
  assert.equal(r.status, 400);
  assert.match(r.payload.error, /name/);
  assert.match(r.payload.error, /password/);
  const r2 = run(SCHEMAS.shouldCost, { partName: 'x', material: 'm', process: { nested: 'object' }, weightKg: 1, annualVolume: 1 });
  assert.equal(r2.status, 400);
});

test('oversized strings are rejected (no 500 KB "emails")', () => {
  const r = run(SCHEMAS.signin, { email: 'x'.repeat(500_000), password: 'p' });
  assert.equal(r.status, 400);
});

test('route array is accepted on shouldCost', () => {
  assert.ok(run(SCHEMAS.shouldCost, { partName: 'x', material: 'm', process: 'p', weightKg: 1, annualVolume: 1, route: [{ process: 'Sand Casting' }] }).nexted);
});
