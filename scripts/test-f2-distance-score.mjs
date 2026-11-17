import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const context = vm.createContext({
  frameMetricsHistory: {},
  frameSideMetricsHistory: {},
  frontVideo: { videoWidth: 2, videoHeight: 1 },
  sideVideo: { videoWidth: 2, videoHeight: 1 },
  areVideoSourcesSame: () => true,
  getLockedReferenceLineLength: () => 1,
  getDownswingSideEvidence: () => null,
  getSwingTargetSign: () => null,
});
for (const name of [
  'clamp', 'hasMetric', 'roundToStep', 'scoreExponentialReferenceBand',
  'scoreLagAngle', 'getF2MetricBreakdown', 'getFrameScoreParts',
  'combineMetricScores', 'computeRawSegmentScore', 'computeSegmentScore',
  'computeFrameMetrics', 'computeThreePointSpread', 'getAnalysisAspect',
  'getPanelReferenceLength', 'referenceRatio', 'referencePositionX',
  'getThreePointSpreadChange', 'computeMetricDelta', 'createDeltaResult',
]) {
  const source = html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`));
  assert.ok(source, name);
  vm.runInContext(source[0], context);
}

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('F2 angle and reference-line distance use the specified linear thresholds', () => {
  for (const [angle, expected] of [[0, 1], [55, 1], [72.5, 0.5], [90, 0], [180, 0]]) {
    close(context.scoreLagAngle(angle), expected);
  }
  for (const [distance, expected] of [[0, 1], [0.35, 1], [0.425, 0.5], [0.5, 0], [0.55, 0]]) {
    close(context.getF2MetricBreakdown({ coreHandReferenceRatio: distance }).distanceScore, expected);
  }
  assert.equal(context.scoreLagAngle(-1), null);
  assert.equal(context.scoreLagAngle(181), null);
  assert.equal(context.getF2MetricBreakdown({ coreHandReferenceRatio: null }).distanceScore, null);
  assert.equal(context.getF2MetricBreakdown({ coreHandReferenceRatio: -0.1 }).distanceScore, null);
});

test('F2 combines angle, distance and pelvis/C7 weights, independently of top compression', () => {
  const fm = {
    laggingAngleBDeg: 72.5, coreHandReferenceRatio: 0.425,
    radiusCompressionRatio: 0.1, pelvisLateralDelta: 0.25, c7LateralDelta2: 0.05,
  };
  const result = { fm };
  assert.equal(context.computeSegmentScore(result, 'frame2'), 7);
  fm.radiusCompressionRatio = 0.9;
  assert.equal(context.computeSegmentScore(result, 'frame2'), 7);
  fm.coreHandReferenceRatio = null;
  assert.equal(context.computeSegmentScore(result, 'frame2'), 7.5);
  assert.equal(result.scoreCoverage.available, 2);
  assert.equal(context.computeSegmentScore({ fm: { visibilityLimited: true, radiusCompressionRatio: 0.4 } }, 'frame2'), null);
});

test('F2 pelvis score and C7 deduction are linear and capped within the four-point component', () => {
  for (const [pelvis, expected] of [[0, 0], [0.125, 0.5], [0.25, 1], [0.499, 1], [-0.25, 1]]) {
    close(context.getF2MetricBreakdown({ pelvisLateralDelta: pelvis, c7LateralDelta2: 0.05 }).coreShiftScore, expected);
  }
  const sample = context.getF2MetricBreakdown({ pelvisLateralDelta: 0.499, c7LateralDelta2: 0.299 });
  close(sample.appliedC7PenaltyPoints, 2.49);
  close(sample.coreShiftScore * 4, 1.51);
  const fractional = context.getF2MetricBreakdown({ pelvisLateralDelta: 0.25, c7LateralDelta2: -0.055 });
  close(fractional.appliedC7PenaltyPoints, 0.05);
  const capped = context.getF2MetricBreakdown({ pelvisLateralDelta: 0.125, c7LateralDelta2: 0.5 });
  close(capped.appliedC7PenaltyPoints, 2);
  close(capped.coreShiftScore, 0);
  const noC7 = context.getF2MetricBreakdown({ pelvisLateralDelta: 0.25, c7LateralDelta2: null });
  assert.equal(noC7.appliedC7PenaltyPoints, null);
  close(noC7.coreShiftScore, 1);
  assert.equal(context.getF2MetricBreakdown({ c7LateralDelta2: 0.1 }).coreShiftScore, null);
  assert.equal(context.getF2MetricBreakdown({ pelvisLateralDelta: 0.25, c7LateralDelta2: 0.05, distanceComparable: false }).coreShiftScore, null);
  assert.equal(context.computeSegmentScore({ fm: {
    laggingAngleBDeg: 53.9, coreHandReferenceRatio: 0.336,
    pelvisLateralDelta: 0.499, c7LateralDelta2: 0.299,
  } }, 'frame2'), 7.5);
});

test('F2 carries the aspect-corrected pelvis–hands distance relative to the B reference line', () => {
  const points = [
    { type: 'handMid', x: 0.4, y: 0.4 },
    { type: 'pelvis', x: 0.5, y: 0.55 },
    { type: 'shoulder', x: 0.4, y: 0.2 },
    { type: 'club', x: 0.5, y: 0.4 },
  ];
  const measured = context.computeFrameMetrics(points, [], 'frame2', 1, 480, 2);
  close(measured.coreHandRadiusRaw, 0.25);
  measured.coreHandReferenceRatio = context.referenceRatio(measured.coreHandRadiusRaw, 'side');
  const result = context.createDeltaResult({ frameMetrics: {} }, { frameMetrics: measured }, 'frame2');
  close(result.fm.coreHandReferenceRatio, 0.25);
  close(context.getF2MetricBreakdown(result.fm).distanceScore, 1);
  context.getLockedReferenceLineLength = () => null;
  measured.coreHandReferenceRatio = context.referenceRatio(measured.coreHandRadiusRaw, 'side');
  assert.equal(context.createDeltaResult({ frameMetrics: {} }, { frameMetrics: measured }, 'frame2').fm.coreHandReferenceRatio, null);
});
