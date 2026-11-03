import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const ids = Array.from({ length: 6 }, (_, index) => `frame${index + 1}`);
const pose = [
  { type: 'wrist', x: 0.4, y: 0.25 },
  { type: 'club', x: 0.3, y: 0.3 },
  { type: 'shoulder', x: 0.5, y: 0.3 },
  { type: 'pelvis', x: 0.4, y: 0.6 },
  { type: 'handMid', x: 0.45, y: 0.55 },
];

function load(context, name) {
  const source = html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`));
  assert.ok(source, name);
  vm.runInContext(source[0], context);
}

function setup(sameVideo = true) {
  const entry = time => ({ points: clone(pose), lines: [], aspectRatio: 1, videoTime: time });
  const context = vm.createContext({
    console: { error() {} },
    uiLanguage: 'en',
    Math,
    hasMetric: Number.isFinite,
    getSwingUiText: (ko, en) => en,
    getAnalysisAspect: () => 1,
    frontVideo: {}, sideVideo: {},
    areVideoSourcesSame: () => sameVideo,
    getPanelReferenceLength: () => 1,
    stanceReferenceLineFront: { start: { x: 0.2, y: 0.8 }, end: { x: 0.8, y: 0.81 } },
    frameStateHistory: { front: { frame1: entry(0) }, side: { frame1: entry(1) } },
    frameMetricsHistory: {}, frameSideMetricsHistory: {},
    segmentScoreHistory: { frame1: 10 }, segmentDeltaHistory: {},
    baselineFrontResult: {}, frame1ReferenceSnapshot: { front: 1, side: 1 },
    selectedSegment: 'frame1', frontPoints: clone(pose), frontLines: [], sidePoints: clone(pose), sideLines: [],
    frameEditMode: true, guideView: 'front', guideStep: 2,
    distanceReferenceLinesByView: {}, videoFileIdentity: { front: 'a', side: sameVideo ? 'a' : 'b' },
    backswingClassification: null, ANALYSIS_FRAME_IDS: ids,
    computing2dCorrectionScenario: false, cached2dCorrectionScenarioKey: null, cached2dCorrectionScenario: null,
    classifySwingType: () => null,
    getSwingTypeReadiness: () => ({ missing: ['Missing phase evidence'] }),
    rebuilds: 0,
    refreshStoredFrameAnalyses() {
      context.rebuilds++;
      context.observed = clone(context.frameStateHistory);
      context.segmentScoreHistory.frame1 = 9;
      context.frame1ReferenceSnapshot.front = 2;
    },
  });
  const semantics = html.slice(html.indexOf('  const FRAME_POINT_TYPES ='), html.indexOf('  function getReusableFrameGroup'));
  vm.runInContext(semantics, context);
  for (const name of ['getDiagnosticSemanticPoint', 'getStanceCorrectionAngle', 'get2dPhaseObservations',
    'get2dVirtualCorrectionScenario']) load(context, name);
  return context;
}

test('stance rotation is independent of endpoint order and rejects collapsed or invalid lines', () => {
  const c = setup();
  const line = c.stanceReferenceLineFront;
  assert.ok(Math.abs(c.getStanceCorrectionAngle(line, 1)
    - c.getStanceCorrectionAngle({ start: line.end, end: line.start }, 1)) < 1e-12);
  for (const end of [line.start, { x: line.start.x + 0.001, y: line.start.y }]) {
    assert.throws(() => c.getStanceCorrectionAngle({ start: line.start, end }, 1), /too short/);
  }
  assert.throws(() => c.getStanceCorrectionAngle(line, NaN), /Invalid/);
});

test('same-video A/B phases rotate together and originals retain both values and identity', () => {
  const c = setup();
  const keys = ['frameStateHistory', 'frameMetricsHistory', 'frameSideMetricsHistory',
    'segmentScoreHistory', 'segmentDeltaHistory', 'baselineFrontResult', 'frame1ReferenceSnapshot',
    'frontPoints', 'frontLines', 'sidePoints', 'sideLines'];
  const originals = Object.fromEntries(keys.map(key => [key, c[key]]));
  const before = clone(originals);
  c.get2dVirtualCorrectionScenario();
  assert.deepEqual(c.observed.front.frame1.points, c.observed.side.frame1.points);
  assert.notDeepEqual(c.observed.front.frame1.points, pose);
  for (const key of keys) {
    assert.equal(c[key], originals[key], key);
    assert.deepEqual(clone(c[key]), before[key], key);
  }
  assert.equal(c.rebuilds, 1);
  assert.equal(c.computing2dCorrectionScenario, false);
  c.get2dVirtualCorrectionScenario();
  assert.equal(c.rebuilds, 1, 'unchanged input uses cache');
});

test('same-video identical poses gain no artificial C7 displacement or relative shoulder angle', () => {
  const c = setup();
  for (const name of ['computeFrameMetrics', 'computeThreePointSpread']) load(c, name);
  c.clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  c.get2dVirtualCorrectionScenario();
  const a = c.computeFrameMetrics(c.observed.front.frame1.points, [], 'frame1', 1, 480, 1);
  const b = c.computeFrameMetrics(c.observed.side.frame1.points, [], 'frame1', 1, 480, 1);
  assert.equal(a.c7NormX, b.c7NormX);
  assert.equal(a.c7NormY, b.c7NormY);
  assert.equal(a.xFactorDeg - b.xFactorDeg, 0);
});

test('different-video B is not rotated and cannot produce cross-camera phase displacement', () => {
  const c = setup(false);
  c.get2dVirtualCorrectionScenario();
  assert.deepEqual(c.observed.side.frame1.points, pose);
  assert.equal(c.get2dPhaseObservations().length, 0);
});

test('calculation errors restore original state without a second analysis or success-shaped result', () => {
  const c = setup();
  const original = c.frameStateHistory;
  c.refreshStoredFrameAnalyses = () => { throw new Error('test calculation failure'); };
  assert.match(c.get2dVirtualCorrectionScenario().unavailable, /test calculation failure/);
  assert.equal(c.frameStateHistory, original);
  assert.equal(c.computing2dCorrectionScenario, false);
  assert.equal(c.cached2dCorrectionScenario, null);
});

test('diagnostics compare P1 to B top, not repeated A address points', () => {
  const c = setup();
  c.frameStateHistory.front.frame2 = clone(c.frameStateHistory.front.frame1);
  c.frameStateHistory.side.frame1.points.find(p => p.type === 'wrist').x += 0.1;
  const observations = c.get2dPhaseObservations();
  assert.equal(observations.length, 1);
  assert.equal(observations[0].phase, 'P4');
  assert.ok(Math.abs(observations[0].c7Shift - 10) < 1e-10);
  c.frameStateHistory.side.frame1.videoTime = 0;
  assert.equal(c.get2dPhaseObservations().length, 0);
});

test('virtual analysis does not render cards, narratives, summary or analysis sections', () => {
  const c = setup();
  c.computing2dCorrectionScenario = true;
  for (const name of ['updateAllFramesMetricBar', 'updateAnalysisSection', 'updateSegmentComparisonCard',
    'updateSwingNarrative', 'updateSummary']) {
    load(c, name);
    assert.doesNotThrow(() => c[name](), name);
  }
  load(c, 'updateSegmentScoresDisplay');
  c.segmentScoreHistory = {};
  assert.doesNotThrow(() => c.updateSegmentScoresDisplay());
});

test('refresh feedback distinguishes failure, missing input and success', () => {
  const source = html.slice(html.indexOf('  const refresh2dDiagnosticsButton ='),
    html.indexOf('  const analysis2dDiagnostics ='));
  for (const [status, expected] of [['success', 'Updated'], ['incomplete', 'Updated · inputs missing'],
    ['error', 'Update failed']]) {
    let click;
    const timers = [];
    const button = {
      setAttribute() {}, removeAttribute() {},
      addEventListener(event, callback) { click = callback; },
    };
    const c = vm.createContext({
      console, computing2dCorrectionScenario: false,
      cached2dCorrectionScenarioKey: 'old', cached2dCorrectionScenario: {},
      document: { getElementById: () => button },
      window: { setTimeout: fn => timers.push(fn) },
      getSwingUiText: (ko, en) => en,
      update2dCorrectionDiagnostics: () => ({ status }),
    });

    vm.runInContext(source, c);
    click();
    assert.equal(button.disabled, true);
    timers.shift()();
    assert.equal(button.textContent, expected);
    assert.equal(button.disabled, false);
    assert.equal(c.cached2dCorrectionScenario, null);
  }
});

test('diagnostic wrapper exposes errors instead of preserving stale success content', () => {
  let children;
  const c = vm.createContext({
    computing2dCorrectionScenario: false,
    console: { error() {} },
    getSwingUiText: (ko, en) => en,
    render2dCorrectionDiagnostics() { throw new Error('invalid stance'); },
    document: {
      getElementById: () => ({ replaceChildren: (...items) => { children = items; } }),
      createElement: () => ({}),
    },
  });
  load(c, 'update2dCorrectionDiagnostics');
  assert.equal(c.update2dCorrectionDiagnostics().status, 'error');
  assert.match(children[0].textContent, /invalid stance/);
});
