import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const context = vm.createContext({
  getSelectedAnalysisClubType: () => 'driver',
  scoreHeadPelvisCoupling: () => null,
});

for (const name of [
  'clamp', 'hasMetric', 'smoothstep01', 'bandScore', 'rampScore',
  'roundToStep', 'combineMetricScores', 'computeRawSegmentScore',
]) {
  const source = html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`));
  assert.ok(source, name);
  vm.runInContext(source[0], context);
}

const scoreShaftAngle = angle => context.computeRawSegmentScore({
  fm: { topShaftAngleDeg: angle },
}, 'frame1');

test('driver F1 top-shaft scoring remains unchanged', () => {
  context.getSelectedAnalysisClubType = () => 'driver';
  assert.equal(scoreShaftAngle(-3), 10);
  assert.equal(scoreShaftAngle(5), 10);
  assert.equal(scoreShaftAngle(-11.5), 5);
  assert.equal(scoreShaftAngle(12.5), 5);
  assert.equal(scoreShaftAngle(-20), 0);
  assert.equal(scoreShaftAngle(20), 0);
});

test('iron F1 accepts compact tops and penalizes overswing more steeply', () => {
  context.getSelectedAnalysisClubType = () => 'iron';
  assert.equal(scoreShaftAngle(0), 10);
  assert.equal(scoreShaftAngle(15), 10);
  assert.equal(scoreShaftAngle(18), 10);
  assert.equal(scoreShaftAngle(20), 9.5);
  assert.equal(scoreShaftAngle(-1), 9.5);
  assert.equal(scoreShaftAngle(-5), 5);
  assert.equal(scoreShaftAngle(-10), 0);
  assert.equal(scoreShaftAngle(-20), 0);
  assert.equal(scoreShaftAngle(26.5), 5);
  assert.equal(scoreShaftAngle(35), 0);
  assert.equal(scoreShaftAngle(60), 0);
  assert.equal(scoreShaftAngle(null), null);
});

test('iron shaft overswing affects its 30% share of the complete F1 score', () => {
  context.getSelectedAnalysisClubType = () => 'iron';
  const fm = {
    spineAngleDelta: 0, xFactorDelta: -150,
    c7XPercent: 0, c7YPercent: 0, topShaftAngleDeg: -5,
  };
  assert.equal(context.computeRawSegmentScore({ fm }, 'frame1'), 8.5);
  fm.topShaftAngleDeg = 15;
  assert.equal(context.computeRawSegmentScore({ fm }, 'frame1'), 10);
});
