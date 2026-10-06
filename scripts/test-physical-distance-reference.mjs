import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
const context = vm.createContext({ window: {} });
vm.runInContext(readFileSync('physical-distance-reference.js', 'utf8'), context);
const compute = context.window.PhysicalDistanceReference.compute;
const base = { sex: 'male', height: 176, weight: 76, muscle: 35, distance: 210 };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
test('balanced male reference uses upper total distance without uplift', () => {
  const r = compute(base);
  assert.equal(r.composite, 50);
  assert.equal(r.correction, 1);
  close(r.baselineMeters, 308 * 0.9144);
  close(r.efficiency, 210 / r.baselineMeters * 100);
});
test('female midpoint and missing muscle reweight without inventing correction', () => {
  const r = compute({ sex: 'female', height: 166, weight: 60.5, muscle: null, distance: 210 });
  assert.equal(r.composite, 50);
  assert.equal(r.lambda, null);
  assert.equal(r.correction, 1);
  close(r.baselineMeters, 258 * 0.9144);
  const weighted = compute({ ...base, height: 181, weight: 69, muscle: null });
  assert.equal(weighted.composite, 54);
});
test('tall lean example follows approved interpolation, not supplied illustrative percentiles', () => {
  const r = compute({ ...base, height: 183, weight: 68, muscle: 32 });
  close(r.heightPercentile, 70 + 2 / 3 * 20);
  close(r.weightPercentile, 25);
  close(r.musclePercentile, 30);
  close(r.composite, r.heightPercentile * .35 + 25 * .15 + 30 * .50);
  close(r.correction, 1 - .015 * (r.heightPercentile / 30 - 1.15));
});
test('correction bounds, endpoint clamping and efficiency above 100', () => {
  const tall = compute({ ...base, height: 200, muscle: 25 });
  assert.equal(tall.correction, .96);
  assert.ok(tall.outside.includes('height'));
  const compact = compute({ ...base, height: 160, muscle: 40 });
  close(compact.correction, 1 + .020 * (.85 - 10 / 90));
  assert.ok(compact.correction <= 1.05);
  const high = compute({ ...base, distance: 600 });
  assert.ok(high.efficiency > 100);
});
test('invalid and missing data explicitly hold calculation', () => {
  for (const patch of [{ sex: '' }, { sex: 'constructor' }, { weight: null }, { weight: 25 }, { distance: 0 }, { muscle: NaN }, { muscle: 19 }, { muscle: 80 }]) {
    assert.equal(compute({ ...base, ...patch }).status, 'inputs');
  }
});
test('unit gain preserves original results and central body anchors stay unchanged', () => {
  const r = compute({ ...base, sensitivity: { heightGain: 3, weightGain: 3 } });
  close(r.baselineMeters, compute(base).baselineMeters);
  close(r.sensitivityFactor, 1);
  const input = { ...base, height: 183, weight: 68, muscle: 32 };
  close(compute({ ...input, sensitivity: { heightGain: 1, weightGain: 1 } }).baselineMeters, compute(input).baselineMeters);
});
test('height and weight gains amplify measured log changes independently', () => {
  for (const [key, gain] of [['height', 'heightGain'], ['weight', 'weightGain']]) {
    const a = { ...base, [key]: key === 'height' ? 171 : 69 };
    const b = { ...base, [key]: key === 'height' ? 181 : 83 };
    const settings = { heightGain: 1, weightGain: 1, [gain]: 1.5 };
    const original = Math.log(compute(b).baselineMeters / compute(a).baselineMeters);
    const adjusted = Math.log(compute({ ...b, sensitivity: settings }).baselineMeters / compute({ ...a, sensitivity: settings }).baselineMeters);
    close(adjusted, original * 1.5);
  }
});
test('original comparison stays visible, no extrapolation, and invalid gains fail', () => {
  const settings = { heightGain: 1.5, weightGain: 1.5 };
  const input = { ...base, height: 183, weight: 68, muscle: 32 };
  const r = compute({ ...input, sensitivity: settings });
  close(r.originalBaselineMeters, compute(input).baselineMeters);
  close(r.originalEfficiency, compute(input).efficiency);
  close(compute({ ...base, height: 184, sensitivity: settings }).baselineMeters,
    compute({ ...base, height: 190, sensitivity: settings }).baselineMeters);
  for (const heightGain of [0, 4, NaN, null]) assert.throws(() => compute({ ...base, sensitivity: { heightGain, weightGain: 1 } }), /sensitivity/);
});
