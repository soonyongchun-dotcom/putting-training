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

test('F1 top-shaft full-score ranges vary by club while retaining ramp widths', () => {
  context.getSelectedAnalysisClubType = () => 'driver';
  assert.equal(scoreShaftAngle(-3), 10);
  assert.equal(scoreShaftAngle(5), 10);
  assert.equal(scoreShaftAngle(-11.5), 5);
  assert.equal(scoreShaftAngle(12.5), 5);
  assert.equal(scoreShaftAngle(-20), 0);
  assert.equal(scoreShaftAngle(20), 0);

  context.getSelectedAnalysisClubType = () => 'iron';
  assert.equal(scoreShaftAngle(-3), 10);
  assert.equal(scoreShaftAngle(10), 10);
  assert.equal(scoreShaftAngle(-11.5), 5);
  assert.equal(scoreShaftAngle(18.5), 5);
  assert.equal(scoreShaftAngle(-20), 0);
  assert.equal(scoreShaftAngle(27), 0);
});
