import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const context = vm.createContext({
  Math,
  hasMetric: Number.isFinite,
  getFrameScoreParts: () => [{ value: 1, weight: 1 }],
  getCompressionTransitionEvidence: () => ({ f4Bonus: 0, frame4ReferenceFit: 0 }),
});

for (const name of [
  'clamp', 'smoothstep01', 'bandScore', 'rampScore', 'roundToStep',
  'weightedAvg01', 'combineMetricScores', 'scoreExponentialReferenceBand', 'scoreImpactHeadPelvisGap',
  'scoreImpactDownswingCoupling', 'getThreePointProfilePenalty',
  'computeRawSegmentScore', 'computeSegmentScore',
]) {
  const source = html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`));
  assert.ok(source, name);
  vm.runInContext(source[0], context);
}

test('F4 caps overlapping experimental trajectory and separation deductions at three points', () => {
  const result = { fm: { impactSeparationDelta4: 0, c7CouplingDown4: 2 } };

  assert.equal(context.computeSegmentScore(result, 'frame4'), 7);
  assert.ok(result.fm.headPelvisPenalty4 > 2.9);
  assert.equal(result.fm.compressionProfilePenalty4, 1.5);
  assert.equal(result.fm.totalExperimentalPenalty4, 3);
});
