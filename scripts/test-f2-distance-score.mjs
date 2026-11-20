import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
let selectedClubType = 'iron';
const context = vm.createContext({
  frameMetricsHistory: {},
  frameSideMetricsHistory: {},
  frontVideo: { videoWidth: 2, videoHeight: 1 },
  sideVideo: { videoWidth: 2, videoHeight: 1 },
  areVideoSourcesSame: () => true,
  getLockedReferenceLineLength: () => 1,
  getDownswingSideEvidence: () => null,
  getF6DownswingSideEvidence: () => null,
  getC7HandExtensionEvidence: () => ({ available: false }),
  getSwingTargetSign: () => null,
  getSelectedAnalysisClubType: () => selectedClubType,
});
for (const name of [
  'clamp', 'hasMetric', 'roundToStep', 'smoothstep01', 'rampScore', 'bandScore', 'scoreExponentialReferenceBand',
  'scoreDriverTrailShift', 'computeTempoSequenceReport',
  'scoreLagAngle', 'scoreImpactAlignment', 'scoreImpactHeadPelvisGap', 'scoreImpactDownswingCoupling',
  'getImpactAlignment', 'weightedAvg01', 'getF2MetricBreakdown', 'getFrameScoreParts', 'getLinearEngineEvidence',
  'computeModernSwingProximity',
  'combineMetricScores', 'computeRawSegmentScore', 'computeSegmentScore',
  'computeFrameMetrics', 'computeThreePointSpread', 'getAnalysisAspect',
  'computeF6DisplacementObservation',
  'getPanelReferenceLength', 'referenceRatio', 'referencePositionX',
  'getThreePointSpreadChange', 'computeMetricDelta', 'createDeltaResult',
]) {
  const source = html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`));
  assert.ok(source, name);
  vm.runInContext(source[0], context);
}
context.getCompressionTransitionEvidence = () => ({ available: false, f4Bonus: 0 });
context.getThreePointProfilePenalty = () => ({ fit: 0, penalty: 0 });
context.getLateRadiusExpansion = () => null;

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
    radiusCompressionRatio: 0.1, pelvisLateralDelta: 0.25, c7ReferenceDelta2: 0.02,
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

test('F2 C7 deduction follows the F1/F4 reference-line band and is capped by the pelvis score', () => {
  for (const [pelvis, expected] of [[0, 0], [0.125, 0.5], [0.25, 1], [0.499, 1], [-0.25, 1]]) {
    close(context.getF2MetricBreakdown({ pelvisLateralDelta: pelvis, c7ReferenceDelta2: 0.02 }).coreShiftScore, expected);
  }
  for (const [shift, penalty] of [[0, 0], [0.02, 0], [0.07, 2], [-0.07, 2], [0.12, 4], [0.2, 4]]) {
    const breakdown = context.getF2MetricBreakdown({ pelvisLateralDelta: 0.25, c7ReferenceDelta2: shift });
    close(breakdown.appliedC7PenaltyPoints, penalty);
  }
  const capped = context.getF2MetricBreakdown({ pelvisLateralDelta: 0.125, c7ReferenceDelta2: 0.12 });
  close(capped.appliedC7PenaltyPoints, 2);
  close(capped.coreShiftScore, 0);
  const noC7 = context.getF2MetricBreakdown({ pelvisLateralDelta: 0.25, c7LateralDelta2: 0.3 });
  assert.equal(noC7.appliedC7PenaltyPoints, null);
  close(noC7.coreShiftScore, 1);
  assert.equal(context.getF2MetricBreakdown({ c7ReferenceDelta2: 0.1 }).coreShiftScore, null);
  assert.equal(context.getF2MetricBreakdown({ pelvisLateralDelta: 0.25, c7ReferenceDelta2: 0.05, distanceComparable: false }).coreShiftScore, null);
  assert.equal(context.computeSegmentScore({ fm: {
    laggingAngleBDeg: 53.9, coreHandReferenceRatio: 0.336,
    pelvisLateralDelta: 0.499, c7ReferenceDelta2: 0.07,
  } }, 'frame2'), 8);
});

test('driver F2 pelvis-shift score and LSE fit use the 22–32% band with shared decay 4', () => {
  const previousClubType = selectedClubType;
  selectedClubType = 'driver';
  try {
    for (const shift of [0.22, 0.27, 0.32]) {
      close(context.getF2MetricBreakdown({ pelvisLateralDelta: shift }).pelvisShiftScore, 1);
      close(context.getLinearEngineEvidence({ pelvisLateralDelta: shift }, null, 1).fit, 1);
    }
    assert.equal(context.getLinearEngineEvidence({ pelvisLateralDelta: 0.27 }, null, 1).calibration, 'driver-shift-band-22-32');
    close(context.getF2MetricBreakdown({ pelvisLateralDelta: 0.308 }).pelvisShiftScore, 1);
    const fitAt10Point3Percent = Math.exp(-4 * (0.22 - 0.103));
    close(context.getF2MetricBreakdown({ pelvisLateralDelta: 0.103 }).pelvisShiftScore, fitAt10Point3Percent);
    close(context.getLinearEngineEvidence({ pelvisLateralDelta: 0.103 }, null, 1).fit, fitAt10Point3Percent);
    assert.equal(context.computeSegmentScore({ fm: {
      laggingAngleBDeg: 59.7,
      coreHandReferenceRatio: 0.322,
      pelvisLateralDelta: 0.103,
      c7ReferenceDelta2: 0.02,
      distanceComparable: true,
    } }, 'frame2'), 8);
    assert.equal(context.computeSegmentScore({ fm: {
      laggingAngleBDeg: 46.90146198915187,
      coreHandReferenceRatio: 0.3032924489966823,
      pelvisLateralDelta: 0.3078737818387437,
      c7ReferenceDelta2: 0.02,
      distanceComparable: true,
    } }, 'frame2'), 10);
    close(context.getF2MetricBreakdown({ pelvisLateralDelta: 0.12 }).pelvisShiftScore, Math.exp(-0.4));
    close(context.getF2MetricBreakdown({ pelvisLateralDelta: 0.42 }).pelvisShiftScore, Math.exp(-0.4));
  } finally {
    selectedClubType = previousClubType;
  }
});

test('F4 impact alignment uses the swapped driver and iron score ranges', () => {
  const previousClubType = selectedClubType;
  try {
    selectedClubType = 'driver';
    close(context.scoreImpactAlignment(140), 0);
    close(context.scoreImpactAlignment(157.5), 0.5);
    assert.ok(context.scoreImpactAlignment(160) < 1);
    close(context.scoreImpactAlignment(175), 1);
    selectedClubType = 'iron';
    close(context.scoreImpactAlignment(140), 0);
    close(context.scoreImpactAlignment(150), 0.5);
    close(context.scoreImpactAlignment(160), 1);
    close(context.scoreImpactAlignment(175), 1);
  } finally {
    selectedClubType = previousClubType;
  }
});

test('modern swing proximity averages F1–F4 only and requires all four scores', () => {
  const previousGetStoredSegmentScore = context.getStoredSegmentScore;
  const requestedFrames = [];
  const scores = { frame1: 4, frame2: 6, frame3: 8, frame4: 10, frame5: null, frame6: null };
  try {
    context.getStoredSegmentScore = frame => {
      requestedFrames.push(frame);
      return scores[frame];
    };
    assert.equal(context.computeModernSwingProximity(), 70);
    assert.deepEqual(requestedFrames, ['frame1', 'frame2', 'frame3', 'frame4']);

    scores.frame4 = null;
    assert.equal(context.computeModernSwingProximity(), null);
  } finally {
    context.getStoredSegmentScore = previousGetStoredSegmentScore;
  }
});

test('F6 keeps the driver Release Index observational and out of the score', () => {
  const previousClubType = selectedClubType;
  selectedClubType = 'driver';
  try {
    const fm = {
      sequenceIndex: 3,
      sequenceBasis6: 'address',
      pelvisNetP6: 0.056,
      c7NetP7: -0.062,
      c7TopShift6: 0.008,
      releaseIndex: 21,
    };
    const withReleaseIndex = context.computeTempoSequenceReport(fm, null);
    const withoutReleaseIndex = context.computeTempoSequenceReport({ ...fm, releaseIndex: null }, null);
    assert.equal(withReleaseIndex.sRelease, 100);
    assert.equal(withReleaseIndex.releaseWeight, 0);
    assert.equal(withReleaseIndex.score100, withoutReleaseIndex.score100);
  } finally {
    selectedClubType = previousClubType;
  }
});

test('F4 applies the same head-pelvis separation deduction to drivers and irons', () => {
  const previousClubType = selectedClubType;
  const penalties = {};
  const fm = {
    armShaftAngleBDeg: 175.8,
    c7XPercent: 6.2,
    c7YPercent: 1.0,
    impactSeparationDelta4: 0.7,
    c7CouplingDown4: 0.57,
    distanceComparable: true,
  };
  try {
    for (const clubType of ['driver', 'iron']) {
      selectedClubType = clubType;
      const result = { fm: { ...fm } };
      context.computeSegmentScore(result, 'frame4');
      penalties[clubType] = result.fm.headPelvisPenalty4;
    }
    close(penalties.driver, penalties.iron);
    close(penalties.driver, 3 * (2 - Math.exp(-0.6)) / 2);
  } finally {
    selectedClubType = previousClubType;
  }
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
  context.getLockedReferenceLineLength = () => 1;
});

test('F2 scores C7 against the reference line while preserving torso-relative pelvis and coupling', () => {
  const result = context.createDeltaResult(
    { frameMetrics: { pelvisNormX: 0.4, c7NormX2: 0.4, torsoRefDist: 0.2 } },
    { frameMetrics: { pelvisNormX: 0.45, c7NormX2: 0.42 } },
    'frame2',
  );
  close(result.fm.pelvisLateralDelta, 0.5);
  close(result.fm.pelvisReferenceDelta2, 0.1);
  close(result.fm.c7LateralDelta2, 0.2);
  close(result.fm.c7ReferenceDelta2, 0.04);
  const breakdown = context.getF2MetricBreakdown(result.fm);
  close(breakdown.headPelvisCoupling, 0.4);
  close(breakdown.appliedC7PenaltyPoints, 4 * (1 - context.bandScore(4, 2, 12)));
  context.getLockedReferenceLineLength = () => null;
  const missing = context.createDeltaResult(
    { frameMetrics: { pelvisNormX: 0.4, c7NormX2: 0.4, torsoRefDist: 0.2 } },
    { frameMetrics: { pelvisNormX: 0.45, c7NormX2: 0.42 } },
    'frame2',
  );
  assert.equal(missing.fm.c7ReferenceDelta2, null);
  context.getLockedReferenceLineLength = () => 1;
});
