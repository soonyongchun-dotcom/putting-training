import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { swingReportFixtures, engineCalibrationFixtures, verticalCalibrationFixtures,
  type3PhaseFixtures, frameTransitionFixtures } from './swing-report-fixtures.mjs';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const context = vm.createContext({
  uiLanguage: 'en',
  frameEditMode: false,
  ANALYSIS_FRAME_IDS: ['frame1', 'frame2', 'frame3', 'frame4', 'frame5', 'frame6'],
  areVideoSourcesSame: () => false,
  frontVideo: { videoWidth: 1, videoHeight: 1 },
  sideVideo: { videoWidth: 1, videoHeight: 1 },
  getLockedReferenceLineLength: () => 1,
  getSwingUiText: (ko, en) => context.uiLanguage === 'en' ? en : ko,
  getDownswingSideEvidence: () => null,
  segmentDeltaHistory: {},
  frameMetricsHistory: {},
  segmentScoreHistory: {},
  frameSideMetricsHistory: {},
  frameStateHistory: { front: {}, side: {} },
  updateSegmentComparisonCard: () => {},
  showGuide: () => {},
});

function loadFunction(name) {
  const source = html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`));
  assert.ok(source, name);
  vm.runInContext(source[0], context);
}

for (const name of [
  'clamp', 'hasMetric', 'smoothstep01', 'bandScore', 'rampScore', 'roundToStep',
  'getForwardDrift', 'getSwingTargetSign', 'scoreHeadPelvisCoupling', 'scoreImpactHeadPelvisGap',
  'computeHeadPelvisDifferentialShift', 'getHeadPelvisSeparationFit',
  'scoreExponentialReferenceBand', 'scoreImpactDownswingCoupling',
  'computeFrameMetrics', 'computeArcCompactScore', 'computeTransferScore',
  'computeImpactScore', 'applyProjectionNormalization', 'computeGroundForceTransitionReport',
  'computeTempoSequenceReport', 'refreshFrameRadiusExpansion',
  'computeThreePointSpread', 'getThreePointSpreadChange', 'updateThreePointSpreadDisplay',
  'combineMetricScores', 'computeSegmentScore', 'countAvailableMetrics',
  'computeRawSegmentScore', 'formatFrameScoreCalibration',
  'scoreLagAngle', 'scoreP6LagRetention', 'getImpactAlignment', 'getLateRadiusExpansion', 'scoreLateRadiusExpansion',
  'getF2MetricBreakdown', 'formatF2ProReferenceComparison',
  'getFrameScoreParts', 'getThreePointDirectionFit', 'getPowerEngineDecision',
  'getVerticalEngineEvidence', 'formatEngineEvidence',
  'getVerticalMotionDiagnostics', 'formatVerticalMotionDiagnostics',
  'getType3CombinedEvidence', 'formatType3CombinedEvidence',
  'getLinearEngineEvidence', 'formatLinearEngineEvidence',
  'getEngineCoactivation', 'formatEngineCoactivation',
  'formatPowerEngineRules',
  'getDistanceMotionSummary', 'formatDistanceMotionSummary',
  'getR10ConsistencyPercent', 'combineConsistencyScores',
  'buildAllFramesNarrative',
  'areFramePointsComplete', 'getNextAnalysisFrame', 'continueFrameSelection',
  'computePhaseTimeDelta', 'getMotionSearchRequest', 'advanceGuideStep', 'isPanelComplete',
  'getFrameMaxPoints',
  'getThreePointEngineEvidence', 'combineEngineCompressionEvidence', 'weightedAvg01',
  'getCompressionTransitionEvidence',
  'getThreePointProfilePenalty',
  'classifySwingType', 'getStoredArmShaftDelta',
  'findNearestPointIndex', 'refreshStoredFrameAnalyses', 'hasProjectFrameInputs',
  'clearDerivedAnalysisState', 'reuseSharedFramePoints',
  'getReusableFrameGroup',
  'deletePoint', 'saveFrameInputState', 'getGuideStepForPoints', 'getAutoPointType',
  'addPoint',
  'getAnalysisAspect', 'getPanelReferenceLength', 'referenceRatio', 'referencePositionX',
  'getReferenceLineLengthNorm', 'computeHeightPercentDisplacement',
]) loadFunction(name);
const typeStart = html.indexOf('  const FRAME_POINT_TYPES =');
const typeEnd = html.indexOf('  function getReusableFrameGroup(', typeStart);
assert.ok(typeStart >= 0 && typeEnd > typeStart);
vm.runInContext(html.slice(typeStart, typeEnd), context);
loadFunction('hasFramePointType');
const translationStart = html.indexOf('  const UI_TRANSLATIONS_EN =');
const translationEnd = html.indexOf('  let uiLanguage =', translationStart);
vm.runInContext(html.slice(translationStart, translationEnd), context);
loadFunction('translateUiText');

const point = (type, x, y) => ({ type, x, y });

test('R10 consistency uses the fixed 1.5-sigma center ratio and combines 50:50', () => {
  const ellipseRatio = context.getR10ConsistencyPercent([
    { mahalanobis: 0 }, { mahalanobis: 1.49 }, { mahalanobis: 1.5 }, { mahalanobis: 1.51 },
  ], true);
  assert.equal(ellipseRatio, 75);
  const axisRatio = context.getR10ConsistencyPercent([
    { distanceZ: 1.5, sideZ: 0 }, { distanceZ: 0, sideZ: -1.5 },
    { distanceZ: 1.51, sideZ: 0 }, { distanceZ: 0, sideZ: 0 },
  ], false);
  assert.equal(axisRatio, 75);
  assert.equal(context.combineConsistencyScores(80, 60), 70);
  assert.equal(context.getR10ConsistencyPercent([{ mahalanobis: 0 }], true), null);
  assert.equal(context.combineConsistencyScores(80, null), null);
});

test('all-frame interpretation includes six sections and distinguishes unanalyzed frames', () => {
  const original = {
    deltas: context.segmentDeltaHistory,
    scores: context.segmentScoreHistory,
    metrics: context.frameMetricsHistory,
    sideMetrics: context.frameSideMetricsHistory,
    build: context.buildSwingNarrative,
  };
  try {
    context.segmentDeltaHistory = { frame1: { fm: {} }, frame4: { fm: {} }, frame5: { fm: {} } };
    context.segmentScoreHistory = { frame1: 8.5, frame4: 7.25, frame5: 9.3 };
    context.frameMetricsHistory = { frame1: { _radiusA: 1, _radiusB: 0.8 }, frame4: {}, frame5: {} };
    context.frameSideMetricsHistory = { frame1: {}, frame4: {}, frame5: {} };
    context.buildSwingNarrative = (_front, _side, _delta, frame) => `<div>${frame} interpretation</div>`;

    const html = context.buildAllFramesNarrative();
    for (let frame = 1; frame <= 6; frame++) {
      assert.match(html, new RegExp(`Frame ${frame}`));
    }
    assert.match(html, /frame1 interpretation/);
    assert.match(html, /frame4 interpretation/);
    assert.match(html, /frame5 interpretation/);
    assert.match(html, /No A\/B analysis is available for this frame yet\./);
    assert.ok(html.includes('8.5 / 10'));
    assert.ok(html.includes('7.3 / 10'));
    assert.ok(html.includes('93.0 / 100'));
  } finally {
    context.segmentDeltaHistory = original.deltas;
    context.segmentScoreHistory = original.scores;
    context.frameMetricsHistory = original.metrics;
    context.frameSideMetricsHistory = original.sideMetrics;
    context.buildSwingNarrative = original.build;
  }
});

function pointsFor(frame, handX = 0.8) {
  const coreType = ['frame3', 'frame4'].includes(frame) ? 'pelvisCenter' : 'pelvis';
  const points = [
    point('wrist', 0.35, 0.2), point('club', 0.5, 0.35),
    point('shoulder', 0.65, 0.4), point('pelvis', 0.45, 0.6),
    point('c7', 0.5, 0.2), point('handMid', handX, 0.6),
    point('clubHead', 0.9, 0.1), point('clubHeadTop', 0.95, 0.05),
  ];
  const core = points.find(p => p.type === coreType);
  if (core) { core.x = 0.5; core.y = 0.6; }
  else points.push(point(coreType, 0.5, 0.6));
  return points;
}
const metrics = (frame, points) => context.computeFrameMetrics(points, [], frame, 1, 480, 1);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('reference distances correct aspect and A/B scale without height-dependent percentage changes', () => {
  const old = {
    frontVideo: context.frontVideo, sideVideo: context.sideVideo,
    getLockedReferenceLineLength: context.getLockedReferenceLineLength,
    areVideoSourcesSame: context.areVideoSourcesSame,
  };
  try {
    context.frontVideo = { videoWidth: 1920, videoHeight: 1080 };
    context.sideVideo = { videoWidth: 1080, videoHeight: 1920 };
    context.distanceReferenceLinesByView = {
      front: { start: point('', 0.2, 0.1), end: point('', 0.4, 0.8) },
      side: null,
    };
    close(context.getReferenceLineLengthNorm('front'), Math.hypot(0.2 * 16 / 9, 0.7));
    const refs = { front: 0.8, side: 0.4 };
    context.getLockedReferenceLineLength = view => refs[view];
    context.areVideoSourcesSame = () => false;
    const make = (view, radius) => ({
      view, rawRadiusProxy: radius, rawMomentProxy: radius / 2,
      angleDeg: 90, summary: '', frameMetrics: { coreHandRadiusRaw: radius, swingRadiusRaw: radius },
    });
    const a = make('A', 0.2);
    const b = make('B', 0.1);
    context.applyProjectionNormalization(a, a);
    context.applyProjectionNormalization(b, a);
    close(a.radiusProxy, 1);
    close(b.radiusProxy, 1);
    close(context.referenceRatio(0.08, 'front'), context.referenceRatio(0.04, 'side'));
    const xA = 0.16 / (16 / 9), xB = 0.08 / (9 / 16);
    const displacement = context.computeHeightPercentDisplacement(xA, 0.32, xB, 0.16);
    close(displacement.xPercent, 0);
    close(displacement.yPercent, 0);
    context.areVideoSourcesSame = () => true;
    close(context.referenceRatio(0.08, 'side'), 0.1);
    context.areVideoSourcesSame = () => false;
    refs.side = null;
    const missing = make('B', 0.1);
    context.applyProjectionNormalization(missing, a);
    assert.equal(missing.radiusProxy, null);
    assert.equal(context.referenceRatio(0.1, 'side'), null);
    assert.match(missing.summary, /reference required/);
  } finally {
    Object.assign(context, old);
  }
});

test('F2-F6 delta distances use calibrated references and preserve body-relative ratios', () => {
  const sandbox = vm.createContext({
    hasMetric: context.hasMetric, clamp: context.clamp,
    getThreePointSpreadChange: context.getThreePointSpreadChange,
    getSwingTargetSign: () => null,
    getAddressC7DriftPercent: () => ({ value: null, directional: false }),
    frontVideo: { videoWidth: 1, videoHeight: 1 },
    sideVideo: { videoWidth: 1, videoHeight: 1 },
    getLockedReferenceLineLength: view => view === 'front' ? 0.8 : 0.4,
    areVideoSourcesSame: () => false,
    computeSegmentScore: () => null,
    computeConsistencyReport: () => ({}),
    computeTempoSequenceReport: () => ({}),
    computeGroundForceTransitionReport: () => ({}),
    computePhaseTimeDelta: () => null,
    frameMetricsHistory: {},
    frameSideMetricsHistory: { frame1: { pelvisNormX: 0.1, c7NormX: 0.08 } },
    frameStateHistory: { front: {}, side: {} },
  });
  for (const name of ['getAnalysisAspect', 'getPanelReferenceLength', 'referenceRatio',
    'referencePositionX', 'computeHeightPercentDisplacement', 'computeMetricDelta', 'createDeltaResult']) {
    vm.runInContext(html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`))[0], sandbox);
  }
  const base = {
    pelvisNormX: 0.2, c7NormX: 0.16, c7NormY: 0.2, hipNormY: 0.6,
    torsoRefDist: 0.3, rMaxNorm: 0.2, rotRadius6: 0.2,
    spineLen5: 0.3, handX: 0.3, handY: 0.3,
    c7X: 0.16, c7Y: 0.2, pelvisX: 0.16, pelvisY: 0.5,
    comNormX6: 0.2, c7NormX6: 0.16,
  };
  const smaller = Object.fromEntries(Object.entries(base).map(([key, value]) => [key, value / 2]));
  base.lagAngleDeg6 = smaller.lagAngleDeg6 = 90;
  const result = (fm, raw) => ({ frameMetrics: fm, rawRadiusProxy: raw, rawMomentProxy: raw,
    momentProxy: 1, radiusProxy: 1, angleDeg: 90 });
  for (const frame of ['frame2', 'frame3', 'frame4', 'frame5', 'frame6']) {
    const delta = sandbox.createDeltaResult(result(base, 0.2), result(smaller, 0.1), frame, { a: 0, b: 0.06 });
    close(delta.radiusPercent, 0);
    close(delta.momentPercent, 0);
    if (frame === 'frame2') close(delta.fm.pelvisLateralDelta, 0);
    if (frame === 'frame3') {
      close(delta.fm.hipDropPercent, 0);
      close(delta.fm.c7RisePercent, 0);
      close(delta.fm.c7SwayPercent, 0);
    }
    if (frame === 'frame4') close(delta.fm.rMaxNormDelta, 0);
    if (frame === 'frame5') {
      close(delta.fm.handOffsetDelta, 0);
      close(delta.fm.c7DisplacementRatio, 0);
      close(delta.fm.pelvisShiftRatio, 0);
    }
    if (frame === 'frame6') {
      close(delta.fm.releaseIndex, 90);
      close(delta.fm.comShiftTop6, 0);
      close(delta.fm.c7ShiftTop6, 0);
    }
  }
});

test('all six frame radii use pelvis-to-hand distance, independent of the clubhead', () => {
  for (const frame of ['frame1', 'frame2', 'frame3', 'frame4', 'frame5', 'frame6']) {
    const points = pointsFor(frame);
    const before = metrics(frame, points);
    close(before.coreHandRadiusRaw, 0.3);
    for (const p of points) {
      if (['clubHead', 'clubHeadTop'].includes(p.type)
        || (frame === 'frame2' && p.type === 'club')
        || (frame === 'frame4' && p.type === 'pelvis')) {
        p.x = 0.02; p.y = 0.97;
      }
    }
    const after = metrics(frame, points);
    close(after.swingRadiusRaw, before.swingRadiusRaw);
    if (frame === 'frame4') close(after.rMaxNorm, 0.3);
    if (frame === 'frame6') close(after.rotRadius6, 0.3);
  }
});

test('three-point RMS spread matches geometry and ignores rigid translation', () => {
  const c7 = point('c7', 0, 0);
  const pelvis = point('pelvis', 0, 3);
  const hands = point('handMid', 3, 0);
  close(context.computeThreePointSpread(c7, pelvis, hands, 1), 2);
  const translate = p => ({ ...p, x: p.x + 0.7, y: p.y - 0.2 });
  close(context.computeThreePointSpread(...[c7, pelvis, hands].map(translate), 1), 2);
  close(context.computeThreePointSpread(...[c7, pelvis, hands].map(p => ({
    ...p, x: p.x / 2, y: p.y / 2,
  })), 1), 1);
  assert.equal(context.computeThreePointSpread(c7, pelvis, null, 1), null);
  assert.equal(context.computeThreePointSpread(c7, pelvis, hands, 0), null);
  close(context.getThreePointSpreadChange(2, 1), -50);
  close(context.getThreePointSpreadChange(1, 1.5), 50);
  assert.equal(context.getThreePointSpreadChange(0, 1), null);
});

test('F1-F4 spread uses actual C7 aliases, not the shoulder or clubhead', () => {
  for (const frame of ['frame1', 'frame2', 'frame3', 'frame4']) {
    const points = pointsFor(frame);
    const c7Type = frame === 'frame3' ? 'pelvis' : frame === 'frame2' ? 'c7' : 'wrist';
    const pelvisType = ['frame3', 'frame4'].includes(frame) ? 'pelvisCenter' : 'pelvis';
    const expected = context.computeThreePointSpread(points.find(p => p.type === c7Type),
      points.find(p => p.type === pelvisType), points.find(p => p.type === 'handMid'), 1);
    close(metrics(frame, points).threePointSpreadRaw, expected);
    assert.equal(metrics(frame, points.filter(p => p.type !== c7Type)).threePointSpreadRaw, null);
  }
  assert.ok(context.getFramePointTypesForView('frame2', 'side').includes('c7'));
});

test('auxiliary spread is excluded from F2-F4 scores', () => {
  for (const frame of ['frame2', 'frame3', 'frame4']) {
    const result = { _arcBCurrent: 30, fm: {
      laggingAngleDelta: -90, pelvisLateralDelta: -0.2, radiusCompressionRatio: 0.25,
      kneeExtensionDegB: 165, c7SwayPercent: 1, radiusExpansionRatio: 0.2,
      armShaftDelta: 50, lateralLeanDelta: 10, c7XPercent: 1, c7YPercent: 1,
    } };
    const score = context.computeSegmentScore(result, frame);
    result.fm.threePointSpreadRaw = 999;
    result.fm.threePointSpreadChange = -100;
    assert.equal(context.computeSegmentScore(result, frame), score);
  }
});

test('auxiliary display handles incomplete data, history updates, languages and reset', () => {
  const element = { textContent: '' };
  context.document = { getElementById: () => element };
  context.frameMetricsHistory = {};
  context.frameSideMetricsHistory = {};
  context.updateThreePointSpreadDisplay();
  assert.match(element.textContent, /head-to-left-foot reference/);
  assert.match(element.textContent, /Not measurable/);
  context.frameSideMetricsHistory = {
    frame1: { threePointSpreadRatio: 0.4 }, frame2: { threePointSpreadRatio: 0.2 },
    frame3: { threePointSpreadRatio: 0.25 }, frame4: { threePointSpreadRatio: 0.3 },
  };
  context.updateThreePointSpreadDisplay();
  assert.match(element.textContent, /F1: A .* \| B 40.00%/);
  assert.match(element.textContent, /F1 B → F2 B: -50.0% \(compression\)/);
  assert.match(element.textContent, /F2 B → F4 B: \+50.0% \(expansion\)/);
  context.uiLanguage = 'ko';
  context.updateThreePointSpreadDisplay();
  assert.match(element.textContent, /실험적 F3\/F4 전환 감점/);
  context.frameSideMetricsHistory = {};
  context.updateThreePointSpreadDisplay();
  assert.doesNotMatch(element.textContent, /-50.0%/);
  context.uiLanguage = 'en';
  context.frameMetricsHistory = {};
});

test('clubhead still controls lag and shaft alignment angles', () => {
  for (const [frame, angle] of [
    ['frame1', 'topShaftAngleDeg'], ['frame2', 'laggingAngleDeg'],
    ['frame4', 'armShaftAngleDeg'], ['frame6', 'lagAngleDeg6'],
  ]) {
    const points = pointsFor(frame);
    const before = metrics(frame, points);
    const type = frame === 'frame1' ? 'clubHeadTop'
      : frame === 'frame2' ? 'club' : frame === 'frame4' ? 'pelvis' : 'clubHead';
    Object.assign(points.find(p => p.type === type), { x: 0.01, y: 0.9 });
    const after = metrics(frame, points);
    assert.notEqual(after[angle], before[angle], frame);
    close(after.coreHandRadiusRaw, before.coreHandRadiusRaw);
  }
});

test('missing hand-center data never falls back to clubhead or left wrist', () => {
  for (const frame of ['frame1', 'frame3', 'frame4', 'frame5', 'frame6']) {
    const fm = metrics(frame, pointsFor(frame).filter(p => p.type !== 'handMid'));
    assert.equal(fm.coreHandRadiusRaw, null, frame);
    assert.equal(fm.swingRadiusRaw, null, frame);
  }
});

test('legacy F2 wrist retains its hand-center meaning', () => {
  const points = pointsFor('frame2').filter(p => p.type !== 'handMid');
  Object.assign(points.find(p => p.type === 'wrist'), { x: 0.8, y: 0.6 });
  close(metrics('frame2', points).coreHandRadiusRaw, 0.3);
});

test('radius corrects horizontal distance for the video aspect ratio', () => {
  const points = pointsFor('frame4', 0.8);
  points.find(p => p.type === 'handMid').y = 0.8;
  const fm = context.computeFrameMetrics(points, [], 'frame4', 1, 480, 16 / 9);
  close(fm.coreHandRadiusRaw, Math.hypot(0.3 * 16 / 9, 0.2));
});

test('wide-narrow-wide ratios respond to hands and remain scale independent', () => {
  for (const scale of [0.5, 1, 2]) {
    const radii = ['frame1', 'frame2', 'frame3', 'frame4'].map((frame, i) => {
      const points = pointsFor(frame, [0.9, 0.7, 0.75, 0.8][i])
        .map(p => ({ ...p, x: p.x * scale, y: p.y * scale }));
      return metrics(frame, points).coreHandRadiusRaw;
    });
    close((radii[0] - radii[1]) / radii[0], 0.5);
    close((radii[2] - radii[1]) / radii[1], 0.25);
    close((radii[3] - radii[1]) / radii[1], 0.5);
  }
});

test('normalization preserves unavailable radii and uses the address hand radius', () => {
  const baseline = { rawRadiusProxy: 0.2, rawMomentProxy: 0.1 };
  const result = {
    rawRadiusProxy: 0.3, rawMomentProxy: 0.1, angleDeg: 90, summary: '',
    frameMetrics: { coreHandRadiusRaw: 0.3, swingRadiusRaw: 0.3 },
  };
  context.applyProjectionNormalization(result, baseline);
  close(result.radiusProxy, 1.5);
  close(result.frameMetrics.swingRadius, 1.5);
  const missing = { ...result, rawRadiusProxy: null, frameMetrics: {} };
  context.applyProjectionNormalization(missing, baseline);
  assert.equal(missing.radiusProxy, null);
  assert.equal(missing.radiusRatioPct, null);
  assert.equal(missing.impactScore, null);
  context.applyProjectionNormalization(result, null);
  assert.equal(result.radiusProxy, null);
  assert.equal(result.frameMetrics.swingRadius, null);
  assert.equal(result.motionScore, null);
  assert.match(result.summary, /baseline/);
});

test('F6 release radius factor is unchanged when the clubhead moves along the same ray', () => {
  const points = pointsFor('frame6');
  const before = metrics('frame6', points);
  const hand = points.find(p => p.type === 'handMid');
  const club = points.find(p => p.type === 'clubHead');
  club.x = hand.x + (club.x - hand.x) * 2;
  club.y = hand.y + (club.y - hand.y) * 2;
  const after = metrics('frame6', points);
  close(after.lagAngleDeg6, before.lagAngleDeg6);
  close((after.rotRadius6 / 0.2) * (180 - after.lagAngleDeg6),
    (before.rotRadius6 / 0.2) * (180 - before.lagAngleDeg6));
});

test('F3 and F4 input schemas require an explicit pelvis and both-hands center in both panels', () => {
  for (const frame of ['frame3', 'frame4']) {
    for (const view of ['front', 'side']) {
      const types = context.getFramePointTypesForView(frame, view);
      assert.ok(types.includes('pelvisCenter'));
      assert.ok(types.includes('handMid'));
      assert.equal(new Set(types).size, types.length);
    }
  }
  assert.ok(context.getFramePointTypesForView('frame1', 'front').includes('handMid'));
});

test('engine rules display decision ordering, thresholds and both languages', () => {
  context.uiLanguage = 'en';
  const en = context.formatPowerEngineRules();
  assert.match(en, /coactivation/);
  assert.match(en, /13.5/);
  assert.match(en, /14 percentage points/);
  assert.match(en, /F2 shoulder–pelvis-relative shift only/);
  assert.match(en, /0→13%/);
  assert.doesNotMatch(en, /[가-힣]/);
  context.uiLanguage = 'ko';
  assert.match(context.formatPowerEngineRules(), /결정 규칙/);
  assert.match(context.formatPowerEngineRules(), /실제 파워 측정 아님/);
  context.uiLanguage = 'en';
});

test('reference guide defaults closed and retains auxiliary evidence outside the concise results', () => {
  const guide = html.match(/<details class="analysis-reference" id="analysisReferenceGuide">([\s\S]*?)<\/details>/);
  assert.ok(guide);
  assert.ok(guide[1].includes('id="analysisThreePointSpread"'));
  assert.ok(guide[1].includes('id="analysisTypeReference"'));
  assert.ok(guide[1].includes('id="analysisBonusReference"'));
  assert.ok(guide[1].includes('잠정 채점 v4'));
  assert.ok(guide[1].includes('최대 0.5점 보완'));
  assert.equal(context.translateUiText('참고 안내 — 측정 근거·채점 기준·한계', 'en'),
    'Reference Guide — Evidence, Scoring and Limitations');
  const card = html.match(/  function updateSwingTypeCard\([\s\S]*?\n  }/)[0];
  assert.ok(card.includes('referenceRows.push'));
  assert.ok(card.includes("reference.innerHTML = referenceRows.join('')"));
});

test('updated radius tooltips are completely translated into English', () => {
  for (const id of [
    'analysisFrontRadius', 'analysisFrontTransfer', 'analysisFrontImpact',
    'analysisDeltaCardF3GroundForceTransition', 'analysisDeltaCardF4RMax',
    'analysisDeltaCardF6Release', 'analysisDeltaCardF4ArmShaft',
    'analysisDeltaCardF2Score', 'analysisDeltaCardF2LagAngle', 'analysisDeltaCardF2CoreShift',
    'analysisDeltaCardF3Score', 'analysisDeltaCardF3Thrust', 'analysisDeltaCardF3AxisSway',
    'analysisDeltaCardF4Score', 'analysisDeltaCardF4Lean',
    'analysisDeltaCardF6Score', 'analysisDeltaCardF6TimeDelta', 'analysisDeltaCardF6Sequence',
  ]) {
    const tooltip = html.match(new RegExp(`id="${id}"[^>]*data-tooltip="([^"]*)"`));
    assert.ok(tooltip, id);
    const decoded = tooltip[1].replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
    assert.doesNotMatch(context.translateUiText(decoded, 'en'), /[가-힣]/, id);
    assert.equal(context.translateUiText(decoded, 'ko'), decoded);
  }
});

test('updated exponential F2 and F4 reference-band tooltips translate without Korean', () => {
  for (const id of [
    'analysisDeltaCardF2Score', 'analysisDeltaCardF2LagAngle',
    'analysisDeltaCardF2RadiusCompression', 'analysisDeltaCardF2CoreShift',
    'analysisDeltaCardF4Score', 'analysisDeltaCardF4RMax',
  ]) {
    const tooltip = html.match(new RegExp(`id="${id}"[^>]*data-tooltip="([^"]*)"`));
    assert.ok(tooltip, id);
    const decoded = tooltip[1].replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
    const translated = context.translateUiText(decoded, 'en');
    assert.doesNotMatch(translated, /[가-힣]/, id);
  }
});

test('frame comparison translates axis and head-pelvis metric labels into English', () => {
  for (const [korean, english] of [
    ['C7–골반 동반 0.07', 'C7–pelvis coupling 0.07'],
    ['축 고정: 어드레스→F3 C7 +0.071%', 'Axis Hold: Address→F3 C7 +0.071%'],
    ['축 고정: 어드레스→F3 C7 +0.071% (방향 미확인)', 'Axis Hold: Address→F3 C7 +0.071% (direction unknown)'],
    ['임팩트 골반–C7 간격 12.1%', 'Impact pelvis–C7 gap 12.1%'],
    ['다운스윙 동반 0.02', 'Downswing coupling 0.02'],
  ]) {
    assert.equal(context.translateUiText(korean, 'en'), english);
  }
});

test('frame completion requires every semantic point rather than array length', () => {
  const types = context.getFramePointTypesForView('frame4', 'front');
  const points = types.map(type => point(type, 0.5, 0.5));
  assert.equal(context.areFramePointsComplete(points, 'frame4', 'front'), true);
  points[2] = point(types[0], 0.2, 0.2);
  assert.equal(context.areFramePointsComplete(points, 'frame4', 'front'), false);
  context.frameStateHistory = { front: { frame4: { points } }, side: {} };
  assert.equal(context.isPanelComplete('frame4', 'front'), false);
  assert.equal(context.getNextAnalysisFrame('frame4'), 'frame5');
  assert.equal(context.getNextAnalysisFrame('frame6'), null);
});

test('selection completion opens the missing panel or advances a fully reused frame', () => {
  const visited = [];
  const changes = [];
  context.selectedSegment = 'frame2';
  context.setGuideState = view => visited.push(view);
  context.showGuide = () => {};
  context.analysisSegmentSelect = {
    value: 'frame2', dispatchEvent: () => changes.push(context.analysisSegmentSelect.value),
  };
  context.Event = class {};
  context.frontPoints = [];
  context.sidePoints = [];
  context.continueFrameSelection();
  assert.equal(visited.pop(), 'front');
  context.frontPoints = context.getFramePointTypesForView('frame2', 'front').map(type => point(type, 0, 0));
  context.continueFrameSelection();
  assert.equal(visited.pop(), 'side');
  context.sidePoints = context.getFramePointTypesForView('frame2', 'side').map(type => point(type, 0, 0));
  context.guideView = 'side';
  context.performAnalysis = () => visited.push('analyzed');
  context.advanceGuideStep();
  assert.equal(visited.pop(), 'analyzed');
  assert.equal(changes.pop(), 'frame3');
  context.selectedSegment = 'frame6';
  context.frontPoints = context.getFramePointTypesForView('frame6', 'front').map(type => point(type, 0, 0));
  context.sidePoints = context.getFramePointTypesForView('frame6', 'side').map(type => point(type, 0, 0));
  context.continueFrameSelection();
  assert.equal(changes.length, 0);
  context.selectedSegment = 'frame2';
  context.frameEditMode = true;
  context.frontPoints = context.getFramePointTypesForView('frame2', 'front').map(type => point(type, 0, 0));
  context.sidePoints = context.getFramePointTypesForView('frame2', 'side').map(type => point(type, 0, 0));
  context.advanceGuideStep();
  assert.equal(context.selectedSegment, 'frame2');
  assert.equal(changes.length, 0);
  context.frameEditMode = false;
});

test('point hit testing picks the nearest screen-space point regardless of aspect or zoom', () => {
  const points = [point('pelvis', 0.5, 0.5), point('hands', 0.51, 0.5)];
  assert.equal(context.findNearestPointIndex(points, { x: 0.509, y: 0.5 }, 1000, 500), 1);
  assert.equal(context.findNearestPointIndex(points, { x: 0.5, y: 0.52 }, 1000, 500), 0);
  assert.equal(context.findNearestPointIndex(points, { x: 0.5, y: 0.53 }, 1000, 500), -1);
  assert.equal(context.findNearestPointIndex(points, { x: 0.53, y: 0.5 }, 400, 800), 1);
});

test('saved frame inputs are never replenished from another frame after deletion', () => {
  context.frameStateHistory = { front: { frame2: { points: [] } }, side: {} };
  context.frontPoints = [];
  context.sidePoints = [];
  assert.equal(context.reuseSharedFramePoints('frame2', 'front').count, 0);
  context.frameEditMode = true;
  assert.equal(context.reuseSharedFramePoints('frame4', 'side').count, 0);
  context.frameEditMode = false;
});

test('deleting a point prioritizes it over a crossing line and preserves other frames', () => {
  context.selectedSegment = 'frame2';
  context.motionAnalysisFrame = null;
  context.frontVideo = { currentTime: 0.1 };
  context.sideVideo = { currentTime: 1.2 };
  context.drawOverlay = () => {};
  context.getVideoMetrics = () => ({ drawWidth: 1000, drawHeight: 500 });
  context.frontPoints = [point('pelvis', 0.5, 0.5), point('handMid', 0.51, 0.5)];
  context.sidePoints = [];
  context.frontLines = [{ start: { x: 0.4, y: 0.5 }, end: { x: 0.6, y: 0.5 } }];
  context.frameStateHistory = { front: { frame5: { points: [point('pelvis', 0.5, 0.5)] } }, side: {} };
  const other = JSON.stringify(context.frameStateHistory.front.frame5);
  const canvas = { getBoundingClientRect: () => ({ width: 1000, height: 500 }) };
  assert.equal(context.deletePoint(context.frontPoints, context.frontLines,
    { x: 0.509, y: 0.5 }, {}, canvas, context.frontVideo, 1, 0.03, 'front'), true);
  assert.equal(context.frontPoints.length, 1);
  assert.equal(context.frontPoints[0].type, 'pelvis');
  assert.equal(context.frontLines.length, 1);
  assert.equal(context.frameEditMode, true);
  assert.equal(context.guideView, 'front');
  assert.equal(context.getAutoPointType(context.frontPoints, 'front'), 'handMid');
  assert.equal(JSON.stringify(context.frameStateHistory.front.frame5), other);
  assert.equal(context.reuseSharedFramePoints('frame2', 'front').count, 0);
  context.frameEditMode = false;
});

test('first-time input retains automatic A/B progression while editing waits for analysis', () => {
  const analyzed = [];
  const visited = [];
  context.selectedSegment = 'frame2';
  context.frameEditMode = false;
  context.guideView = 'front';
  context.frontVideo = { src: 'test', currentTime: 0.1 };
  context.sideVideo = { src: 'test', currentTime: 1.2 };
  context.frontPoints = context.getFramePointTypesForView('frame2', 'front')
    .filter(type => type !== 'c7').map(type => point(type, 0.2, 0.2));
  context.sidePoints = [];
  context.frontLines = [];
  context.sideLines = [];
  context.frameStateHistory = { front: {}, side: {} };
  context.performAnalysis = () => analyzed.push(context.selectedSegment);
  context.setGuideState = view => visited.push(view);
  context.addPoint(context.frontPoints, [], { x: 0.4, y: 0.2 }, {}, {}, {}, 1, 'front');
  assert.equal(analyzed.length, 1);
  assert.equal(visited.pop(), 'side');
  context.frameEditMode = true;
  context.guideView = 'side';
  context.sidePoints = context.getFramePointTypesForView('frame2', 'side')
    .filter(type => type !== 'c7').map(type => point(type, 0.2, 0.2));
  context.addPoint(context.sidePoints, [], { x: 0.4, y: 0.2 }, {}, {}, {}, 1, 'side');
  assert.equal(analyzed.length, 1);
  context.frameEditMode = false;
});

test('related rebuild restores the active editor and uses each saved frame time without changing inputs', () => {
  const originalAnalysis = context.performAnalysis;
  const calls = [];
  context.selectedSegment = 'frame4';
  const activePoints = [point('hands', 0.7, 0.6)];
  context.frontPoints = activePoints;
  context.sidePoints = [];
  context.frontLines = [];
  context.sideLines = [];
  context.frameStateHistory = {
    front: { frame1: { points: [point('pelvis', 0.5, 0.6)], lines: [], videoTime: 0.1 },
      frame4: { points: activePoints, lines: [], videoTime: 0.1 } },
    side: { frame1: { points: [], lines: [], videoTime: 1.5 },
      frame4: { points: [], lines: [], videoTime: 2.5 } },
  };
  const before = JSON.stringify(context.frameStateHistory);
  context.performAnalysis = (refresh, times) => calls.push({ segment: context.selectedSegment, refresh, times });
  context.refreshStoredFrameAnalyses();
  assert.equal(context.selectedSegment, 'frame4');
  assert.equal(context.frontPoints, activePoints);
  assert.equal(JSON.stringify(context.frameStateHistory), before);
  assert.deepEqual(calls.map(call => call.segment), ['frame1', 'frame4', 'frame1', 'frame4', 'frame4']);
  assert.ok(calls.every(call => call.refresh === false));
  assert.equal(calls[0].times.b, 1.5);
  assert.equal(calls[1].times.b, 2.5);
  context.performAnalysis = originalAnalysis;
});

test('project restore detects saved raw frame inputs and clears every derived metric cache', () => {
  const emptyState = {
    frameStateHistory: { front: {}, side: {} },
    frontPoints: [], frontLines: [], sidePoints: [], sideLines: [],
  };
  assert.equal(context.hasProjectFrameInputs(emptyState), false);
  emptyState.frameStateHistory.front.frame2 = {
    points: [point('pelvis', 0.4, 0.5)], lines: [],
  };
  assert.equal(context.hasProjectFrameInputs(emptyState), true);
  delete emptyState.frameStateHistory.front.frame2;
  emptyState.sideLines = [{ start: { x: .2, y: .2 }, end: { x: .4, y: .4 } }];
  assert.equal(context.hasProjectFrameInputs(emptyState), true);

  context.baselineFrontResult = { stale: true };
  context.frameMetricsHistory = { frame1: { stale: true } };
  context.frameSideMetricsHistory = { frame1: { stale: true } };
  context.segmentScoreHistory = { frame1: 9 };
  context.segmentDeltaHistory = { frame1: { stale: true } };
  context.clearDerivedAnalysisState();
  assert.equal(context.baselineFrontResult, null);
  for (const name of ['frameMetricsHistory', 'frameSideMetricsHistory', 'segmentScoreHistory', 'segmentDeltaHistory']) {
    assert.deepEqual({ ...context[name] }, Object.fromEntries(context.ANALYSIS_FRAME_IDS.map(frame => [frame, null])));
  }
});

test('project restore invalidates old async work and only reports recalculated scores after rebuilding inputs', () => {
  const restoreStart = html.indexOf('  function restoreAnalysisProject(project)');
  const restoreEnd = html.indexOf('  if (saveAnalysisProjectBtn)', restoreStart);
  assert.ok(restoreStart >= 0 && restoreEnd > restoreStart);
  const restore = html.slice(restoreStart, restoreEnd);
  assert.ok(restore.indexOf('analysisGeneration += 1') < restore.indexOf('frameStateHistory = copyProjectValue'));
  assert.ok(restore.indexOf('clearDerivedAnalysisState()') < restore.indexOf('refreshStoredFrameAnalyses()'));
  assert.match(restore, /if \(hasFrameInputs\) refreshStoredFrameAnalyses\(\);/);
  assert.match(restore, /frontVideo\.readyState < 1[\s\S]*?sideVideo\.readyState < 1/);
  assert.doesNotMatch(restore, /Stored frame re-analysis failed|console\.warn/);
  const loaderStart = html.indexOf("analysisProjectFileInput.addEventListener('change'");
  const loaderEnd = html.indexOf('\n  }', loaderStart);
  const loader = html.slice(loaderStart, loaderEnd);
  assert.match(loader, /frontPoints\.length > 0[\s\S]*?sideLines\.length > 0/);
  assert.match(loader, /Analysis project restored; metrics and scores were recalculated/);
  assert.match(loader, /Motion metrics and scores were not recalculated/);
});

test('F6 searches the shaft-parallel P6 phase and does not time unrelated videos', () => {
  context.backswingActive = false;
  context.selectedSegment = 'frame6';
  assert.equal(context.getMotionSearchRequest('front').target, 'downswing78');
  assert.equal(context.getMotionSearchRequest('side').target, 'impact');
  close(context.computePhaseTimeDelta(1, 1.06, true), 0.06);
  assert.equal(context.computePhaseTimeDelta(1, 1.06, false), null);
  assert.equal(context.computePhaseTimeDelta(null, 1.06, true), null);
  const tempo = context.computeTempoSequenceReport({ timeDeltaSec: 0.4667, releaseIndex: 39, sequenceIndex: 3 });
  assert.equal(tempo.score100, 100);
});

test('F6 excludes unvalidated timing and Release Index from the score', () => {
  const input = { timeDeltaSec: 0.4667, sequenceIndex: 3, releaseIndex: 39 };
  const low = context.computeTempoSequenceReport(input);
  const high = context.computeTempoSequenceReport({ ...input, releaseIndex: 500 });
  assert.equal(low.score100, 100);
  assert.equal(high.score100, 100);
  assert.equal(low.sRelease, 100);
  assert.equal(low.totalMetrics, 1);
  close(low.tempoWeight, 0);
  close(low.releaseWeight, 0);
  close(low.sequenceWeight, 1);
  const supplemental = context.computeTempoSequenceReport(input, { penalty: 25 });
  close(supplemental.tempoWeight + supplemental.releaseWeight
    + supplemental.sequenceWeight + supplemental.downswingWeight, 1);
  close(supplemental.tempoWeight, 0);
  close(supplemental.releaseWeight, 0);
  close(supplemental.sequenceWeight, 0.9);
  close(supplemental.downswingWeight, 0.1);
  assert.equal(supplemental.score100, 98);
  assert.equal(context.computeTempoSequenceReport({ releaseIndex: 500 }).score100, null);
  const missingTiming = context.computeTempoSequenceReport({ sequenceIndex: 3, releaseIndex: 39 });
  assert.equal(missingTiming.tempoWeight, 0);
  assert.equal(missingTiming.sequenceWeight, 1);
});

test('F6 example keeps the 457.9ms and Release Index penalties out of the score', () => {
  const report = context.computeTempoSequenceReport({
    timeDeltaSec: 0.4579,
    releaseIndex: 40,
    sequenceIndex: 3,
  }, { penalty: 70 });
  assert.equal(report.score100, 93);
  assert.equal(report.sTempo, 100);
  assert.equal(report.sRelease, 100);
  assert.equal(report.tempoWeight, 0);
  assert.equal(report.releaseWeight, 0);
  assert.equal(report.sequenceWeight, 0.9);
  assert.equal(report.downswingWeight, 0.1);
});

test('F6 score uses only relative displacement and optional side-path evidence', () => {
  const evidence = { pathFit: 0.3, penalty: 70 };
  const previous = context.getDownswingSideEvidence;
  context.getDownswingSideEvidence = () => evidence;
  try {
    const fm = { armShaftAngleBDeg: 164.2, c7XPercent: 5.9, c7YPercent: 0.3,
      radiusF3: 0.629 / 0.593, radiusCurrent: 0.629 };
    assert.equal(context.computeSegmentScore({ fm }, 'frame4'), 7.5);
    const report = context.computeTempoSequenceReport({ timeDeltaSec: 0.2946, sequenceIndex: 2.20 }, evidence);
    assert.equal(report.score100, 93);
    assert.equal(report.sTempo, 100);
    close(report.sequenceWeight, 0.9);
    close(report.downswingWeight, 0.1);
    assert.equal(context.computeTempoSequenceReport({ timeDeltaSec: 0.02, sequenceIndex: 2.20 }, evidence).score100, 93);
    assert.equal(context.computeTempoSequenceReport({ timeDeltaSec: 0.06, sequenceIndex: 2.20 }, evidence).score100, 93);
    assert.equal(context.computeTempoSequenceReport({ timeDeltaSec: 0.8, sequenceIndex: 2.20 }, evidence).score100, 93);
    assert.equal(context.computeTempoSequenceReport({ sequenceIndex: 2.20 }, evidence).score100, 93);
    assert.equal(context.computeTempoSequenceReport({ timeDeltaSec: 0.06 }, evidence).score100, null);
    assert.equal(context.computeTempoSequenceReport({ timeDeltaSec: 0.8 }, null).score100, null);
  } finally {
    context.getDownswingSideEvidence = previous;
  }
});

test('F6 score remains stable when unvalidated time and release values differ', () => {
  const reportA = context.computeTempoSequenceReport({
    timeDeltaSec: 0.1163, releaseIndex: 31, sequenceIndex: 3,
  });
  const reportB = context.computeTempoSequenceReport({
    timeDeltaSec: 0.0632, releaseIndex: 20, sequenceIndex: 3,
  });
  assert.equal(reportA.score100, 100);
  assert.equal(reportB.score100, 100);
});

test('three-point average bonus uses independent phase contributions, requires all four scores, and caps at ten', () => {
  const history = values => Object.fromEntries(values.map((value, i) => [
    `frame${i + 1}`, { threePointSpreadRatio: value },
  ]));
  const cycle = history([0.2, 0.15, 0.18]);
  const result = context.getDistanceMotionSummary([8, 9, 8, 9], cycle);
  close(result.base, 8.5);
  close(result.score, 9.5);
  close(result.bonus, 1);
  assert.equal(result.eligible, true);
  assert.match(context.formatDistanceMotionSummary(result), /base 8.5 \+ experimental bonus 1.0/);
  const capped = context.getDistanceMotionSummary([9.5, 10, 10, 10], cycle);
  close(capped.score, 10);
  close(capped.bonus, 0.125);
  assert.match(context.formatDistanceMotionSummary(capped), /base 9.875 \+ experimental bonus 0.125/);
  close(context.getDistanceMotionSummary([10, 10, 10, 10], cycle).bonus, 0);
  for (const values of [[0.2, 0.2, 0.2], [1, 0.98, 0.9996], [1, 1.1, 1.05]]) {
    assert.equal(context.getDistanceMotionSummary([8, 8, 8, 8], history(values)).bonus, 0);
  }
  assert.equal(context.getDistanceMotionSummary([8, 8, 8, null], cycle).bonus, 0);
  assert.equal(context.getDistanceMotionSummary([8, 8, 8, 8], {}).bonus, 0);
  assert.equal(context.getDistanceMotionSummary([8, 8, 8, 8], history([0.2, 0, 0.18])).bonus, 0);
  assert.equal(context.getDistanceMotionSummary([null, null, null, null], cycle).score, null);
  const scaled = history([2, 1.5, 1.8]);
  close(context.getDistanceMotionSummary([8, 9, 8, 9], scaled).score, result.score);
  cycle.frame3.threePointSpreadRatio = 0.14;
  close(context.getDistanceMotionSummary([8, 9, 8, 9], cycle).bonus, 0.5, 'editing removes expansion contribution only');
  context.uiLanguage = 'ko';
  assert.match(context.formatDistanceMotionSummary(result), /기본 8.5 \+ 실험적 가점 1.0/);
  context.uiLanguage = 'en';
});

test('average bonus independently averages linear phase fits and matches all five PDF cycles', () => {
  const history = (compression, expansion) => ({
    frame1: { threePointSpreadRatio: 1 },
    frame2: { threePointSpreadRatio: 1 - compression / 100 },
    frame3: { threePointSpreadRatio: (1 - compression / 100) * (1 + expansion / 100) },
  });
  for (const [change, expected] of [[0, 0], [2, 0], [5.25, 0.25], [8.5, 0.5], [11.75, 0.75], [15, 1], [25, 1]]) {
    for (const [compression, expansion] of [[change, 25], [25, change]]) {
      const summary = context.getDistanceMotionSummary([8, 8, 8, 8], history(compression, expansion));
      close(summary.proposedBonus, (expected + 1) / 2);
      close(summary.bonus, (expected + 1) / 2);
      close(summary.score, 8 + (expected + 1) / 2);
    }
  }
  const partial = context.getDistanceMotionSummary([8, 8, 8, 8], history(8.5, 25));
  assert.match(context.formatDistanceMotionSummary(partial), /experimental bonus 0.75; calculated 0.75/);
  const capped = context.getDistanceMotionSummary([9.75, 9.75, 9.75, 9.75], history(8.5, 25));
  close(capped.proposedBonus, 0.75);
  close(capped.bonus, 0.25);
  close(capped.score, 10);
  for (const sample of swingReportFixtures) {
    const reports = Object.fromEntries(sample.spread.map((value, i) => [
      `frame${i + 1}`, { threePointSpreadRatio: value / 100 },
    ]));
    const summary = context.getDistanceMotionSummary([8, 8, 8, 8], reports);
    assert.ok(summary.expansion < 0, `${sample.id}: F2→F3 is still compression`);
    const compression = (sample.spread[0] - sample.spread[1]) / sample.spread[0] * 100;
    const expected = Math.max(0, Math.min(1, (compression - 2) / 13)) * 0.5;
    close(summary.proposedBonus, expected);
    close(summary.bonus, expected);
    close(summary.expansionFit, 0);
  }
  close(context.getDistanceMotionSummary([8, 8, 8, 8], history(15, -10)).bonus, 0.5);
  close(context.getDistanceMotionSummary([8, 8, 8, 8], history(-10, 15)).bonus, 0.5);
});

test('engine evidence distinguishes missing data, compression-only, and compression-reexpansion', () => {
  const history = values => Object.fromEntries(values.map((value, i) => [
    `frame${i + 1}`, { threePointSpreadRatio: value },
  ]));
  const missing = context.getThreePointEngineEvidence({});
  assert.equal(missing.fit, null);
  assert.equal(missing.available, false);
  const cycle = context.getThreePointEngineEvidence(history([0.4, 0.2, 0.15, 0.3]));
  assert.equal(cycle.fit, 1);
  close(cycle.topToF2, -50);
  close(cycle.f2ToF3, -25);
  close(cycle.f3ToF4, 100);
  close(cycle.f2ToF4, 50);
  const compressionOnly = context.getThreePointEngineEvidence(history([0.0787, 0.0694, 0.0607, 0.0597]));
  close(compressionOnly.fit, 0.75);
  assert.equal(context.getThreePointEngineEvidence(history([0.2, 0.2, 0.2, 0.2])).fit, 0.5);
  close(context.combineEngineCompressionEvidence(0.4, 1), 0.55);
  close(context.combineEngineCompressionEvidence(0.4, null), 0.4);
});

test('three-point spread remains diagnostic and cannot change Type 3 engine fit', () => {
  context.areVideoSourcesSame = () => true;
  context.getSwingTypeReadiness = () => ({ ready: true });
  context.segmentDeltaHistory = {
    frame1: { fm: { c7XPercent: 1, c7YPercent: 1, xFactorDelta: -90 } },
    frame2: { fm: { radiusCompressionRatio: 0.2, pelvisLateralDelta: 0.25 } },
    frame3: { fm: { c7SwayPercent: 1, c7RisePercent: 0, kneeExtDelta: 15, hipDropPercent: 2, leadLegBraceRatioB: 0.1 } },
    frame4: { fm: { armShaftDelta: 50, armShaftAngleBDeg: 175 } },
    frame6: { fm: { timeDeltaSec: 0.08, lagAngleA6: 90 } },
  };
  context.frameMetricsHistory = {
    frame1: { _swingRadiusB: 1 }, frame2: { _swingRadiusB: 0.8 }, frame4: { _swingRadiusB: 0.9 },
  };
  context.frameSideMetricsHistory = {};
  const before = context.classifySwingType();
  const frameScores = JSON.stringify(context.segmentScoreHistory);
  context.frameSideMetricsHistory = {
    frame1: { threePointSpreadRatio: 0.4 }, frame2: { threePointSpreadRatio: 0.2 },
    frame3: { threePointSpreadRatio: 0.15 }, frame4: { threePointSpreadRatio: 0.3 },
  };
  const after = context.classifySwingType();
  close(after.compressionCycle, after.distanceCompressionCycle * 0.75 + 0.25);
  assert.equal(before.pct.type3, after.pct.type3);
  assert.equal(JSON.stringify(context.segmentScoreHistory), frameScores);
  context.segmentDeltaHistory = {};
  context.frameSideMetricsHistory = {};
  context.frameMetricsHistory = {};
  context.frameStateHistory = { front: {}, side: {} };
  context.areVideoSourcesSame = () => false;
});

test('F4 differentiates missing points from zero-length overlapping points', () => {
  const points = pointsFor('frame4');
  assert.equal(metrics('frame4', points).armShaftMissingReason, null);
  const wrist = points.find(p => p.type === 'shoulder');
  Object.assign(points.find(p => p.type === 'pelvis'), { x: wrist.x, y: wrist.y });
  assert.equal(metrics('frame4', points).armShaftMissingReason, 'overlappingPoints');
  assert.equal(metrics('frame4', points.filter(p => p.type !== 'shoulder')).armShaftMissingReason, 'missingPoints');
});

test('metric scores preserve missing data, coverage and provisional labels without interpolation', () => {
  context.frameSideMetricsHistory = {};
  context.frameMetricsHistory = {};
  for (const frame of ['frame2', 'frame3', 'frame4']) {
    const missing = { fm: {} };
    assert.equal(context.computeSegmentScore(missing, frame), null);
    assert.equal(missing.scoreCoverage.available, 0);
    const result = { fm: frame === 'frame2' ? { laggingAngleBDeg: 68 }
      : frame === 'frame3' ? { kneeExtensionDegB: 177 } : { armShaftAngleBDeg: 177 } };
    assert.equal(context.computeSegmentScore(result, frame), frame === 'frame2' ? 9.5 : 10);
    assert.equal(result.segmentRawScore, frame === 'frame2' ? 9.5 : 10);
    assert.equal(result.experimentalScoreCalibration, false);
    assert.equal(result.scoreCoverage.available, 1);
    assert.match(context.formatFrameScoreCalibration(result), /Provisional metric score/);
  }
});

test('F2 uses actual lag, F3 uses extension state, and F4 ignores incompatible angle-radius proxies', () => {
  const f2 = { fm: { laggingAngleBDeg: 68.1, laggingAngleDelta: 62.4, radiusCompressionRatio: 0.442, pelvisLateralDelta: 0.145, targetSign2: 1 } };
  const score = context.computeSegmentScore(f2, 'frame2');
  f2.fm.laggingAngleDelta = -120;
  assert.equal(context.computeSegmentScore(f2, 'frame2'), score);
  assert.ok(context.scoreLagAngle(68.1) > context.scoreLagAngle(147));
  assert.equal(context.scoreLagAngle(47.3), 1);
  assert.ok(context.scoreLagAngle(102.7) < 0.25);
  const noLag = { fm: { laggingAngleBDeg: 102.7, radiusCompressionRatio: 0.351, pelvisLateralDelta: -0.056, targetSign2: 1 } };
  assert.equal(context.computeSegmentScore(noLag, 'frame2'), 4.5);
  assert.equal(context.scoreLagAngle(190), null);
  const f3 = { fm: { kneeExtDelta: 2, kneeExtensionDegB: 175 } };
  const extensionScore = context.computeSegmentScore(f3, 'frame3');
  f3.fm.kneeExtensionDegB = 150;
  assert.ok(context.computeSegmentScore(f3, 'frame3') < extensionScore);
  const f4 = { _arcBCurrent: 1.3, fm: { armShaftAngleBDeg: 177, armShaftDelta: -10,
    radiusF3: 1, radiusF4: 1.2, c7XPercent: 1, c7YPercent: 1, lateralLeanDelta: -30 } };
  const impactScore = context.computeSegmentScore(f4, 'frame4');
  f4._arcBCurrent = 1000;
  f4.fm.armShaftDelta = 100;
  f4.fm.lateralLeanDelta = 100;
  assert.equal(context.computeSegmentScore(f4, 'frame4'), impactScore);
  f4.fm.radiusF4 = 0.7;
  assert.equal(context.computeSegmentScore(f4, 'frame4'), impactScore);
  for (const value of [-0.02, 0, 0.02]) close(context.scoreLateRadiusExpansion(value), 0.5);
});

test('F2 protects the observed pro C7 range and penalizes large absolute C7 travel', () => {
  const f2 = { fm: {
    laggingAngleBDeg: 82.3,
    radiusCompressionRatio: 0.277,
    pelvisLateralDelta: 0.239,
    c7LateralDelta2: 0.06,
    targetSign2: 1,
  } };
  const score = context.computeSegmentScore(f2, 'frame2');
  close(f2.fm.headPelvisCouplingRatio2, 0.06 / 0.239);
  close(f2.fm.headStableScore2, 1);
  const excessiveC7 = context.getF2MetricBreakdown({
    laggingAngleBDeg: 60, radiusCompressionRatio: 0.4,
    pelvisLateralDelta: 0.24, c7LateralDelta2: 0.305,
  });
  assert.ok(excessiveC7.headStability < 0.2);
  assert.equal(score, 5.5);
});

test('F2 scores absolute pelvis and C7 shift magnitudes regardless of target direction', () => {
  const fm = {
    laggingAngleBDeg: 82.3,
    radiusCompressionRatio: 0.277,
    pelvisLateralDelta: 0.239,
    c7LateralDelta2: 0.06,
    targetSign2: null,
  };
  const breakdown = context.getF2MetricBreakdown(fm);
  close(breakdown.pelvisShiftMagnitude, 0.239);
  assert.ok(breakdown.pelvisShiftScore > 0);
  close(breakdown.headPelvisCoupling, 0.06 / 0.239);
  const reversed = context.getF2MetricBreakdown({
    ...fm, pelvisLateralDelta: -fm.pelvisLateralDelta, c7LateralDelta2: -fm.c7LateralDelta2,
    targetSign2: 1,
  });
  close(reversed.pelvisShiftScore, breakdown.pelvisShiftScore);
  close(reversed.headStability, breakdown.headStability);
  const oldLanguage = context.uiLanguage;
  try {
    context.uiLanguage = 'ko';
    assert.match(context.formatF2ProReferenceComparison(fm, breakdown), /좌우 방향이 아닌 크기 기준/);
    context.uiLanguage = 'en';
    assert.match(context.formatF2ProReferenceComparison(fm, breakdown), /magnitude only, direction ignored/);
  } finally {
    context.uiLanguage = oldLanguage;
  }
});

test('F2 report breakdown and pro comparisons surface lag, compression and C7-pelvis gaps', () => {
  const fm = {
    laggingAngleBDeg: 82.3,
    radiusCompressionRatio: 0.277,
    pelvisLateralDelta: 0.239,
    c7LateralDelta2: 0.06,
    targetSign2: 1,
  };
  const breakdown = context.getF2MetricBreakdown(fm);
  close(breakdown.headPelvisCoupling, 0.06 / 0.239);
  const oldLanguage = context.uiLanguage;
  try {
    context.uiLanguage = 'ko';
    const text = context.formatF2ProReferenceComparison(fm, breakdown);
    assert.match(text, /82\.3° vs Rory 42\.2° \/ Tiger 64\.9° \(\+40\.1° \/ \+17\.4°; 프로 참고 상한 초과·거리별 지수 감점\)/);
    assert.match(text, /27\.7% vs Rory 40\.2% \/ Tiger 39\.8% \(-12\.5%p \/ -12\.1%p; 프로 참고 범위 이탈·거리별 지수 감점\)/);
    assert.match(text, /23\.9% vs Rory 23\.7% \/ Tiger 27\.5% \(\+0\.2%p \/ -3\.6%p; 선수 참고 이동 크기 범위 안\)/);
    assert.match(text, /X 이동 크기 차 17\.9%p, 동반률 25\.1% \(안정 계수 1\.00; 좌우 방향이 아닌 크기 기준/);
    assert.match(text, /프로 C7 비교자료 없음/);

    context.uiLanguage = 'en';
    const english = context.formatF2ProReferenceComparison(fm, breakdown);
    assert.match(english, /Versus pro references/);
    assert.match(english, /X magnitude difference 17\.9 pp, co-movement 25\.1% \(stability factor 1\.00/);
    assert.doesNotMatch(english, /[가-힣]/);
  } finally {
    context.uiLanguage = oldLanguage;
  }
});

test('F4 impact-separation tooltip and reference explain the scored displacement difference', () => {
  const tooltip = html.match(/id="analysisDeltaCardF4C7XY"[^>]*data-tooltip="([^"]*)"/);
  assert.ok(tooltip);
  const decoded = tooltip[1].replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
  const oldLanguage = context.uiLanguage;
  try {
    context.uiLanguage = 'en';
    const translatedTooltip = context.translateUiText(decoded, 'en');
    assert.match(translatedTooltip, /address-to-impact C7 and pelvis X-shift magnitudes/);
    assert.match(translatedTooltip, /Top→impact C7\/pelvis coupling/);
    assert.doesNotMatch(translatedTooltip, /[가-힣]/);
    assert.match(context.translateUiText(
      'F4 임팩트 분리 추가감점: 같은 영상에서 주소→임팩트 각 X 이동의 절댓값을 비교하며 좌우 방향은 무시합니다. C7과 골반의 이동 크기 차이가 작고 다운스윙 중 함께 움직일수록 감점이 커집니다. 두 근거를 50:50으로 반영해 최대 3점 감점합니다.',
      'en'), /F4 additional impact-separation deduction/);
  } finally {
    context.uiLanguage = oldLanguage;
  }
});

test('F2 scores the supplied amateur and professional reports by actual lag angle', () => {
  const reports = [
    { id: 'amateur-20241226', angle: 102.7, compression: 0.351, shift: -0.056, expected: 4.5 },
    { id: 'amateur-20250218', angle: 109.8, compression: 0.512, shift: 0.272, expected: 5.5 },
    { id: 'Rory-reference', angle: 42.2, compression: 0.402, shift: 0.237, expected: 10 },
    { id: 'Tiger-reference', angle: 64.9, compression: 0.398, shift: 0.275, expected: 10 },
  ];
  for (const report of reports) {
    assert.equal(context.computeSegmentScore({
      fm: {
        laggingAngleBDeg: report.angle,
        radiusCompressionRatio: report.compression,
        pelvisLateralDelta: report.shift,
        targetSign2: 1,
      },
    }, 'frame2'), report.expected, report.id);
  }
});

test('F4 scores address-to-impact magnitude separation regardless of direction, not instantaneous gap', () => {
  const proLike = context.computeHeadPelvisDifferentialShift(0.20, 0.22, 0.40, 0.49);
  close(proLike.c7Shift, 2);
  close(proLike.pelvisShift, 9);
  close(proLike.separationDelta, 7);
  const reversed = context.computeHeadPelvisDifferentialShift(0.20, 0.18, 0.40, 0.31);
  close(reversed.c7Shift, proLike.c7Shift);
  close(reversed.pelvisShift, proLike.pelvisShift);
  close(reversed.separationDelta, proLike.separationDelta);
  const wholeBodySlide = context.computeHeadPelvisDifferentialShift(0.20, 0.28, 0.40, 0.48);
  close(wholeBodySlide.c7Shift, 8);
  close(wholeBodySlide.pelvisShift, 8);
  close(wholeBodySlide.separationDelta, 0);
  assert.equal(context.getHeadPelvisSeparationFit({}, {
    impactSeparationDelta4: 9, impactGap4: 0, c7CouplingDown4: 0.1,
  }), 1);
  close(context.getHeadPelvisSeparationFit({}, {
    impactSeparationDelta4: 0, impactGap4: 9, c7CouplingDown4: 0.1,
  }), 0.375);

  const old = {
    getFrameScoreParts: context.getFrameScoreParts,
    getCompressionTransitionEvidence: context.getCompressionTransitionEvidence,
  };
  try {
    context.getFrameScoreParts = () => [{ value: 1, weight: 1 }];
    context.getCompressionTransitionEvidence = () => ({ f4Bonus: 0 });
    const separated = { fm: { impactSeparationDelta4: 9, c7CouplingDown4: 0.1 } };
    const movingTogether = { fm: { impactSeparationDelta4: 0, c7CouplingDown4: 0.1 } };
    assert.equal(context.computeSegmentScore(separated, 'frame4'), 10);
    assert.equal(context.computeSegmentScore(movingTogether, 'frame4'), 8.5);
    assert.equal(movingTogether.fm.headPelvisPenalty4, 1.5);
  } finally {
    context.getFrameScoreParts = old.getFrameScoreParts;
    context.getCompressionTransitionEvidence = old.getCompressionTransitionEvidence;
  }
});

test('ordered three-point compression profile protects pro ranges and exponentially penalizes amateur deviations', () => {
  const old = {
    same: context.areVideoSourcesSame,
    spread: context.frameSideMetricsHistory,
    frames: context.frameStateHistory,
  };
  const evidenceFor = ([topToF2, f2ToF3, f3ToF4]) => {
    const radii = [0.20];
    for (const change of [topToF2, f2ToF3, f3ToF4]) {
      radii.push(radii[radii.length - 1] * (1 + change / 100));
    }
    context.areVideoSourcesSame = () => true;
    context.frameSideMetricsHistory = Object.fromEntries(radii.map((value, i) => [
      `frame${i + 1}`, { threePointSpreadRatio: value },
    ]));
    context.frameStateHistory = { front: {}, side: Object.fromEntries(radii.map((_, i) => [
      `frame${i + 1}`, { videoTime: i / 30 },
    ])) };
    return context.getCompressionTransitionEvidence();
  };
  try {
    for (const proProfile of [
      [-18.4, -10.6, 0.4],
      [-23.3, -9.1, -2.5],
      [-19.5, -6.2, 4.2],
      [-12.9, -2.4, 0.1],
    ]) {
      const transition = evidenceFor(proProfile);
      assert.equal(transition.available, true);
      close(transition.frame3ReferenceFit, 1);
      close(transition.frame4ReferenceFit, 1);
      close(context.getThreePointProfilePenalty(transition, 'frame3').penalty, 0);
      close(context.getThreePointProfilePenalty(transition, 'frame4').penalty, 0);
    }

    const femaleAmateur = evidenceFor([7.0, 2.1, -7.4]);
    const maleAmateur = evidenceFor([-21.6, 0.8, 5.0]);
    assert.ok(femaleAmateur.frame3ReferenceFit < 0.35);
    assert.ok(femaleAmateur.frame4ReferenceFit < 0.60);
    assert.ok(maleAmateur.frame3ReferenceFit < 0.85);
    assert.ok(maleAmateur.frame4ReferenceFit < 0.80);
    const femaleF3Penalty = context.getThreePointProfilePenalty(femaleAmateur, 'frame3').penalty;
    const maleF3Penalty = context.getThreePointProfilePenalty(maleAmateur, 'frame3').penalty;
    assert.ok(femaleF3Penalty > maleF3Penalty);
    assert.ok(femaleF3Penalty > 1);
    assert.ok(maleF3Penalty > 0 && maleF3Penalty < 0.5);

    const previousParts = context.getFrameScoreParts;
    const previousTransition = context.getCompressionTransitionEvidence;
    try {
      context.getFrameScoreParts = () => [{ value: 1, weight: 1 }];
      context.getCompressionTransitionEvidence = () => femaleAmateur;
      const f3Result = { fm: {} };
      const f4Result = { fm: {} };
      assert.equal(context.computeSegmentScore(f3Result, 'frame3'), 9);
      assert.equal(context.computeSegmentScore(f4Result, 'frame4'), 9);
      close(f3Result.fm.compressionProfilePenalty3, femaleF3Penalty);
      close(f4Result.fm.compressionProfilePenalty4,
        context.getThreePointProfilePenalty(femaleAmateur, 'frame4').penalty);
    } finally {
      context.getFrameScoreParts = previousParts;
      context.getCompressionTransitionEvidence = previousTransition;
    }
  } finally {
    context.areVideoSourcesSame = old.same;
    context.frameSideMetricsHistory = old.spread;
    context.frameStateHistory = old.frames;
  }
});

test('four supplied player projects stay inside exponential F2/F4 reference ranges', () => {
  const players = [
    { lag: 59.17, compression: 47.95, pelvis: 10.25, c7: 4.74, ratio: 0.462, radius: 0.606, score: 10 },
    { lag: 65.81, compression: 48.92, pelvis: 20.97, c7: 7.59, ratio: 0.271, radius: 0.180, score: 10 },
    { lag: 49.53, compression: 47.21, pelvis: 15.90, c7: 14.60, ratio: 0.462, radius: 0.105, score: 10 },
    { lag: 61.31, compression: 36.15, pelvis: 20.19, c7: 6.14, ratio: 0.022, radius: 0.083, score: 10 },
  ];
  for (const player of players) {
    close(context.scoreLagAngle(player.lag), 1);
    close(context.scoreExponentialReferenceBand(player.compression, 35, 50, 0.18), 1);
    close(context.scoreExponentialReferenceBand(player.pelvis, 10, 28, 0.12), 1);
    close(context.scoreExponentialReferenceBand(player.c7, 0, 15, 0.12), 1);
    close(context.scoreImpactDownswingCoupling(player.ratio), 1);
    assert.equal(context.computeSegmentScore({ fm: {
      laggingAngleBDeg: player.lag,
      radiusCompressionRatio: player.compression / 100,
      pelvisLateralDelta: player.pelvis / 100,
      c7LateralDelta2: player.c7 / 100,
    } }, 'frame2'), player.score);
  }
  const amateurLag = [82.30, 98.21].map(context.scoreLagAngle);
  const amateurCompression = [27.68, 49.63]
    .map(value => context.scoreExponentialReferenceBand(value, 35, 50, 0.18));
  const amateurPelvis = [23.94, 33.24]
    .map(value => context.scoreExponentialReferenceBand(value, 10, 28, 0.12));
  const amateurC7 = [5.96, 30.49]
    .map(value => context.scoreExponentialReferenceBand(value, 0, 15, 0.12));
  assert.ok(amateurLag[0] < 0.25 && amateurLag[1] < amateurLag[0]);
  assert.ok(amateurCompression[0] < 0.5 && amateurCompression[1] === 1);
  assert.equal(amateurPelvis[0], 1);
  assert.ok(amateurPelvis[1] < 0.6);
  assert.equal(amateurC7[0], 1);
  assert.ok(amateurC7[1] < 0.2);
  const amateurScores = [
    { lag: 82.30, compression: 27.68, pelvis: 23.94, c7: 5.96, expected: 5.5 },
    { lag: 98.21, compression: 49.63, pelvis: 33.24, c7: 30.49, expected: 2.5 },
  ];
  for (const amateur of amateurScores) {
    assert.equal(context.computeSegmentScore({ fm: {
      laggingAngleBDeg: amateur.lag,
      radiusCompressionRatio: amateur.compression / 100,
      pelvisLateralDelta: amateur.pelvis / 100,
      c7LateralDelta2: amateur.c7 / 100,
    } }, 'frame2'), amateur.expected);
  }
});

test('single-interval core-hand radius magnitude does not replace the ordered profile score', () => {
  const scoreAt = radiusF4 => context.computeSegmentScore({
    fm: { armShaftAngleBDeg: 175, c7XPercent: 0, c7YPercent: 0, radiusF3: 1, radiusF4 },
  }, 'frame4');
  const previousTransition = context.getCompressionTransitionEvidence;
  context.getCompressionTransitionEvidence = () => ({ f4Bonus: 0, frame4ReferenceFit: 1 });
  try {
    const neutral = scoreAt(1);
    assert.equal(neutral, 10);
    assert.equal(scoreAt(1.71), neutral);
    assert.equal(scoreAt(0.29), neutral);
  } finally {
    context.getCompressionTransitionEvidence = previousTransition;
  }
});

test('Oh Sumin report adds bounded F3/F4 compression-easing supplements without requiring positive expansion', () => {
  const sample = frameTransitionFixtures.find(item => item.id === 'Oh-Sumin-driver-261005');
  assert.ok(sample);
  const old = {
    same: context.areVideoSourcesSame,
    frameSideMetricsHistory: context.frameSideMetricsHistory,
    frameStateHistory: context.frameStateHistory,
    groundForce: context.computeGroundForceTransitionReport,
    frameScoreParts: context.getFrameScoreParts,
  };
  context.areVideoSourcesSame = () => true;
  context.computeGroundForceTransitionReport = () => ({ score100: 84.93 });
  context.getFrameScoreParts = () => [{ value: 0.85, weight: 1 }];
  context.frameSideMetricsHistory = {};
  context.frameStateHistory = { front: {}, side: {} };
  try {
    const frame3 = { fm: { kneeExtensionDegB: 168.875, kneeExtDelta: 6.04,
      c7SwayPercent: 8.04 } };
    const frame4 = { fm: { armShaftAngleBDeg: 166.425,
      c7XPercent: 9.55, c7YPercent: 9.55 } };
    const base3 = context.computeSegmentScore(frame3, 'frame3');
    const base4 = context.computeSegmentScore(frame4, 'frame4');
    assert.equal(base3, sample.reportedFrameScores.frame3);
    assert.equal(base4, sample.reportedFrameScores.frame4);

    context.frameSideMetricsHistory = Object.fromEntries(sample.threePointSpreadPct.map((value, i) => [
      `frame${i + 1}`, { threePointSpreadRatio: value / 100 },
    ]));
    context.frameStateHistory.side = Object.fromEntries([1, 2, 3, 4].map(i => [
      `frame${i}`, { videoTime: i },
    ]));
    const trend = context.getCompressionTransitionEvidence();
    assert.equal(trend.available, true);
    const [f1, f2, f3, f4] = sample.threePointSpreadPct;
    const topToF2 = (f2 - f1) / f1 * 100;
    const f2ToF3 = (f3 - f2) / f2 * 100;
    const f3ToF4 = (f4 - f3) / f3 * 100;
    close(trend.initialCompressionPct, -topToF2);
    close(trend.f3EasingPct, f2ToF3 - topToF2);
    close(trend.f4EasingPct, f3ToF4 - f2ToF3);
    assert.ok(trend.f3Bonus > 0.48 && trend.f3Bonus <= 0.5);
    assert.ok(trend.f4Bonus > 0.3 && trend.f4Bonus < 0.35);
    assert.deepEqual(sample.intervalChangesPct, [-13.8, -8.7, -5.6]);
    assert.ok(sample.intervalChangesPct.every(value => value < 0),
      'ongoing contraction remains eligible when each interval moves toward zero');

    const updated3 = context.computeSegmentScore(frame3, 'frame3');
    const updated4 = context.computeSegmentScore(frame4, 'frame4');
    assert.equal(updated3, 9);
    assert.equal(updated4, 8);
    assert.ok(updated3 > base3 && updated4 < base4);
    assert.match(context.formatFrameScoreCalibration(frame3), /Three-point trajectory: F1B→F2B -13\.8% · F2B→F3B -8\.6%/);
    assert.match(context.formatFrameScoreCalibration(frame4), /outside-player-band deduction −0\.28/);

    context.frameStateHistory.side.frame4.videoTime = 2;
    assert.equal(context.getCompressionTransitionEvidence().available, false,
      'reversed phase timestamps cannot earn the supplement');
    context.areVideoSourcesSame = () => false;
    assert.equal(context.getCompressionTransitionEvidence().available, false,
      'different video sources cannot earn the supplement');
    assert.equal(sample.reportedEnginePct.type3, 33.6,
      'frame-score supplements do not alter engine classification evidence');
  } finally {
    Object.assign(context, {
      areVideoSourcesSame: old.same,
      frameSideMetricsHistory: old.frameSideMetricsHistory,
      frameStateHistory: old.frameStateHistory,
      computeGroundForceTransitionReport: old.groundForce,
      getFrameScoreParts: old.frameScoreParts,
    });
  }
});

test('reported F1 score and independent F5/F6 behavior remain unchanged', () => {
  context.frameMetricsHistory = { frame3: { _arcB: 15.7 } };
  const cases = {
    frame1: { fm: { spineAngleDelta: -4.2, xFactorDelta: -172, topShaftAngleDeg: 9.4, c7XPercent: 3.2, c7YPercent: 0.3 } },
    frame2: { fm: { laggingAngleDelta: -90.5, pelvisLateralDelta: 0.276, radiusCompressionRatio: 0.387 } },
    frame3: { fm: { kneeExtDelta: 9.9, c7SwayPercent: 1, leadLegBraceRatioB: 0.146,
      hipDropPercent: 0.5, c7RisePercent: 1.5, radiusExpansionRatio: -0.635,
      radiusF3: 1.146, radiusF4: 1.227, arcF4: 41.9 } },
    frame4: { _arcBCurrent: 41.9, fm: { radiusExpansionRatio: -0.61, armShaftDelta: null,
      lateralLeanDelta: -0.3, c7XPercent: 7.5, c7YPercent: 0.9 } },
  };
  for (const [frame, expected] of Object.entries({ frame1: 9 })) {
    assert.equal(context.computeRawSegmentScore(cases[frame], frame), expected, frame);
  }
  for (const frame of ['frame5', 'frame6']) {
    const result = { fm: { _consistency: { score100: 77 }, _tempo: { score100: 86 } } };
    assert.equal(context.computeSegmentScore(result, frame), frame === 'frame5' ? 7.7 : 8.6);
    assert.equal(result.provisionalMetricScore, false);
  }
  context.frameMetricsHistory = {};
});

test('five PDF experiments retain motion differences instead of converging to nine points', () => {
  const output = [];
  context.getSwingTypeReadiness = () => ({ ready: true });
  context.areVideoSourcesSame = () => true;
  try {
    for (const sample of swingReportFixtures) {
      context.getDownswingSideEvidence = () => ({ pathFit: sample.pathFit });
      context.frameMetricsHistory = Object.fromEntries(sample.radii.map((radius, i) => [
        `frame${i + 1}`, { _swingRadiusB: radius },
      ]));
      context.frameSideMetricsHistory = Object.fromEntries(sample.spread.map((spread, i) => [
        `frame${i + 1}`, { threePointSpreadRatio: spread / 100 },
      ]));
      const f3 = { ...sample.f3, radiusF3: sample.radii[2], radiusF4: sample.radii[3] };
      const f4 = { ...sample.f4, radiusF3: sample.radii[2], radiusCurrent: sample.radii[3] };
      context.segmentDeltaHistory = {
        frame1: { fm: sample.f1 }, frame2: { fm: sample.f2 },
        frame3: { fm: f3 }, frame4: { fm: f4 },
        frame6: { fm: { timeDeltaSec: 0.06, lagAngleA6: 90 } },
      };
      const scores = ['frame2', 'frame3', 'frame4'].map(frame =>
        context.computeSegmentScore(context.segmentDeltaHistory[frame], frame));
      const type = context.classifySwingType();
      assert.ok(type.scores.type3 >= 0 && type.scores.type3 <= 1, sample.id);
      const decision = context.getPowerEngineDecision(type);
      assert.ok(['ATE', 'LSE', 'VEE', 'RLH', 'RVH', 'LVH', 'TKE', null].includes(decision.code), sample.id);
      context.areVideoSourcesSame = () => false;
      assert.equal(context.getPowerEngineDecision(context.classifySwingType()).code, null);
      context.areVideoSourcesSame = () => true;
      for (const score of scores) assert.ok(Number.isFinite(score) && score >= 0 && score <= 10);
      output.push({
        id: sample.id,
        scores,
        radiusPenalty: context.segmentDeltaHistory.frame4.fm.proReferenceExpansionPenalty4,
        engine: decision.code,
      });
    }
    assert.ok(output[0].radiusPenalty < 0.01 && output[1].radiusPenalty < 0.01,
      'Lee and Yu F3→F4 radius magnitudes stay in the expanded player reference envelope');
    assert.ok(new Set(output.map(item => item.scores[2])).size >= 2,
      `F4 retains distinct outcomes: ${JSON.stringify(output)}`);
    console.log('PDF metric-score regression:', JSON.stringify(output));
  } finally {
    context.areVideoSourcesSame = () => false;
    context.getDownswingSideEvidence = () => null;
    context.frameMetricsHistory = {};
    context.frameSideMetricsHistory = {};
    context.segmentDeltaHistory = {};
  }
});

test('vertical engine uses extension and upward motion, not downward loading or a straight static knee', () => {
  context.areVideoSourcesSame = () => true;
  try {
    const sample = { kneeExtDelta: 4.6, kneeExtensionDegB: 178.7, hipDropPercent: -1.4 };
    const rising = context.getVerticalEngineEvidence(sample);
    const falling = context.getVerticalEngineEvidence({ ...sample, hipDropPercent: 1.4 });
    assert.ok(rising.fit > falling.fit);
    close(rising.hipRisePercent, 1.4);
    const still = context.getVerticalEngineEvidence({ kneeExtDelta: 0, kneeExtensionDegB: 179, hipDropPercent: 0 });
    close(still.fit, 0);
    assert.equal(still.available, true);
    assert.equal(context.getVerticalEngineEvidence({ kneeExtDelta: 5 }).available, false);
    assert.equal(context.getVerticalEngineEvidence({ ...sample, distanceComparable: false }).available, false);
    for (const enginePhaseDeltaSec of [0, -0.03, null]) {
      assert.equal(context.getVerticalEngineEvidence({ ...sample, enginePhaseDeltaSec }).available, false);
    }
    assert.equal(context.getVerticalEngineEvidence({ ...sample, enginePhaseDeltaSec: .03 }).available, true);
    context.areVideoSourcesSame = () => false;
    assert.equal(context.getVerticalEngineEvidence(sample).fit, null);
    const text = context.formatEngineEvidence({ verticalEvidence: rising });
    assert.match(text, /ground forces are unmeasured/);
  } finally {
    context.areVideoSourcesSame = () => false;
  }
});

test('engine decision does not turn a 51% near tie into a single engine', () => {
  const result = { share: { type1: .512, type2: .408, type3: .08 },
    scores: { type1: .96, type2: .765, type3: .15 } };
  assert.equal(context.getPowerEngineDecision(result).code, 'RLH');
  assert.equal(context.getPowerEngineDecision({ ...result,
    share: { type1: .60, type2: .30, type3: .10 } }).code, 'ATE');
  assert.equal(context.getPowerEngineDecision({ ...result,
    share: { type1: .512, type2: .408, type3: .08 },
    scores: { type1: .5, type2: .2, type3: .05 } }).code, null);
});

test('vertical interval checks separate lead-hip drop from pelvis-center loading and late rise', () => {
  const old = {
    frameStateHistory: context.frameStateHistory, frameMetricsHistory: context.frameMetricsHistory,
    frameSideMetricsHistory: context.frameSideMetricsHistory,
    getLockedReferenceLineLength: context.getLockedReferenceLineLength, uiLanguage: context.uiLanguage,
  };
  context.areVideoSourcesSame = () => true;
  context.getLockedReferenceLineLength = () => .5;
  context.frameMetricsHistory = { frame3: { pelvisCenterNormY: .56 } };
  context.frameSideMetricsHistory = {
    frame2: { pelvisCenterNormY: .55 }, frame3: { pelvisCenterNormY: .55 },
    frame4: { pelvisCenterNormY: .54 },
  };
  context.frameStateHistory = {
    front: { frame3: { videoTime: 1.1 } },
    side: { frame2: { videoTime: 1 }, frame3: { videoTime: 1.2 }, frame4: { videoTime: 1.3 } },
  };
  try {
    const f3 = { kneeExtDelta: 6.7, hipDropPercent: .8 };
    const diagnostics = context.getVerticalMotionDiagnostics(f3);
    assert.equal(diagnostics.extensionWithHipDrop, true);
    assert.equal(diagnostics.observationOnly, true);
    close(diagnostics.intervals[0].risePercent, -2);
    close(diagnostics.intervals[1].risePercent, 2);
    close(diagnostics.intervals[2].risePercent, 2);
    const fit = context.getVerticalEngineEvidence(f3).fit;
    for (const lang of ['ko', 'en']) {
      context.uiLanguage = lang;
      const text = context.formatVerticalMotionDiagnostics(diagnostics);
      assert.match(text, /F2 B→F3 A/);
      assert.match(text, lang === 'ko' ? /골반 중심과 왼고관절은 다른 점/ : /distinct landmarks/);
      assert.match(text, lang === 'ko' ? /엔진\/점수 미반영/ : /excluded from engine fits/);
    }
    context.frameSideMetricsHistory.frame4.pelvisCenterNormY = .1;
    close(context.getVerticalEngineEvidence(f3).fit, fit, 'added intervals must not raise VEE');
    for (const time of [1.2, 1.1]) {
      context.frameStateHistory.side.frame4.videoTime = time;
      const last = context.getVerticalMotionDiagnostics(f3).intervals[2];
      assert.equal(last.reason, 'phase-order');
      assert.equal(last.risePercent, null);
    }
    delete context.frameStateHistory.side.frame4.videoTime;
    assert.equal(context.getVerticalMotionDiagnostics(f3).intervals[2].reason, 'missing-time');
    context.frameStateHistory.side.frame4.videoTime = 1.3;
    delete context.frameSideMetricsHistory.frame4.pelvisCenterNormY;
    assert.equal(context.getVerticalMotionDiagnostics(f3).intervals[2].reason, 'missing-pelvis');
    context.areVideoSourcesSame = () => false;
    assert.ok(context.getVerticalMotionDiagnostics(f3).intervals.every(i => i.reason === 'different-source' && i.risePercent === null));
    context.areVideoSourcesSame = () => true;
    assert.ok(context.getVerticalMotionDiagnostics({ ...f3, distanceComparable: false }).intervals.every(i => i.risePercent === null));
    assert.equal(context.getVerticalMotionDiagnostics({ ...f3, kneeExtDelta: 0 }).extensionWithHipDrop, false);
  } finally {
    Object.assign(context, old);
    context.areVideoSourcesSame = () => false;
  }
});

test('pelvis-center vertical metrics use the same anatomical point, never F3 lead hip or F4 clubhead', () => {
  for (const frame of ['frame2', 'frame3', 'frame4']) {
    const points = pointsFor(frame);
    const core = points.find(p => p.type === (frame === 'frame2' ? 'pelvis' : 'pelvisCenter'));
    core.y = .62;
    const result = metrics(frame, points);
    close(result.pelvisCenterNormY, .62);
    assert.equal(metrics(frame, points.filter(p => p !== core)).pelvisCenterNormY, null);
  }
});

test('updated Lee report keeps observed extension distinct from inferred power ordering', () => {
  context.areVideoSourcesSame = () => true;
  try {
    const evidence = context.getVerticalEngineEvidence({
      kneeExtensionDegA: 167.6, kneeExtensionDegB: 174.4, kneeExtDelta: 6.7,
      hipDropPercent: .8, enginePhaseDeltaSec: .03,
    });
    close(evidence.riseFit, 0);
    close(evidence.fit, context.rampScore(6.7, 0, 8) * .5);
    close(evidence.previousFit, context.rampScore(6.7, 0, 15) * .7);
    assert.equal(evidence.diagnostics.extensionWithHipDrop, true);
    assert.ok(evidence.diagnostics.intervals.every(i => i.risePercent === null),
      'PDF-only data cannot reconstruct missing pelvis-center trajectories');
  } finally {
    context.areVideoSourcesSame = () => false;
  }
});

test('Type 3 scores P6 lag retention, P7 impact extension and vertical evidence at 30:30:40', () => {
  const oldLanguage = context.uiLanguage;
  context.areVideoSourcesSame = () => true;
  const vertical = { available: true, fit: .6 };
  const p6p7 = { timeDeltaSec: .06, lagAngleA6: 90 };
  try {
    for (const [lag, expected] of [[20, 0], [30, 0], [50, .5], [70, 1], [90, 1],
      [110, 1], [130, .5], [150, 0], [170, 0]]) {
      close(context.scoreP6LagRetention(lag), expected);
      const evidence = context.getType3CombinedEvidence(
        { ...p6p7, lagAngleA6: lag }, vertical, 175);
      close(evidence.lagRetentionFit, expected);
      close(evidence.impactExtensionFit, 1);
      close(evidence.fit, .30 * expected + .30 + .40 * .6);
    }
    for (const [alignment, expected] of [[139, 0], [140, 0], [157.5, .5], [175, 1], [180, 1]]) {
      const evidence = context.getType3CombinedEvidence(p6p7, vertical, alignment);
      close(evidence.impactExtensionFit, expected);
      close(evidence.fit, .30 + .30 * expected + .40 * .6);
    }
    for (const invalid of [null, -0.01, 0, NaN]) {
      const evidence = context.getType3CombinedEvidence(
        { ...p6p7, timeDeltaSec: invalid }, vertical, 175);
      assert.equal(evidence.available, false);
      assert.equal(evidence.fit, null);
    }
    assert.equal(context.getType3CombinedEvidence({ ...p6p7, lagAngleA6: null }, vertical, 175).fit, null);
    assert.equal(context.getType3CombinedEvidence(p6p7, vertical, null).fit, null);
    assert.equal(context.getType3CombinedEvidence(p6p7, { ...vertical, available: false }, 175).fit, null);
    const incomplete = context.getType3CombinedEvidence(p6p7, vertical, null);
    const text = context.formatType3CombinedEvidence({
      type3CombinedEvidence: incomplete, verticalEvidence: vertical,
    });
    assert.match(text, /P6→P7/);
    assert.match(text, /Hold reasons/);
    context.areVideoSourcesSame = () => false;
    assert.equal(context.getType3CombinedEvidence(p6p7, vertical, 175).fit, null);
    const balanced = { share: { type1: .34, type2: .33, type3: .33 },
      scores: { type1: .7, type2: .7, type3: .7 },
      type3CombinedEvidence: { available: true }, verticalEvidence: { fit: 0 },
      coactivation: { all: false, vertical: false } };
    assert.equal(context.getPowerEngineDecision(balanced).code, null, 'shape alone cannot create TKE');
    assert.equal(context.getPowerEngineDecision({ ...balanced, verticalEvidence: { fit: .5 },
      coactivation: { all: false, vertical: true } }).code, 'TKE');
  } finally {
    context.areVideoSourcesSame = () => false;
    context.uiLanguage = oldLanguage;
  }
});

test('YouTube report Type 3 fit reflects retained P6 lag and impact extension despite shrinking three-point spread', () => {
  const sample = type3PhaseFixtures.find(item => item.id === 'YouTube-261005');
  assert.ok(sample);
  context.areVideoSourcesSame = () => true;
  try {
    const evidence = context.getType3CombinedEvidence({
      timeDeltaSec: sample.p6ToP7Ms / 1000,
      lagAngleA6: sample.p6LagAngleDeg,
    }, { available: true, fit: sample.verticalFit }, sample.impactArmShaftAngleDeg);
    close(evidence.lagRetentionFit, 1);
    close(evidence.impactExtensionFit, 1);
    close(evidence.fit, .30 + .30 + .40 * sample.verticalFit);
    assert.ok(sample.threePointChanges.every(change => change < 0),
      'the measured three-point metric contracts through impact and is not a suitable expansion proxy here');
    const oldFit = .30 * context.rampScore(-sample.threePointChanges[0], 2, 15)
      + .30 * context.rampScore(sample.threePointChanges[2], 2, 10)
      + .40 * sample.verticalFit;
    const otherFits = oldFit * (100 / sample.reportedEnginePct.type3 - 1);
    const type2Fit = otherFits * sample.reportedEnginePct.type2
      / (sample.reportedEnginePct.type1 + sample.reportedEnginePct.type2);
    const updatedType3Pct = evidence.fit / (otherFits + evidence.fit) * 100;
    assert.ok(updatedType3Pct > sample.reportedEnginePct.type3);
    assert.ok(evidence.fit > type2Fit, 'Type 3 should no longer rank below the inferred Type 2 fit');
  } finally {
    context.areVideoSourcesSame = () => false;
  }
});

test('VEE calibration balances extension and rise without treating static alignment as motion', () => {
  context.areVideoSourcesSame = () => true;
  try {
    for (const [delta, rise, expected] of [[0, 0, 0], [-.4, 2, .324], [8, 0, .5],
      [4, 0, .25], [0, 3, .5], [8, 3, 1], [30, 10, 1], [-5, -2, 0]]) {
      const result = context.getVerticalEngineEvidence({
        kneeExtDelta: delta, hipDropPercent: -rise, enginePhaseDeltaSec: .03,
      });
      close(result.fit, expected);
    }
    const still = context.getVerticalEngineEvidence({ kneeExtDelta: 0, hipDropPercent: 0,
      kneeExtensionDegB: 180, enginePhaseDeltaSec: .03 });
    close(still.fit, 0);
    for (const field of ['kneeExtDelta', 'hipDropPercent']) {
      const result = context.getVerticalEngineEvidence({ kneeExtDelta: 8, hipDropPercent: -3, [field]: null });
      assert.equal(result.available, false);
    }
    for (const dt of [0, -.03, null]) {
      assert.equal(context.getVerticalEngineEvidence({
        kneeExtDelta: 8, hipDropPercent: -3, enginePhaseDeltaSec: dt,
      }).available, false);
    }
  } finally {
    context.areVideoSourcesSame = () => false;
  }
});

test('Rory/Tiger iron and female PDFs retain vertical observations but cannot invent missing composite evidence', () => {
  context.getSwingTypeReadiness = () => ({ ready: true });
  context.areVideoSourcesSame = () => true;
  const output = [];
  try {
    for (const sample of verticalCalibrationFixtures) {
      context.segmentDeltaHistory = Object.fromEntries([sample.f1, sample.f2, sample.f3].map((fm, i) => [
        `frame${i + 1}`, { fm: { ...fm } },
      ]));
      context.frameMetricsHistory = Object.fromEntries(sample.radii.map((r, i) => [
        `frame${i + 1}`, { _swingRadiusB: r },
      ]));
      const before = JSON.stringify(context.segmentDeltaHistory);
      const result = context.classifySwingType();
      assert.equal(result.type3CombinedEvidence.available, false, 'PDF lacks spread and timestamps');
      assert.equal(context.getPowerEngineDecision(result).code, null);
      assert.equal(result.coactivation.all, false, 'coactivation thresholds are unchanged');
      close(result.scores.type1 / result.scores.type2,
        result.previousVerticalPct.type1 / result.previousVerticalPct.type2);
      close(Object.values(result.pct).reduce((sum, v) => sum + v), 100);
      assert.equal(JSON.stringify(context.segmentDeltaHistory), before);
      for (const lang of ['ko', 'en']) {
        context.uiLanguage = lang;
        const text = context.formatEngineEvidence(result);
        assert.match(text, /0→8°/);
        assert.match(text, /50%/);
        assert.match(text, /0→15°/);
        assert.match(text, lang === 'ko' ? /실험적 보정/ : /Experimental case-based calibration/);
      }
      output.push({ id: sample.id, reported: sample.reportedPct,
        previousReconstructed: result.previousVerticalPct, composite: 'held: missing spread/times',
        engine: context.getPowerEngineDecision(result).code });
    }
    console.log('Iron/female report evidence (rounded values, spread unavailable):', JSON.stringify(output));
  } finally {
    context.segmentDeltaHistory = {};
    context.frameMetricsHistory = {};
    context.frameSideMetricsHistory = {};
    context.areVideoSourcesSame = () => false;
    context.uiLanguage = 'en';
  }
});

test('Rory report metrics produce a measured motion candidate without name-based overrides', () => {
  context.getSwingTypeReadiness = () => ({ ready: true });
  context.areVideoSourcesSame = () => true;
  context.segmentDeltaHistory = {
    frame1: { fm: { c7XPercent: .2, c7YPercent: .2, xFactorDelta: -156.1 } },
    frame2: { fm: { radiusCompressionRatio: .402, pelvisLateralDelta: .237 } },
    frame3: { fm: { kneeExtDelta: 4.6, kneeExtensionDegB: 178.7, hipDropPercent: -1.4,
      c7RisePercent: 1.2, c7SwayPercent: .1, leadLegBraceRatioB: .05 } },
    frame4: { fm: { armShaftAngleBDeg: 158.2 } },
    frame6: { fm: { timeDeltaSec: .06, lagAngleA6: 90 } },
  };
  context.frameMetricsHistory = Object.fromEntries([4.518,2.701,1.335,.989].map((r,i)=>[
    `frame${i+1}`,{_swingRadiusB:r},
  ]));
  context.frameSideMetricsHistory = Object.fromEntries([18.87,16.64,16.80,16.41].map((r,i)=>[
    `frame${i+1}`,{threePointSpreadRatio:r/100},
  ]));
  context.frameStateHistory = { front: {}, side: Object.fromEntries([1,2,3,4].map(i=>[
    `frame${i}`,{videoTime:i},
  ])) };
  try {
    const result = context.classifySwingType();
    assert.equal(result.missingEngineEvidence.length, 0);
    assert.equal(context.getPowerEngineDecision(result).code, 'TKE');
    assert.ok(result.scores.type3 > 0);
    assert.ok(result.scores.type3 < result.scores.type1);
    context.segmentDeltaHistory.frame3.fm.hipDropPercent = null;
    assert.equal(context.getPowerEngineDecision(context.classifySwingType()).code, null);
  } finally {
    context.segmentDeltaHistory = {};
    context.frameMetricsHistory = {};
    context.frameSideMetricsHistory = {};
    context.frameStateHistory = { front: {}, side: {} };
    context.areVideoSourcesSame = () => false;
  }
});

test('LSE calibration keeps F2 units and preserves the previous F5-first result separately', () => {
  context.areVideoSourcesSame = () => true;
  try {
    const f2 = { pelvisLateralDelta: .13 };
    const evidence = context.getLinearEngineEvidence(f2, { pelvisShiftRatio: .04 }, .5);
    close(evidence.fit, .9);
    close(evidence.previousFit, context.rampScore(.04, 0, .30) * .9);
    assert.equal(evidence.source, 'F2');
    assert.equal(evidence.previousSource, 'F5');
    close(context.getLinearEngineEvidence(f2, { pelvisShiftRatio: .30 }, .5).fit, evidence.fit);
    close(context.getLinearEngineEvidence({ pelvisLateralDelta: -.13 }, {}, .5).fit, evidence.fit);
    close(context.getLinearEngineEvidence({ pelvisLateralDelta: 0 }, {}, .5).fit, 0);
    close(context.getLinearEngineEvidence({ pelvisLateralDelta: .065 }, {}, null).fit, .5);
    close(context.getLinearEngineEvidence({ pelvisLateralDelta: 1 }, {}, null).fit, 1);
    let previous = 0;
    for (const shift of [.001, .02, .06, .10, .125, .13, .20]) {
      const fit = context.getLinearEngineEvidence({ pelvisLateralDelta: shift }, {}, null).fit;
      assert.ok(fit >= previous && fit <= 1);
      previous = fit;
    }
    for (const invalid of [null, NaN, Infinity]) {
      assert.equal(context.getLinearEngineEvidence({ pelvisLateralDelta: invalid }, { pelvisShiftRatio: .2 }, .5).fit, null);
    }
    assert.equal(context.getLinearEngineEvidence({ ...f2, distanceComparable: false }, {}, .5).fit, null);
    context.areVideoSourcesSame = () => false;
    assert.equal(context.getLinearEngineEvidence(f2, { pelvisShiftRatio: .3 }, .5).fit, null);
  } finally {
    context.areVideoSourcesSame = () => false;
  }
});

test('three reference reports gain LSE balance without forced ATE/VEE ordering or score changes', () => {
  context.getSwingTypeReadiness = () => ({ ready: true });
  context.areVideoSourcesSame = () => true;
  context.frameStateHistory = { front: {}, side: Object.fromEntries([1,2,3,4].map(i=>[
    `frame${i}`,{videoTime:i},
  ])) };
  const output = [];
  try {
    const shifts = engineCalibrationFixtures.map(sample => sample.f2.pelvisLateralDelta).sort((a, b) => a - b);
    close(shifts[1], .13);
    for (const sample of engineCalibrationFixtures) {
      context.segmentDeltaHistory = {
        frame1: { fm: { ...sample.f1 } }, frame2: { fm: { ...sample.f2 } },
        frame3: { fm: { ...sample.f3, enginePhaseDeltaSec: .03 } },
        frame4: { fm: { armShaftAngleBDeg: 165 } },
        frame6: { fm: { timeDeltaSec: .06, lagAngleA6: 90 } },
      };
      context.frameMetricsHistory = Object.fromEntries(sample.radii.map((r, i) => [
        `frame${i + 1}`, { _swingRadiusB: r },
      ]));
      context.frameSideMetricsHistory = Object.fromEntries(sample.spread.map((r, i) => [
        `frame${i + 1}`, { threePointSpreadRatio: r / 100 },
      ]));
      const before = JSON.stringify(context.segmentDeltaHistory);
      const result = context.classifySwingType();
      assert.equal(context.getPowerEngineDecision(result).code, 'TKE', sample.id);
      assert.equal(result.linearEvidence.previousSource, 'F2', 'F5 is absent in transcribed reports');
      assert.ok(result.scores.type2 > result.previousScores.type2, sample.id);
      close(result.scores.type1, result.previousScores.type1);
      close(result.scores.type3, result.previousScores.type3);
      close(Object.values(result.pct).reduce((a, b) => a + b), 100);
      assert.equal(JSON.stringify(context.segmentDeltaHistory), before, 'quality metrics remain untouched');
      output.push({ id: sample.id, previousF2Fallback: result.previousPct, calibrated: result.pct });
      for (const language of ['ko', 'en']) {
        context.uiLanguage = language;
        const text = context.formatLinearEngineEvidence(result);
        assert.match(text, /13%/);
        assert.match(text, /F2/);
        assert.match(text, language === 'ko' ? /실제 파워·우수성 검증 전/ : /not validated power/);
      }
      context.segmentDeltaHistory.frame2 = { fm: {} };
      context.segmentDeltaHistory.frame5 = { fm: { pelvisShiftRatio: .3 } };
      assert.equal(context.getPowerEngineDecision(context.classifySwingType()).code, null,
        'F5 alone cannot restore missing F2 engine evidence');
    }
    console.log('Three-case experimental calibration (F5 unavailable):', JSON.stringify(output));
  } finally {
    context.segmentDeltaHistory = {};
    context.frameMetricsHistory = {};
    context.frameSideMetricsHistory = {};
    context.frameStateHistory = { front: {}, side: {} };
    context.areVideoSourcesSame = () => false;
    context.uiLanguage = 'en';
  }
});

test('coactivation applies common criteria to Tiger and holds incomplete or single-motion evidence', () => {
  const vertical = { available: true, kneeChange: 4.2, hipRisePercent: 2.6 };
  const c = context.getEngineCoactivation(.776, 1, .125, vertical);
  assert.equal(c.all, true);
  const candidate = { share: { type1: .541, type2: .20, type3: .259 },
    scores: { type1: .854, type2: .316, type3: .409 }, coactivation: c };
  assert.equal(context.getPowerEngineDecision(candidate).code, 'TKE');
  assert.equal(context.getPowerEngineDecision(candidate).basis, 'experimental-coactivation');
  assert.equal(context.getEngineCoactivation(.776, 1, .099, vertical).all, false);
  assert.equal(context.getEngineCoactivation(.776, 1, .125, { ...vertical, kneeChange: 2.9 }).all, false);
  assert.equal(context.getEngineCoactivation(.776, 1, .125, { ...vertical, hipRisePercent: .9 }).all, false);
  assert.equal(context.getEngineCoactivation(.776, 1, .125, { ...vertical, available: false }).all, false);
  assert.equal(context.getEngineCoactivation(null, 1, .125, vertical).all, false);
  assert.equal(context.getPowerEngineDecision({ ...candidate, missingEngineEvidence: ['missing'] }).code, null);
  assert.match(context.formatEngineCoactivation({ coactivation: c }), /two examples/);
});

test('neutral three-point changes cannot create a VEE classification and weak fits cannot create TKE', () => {
  close(context.getThreePointDirectionFit(0.2, 1), 0.5);
  close(context.getThreePointDirectionFit(-0.7, 1), 0.5);
  close(context.getThreePointDirectionFit(0.6, 1), 0.5);
  const weak = { share: { type1: 0.34, type2: 0.33, type3: 0.33 },
    scores: { type1: 0.10, type2: 0.09, type3: 0.09 } };
  assert.equal(context.getPowerEngineDecision(weak).code, null);
  const strong = { ...weak, scores: { type1: 0.8, type2: 0.78, type3: 0.78 } };
  assert.equal(context.getPowerEngineDecision(strong).code, 'TKE');
});

test('cross-video coordinate shifts do not become score or engine evidence', () => {
  const a = context.getFrameScoreParts({ distanceComparable: false, laggingAngleBDeg: 60,
    radiusCompressionRatio: 0.4, pelvisLateralDelta: 0.25 }, 'frame2', null);
  assert.equal(a[2].value, null);
  const b = context.computeGroundForceTransitionReport({ distanceComparable: false,
    leadLegBraceRatioB: 0.1, hipDropPercent: 100, c7RisePercent: 100 });
  assert.equal(b.hipLoadScore, null);
  assert.equal(b.c7EarlyRiseScore, null);
  const c = context.getFrameScoreParts({ distanceComparable: false, armShaftAngleBDeg: 177,
    c7XPercent: 1, c7YPercent: 1 }, 'frame4', null);
  assert.equal(c[1].value, null);
  assert.equal(c[2].value, null);
  context.frameSideMetricsHistory = { frame4: { armShaftAngleDeg: 177 } };
  assert.equal(context.getImpactAlignment({ armShaftAngleBDeg: null }), null, 'explicit deletion cannot use stale data');
  context.frameSideMetricsHistory = {};
});

test('backswing geometry is invariant to aspect-correct representation and reports near matches honestly', () => {
  const sandbox = vm.createContext({
    clamp: context.clamp, frontVideo: { videoWidth: 1600, videoHeight: 900 },
    BACKSWING_PHASES: ['address', 'p1', 'p2', 'p3', 'p4', 'top', 'transition', 'downP6'],
    BACKSWING_OUTSIDE_THRESHOLD: 0.05, BACKSWING_P1_PATH_THRESHOLD: 0.03,
    getBackswingPointLabels: phase => phase === 'address' || phase === 'top' ? [1, 2, 3] : [1, 2],
    backswingPhaseSelect: { querySelector: () => ({ textContent: '' }) },
  });
  for (const name of ['getAnalysisAspect', 'classifyBackswing']) {
    vm.runInContext(html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`))[0], sandbox);
  }
  const positions = {
    address: [[0.65, 0.9], [0.52, 0.6], [0.45, 0.4]],
    p1: [[0.45, 0.5], [0.55, 0.85]], p2: [[0.4, 0.4], [0.55, 0.4]],
    p3: [[0.38, 0.3], [0.3, 0.1]], p4: [[0.42, 0.2], [0.3, 0.15]],
    top: [[0.5, 0.2], [0.42, 0.1], [0.6, 0.1]],
    transition: [[0.38, 0.3], [0.3, 0.2]], downP6: [[0.48, 0.6], [0.55, 0.6]],
  };
  const frames = Object.fromEntries(Object.entries(positions).map(([phase, values], i) => [
    phase, { time: i, points: values.map(([x, y]) => ({ x, y })) },
  ]));
  const landscape = sandbox.classifyBackswing(frames);
  sandbox.frontVideo = { videoWidth: 900, videoHeight: 1600 };
  const portraitFrames = Object.fromEntries(Object.entries(frames).map(([phase, frame]) => [
    phase, { ...frame, points: frame.points.map(p => ({ x: p.x * (16 / 9) / (9 / 16), y: p.y })) },
  ]));
  const portrait = sandbox.classifyBackswing(portraitFrames);
  assert.equal(portrait.profileCode, landscape.profileCode);
  assert.equal(portrait.nearMatch, landscape.nearMatch);
  for (const key of ['outsideRatio', 'p3ReturnDistance', 'bestCandidateFit']) close(portrait[key], landscape[key]);
});

test('reanalysis of F2 refreshes downstream expansion ratios and scores', () => {
  context.frameMetricsHistory = {
    frame2: { _swingRadiusB: 0.2 },
    frame3: { _swingRadiusB: 0.25 },
    frame4: { _swingRadiusB: 0.3 },
  };
  context.segmentDeltaHistory = { frame3: { fm: {} }, frame4: { fm: {} } };
  context.computeSegmentScore = result => result.fm.radiusExpansionRatio;
  context.refreshFrameRadiusExpansion();
  close(context.segmentDeltaHistory.frame3.fm.radiusExpansionRatio, 0.25);
  close(context.segmentDeltaHistory.frame4.fm.radiusExpansionRatio, 0.5);
  context.frameMetricsHistory.frame2._swingRadiusB = 0.1;
  context.refreshFrameRadiusExpansion();
  close(context.segmentDeltaHistory.frame3.fm.radiusExpansionRatio, 1.5);
  close(context.segmentDeltaHistory.frame4.fm.radiusExpansionRatio, 2);
  close(context.segmentScoreHistory.frame4, 2);
});

test('reset invalidates pending pose scans before they can repopulate cache or restore old time', async () => {
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  let seeks = 0;
  const sandbox = vm.createContext({
    analysisGeneration: 1, DOMException, Number, Math,
    uiLanguage: 'en', poseSampleCache: new WeakMap(),
    ensureVideoReady: () => ready,
    getPoseLandmarker: async () => ({ detect: () => { throw new Error('stale scan must not detect'); } }),
    seekVideoTo: async () => { seeks++; },
  });
  for (const name of ['assertAnalysisGeneration', 'scanVideoPoses']) {
    vm.runInContext(html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }|  async function ${name}\\([\\s\\S]*?\\n  }`))[0], sandbox);
  }
  const video = { duration: 1, currentTime: .5, src: 'test', pause: () => {} };
  const pending = sandbox.scanVideoPoses(video, () => {});
  sandbox.analysisGeneration++;
  release();
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(sandbox.poseSampleCache.has(video), false);
  assert.equal(seeks, 0);
});

test('full reset clears all analysis inputs and guards asynchronous result writers', () => {
  const reset = html.match(/  function resetAll\([\s\S]*?\n  }/)[0];
  assert.ok(reset.indexOf('confirm(') < reset.indexOf('analysisGeneration += 1'));
  for (const text of [
    "selectedSegment = 'frame1'", 'autoFrameAdvanceTarget = null',
    'frameStateHistory = { front: {}, side: {} }', 'baselineFrontResult = null',
    'frame1ReferenceSnapshot = { front: null, side: null }',
    'distanceReferencePendingPoints = { front: [], side: [] }',
    'distanceReferenceActive = false', 'distanceMeasureActive = false',
    'poseSampleCache.delete(frontVideo)', 'poseSampleCache.delete(sideVideo)',
    'pauseBothVideos()', 'cancelAnimationFrame(motionAnalysisFrame)',
    'setBackswingMode(false)', 'swingCompareActive = false',
    "resetViewAnalysis('front')", "resetViewAnalysis('side')", 'clearAnalysisResults()',
  ]) assert.ok(reset.includes(text), text);
  for (const name of ['findVideoPosition', 'requestGeminiAnalysis']) {
    const source = html.match(new RegExp(`  async function ${name}\\([\\s\\S]*?\\n  }`))[0];
    assert.ok(source.includes('const generation = analysisGeneration'));
    assert.ok(source.includes('assertAnalysisGeneration(generation)'));
    assert.ok(source.includes('if (generation !== analysisGeneration) return;'));
  }
});
