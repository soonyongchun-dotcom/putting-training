import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
const context = vm.createContext({ window: {} });
vm.runInContext(readFileSync('player-distance-reference.js', 'utf8'), context);
const api = context.window.PlayerDistanceReference;
const settings = { sex: 'male', age_band: 'adult', level: 'tour', club: 'driver', conditions: 'standard', heightTolerance: 5, weightTolerance: 5, minimumPlayers: 2 };
const athlete = { height: 170, weight: 70, code: 'self', distance: 210 };
const row = (code, distance, extras = {}) => ({ player_code: code, sex: 'male', height_cm: 170, weight_kg: 70, age_band: 'adult', level: 'tour', club: 'driver', distance_type: 'total', conditions: 'standard', distance_m: distance, source: 'test-only', ...extras });
test('player weighting, self exclusion and exact conditions', () => {
  const rows = api.validateRows([row('a', 200), row('a', 240), row('b', 240), row('self', 500), row('c', 300, { sex: 'female' }), row('d', 300, { distance_type: 'carry' }), row('e', 300, { height_cm: 180 }), row('f', 300, { conditions: 'windy' })]);
  const result = api.compare(rows, settings, athlete);
  assert.equal(result.players, 2);
  assert.equal(result.records, 3);
  assert.equal(result.mean, 230);
  assert.equal(result.q1, 225);
  assert.equal(result.q3, 235);
  assert.ok(Math.abs(result.realization - 210 / 230 * 100) < 1e-10);
});
test('missing fields, invalid values and settings fail explicitly', () => {
  assert.throws(() => api.validateRows([row('a', '')]), /distance_m/);
  assert.throws(() => api.validateRows([row('a', 100, { sex: 'unknown' })]), /sex/);
  assert.throws(() => api.validateSettings({ ...settings, minimumPlayers: 1.5 }), /minimumPlayers/);
  assert.throws(() => api.validateSettings({ ...settings, heightTolerance: -1 }), /heightTolerance/);
});
test('minimum counts distinct players, not records', () => {
  const result = api.compare(api.validateRows([row('a', 200), row('a', 220)]), settings, athlete);
  assert.equal(result.status, 'insufficient');
  assert.equal(result.players, 1);
});
test('tolerances can be changed and missing outcome does not become zero', () => {
  const rows = api.validateRows([row('a', 200), row('b', 240, { height_cm: 180 })]);
  assert.equal(api.compare(rows, settings, athlete).status, 'insufficient');
  const result = api.compare(rows, { ...settings, heightTolerance: 10 }, { ...athlete, distance: 0 });
  assert.equal(result.status, 'ready');
  assert.equal(result.realization, null);
  assert.equal(api.compare(rows, { ...settings, sex: '' }, athlete).status, 'inputs');
});
test('all matching dimensions and inclusive body boundaries', () => {
  const excluded = ['sex', 'age_band', 'level', 'club', 'conditions', 'distance_type'].map((key, i) =>
    row(`excluded${i}`, 500, { [key]: key === 'sex' ? 'female' : key === 'distance_type' ? 'carry' : 'different' }));
  const rows = api.validateRows([
    row('a', 200, { height_cm: 165, weight_kg: 65 }),
    row('b', 240, { height_cm: 175, weight_kg: 75 }),
    row('outside', 500, { weight_kg: 75.01 }), ...excluded,
  ]);
  const result = api.compare(rows, settings, athlete);
  assert.equal(result.players, 2);
  assert.equal(result.mean, 220);
  assert.equal(result.median, 220);
  assert.ok(Math.abs(result.sd - Math.sqrt(800)) < 1e-10);
  assert.equal(api.compare(rows, settings, { ...athlete, distance: 440 }).realization, 200);
});
test('CSV row count and malformed records are rejected', () => {
  assert.throws(() => api.validateRows([]), /rows/);
  assert.throws(() => api.validateRows(Array(10001).fill(row('a', 200))), /rows/);
  assert.equal(api.validateRows(Array(10000).fill(row('a', 200))).length, 10000);
  assert.throws(() => api.validateRows([null]), /record/);
  assert.throws(() => api.validateRows([row('a', 200, { source: '<tag>' })]), /source/);
  const missing = row('a', 200);
  delete missing.club;
  assert.throws(() => api.validateRows([missing]), /club/);
});
