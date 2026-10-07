import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const phases = ['address', 'p1', 'p2', 'p3', 'p4', 'top', 'transition', 'downP6'];
const positions = {
  address: [[0.65, 0.9], [0.52, 0.6], [0.45, 0.4]],
  p1: [[0.45, 0.5], [0.55, 0.85]], p2: [[0.4, 0.4], [0.55, 0.4]],
  p3: [[0.38, 0.3], [0.3, 0.1]], p4: [[0.42, 0.2], [0.3, 0.15]],
  top: [[0.5, 0.2], [0.42, 0.1], [0.6, 0.1]],
  transition: [[0.38, 0.3], [0.3, 0.2]], downP6: [[0.48, 0.6], [0.55, 0.6]],
};
const clone = value => JSON.parse(JSON.stringify(value));
const checkpoints = () => Object.fromEntries(Object.entries(positions).map(([phase, points], time) => [
  phase, { time, aspectRatio: 16 / 9, points: points.map(([x, y]) => ({ x, y })) },
]));

function load(context, name) {
  const source = html.match(new RegExp(`  (?:async )?function ${name}\\([\\s\\S]*?\\n  }`));
  assert.ok(source, name);
  vm.runInContext(source[0], context);
}

function sandbox() {
  const noop = () => {};
  const element = () => ({
    value: '', textContent: '', style: {}, children: [],
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute: noop, addEventListener: noop,
  });
  const storage = new Map();
  const context = vm.createContext({
    console, uiLanguage: 'en',
    BACKSWING_PHASES: phases, BACKSWING_OUTSIDE_THRESHOLD: 0.05,
    BACKSWING_P1_PATH_THRESHOLD: 0.03, BACKSWING_CACHE_PREFIX: 'test-backswing-',
    SWING_BACKSWING_CODES: ['OPA', 'USP', 'OFP', 'HAP-A', 'HAP-B'].map(code => ({ code, en: code, ko: code })),
    backswingPhaseSelect: { value: 'address', querySelector: () => ({ textContent: '' }) },
    backswingFrames: checkpoints(), backswingClassification: null,
    backswingClassificationCacheKey: null, backswingOriginalVideo: null,
    backswingActive: false, backswingProgressNotice: null, backswingResult: element(),
    frontVideo: { src: 'side-view', currentTime: 0, videoWidth: 1600, videoHeight: 900, pause: noop },
    sideVideo: { src: 'engine', currentTime: 0, videoWidth: 900, videoHeight: 1600 },
    videoFileIdentity: { front: 'side-view', side: 'engine' },
    frameStateHistory: { front: {}, side: {} }, selectedSegment: 'frame2',
    segmentDeltaHistory: {},
    segmentScoreHistory: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`frame${i + 1}`, null])),
    frameMetricsHistory: {}, frameSideMetricsHistory: {},
    baselineFrontResult: null, frontPoints: [], frontLines: [], sidePoints: [], sideLines: [],
    distanceLinesByView: { front: [], side: [] }, distancePendingPoints: { front: [], side: [] },
    distanceReferencePendingPoints: { front: [], side: [] },
    distanceReferenceLinesByView: { front: null, side: null },
    frame1ReferenceSnapshot: { front: null, side: null },
    frontZoomRange: element(), frontSpeedRange: element(), sideZoomRange: element(), sideSpeedRange: element(),
    frontFindPositionStatus: element(), sideFindPositionStatus: element(), statusSpan: element(),
    frontCanvas: {}, frontCtx: {}, sideCanvas: {}, sideCtx: {}, poseSampleCache: new Map(),
    frontZoom: 1, sideZoom: 1,
    document: { getElementById: element, createElement: element, createTextNode: text => text },
    getBackswingPointLabels: phase => phase === 'address' || phase === 'top' ? [1, 2, 3] : [1, 2],
    getSwingUiText: (_ko, en) => en,
    translateUiText: text => text,
    areVideoSourcesSame: () => true,
    getLockedReferenceLineLength: () => 1,
    setFileName: noop, getVideoFileIdentity: file => file.name,
    clearAnalysisResults: noop, resetSwingCompareData: noop, loadVideo: noop,
    updateThreePointSpreadDisplay: noop, applyVideoZoom: noop, applyPlaybackRates: noop,
    drawOverlay: noop, pauseBothVideos: noop, setSelectedView: noop, checkButtonsEnabled: noop,
    updateStatus: noop, detectMotionStart: async () => null,
    updateBackswingGuide: noop, refreshSwingClassificationViews: noop,
    updateSegmentComparisonCard: noop, updateSegmentScoresDisplay: noop,
    updateAllFramesMetricBar: noop, updateSwingNarrative: noop,
    getCompressionTransitionEvidence: () => ({ available: false }),
    getThreePointProfilePenalty: () => ({ fit: null, penalty: null }),
    localStorage: {
      setItem: (key, value) => storage.set(key, value),
      getItem: key => storage.get(key) ?? null,
      removeItem: key => storage.delete(key),
    },
  });
  for (const name of [
    'clamp', 'hasMetric', 'smoothstep01', 'bandScore', 'rampScore', 'roundToStep',
    'getAnalysisAspect', 'classifyBackswing', 'getBackswingProfileCode',
    'renderBackswingClassification',
    'sanitizeStoredBackswingClassification', 'getDownswingSideEvidence',
    'scoreExponentialReferenceBand', 'scoreLagAngle', 'getF2MetricBreakdown',
    'getFrameScoreParts', 'combineMetricScores', 'computeSegmentScore', 'computeRawSegmentScore',
    'getImpactAlignment', 'weightedAvg01', 'scoreImpactHeadPelvisGap', 'scoreImpactDownswingCoupling',
    'getLateRadiusExpansion', 'scoreLateRadiusExpansion', 'scoreHeadPelvisCoupling',
    'getPanelReferenceLength', 'referenceRatio', 'referencePositionX',
    'getForwardDrift', 'computeGroundForceTransitionReport',
    'computeConsistencyReport', 'computeTempoSequenceReport',
    'getSwingTypeReadiness', 'getLinearEngineEvidence', 'getStoredArmShaftDelta',
    'getVerticalMotionDiagnostics', 'getVerticalEngineEvidence', 'getType3CombinedEvidence',
    'scoreP6LagRetention', 'getHeadPelvisSeparationFit', 'getEngineCoactivation',
    'getThreePointSpreadChange', 'getThreePointDirectionFit', 'getThreePointEngineEvidence',
    'combineEngineCompressionEvidence', 'classifySwingType',
    'getPowerEngineDecision', 'getPowerEngineCode', 'getMatchedSwingProfile',
    'getStoredSegmentScore', 'refreshScoresForBackswingEvidence',
    'getBackswingCacheIdentity', 'reportBackswingCacheError', 'saveBackswingClassificationCache',
    'loadBackswingClassificationCache', 'isProjectCoordinate',
    'invalidateBackswingClassification', 'resetBackswing', 'addBackswingPoint',
    'handleFrontVideoFile', 'handleSideVideoFile',
  ]) load(context, name);
  return context;
}

test('backswing-first survives engine A/B video loading with original checkpoints and classification', async () => {
  const c = sandbox();
  c.backswingClassification = c.classifyBackswing(c.backswingFrames);
  const expected = clone(c.backswingClassification);
  const frames = clone(c.backswingFrames);
  let refreshes = 0;
  c.refreshSwingClassificationViews = () => { refreshes++; };
  await c.handleFrontVideoFile({ name: 'engine', type: 'video/mp4' });
  await c.handleSideVideoFile({ name: 'engine', type: 'video/mp4' });
  assert.deepEqual(clone(c.backswingClassification), expected);
  assert.deepEqual(clone(c.backswingFrames), frames);
  assert.equal(refreshes, 2);
  assert.ok(c.backswingClassificationCacheKey, 'retained evidence is persisted for the new engine media');
  const restored = c.loadBackswingClassificationCache(c.videoFileIdentity, c.frameStateHistory);
  assert.deepEqual(clone(restored.classification), expected);
});

test('reclassification and cache restore use the checkpoint video aspect, not the engine A video', () => {
  const c = sandbox();
  const expected = clone(c.classifyBackswing(c.backswingFrames));
  c.backswingClassification = expected;
  c.saveBackswingClassificationCache();
  c.frontVideo.videoWidth = 900;
  c.frontVideo.videoHeight = 1600;
  assert.deepEqual(clone(c.classifyBackswing(c.backswingFrames)), expected);
  assert.deepEqual(clone(c.classifyBackswing(clone(c.backswingFrames))), expected, 'project round trip');
  const restored = c.loadBackswingClassificationCache(c.videoFileIdentity, c.frameStateHistory);
  assert.deepEqual(clone(restored.classification), expected);
  c.backswingFrames.address.aspectRatio = 0;
  assert.match(c.classifyBackswing(c.backswingFrames).error, /aspect ratio/);
});

test('legacy checkpoints without source dimensions retain their cached decision on a different A video', () => {
  const c = sandbox();
  c.backswingClassification = c.classifyBackswing(c.backswingFrames);
  const expected = clone(c.backswingClassification);
  for (const frame of Object.values(c.backswingFrames)) delete frame.aspectRatio;
  c.saveBackswingClassificationCache();
  c.frontVideo.videoWidth = 900;
  c.frontVideo.videoHeight = 1600;
  const restored = c.loadBackswingClassificationCache(c.videoFileIdentity, c.frameStateHistory);
  assert.deepEqual(clone(restored.classification), expected);
});

test('score refresh while a temporary side video is open never rebuilds engine geometry', () => {
  const c = sandbox();
  c.segmentDeltaHistory = {
    frame2: { fm: { laggingAngleBDeg: 60, radiusCompressionRatio: 0.4,
      pelvisLateralDelta: 0.24, c7LateralDelta2: 0.06, distanceComparable: true } },
    frame4: { fm: { armShaftAngleBDeg: 177, c7XPercent: 1, c7YPercent: 1 } },
  };
  c.frameStateHistory = {
    front: { frame2: { points: [1, 2, 3], lines: [] } },
    side: { frame2: { points: [1, 2, 3], lines: [] } },
  };
  c.refreshScoresForBackswingEvidence();
  const f2 = c.segmentScoreHistory.frame2;
  const before = clone(c.segmentDeltaHistory.frame2.fm);
  const fail = () => assert.fail('temporary side-view geometry must not replace stored engine metrics');
  c.refreshStoredFrameAnalyses = fail;
  c.createAnalysisResult = fail;
  c.backswingActive = true;
  c.frontVideo.videoWidth = 900;
  c.frontVideo.videoHeight = 1600;
  c.backswingClassification = c.classifyBackswing(c.backswingFrames);
  let narrativeRefreshes = 0;
  c.updateSwingNarrative = () => { narrativeRefreshes++; };
  c.refreshScoresForBackswingEvidence();
  assert.equal(c.segmentScoreHistory.frame2, f2, 'backswing path is not an F2 scoring component');
  assert.deepEqual(clone(c.segmentDeltaHistory.frame2.fm), before);
  const final = clone(c.segmentScoreHistory);
  c.refreshScoresForBackswingEvidence();
  assert.deepEqual(clone(c.segmentScoreHistory), final, 'repeating the decision is idempotent');
  const first = sandbox();
  first.backswingClassification = first.classifyBackswing(first.backswingFrames);
  first.segmentDeltaHistory = clone(c.segmentDeltaHistory);
  first.refreshScoresForBackswingEvidence();
  assert.deepEqual(clone(first.segmentScoreHistory), final, 'either analysis order produces identical scores');
  assert.equal(narrativeRefreshes, 2);
});

test('a new backswing source and explicit reset still invalidate the previous decision', async () => {
  const c = sandbox();
  c.backswingClassification = c.classifyBackswing(c.backswingFrames);
  c.backswingActive = true;
  await c.handleFrontVideoFile({ name: 'new-side-view', type: 'video/mp4' });
  assert.equal(c.backswingClassification, null);
  assert.deepEqual(clone(c.backswingFrames), {});
  c.backswingClassification = c.classifyBackswing(checkpoints());
  c.saveBackswingClassificationCache();
  c.resetBackswing();
  assert.equal(c.backswingClassification, null);
  assert.equal(c.backswingClassificationCacheKey, null);
});

test('new checkpoints capture their source aspect for later language changes and project restore', () => {
  const c = sandbox();
  c.backswingFrames = {};
  c.addBackswingPoint({ x: 0.65, y: 0.9 });
  assert.equal(c.backswingFrames.address.aspectRatio, 16 / 9);
  assert.equal(c.backswingFrames.address.points.length, 1);
});

test('language rendering preserves a restored legacy decision without reclassifying engine footage', () => {
  const c = sandbox();
  c.backswingClassification = c.classifyBackswing(c.backswingFrames);
  const expected = clone(c.backswingClassification);
  c.backswingFrames = {};
  c.frontVideo.videoWidth = 900;
  c.frontVideo.videoHeight = 1600;
  c.classifyBackswing = () => assert.fail('display changes must not reclassify a different video');
  c.renderBackswingClassification();
  assert.deepEqual(clone(c.backswingClassification), expected);
  assert.equal(c.backswingResult.children.length, 2);
  assert.equal(c.backswingResult.children[0].children[1].textContent, expected.profileCode);
});

test('both orders and repeat decisions produce identical engine indices, percentages and matched profile', async () => {
  const metrics = {
    frame1: { fm: { c7XPercent: 1, c7YPercent: 1, xFactorDelta: -100 } },
    frame2: { fm: { laggingAngleBDeg: 60, radiusCompressionRatio: 0.4,
      pelvisLateralDelta: 0.24, c7LateralDelta2: 0.06 } },
    frame3: { fm: { enginePhaseDeltaSec: 0.04, kneeExtDelta: 4.2, hipDropPercent: -2,
      leadHipRiseBodyPercent: 2.6, leadLegBraceRatioB: 0.1,
      c7SwayPercent: 1, c7RisePercent: 1 } },
    frame4: { fm: { armShaftAngleBDeg: 177, c7XPercent: 1, c7YPercent: 1 } },
    frame6: { fm: { timeDeltaSec: 0.08, lagAngleA6: 90 } },
  };
  const first = sandbox();
  first.backswingClassification = first.classifyBackswing(first.backswingFrames);
  await first.handleFrontVideoFile({ name: 'engine', type: 'video/mp4' });
  await first.handleSideVideoFile({ name: 'engine', type: 'video/mp4' });
  first.segmentDeltaHistory = clone(metrics);
  first.refreshScoresForBackswingEvidence();
  const last = sandbox();
  last.segmentDeltaHistory = clone(metrics);
  last.refreshScoresForBackswingEvidence();
  last.backswingClassification = last.classifyBackswing(last.backswingFrames);
  last.refreshScoresForBackswingEvidence();
  const firstEngine = clone(first.classifySwingType());
  assert.ok(firstEngine);
  assert.deepEqual(firstEngine, clone(last.classifySwingType()));
  assert.deepEqual(clone(first.segmentScoreHistory), clone(last.segmentScoreHistory));
  assert.equal(first.getPowerEngineCode(firstEngine), 'TKE');
  for (const c of [first, last]) {
    c.SWING_PROFILE_DATA = [{ n: 1, g: c.backswingClassification.profileCode, e: 'TKE' }];
  }
  assert.deepEqual(clone(first.getMatchedSwingProfile()), clone(last.getMatchedSwingProfile()));
  last.refreshScoresForBackswingEvidence();
  assert.deepEqual(clone(last.classifySwingType()), firstEngine);
});
