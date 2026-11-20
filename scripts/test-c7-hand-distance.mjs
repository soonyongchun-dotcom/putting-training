import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const context = vm.createContext({
  sideVideo: { videoWidth: 1, videoHeight: 2 },
  frontVideo: { videoWidth: 1, videoHeight: 2 },
  frameStateHistory: { front: {}, side: { frame2: { videoTime: 1, aspectRatio: 0.5 }, frame4: { videoTime: 2, aspectRatio: 0.5 } } },
  frameMetricsHistory: {},
  frameSideMetricsHistory: {},
  segmentDeltaHistory: { frame4: { fm: {} } },
  areVideoSourcesSame: () => true,
  getPanelReferenceLength: () => 1,
  getSelectedAnalysisClubType: () => 'iron',
  getStoredSegmentScore: frame => frame === 'frame6' ? 8 : null,
  getLateRadiusExpansion: () => null,
  getSwingUiText: ko => ko,
});
for (const name of [
  'hasMetric', 'clamp', 'smoothstep01', 'rampScore', 'computeThreePointSpread',
  'computeFrameMetrics', 'getThreePointSpreadChange', 'getC7HandExtensionEvidence', 'getC7HandExtensionReason',
  'getDistanceMotionSummary', 'computeModernSwingProximity', 'snapNearZero', 'formatPercent', 'formatDistanceMotionSummary',
]) {
  const source = html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`));
  assert.ok(source, name);
  vm.runInContext(source[0], context);
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const history = (start, end) => ({ frame2: { c7HandDistanceRaw: start }, frame4: { c7HandDistanceRaw: end } });

test('F2 and F4 extract aspect-corrected C7-to-hands distances from their own landmarks', () => {
  const start = context.computeFrameMetrics([
    { type: 'c7', x: 0.1, y: 0 }, { type: 'handMid', x: 0.3, y: 0 },
  ], [], 'frame2', 1, 1, 0.5);
  const end = context.computeFrameMetrics([
    { type: 'wrist', x: 0.1, y: 0 }, { type: 'handMid', x: 0.3, y: 0.075 },
  ], [], 'frame4', 1, 1, 0.5);
  const duplicate = context.computeFrameMetrics([
    { type: 'c7', x: 0.1, y: 0 }, { type: 'handMid', x: 0.3, y: 0 },
  ], [], 'frame6', 1, 1, 0.5);
  close(start.c7HandDistanceRaw, 0.1);
  close(end.c7HandDistanceRaw, 0.125);
  close(duplicate.c7HandDistanceRaw, 0.1);
});

test('reference-line change scores the agreed 2–6 percentage-point linear range', () => {
  for (const [end, expected] of [[0.36, 0], [0.37, 0], [0.374, 1], [0.39, 5], [0.406, 9], [0.41, 10], [0.42, 10]]) {
    const result = context.getC7HandExtensionEvidence(history(0.35, end));
    assert.equal(result.available, true);
    close(result.score, expected);
  }
  assert.equal(context.getC7HandExtensionEvidence(history(0.35, 0.37)).score, 0);
  assert.equal(context.getC7HandExtensionEvidence(history(0.35, 0.41)).score, 10);
  const scaledReference = context.getPanelReferenceLength;
  context.getPanelReferenceLength = () => 2;
  close(context.getC7HandExtensionEvidence(history(0.7, 0.78)).score, 5);
  context.getPanelReferenceLength = scaledReference;
});

test('valid metric replaces 30% of existing score and changes neither frame scores nor their component weights', () => {
  const input = [8, 8, 8, 8];
  const result = context.getDistanceMotionSummary(input, history(0.35, 0.39));
  close(result.existingScore, 8);
  close(result.c7HandExtension.score, 5);
  close(result.score, 7.1);
  assert.deepEqual(input, [8, 8, 8, 8]);
  assert.match(context.formatDistanceMotionSummary(result), /기존 8.0 × 70% \+ 새 지표 × 30%/);
  context.getStoredSegmentScore = () => null;
  assert.equal(context.getDistanceMotionSummary([null, null, null, null], history(0.35, 0.425)).score, null);
  context.getStoredSegmentScore = frame => frame === 'frame6' ? 8 : null;
});

test('missing or incompatible evidence keeps the existing score and explains why', () => {
  const input = [8, 8, 8, 8], valid = history(0.35, 0.425);
  const check = (evidence, reason) => {
    const summary = context.getDistanceMotionSummary(input, evidence);
    assert.equal(summary.c7HandExtension.reason, reason);
    close(summary.score, 8);
    assert.match(context.formatDistanceMotionSummary(summary), /기존 점수 유지/);
  };
  check(history(null, 0.425), 'points');
  check({ ...valid, frame4: { ...valid.frame4, crossCorrected: true } }, 'correction');
  context.areVideoSourcesSame = () => false; check(valid, 'source');
  context.areVideoSourcesSame = () => true;
  context.frameStateHistory.side.frame4.videoTime = 1; check(valid, 'time');
  context.frameStateHistory.side.frame4.videoTime = 2;
  context.frameStateHistory.side.frame4.aspectRatio = 1; check(valid, 'aspect');
  context.frameStateHistory.side.frame4.aspectRatio = 0.5;
  context.getPanelReferenceLength = () => null; check(valid, 'reference');
  context.getPanelReferenceLength = () => 1;
});

test('valid F6 duplicate measurements are averaged with F2 B and F4 B', () => {
  context.frameStateHistory.front.frame6 = { videoTime: 1.2, aspectRatio: 0.5 };
  context.frameStateHistory.side.frame6 = { videoTime: 2, aspectRatio: 0.5 };
  context.frameMetricsHistory = { frame6: { c7HandDistanceRaw: 0.37 } };
  try {
    const result = context.getC7HandExtensionEvidence(
      { ...history(0.35, 0.41), frame6: { c7HandDistanceRaw: 0.43 } });
    assert.equal(result.available, true);
    close(result.startRatio, 0.36);
    close(result.endRatio, 0.42);
    close(result.changePoints, 6);
    close(result.score, 10);
    assert.equal(result.startSampleCount, 2);
    assert.equal(result.endSampleCount, 2);
    close(result.startSpreadPoints, 2);
    close(result.endSpreadPoints, 2);
  } finally {
    delete context.frameStateHistory.front.frame6;
    delete context.frameStateHistory.side.frame6;
    context.frameMetricsHistory = {};
  }
});

test('duplicate measurements above the 5 pp gate withhold the metric; invalid duplicates are ignored', () => {
  context.frameStateHistory.front.frame6 = { videoTime: 1.2, aspectRatio: 0.5 };
  context.frameMetricsHistory = { frame6: { c7HandDistanceRaw: 0.41 } };
  try {
    // |0.41 − 0.35| = 6 pp > 5 pp → withhold with its own reason.
    const gated = context.getC7HandExtensionEvidence(history(0.35, 0.45));
    assert.equal(gated.available, false);
    assert.equal(gated.reason, 'mismatch');
    assert.match(context.getC7HandExtensionReason('mismatch'), /이중 측정/);
    // Exactly 5 pp passes and is averaged.
    context.frameMetricsHistory = { frame6: { c7HandDistanceRaw: 0.40 } };
    const boundary = context.getC7HandExtensionEvidence(history(0.35, 0.45));
    assert.equal(boundary.available, true);
    close(boundary.startRatio, 0.375);
    // An aspect-mismatched, cross-corrected or post-impact duplicate falls back to the single F2 B sample.
    for (const invalidate of [
      () => { context.frameStateHistory.front.frame6.aspectRatio = 1; },
      () => { context.frameMetricsHistory.frame6.crossCorrected = true; },
      () => { context.frameStateHistory.front.frame6.videoTime = 2; },
    ]) {
      context.frameStateHistory.front.frame6 = { videoTime: 1.2, aspectRatio: 0.5 };
      context.frameMetricsHistory = { frame6: { c7HandDistanceRaw: 0.40 } };
      invalidate();
      const single = context.getC7HandExtensionEvidence(history(0.35, 0.45));
      assert.equal(single.available, true);
      assert.equal(single.startSampleCount, 1);
      close(single.startRatio, 0.35);
    }
  } finally {
    delete context.frameStateHistory.front.frame6;
    context.frameMetricsHistory = {};
  }
});

test('modern swing proximity weights F1–F4 and C7–hands equally, preserving missing-data behavior', () => {
  const scores = { frame1: 4, frame2: 6, frame3: 8, frame4: 10 };
  const previous = context.getStoredSegmentScore;
  context.getStoredSegmentScore = frame => scores[frame] ?? null;
  try {
    context.frameSideMetricsHistory = history(0.35, 0.39);
    close(context.computeModernSwingProximity(), 66);
    context.frameSideMetricsHistory = history(0.35, 0.42);
    close(context.computeModernSwingProximity(), 76);
    scores.frame1 = 5;
    close(context.computeModernSwingProximity(), 78);
    scores.frame1 = 4;
    context.frameSideMetricsHistory = history(null, 0.42);
    close(context.computeModernSwingProximity(), 70);
    context.frameSideMetricsHistory = history(0.35, 0.42);
    context.areVideoSourcesSame = () => false;
    close(context.computeModernSwingProximity(), 70);
    context.areVideoSourcesSame = () => true;
    scores.frame4 = null;
    assert.equal(context.computeModernSwingProximity(), null);
  } finally {
    context.getStoredSegmentScore = previous;
    context.areVideoSourcesSame = () => true;
    context.frameSideMetricsHistory = {};
  }
});
