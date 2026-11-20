import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const context = vm.createContext({
  frontVideo: { videoWidth: 1, videoHeight: 2 },
  sideVideo: { videoWidth: 1, videoHeight: 2 },
  videoFileIdentity: { front: 'video', side: 'video' },
  backswingSourceIdentity: 'video',
  backswingFrames: { top: { time: 1 }, transition: { time: 2 }, downP6: { time: 3 } },
  backswingClassification: { planeChecks: [true, true, true, true, true, true, false], p5ToP6ShallowDelta: 30 },
  getLockedReferenceLineLength: () => 1,
  getSelectedAnalysisClubType: () => 'iron',
});
for (const name of [
  'hasMetric', 'clamp', 'roundToStep', 'rampScore', 'getAnalysisAspect',
  'areVideoSourcesSame', 'getPanelReferenceLength', 'getDownswingSideEvidence',
  'computeFrameMetrics', 'computeThreePointSpread',
  'getF6DownswingSideEvidence', 'computeF6DisplacementObservation', 'computeTempoSequenceReport',
]) {
  const source = html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`));
  assert.ok(source, name);
  vm.runInContext(source[0], context);
}

test('F6 excludes separate C7 and observational release penalties while retaining C7 in the ratio', () => {
  const base = { sequenceBasis6: 'address', sequenceIndex: 1.6, pelvisNetP6: 0.16,
    c7NetP7: 0.089, c7TopShift6: 0.062, releaseIndex: 43, timeDeltaSec: 0.3127 };
  const result = context.computeTempoSequenceReport(base, null);
  assert.equal(result.score100, 80);
  assert.equal(result.sequenceWeight, 1);
  assert.equal(context.computeTempoSequenceReport({ ...base, c7NetP7: 0.01, c7TopShift6: -0.1 }, null).score100, 80);
  assert.equal(context.computeTempoSequenceReport({ ...base, sequenceIndex: 0.75 }, null).score100, 38);
  assert.equal(context.computeTempoSequenceReport({ ...base, sequenceIndex: 1.5 }, null).score100, 75);
  assert.equal(context.computeTempoSequenceReport({ ...base, sequenceIndex: 2 }, null).score100, 100);
  assert.equal(context.computeTempoSequenceReport({ ...base, sequenceIndex: 3, pelvisNetP6: 0.025 }, null).score100, 50);
  assert.equal(context.computeTempoSequenceReport({ ...base, sequenceBasis6: 'top-unsigned', sequenceIndex: 1.2 }, null).score100, 80);
  assert.equal(context.computeTempoSequenceReport({ ...base, sequenceIndex: null }, { penalty: 20 }).score100, null);
  assert.equal(context.computeTempoSequenceReport({ ...base, pelvisNetP6: null }, { penalty: 20 }).score100, null);
  const withPath = context.computeTempoSequenceReport(base, { penalty: 30 });
  assert.equal(withPath.score100, 79);
  assert.equal(withPath.sequenceWeight, 0.9);
  assert.equal(withPath.downswingWeight, 0.1);
});

test('F6 accepts path only for the same source and matching, ordered swing checkpoints', () => {
  const fm = { phaseTimeA6: 3.05, phaseTimeB6: 3.3 };
  assert.ok(context.getF6DownswingSideEvidence(fm));
  assert.ok(context.getF6DownswingSideEvidence({ ...fm, phaseTimeA6: 3.1 }));
  assert.equal(context.getF6DownswingSideEvidence({ ...fm, phaseTimeA6: 3.11 }), null);
  assert.equal(context.getF6DownswingSideEvidence({ ...fm, phaseTimeB6: 2.9 }), null);
  context.backswingFrames.transition.time = 3.2;
  assert.equal(context.getF6DownswingSideEvidence(fm), null);
  context.backswingFrames.transition.time = 2;
  context.backswingSourceIdentity = 'other';
  assert.equal(context.getF6DownswingSideEvidence(fm), null);
  context.backswingSourceIdentity = 'video';
  context.videoFileIdentity.side = 'other';
  assert.equal(context.getF6DownswingSideEvidence(fm), null);
  context.videoFileIdentity.side = 'video';
});

test('F6 displacement observation uses aspect-corrected endpoint distances and rejects unreliable inputs', () => {
  const a = { handNormX6: 0, handNormY6: 0, headNormX6: 0, headNormY6: 0 };
  const b = { handNormX6: 0.2, handNormY6: 0, headNormX6: 0, headNormY6: 0.4 };
  const calculate = (start = a, end = b, time = 0.2, same = true) =>
    context.computeF6DisplacementObservation(start, end, time, same);
  const result = calculate();
  assert.ok(Math.abs(result.ratio - 4) < 1e-10);
  assert.ok(Math.abs(result.handShift - 0.1) < 1e-10);
  assert.equal(calculate(a, b, 0.2, false).reason, 'source');
  assert.equal(calculate(a, b, 0).reason, 'time');
  assert.equal(calculate(a, { ...b, headNormY6: null }).reason, 'points');
  assert.equal(calculate(a, { ...b, handNormX6: 0.01 }).reason, 'smallHand');
  assert.equal(calculate(a, { ...b, crossCorrected: true }).reason, 'correction');
  const points = (hand, head) => [{ type: 'handMid', ...hand }, { type: 'clubHead', ...head }];
  const metricsA = context.computeFrameMetrics(points({ x: 0, y: 0 }, { x: 0, y: 0 }), [], 'frame6', 1, 1, 0.5);
  const metricsB = context.computeFrameMetrics(points({ x: 0.2, y: 0 }, { x: 0, y: 0.4 }), [], 'frame6', 1, 1, 0.5);
  assert.ok(Math.abs(calculate(metricsA, metricsB).ratio - 4) < 1e-10);
  context.sideVideo.videoWidth = 0;
  assert.equal(calculate().reason, 'aspect');
  context.sideVideo.videoWidth = 1;
  context.getLockedReferenceLineLength = () => null;
  assert.equal(calculate().reason, 'reference');
});
