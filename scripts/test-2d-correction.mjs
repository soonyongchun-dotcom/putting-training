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
    renderCrossViewDiagnostics() {},
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
    getMatchedSwingProfile: () => null,
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

test('virtual profile number is derived from the corrected engine result before original state is restored', () => {
  const c = setup();
  c.classifySwingType = () => ({ pct: { type1: 50, type2: 30, type3: 20 } });
  c.getPowerEngineDecision = () => ({ code: 'ATE', mode: 'single' });
  c.getMatchedSwingProfile = (back, engine) => {
    assert.equal(c.computing2dCorrectionScenario, true);
    assert.equal(c.segmentScoreHistory.frame1, 9);
    assert.equal(engine.pct.type1, 50);
    return { n: 8 };
  };
  const result = c.get2dVirtualCorrectionScenario();
  assert.equal(result.profileNumber, 8);
  assert.equal(result.engineCode, 'ATE');
  assert.equal(result.engineShares.type1, 50);
  assert.equal(c.segmentScoreHistory.frame1, 10);
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
  load(c, 'syncSegmentScoreSnapshots');
  c.segmentScoreHistory = {};
  assert.doesNotThrow(() => c.updateSegmentScoresDisplay());
});

test('duplicate stance and diagnostic refresh controls are removed from the correction header', () => {
  assert.doesNotMatch(html, /id="(?:stanceReferenceBtn|refresh2dDiagnostics)"/);
  assert.doesNotMatch(html, /정면 P1에서 양발 기준선을 지정하세요\./);
  assert.match(html, /id="crossCorrectionReference"/);
  assert.match(html, /id="crossCorrectionReferenceSave"/);
});

test('diagnostic wrapper exposes errors instead of preserving stale success content', () => {
  let children;
  const c = vm.createContext({
    computing2dCorrectionScenario: false,
    console: { error() {} },
    getSwingUiText: (ko, en) => en,
    render2dCorrectionDiagnostics() { throw new Error('invalid stance'); },
    renderCrossViewDiagnostics() {},
    document: {
      getElementById: () => ({ replaceChildren: (...items) => { children = items; } }),
      createElement: () => ({}),
    },
  });
  load(c, 'update2dCorrectionDiagnostics');
  assert.equal(c.update2dCorrectionDiagnostics().status, 'error');
  assert.match(children[0].textContent, /invalid stance/);
});

function crossSetup() {
  const c = setup();
  const nodes = {
    crossViewPhase: { value: 'top' },
    crossViewResults: { textContent: '' },
  };
  c.document = { getElementById: id => nodes[id] };
  c.backswingSourceIdentity = 'side-source';
  c.backswingFrames = {};
  for (const [phase, frame, time] of [['top', 'frame1', 1], ['downP6', 'frame2', 2], ['impact', 'frame4', 3]]) {
    c.backswingFrames[phase] = { time, aspectRatio: 2, points: phase === 'top'
      ? [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }, { x: 0.4, y: 0.3 }]
      : [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.3 }] };
    const types = vm.runInContext(`getFramePointTypesForView('${frame}', 'side')`, c);
    c.frameStateHistory.side[frame] = { videoTime: time + 10, aspectRatio: 1.5,
      points: types.map((type, i) => ({ type, x: 0.1 + i * 0.05, y: 0.2 + i * 0.03 })) };
  }
  for (const fn of ['getCrossViewObservation', 'renderCrossViewDiagnostics']) load(c, fn);
  const render = () => { c.renderCrossViewDiagnostics(); return nodes.crossViewResults.textContent; };
  return { c, nodes, render };
}

test('cross-view phase mapping uses saved top/downP6/impact and corresponding front B semantics', () => {
  const { c, nodes } = crossSetup();
  for (const [phase, frame] of [['top', 'frame1'], ['downP6', 'frame2'], ['impact', 'frame4']]) {
    nodes.crossViewPhase.value = phase;
    const data = c.getCrossViewObservation(phase);
    assert.equal(data.frame, frame);
    assert.equal(data.sideLength, Math.hypot(0.4, 0.1));
    assert.ok(data.frontLength > 0);
    assert.ok(data.frontTime > data.sideTime, 'timestamps retain independent video offsets');
  }
});

test('input guide shows only readiness, not projection ratios or phase-confirmation claims', () => {
  const { c, nodes, render } = crossSetup();
  assert.equal(render(), 'Side: ready\nFront: ready');
  assert.doesNotMatch(render(), /%|confirmed|3D/);
  nodes.crossViewPhase.value = 'impact';
  delete c.backswingFrames.impact;
  assert.match(render(), /mark hand and clubhead.*stage 1/);
  assert.match(render(), /Front: ready/);
});

test('input readiness refreshes after point changes without mutating scores', () => {
  const { c, nodes, render } = crossSetup();
  const score = JSON.stringify(c.segmentScoreHistory);
  assert.match(render(), /Side: ready/);
  c.backswingFrames.top.points[2] = { ...c.backswingFrames.top.points[1] };
  assert.match(render(), /Side: mark/);
  nodes.crossViewPhase.value = 'downP6';
  assert.equal(render(), 'Side: ready\nFront: ready');
  assert.equal(JSON.stringify(c.segmentScoreHistory), score);
});

test('input guide explicitly identifies missing points, aspect ratios and saved times', () => {
  const { c, nodes, render } = crossSetup();
  c.backswingFrames.top.points[2].x = NaN;
  assert.match(render(), /Side: mark/);
  nodes.crossViewPhase.value = 'downP6';
  c.backswingFrames.downP6.aspectRatio = 0;
  c.frameStateHistory.side.frame2.videoTime = null;
  assert.match(render(), /Side: mark/);
  assert.match(render(), /Front: mark/);
});

test('only handedness and motion selection persist; obsolete target controls are removed', () => {
  const { c, nodes } = crossSetup();
  nodes.analysis2dHandedness = { value: 'left' };
  load(c, 'get2dDiagnosticSettings');
  assert.equal(c.get2dDiagnosticSettings().analysis2dHandedness, 'left');
  assert.equal(c.get2dDiagnosticSettings().crossViewPhase, 'top');
  assert.equal(Object.keys(c.get2dDiagnosticSettings()).length, 2);
  assert.doesNotMatch(html, /id="(?:analysis2dFrontTarget|analysis2dSideTarget|crossViewRelation|crossViewConfirm)"/);
});

test('input buttons open the selected side motion or its matching front B frame', () => {
  const source = html.slice(html.indexOf('  const analysis2dDiagnostics ='),
    html.indexOf('  const stanceReferenceBtn = null;'));
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, { listeners: {}, value: 'impact',
      addEventListener(event, callback) { this.listeners[event] = callback; } });
    return nodes.get(id);
  };
  const stages = [];
  const frames = [];
  let changed = false;
  const c = vm.createContext({
    document: { getElementById: get }, update2dCorrectionDiagnostics() {},
    selectAnalysisWorkflowStage: index => stages.push(index),
    switchToSegment: (...args) => frames.push(args),
    Event: class { constructor(type) { this.type = type; } },
    backswingPhaseSelect: { value: 'address', dispatchEvent(event) { changed = event.type === 'change'; } },
  });
  vm.runInContext(source, c);
  get('crossViewSideInput').listeners.click();
  assert.equal(c.backswingPhaseSelect.value, 'impact');
  assert.equal(changed, true);
  get('crossViewFrontInput').listeners.click();
  assert.deepEqual(stages, [0, 1]);
  assert.deepEqual(frames, [['frame4', 'side']]);
});

function comparisonSetup(scenario) {
  const c = setup();
  const element = () => ({ textContent: '', children: [], append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; } });
  const result = element();
  c.document = { getElementById: id => id === 'analysis2dDiagnostics' ? { open: true } : result, createElement: element };
  c.get2dVirtualCorrectionScenario = () => scenario;
  c.classifySwingType = () => ({ pct: { type1: 33, type2: 35.5, type3: 31.5 } });
  c.getPowerEngineDecision = () => ({ code: 'TKE' });
  c.getBackswingProfileCode = () => null;
  c.getMatchedSwingProfile = () => ({ n: 7 });
  c.segmentScoreHistory = Object.fromEntries(ids.map((id, i) => [id, 5 + i * 0.5]));
  load(c, 'render2dCorrectionDiagnostics');
  return { c, result, values: () => result.children[1].children[1].children.map(row => row.children.map(cell => cell.textContent)) };
}

test('compact comparison includes F1-F6, three shares, engine and profile number with correct units', () => {
  const scenario = { scores: Object.fromEntries(ids.map(id => [id, 7])),
    engineCode: 'ATE', engineShares: { type1: 50, type2: 30, type3: 20 }, profileNumber: 8, rotationDeg: -1.6 };
  const { c, result, values } = comparisonSetup(scenario);
  assert.equal(c.render2dCorrectionDiagnostics().status, 'success');
  assert.deepEqual(values().slice(0, 2), [['F1 /10', '5.0', '7.0'], ['F2 /10', '5.5', '7.0']]);
  assert.deepEqual(values()[4], ['F5 /100', '70.0', '70.0']);
  assert.deepEqual(values()[5], ['F6 /100', '75.0', '70.0']);
  assert.deepEqual(values()[6], ['ATE fit share', '33.0%', '50.0%']);
  assert.deepEqual(values()[9], ['Engine type', 'TKE', 'ATE']);
  assert.deepEqual(values()[10], ['Backswing type', 'Undetermined', 'Undetermined']);
  assert.deepEqual(values()[11], ['Swing profile number', '07', '08']);
  assert.equal(values().length, 12);
  assert.match(result.children[0].textContent, /-1.6°/);
  assert.equal(result.children[1].children[1].children[0].children[2].className, 'analysis-2d-changed');
  assert.equal(result.children[1].children[1].children[4].children[2].className, undefined);
});

test('missing or failed correction does not leave stale corrected values in the comparison', () => {
  const { c, values, result } = comparisonSetup({ unavailable: 'invalid stance' });
  assert.equal(c.render2dCorrectionDiagnostics().status, 'error');
  assert.equal(result.children[0].textContent, 'invalid stance');
  assert.ok(values().every(row => row[2] === '—'));
  c.get2dVirtualCorrectionScenario = () => null;
  assert.equal(c.render2dCorrectionDiagnostics().status, 'incomplete');
  assert.equal(result.children[0].textContent, '');
  assert.ok(values().every(row => row[2] === '—'));
});
