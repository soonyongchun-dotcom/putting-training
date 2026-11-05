import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('./cross-view-correction.js', import.meta.url), 'utf8');
const setupStart = source.indexOf('(function setupCrossCorrectionInput()');
const frames = Array.from({ length: 6 }, (_, index) => `frame${index + 1}`);

function setup() {
  const c = vm.createContext({
    console: { error() {} }, Math, structuredClone,
    getSwingUiText: (ko, en) => ko,
    ANALYSIS_FRAME_IDS: Array.from({ length: 6 }, (_, index) => `frame${index + 1}`),
    frameStateHistory: { front: {}, side: {} }, backswingFrames: {},
    videoFileIdentity: { front: 'front-source', side: 'independent-side-source' },
    areVideoSourcesSame: () => true, getPanelReferenceLength: () => 1,
    getStanceCorrectionAngle: () => 0,
    stanceReferenceLineFront: { start: { x: 0, y: 1 }, end: { x: 1, y: 1 } },
    isProjectCoordinate: point => point && Number.isFinite(point.x) && Number.isFinite(point.y)
      && Math.abs(point.x) <= 10 && Math.abs(point.y) <= 10,
    get2dVirtualCorrectionScenario: model => ({ model }),
  });
  vm.runInContext(html.slice(html.indexOf('  const FRAME_POINT_TYPES ='),
    html.indexOf('  function getReusableFrameGroup')), c);
  vm.runInContext(source.slice(0, setupStart), c);
  const data = c.crossViewCorrectionData;
  data.workflow = 'frame-pairs';
  data.sources = { front: 'front-source', side: 'independent-side-source' };
  data.backswingEntries = {};
  for (const view of ['front', 'side']) {
    data.references[view] = {
      aspect: 1, time: 99,
      shaftPoints: [{ x: 0.4, y: 0.15 }, { x: 0.4, y: 0.25 }],
      stancePoints: [{ x: 0.2, y: 0.8 }, { x: 0.8, y: 0.8 }],
    };
  }
  for (const [frameIndex, frame] of frames.entries()) {
    const makePoints = (types, view) => types.map((type, index) => ({
      type, x: view === 'front' ? 0.2 + index * 0.05 : 0.3 + (index % 3) * 0.04,
      y: 0.22 + index * 0.035,
    }));
    data.entries[frame] = {
      frontPoints: makePoints(c.CROSS_CORRECTION_POINTS[frame].front, 'front'),
      sidePoints: makePoints(c.CROSS_CORRECTION_POINTS[frame].side, 'side'),
      frontTime: frameIndex, sideTime: frameIndex * 2, frontAspect: 1, sideAspect: 1,
    };
  }
  for (const [phaseIndex, phase] of c.CROSS_CORRECTION_BACKSWING_PHASES.entries()) {
    const makePoints = (types, view) => types.map((type, index) => ({
      type, x: view === 'front' ? 0.22 + index * 0.05 : 0.31 + (index % 2) * 0.04,
      y: 0.24 + index * 0.035,
    }));
    const time = phaseIndex === 0 ? 0 : phaseIndex + 0.5;
    data.backswingEntries[phase] = {
      frontPoints: makePoints(c.CROSS_CORRECTION_BACKSWING_POINTS[phase], 'front'),
      sidePoints: makePoints(c.CROSS_CORRECTION_BACKSWING_POINTS[phase], 'side'),
      frontTime: time, sideTime: time * 2, frontAspect: 1, sideAspect: 1,
    };
  }
  for (const frame of c.ANALYSIS_FRAME_IDS) {
    const frameIndex = Number(frame.replace('frame', '')) - 1;
    for (const panel of ['front', 'side']) {
      c.frameStateHistory[panel][frame] = {
        points: c.getFramePointTypesForView(frame, panel).map((type, i) => ({ type, x: 0.2 + i * 0.06, y: 0.25 + i * 0.05 })),
        videoTime: panel === 'front' ? frameIndex : frameIndex * 2,
        lines: [], aspectRatio: 1,
      };
    }
  }
  data.calibration = 'shaft-ground-v1';
  data.analysisSignature = c.getCrossCorrectionAnalysisSignature();
  return c;
}

test('six matched metric frames map to fused coordinates without type checkpoints', () => {
  const c = setup(), model = c.getCrossCorrectionModel();
  c.crossViewCorrectionData.backswingEntries = {};
  assert.deepEqual(Array.from(model.correctedFrames), frames);
  assert.deepEqual(Array.from(model.retainedFrames), []);
  assert.ok(model.frame3);
  const metrics = {};
  c.applyCrossCorrectionMetrics(metrics, model, 'frame3', 'side');
  assert.ok(Number.isFinite(metrics.kneeExtensionDeg));
  assert.ok(metrics.coreHandRadiusRaw > 0);
  assert.equal(model.frame1.front.points.wrist, model.frame1.front.points.c7);
  assert.equal(model.frame4.side.points.shoulder, model.frame4.side.points.leftWrist);
  assert.equal(model.backswingFrames, undefined);
});

test('shaft length and stance line calibrate normalized cross-view geometry independently of F1 time', () => {
  const c = setup();
  const calibration = c.getCrossCorrectionCalibration({
    aspect: 1, shaftPoints: [{ x: 0.2, y: 0.1 }, { x: 0.29, y: 0.22 }],
    stancePoints: [{ x: 0.1, y: 0.9 }, { x: 0.9, y: 0.9 }],
  });
  assert.ok(Math.abs(calibration.length - Math.hypot(0.09, 0.12)) < 1e-10);
  assert.deepEqual({ ...calibration.bottom }, { x: 0.29, y: 0.22 });
  assert.equal(calibration.ux, 0);
  assert.equal(calibration.uy, -1);
  const model = c.getCrossCorrectionModel(), metrics = { spineAngleDeg: 12, shaftAngleDeg: 13, spineAngleDeg5: 14 };
  c.applyCrossCorrectionMetrics(metrics, model, 'frame5', 'side');
  const p = model.frame5.side.points;
  const expected = Math.hypot(p.pelvis.x - p.handMid.x, p.pelvis.y - p.handMid.y, p.pelvis.z - p.handMid.z) * model.frame5.side.scale;
  assert.ok(Math.abs(metrics.coreHandRadiusRaw - expected) < 1e-10);
  assert.equal(metrics.spineAngleDeg, 12);
  assert.notEqual(metrics.shaftAngleDeg, 13);
  assert.notEqual(metrics.spineAngleDeg5, 14);
  assert.ok(Number.isFinite(metrics.shaftAngleDeg));
  assert.ok(Number.isFinite(metrics.lagAngleDeg5));
  assert.ok(metrics.threePointSpreadRaw > 0);
});

test('large vertical differences between same-motion views are fused instead of blocking all results', () => {
  const c = setup();
  const entry = c.crossViewCorrectionData.entries.frame3;
  const frontHead = entry.frontPoints.find(point => point.type === 'clubHead');
  const sideHead = entry.sidePoints.find(point => point.type === 'clubHead');
  sideHead.y += 0.6;
  c.crossViewCorrectionData.analysisSignature = c.getCrossCorrectionAnalysisSignature();
  const model = c.getCrossCorrectionModel();
  assert.ok(model.correctedFrames.includes('frame3'));
  const frontCalibration = c.getCrossCorrectionCalibration(c.crossViewCorrectionData.references.front);
  const sideCalibration = c.getCrossCorrectionCalibration(c.crossViewCorrectionData.references.side);
  const project = (point, view, calibration) => {
    const reference = c.crossViewCorrectionData.references[view];
    const angle = c.getStanceCorrectionAngle({
      start: reference.stancePoints[0], end: reference.stancePoints[1],
    }, calibration.aspect);
    const dx = (point.x - calibration.bottom.x) * calibration.aspect;
    const dy = point.y - calibration.bottom.y;
    return {
      horizontal: (dx * Math.cos(angle) + dy * Math.sin(angle)) / calibration.length,
      vertical: (dx * Math.sin(angle) - dy * Math.cos(angle)) / calibration.length,
    };
  };
  const front = project(frontHead, 'front', frontCalibration);
  const side = project(sideHead, 'side', sideCalibration);
  assert.ok(Math.abs(front.vertical - side.vertical) > 0.5);
  assert.ok(Math.abs(model.frame3.front.points.clubHead.y - (front.vertical + side.vertical) / 2) < 1e-10);
});

test('independent source scales produce equal fused geometry and the same front-unit length', () => {
  const c = setup(), before = c.getCrossCorrectionModel();
  for (const view of ['front', 'side']) {
    const factor = view === 'front' ? 0.8 : 1.2;
    const transform = point => ({ ...point, x: point.x * factor, y: point.y * factor });
    c.crossViewCorrectionData.references[view].shaftPoints = c.crossViewCorrectionData.references[view].shaftPoints.map(transform);
    c.crossViewCorrectionData.references[view].stancePoints = c.crossViewCorrectionData.references[view].stancePoints.map(transform);
    for (const entry of Object.values(c.crossViewCorrectionData.entries)) {
      entry[`${view}Points`] = entry[`${view}Points`].map(transform);
    }
    for (const entry of Object.values(c.crossViewCorrectionData.backswingEntries)) {
      entry[`${view}Points`] = entry[`${view}Points`].map(transform);
    }
  }
  const after = c.getCrossCorrectionModel();
  for (const type of Object.keys(before.frame5.side.points)) {
    for (const axis of ['x', 'y', 'z']) {
      assert.ok(Math.abs(before.frame5.side.points[type][axis] - after.frame5.side.points[type][axis]) < 1e-10);
    }
  }
  assert.ok(Math.abs(after.frame5.side.scale - before.frame5.side.scale * 0.8) < 1e-10);
});

test('spatial angle calculation uses vectors, rejecting coincident landmarks', () => {
  const c = setup();
  assert.ok(Math.abs(c.crossCorrectionAngle({ x: 1, y: 0, z: 1 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 1 }) - 60) < 1e-10);
  assert.throws(() => c.crossCorrectionAngle({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }));
});

test('source mismatch, stale analysis, missing frame and invalid geometry withhold correction', () => {
  for (const change of [
    c => { c.videoFileIdentity.front = 'new'; },
    c => { c.frameStateHistory.front.frame1.points[0].x += 0.01; },
    c => { delete c.crossViewCorrectionData.entries.frame4; },
    c => { c.crossViewCorrectionData.calibration = null; },
    c => { c.crossViewCorrectionData.references.front.shaftPoints[1] = { ...c.crossViewCorrectionData.references.front.shaftPoints[0] }; },
  ]) {
    const c = setup(); change(c);
    assert.throws(() => c.getCrossCorrectionModel());
    assert.ok(c.getCrossCorrectionScenario().unavailable);
  }
});

test('ground reference tilted over 30 degrees is rejected before corrected values are calculated', () => {
  const c = setup();
  c.getStanceCorrectionAngle = (line, aspect) => {
    const dx = (line.end.x - line.start.x) * aspect;
    const dy = line.end.y - line.start.y;
    const angle = Math.atan2(dy, dx);
    return ((angle + Math.PI / 2) % Math.PI + Math.PI) % Math.PI - Math.PI / 2;
  };
  c.crossViewCorrectionData.references.side.stancePoints = [
    { x: 0.4, y: 0.3 }, { x: 0.5, y: 0.8 },
  ];
  assert.throws(() => c.getCrossCorrectionModel(), /측면 지면 기준선 기울기가 .*°입니다\(허용 ±30°\)/);
});

test('frame pairs allow independently aligned timestamps without a backswing checkpoint dependency', () => {
  const c = setup();
  c.crossViewCorrectionData.backswingEntries = {};
  c.crossViewCorrectionData.entries.frame2.frontTime = c.crossViewCorrectionData.entries.frame1.frontTime;
  c.crossViewCorrectionData.entries.frame4.sideTime = c.crossViewCorrectionData.entries.frame3.sideTime - 0.1;
  const model = c.getCrossCorrectionModel();
  const metrics = {};
  c.applyCrossCorrectionMetrics(metrics, model, 'frame1', 'side');
  assert.equal(metrics.topShaftAngleDeg, undefined);
  assert.equal(model.frame1.side.points.topHandMid, undefined);
});

test('missing F1 entry explains that selected landmarks must be saved before calculation', () => {
  const c = setup();
  delete c.crossViewCorrectionData.entries.frame1;
  assert.throws(() => c.getCrossCorrectionModel(), /F1: 대응점이 저장되지 않았습니다/);
});

test('frame-pair entries are mapped directly to their own analysis frame', () => {
  const c = setup();
  c.frameStateHistory.side.frame2.videoTime = 2.8;
  c.crossViewCorrectionData.analysisSignature = c.getCrossCorrectionAnalysisSignature();
  const model = c.getCrossCorrectionModel();
  assert.ok(model.frame2);
  assert.ok(model.correctedFrames.includes('frame2'));
});

test('persistence validates six metric frames and accepts projects without type checkpoints', () => {
  const c = setup(), data = c.crossViewCorrectionData;
  assert.equal(c.validateCrossCorrectionData(data), true);
  const noCheckpoints = structuredClone(data);
  delete noCheckpoints.backswingEntries;
  assert.equal(c.validateCrossCorrectionData(noCheckpoints), true);
  for (const change of [
    d => { d.entries.frame4.sidePoints[0] = null; },
    d => { d.entries.frame4.sidePoints[0].x = NaN; },
    d => { d.entries.frame4.sidePoints[1].type = d.entries.frame4.sidePoints[0].type; },
    d => { d.references.front.time = -1; },
    d => { d.entries.junk = d.entries.frame1; },
    d => { d.backswingEntries.top.sidePoints[0].type = 'invalid'; },
  ]) {
    const copy = structuredClone(data); change(copy);
    assert.equal(c.validateCrossCorrectionData(copy), false);
  }
  assert.equal(c.validateCrossCorrectionData({ references: {}, entries: {}, sources: {} }), true, 'old project can still be opened');
});

function loadCalculators(c) {
  for (const match of html.matchAll(/^  (?:async )?function (\w+)\([^\n]*[\s\S]*?^  }/gm)) {
    if (!['getPanelReferenceLength', 'areVideoSourcesSame', 'getAnalysisAspect', 'getSwingUiText', 'classifyBackswing'].includes(match[1])) {
      vm.runInContext(match[0], c);
    }
  }
  Object.assign(c, {
    getSwingUiText: (ko, en) => en, uiLanguage: 'en', getHeightScale: () => 1, getAnalysisAspect: () => 1,
    document: { getElementById: () => ({ value: 'right' }) },
    frontVideo: { currentTime: 0 }, sideVideo: { currentTime: 1 },
    frontCanvas: { height: 480 }, sideCanvas: { height: 480 },
    frame1ReferenceSnapshot: { front: 1, side: 1 }, distanceReferenceLinesByView: {},
    backswingClassification: null, backswingFrames: {}, selectedSegment: 'frame1', baselineFrontResult: null,
    frameMetricsHistory: {}, frameSideMetricsHistory: {}, segmentScoreHistory: {}, segmentDeltaHistory: {},
    frontPoints: [], frontLines: [], sidePoints: [], sideLines: [],
    frameEditMode: false, guideView: null, guideStep: 0, computing2dCorrectionScenario: true,
    crossCorrectionContext: null,
    cached2dCorrectionScenarioKey: null, cached2dCorrectionScenario: null,
    classifyBackswing: frames => frames.address.points.length === 3 ? { profileCode: 'OFP' } : { error: 'incomplete' },
    getMatchedSwingProfile: backswing => backswing?.profileCode === 'OFP' ? { n: 3 } : null,
  });
  for (const view of ['Front', 'Side']) {
    for (const field of ['Moment', 'Radius', 'Timing', 'Acceleration', 'Transfer', 'Impact', 'Detail']) c[`analysis${view}${field}`] = null;
  }
  for (const method of ['updateAnalysisSection', 'updateSummary', 'updateComparisonSection', 'updateSegmentScoresDisplay',
    'updateAllFramesMetricBar', 'updateSwingNarrative', 'updateSegmentComparisonCard', 'showGuide']) c[method] = () => {};
}

test('real scoring pipeline recalculates all frames while preserving official state', () => {
  const c = setup(); loadCalculators(c);
  c.crossViewCorrectionData.entries.frame6.sidePoints = c.crossViewCorrectionData.entries.frame6.frontPoints.map(point => ({ ...point }));
  c.refreshStoredFrameAnalyses();
  c.computing2dCorrectionScenario = false;
  const keys = ['frameStateHistory', 'frameMetricsHistory', 'frameSideMetricsHistory', 'segmentScoreHistory', 'segmentDeltaHistory'];
  const original = Object.fromEntries(keys.map(key => [key, c[key]]));
  const values = JSON.stringify(original);
  const before = c.get2dVirtualCorrectionScenario(), after = c.getCrossCorrectionScenario();
  assert.equal(before.unavailable, undefined);
  assert.equal(after.unavailable, undefined);
  assert.ok(c.ANALYSIS_FRAME_IDS.every(frame => Number.isFinite(after.scores[frame])));
  assert.notDeepEqual(after.scores, before.scores);
  assert.notDeepEqual(after.scores.frame3, original.segmentScoreHistory.frame3);
  assert.notDeepEqual(after.engineShares, before.engineShares);
  assert.equal(after.backswingCode, null, 'type checkpoints are not required or recalculated by 2D correction');
  assert.equal(after.profileNumber, null, 'profile matching remains based on the original classification');
  assert.ok(Math.abs(Object.values(after.engineShares).reduce((sum, value) => sum + value, 0) - 100) < 1e-8);
  for (const key of keys) assert.equal(c[key], original[key]);
  assert.equal(JSON.stringify(original), values);
  assert.equal(c.crossCorrectionContext, null);
});

test('calculator failure restores original references and clears correction context', () => {
  const c = setup(); loadCalculators(c);
  const original = c.frameStateHistory;
  c.refreshStoredFrameAnalyses = () => { throw new Error('test failure'); };
  assert.match(c.getCrossCorrectionScenario().unavailable, /test failure/);
  assert.equal(c.frameStateHistory, original);
  assert.equal(c.crossCorrectionContext, null);
  assert.equal(c.computing2dCorrectionScenario, false);
});

function setupEditor() {
  const c = setup(), elements = new Map();
  const ctx = { beginPath() {}, arc() {}, fill() {}, fillText() {}, moveTo() {}, lineTo() {}, stroke() {} };
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: id === 'crossCorrectionFrame' ? 'frame1' : '', style: {}, handlers: {}, options: [],
      clientWidth: 480, clientHeight: 480, readyState: 2, duration: 60, currentTime: 0, paused: true,
      addEventListener(event, callback) { this.handlers[event] = callback; },
      append(option) { this.options.push(option); }, getContext: () => ctx,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 480 }),
      pause() { this.paused = true; }, load() {}, scrollIntoView() {},
    });
    return elements.get(id);
  }
  let updates = 0;
  const files = { front: null, side: null };
  Object.assign(c, {
    document: { getElementById: element, createElement: () => ({}), activeElement: null },
    window: { addEventListener() {} }, URL: { createObjectURL: file => `blob:${file.id}`, revokeObjectURL() {} },
    getAnalysisAspect: () => 1, getVideoFileIdentity: file => file.id, hasMetric: Number.isFinite,
    getCrossCorrectionSourceFiles: () => files,
    update2dCorrectionDiagnostics() { updates++; }, confirm: () => true,
  });
  vm.runInContext(html.match(/  function getStanceCorrectionAngle\([\s\S]*?\n  }/)[0], c);
  vm.runInContext(source.slice(setupStart), c);
  const fire = (id, event, value = {}) => element(`crossCorrection${id}`).handlers[event](value);
  return { c, element, fire, files, updates: () => updates };
}

test('correction selector contains only six frames and directs side alignment to the front reference', () => {
  const { element } = setupEditor();
  const options = element('crossCorrectionFrame').options;
  assert.equal(options.length, 6);
  assert.ok(options.every(option => /정면 기준 동작에 측면 맞춤/.test(option.textContent)));
  assert.match(html, /두 영상의 시점은 별도로 맞추며 같은 초를 의미하지 않습니다/);
  assert.doesNotMatch(html, /이 화면을 열면 1번 측면·2번 정면 영상을 자동으로 가져옵니다/);
});

test('editor reuses and saves per-frame front/side landmarks without changing analysis state', () => {
  const { c, element, fire, updates } = setupEditor();
  const original = c.frameStateHistory;
  fire('SideFile', 'change', { target: { files: [{ id: 'new-side-not-used-in-step1' }] } });
  assert.equal(element('crossCorrectionSideVideo').src, 'blob:new-side-not-used-in-step1');
  assert.equal(c.validateCrossCorrectionData(c.crossViewCorrectionData), true, 'partially loaded input remains saveable');
  fire('FrontFile', 'change', { target: { files: [{ id: 'front-source' }] } });
  assert.equal(element('crossCorrectionFrontVideo').src, 'blob:front-source');
  assert.equal(element('crossCorrectionFrame').options.length, 6);
  assert.equal(c.frameStateHistory, original);
  fire('Reference', 'click');
  for (const view of ['Front', 'Side']) {
    for (const [index, y] of [400, 402, 160, 260].entries()) {
      fire(`${view}Canvas`, 'click', { clientX: 80 + index * 30, clientY: y });
    }
  }
  fire('ReferenceSave', 'click');
  assert.equal(c.crossViewCorrectionData.calibration, 'shaft-ground-v1');
  assert.deepEqual({ ...c.stanceReferenceLineFront }, {
    start: c.crossViewCorrectionData.references.front.stancePoints[0],
    end: c.crossViewCorrectionData.references.front.stancePoints[1],
  });
  assert.match(element('crossCorrectionStatus').textContent, /보정 기준: 저장 완료/);
  assert.equal(element('crossCorrectionFrame').value, 'frame1');
  fire('Points', 'click');
  for (const [frameIndex, frame] of frames.entries()) {
    if (frameIndex > 0) {
      element('crossCorrectionFrontVideo').currentTime = frameIndex;
      element('crossCorrectionSideVideo').currentTime = frameIndex * 2;
      fire('Points', 'click');
    }
    for (const view of ['Front', 'Side']) {
      c.CROSS_CORRECTION_POINTS[frame][view.toLowerCase()].forEach((type, i) =>
        fire(`${view}Canvas`, 'click', { clientX: 60 + i * 20, clientY: 100 + i * 20 }));
    }
    const prior = updates();
    fire('Capture', 'click');
    assert.equal(updates(), prior + 1);
    assert.ok(c.crossViewCorrectionData.entries[frame]);
  }
  assert.equal(element('crossCorrectionSideCanvas').height, 480);
  assert.equal(c.validateCrossCorrectionData(c.crossViewCorrectionData), true);
  const sources = structuredClone(c.crossViewCorrectionData.sources);
  fire('Clear', 'click');
  assert.deepEqual(Object.keys(c.crossViewCorrectionData.entries), []);
  assert.equal(c.stanceReferenceLineFront, null);
  assert.deepEqual(structuredClone(c.crossViewCorrectionData.sources), sources);
});

test('reference save rejects steep floor lines with measured angle before storing calibration', () => {
  const { c, element, fire, files } = setupEditor();
  c.crossViewCorrectionData.calibration = null;
  files.front = { id: 'front-source', name: 'front.mp4' };
  files.side = { id: 'independent-side-source', name: 'side.mp4' };
  element('crossCorrectionSetup').open = true;
  fire('Setup', 'toggle');
  fire('Reference', 'click');
  for (const view of ['Front', 'Side']) {
    for (const [index, point] of [[80, 200], [200, 400], [160, 100], [260, 300]].entries()) {
      fire(`${view}Canvas`, 'click', { clientX: point[0], clientY: point[1] });
    }
  }
  assert.match(element('crossCorrectionStatus').textContent, /지면선 2\/2/);
  fire('ReferenceSave', 'click');
  assert.equal(c.crossViewCorrectionData.calibration, null);
  assert.match(element('crossCorrectionStatus').textContent, /정면 지면 기준선 기울기 59\.0°/);
  assert.match(element('crossCorrectionStatus').textContent, /허용 범위는 수평 기준 ±30° 이내/);
});

test('reference selection uses the front F1 pose and keeps the independently matched side time', () => {
  const { c, element, fire, files } = setupEditor();
  files.front = { id: 'front-source', name: 'front.mp4' };
  files.side = { id: 'independent-side-source', name: 'side.mp4' };
  element('crossCorrectionSetup').open = true;
  fire('Setup', 'toggle');
  c.crossViewCorrectionData.entries.frame1 = { frontTime: 2.2, sideTime: 3.4 };
  element('crossCorrectionFrontVideo').currentTime = 10;
  element('crossCorrectionSideVideo').currentTime = 11;
  fire('Reference', 'click');
  assert.equal(element('crossCorrectionFrame').value, 'frame1');
  assert.equal(element('crossCorrectionFrontVideo').currentTime, 2.2);
  assert.equal(element('crossCorrectionSideVideo').currentTime, 3.4);
});

test('F2-F6 restore matching saved analysis times and landmarks in both views', () => {
  const { c, element, fire, files } = setupEditor();
  files.front = { id: 'front-source', name: 'front.mp4' };
  files.side = { id: 'independent-side-source', name: 'side.mp4' };
  for (const [index, frame] of c.CROSS_CORRECTION_FRAMES.entries()) {
    if (frame === 'frame1') continue;
    for (const view of ['front', 'side']) {
      c.frameStateHistory[view][frame] = {
        points: c.CROSS_CORRECTION_POINTS[frame][view].map((type, pointIndex) => ({
          type, x: 0.2 + pointIndex * 0.05, y: 0.3 + pointIndex * 0.04,
        })),
        videoTime: index + (view === 'front' ? 0.25 : 0.75),
        lines: [], aspectRatio: 1,
      };
    }
  }
  element('crossCorrectionSetup').open = true;
  fire('Setup', 'toggle');
  for (const [index, frame] of c.CROSS_CORRECTION_FRAMES.entries()) {
    if (frame === 'frame1') continue;
    element('crossCorrectionFrame').value = frame;
    fire('Frame', 'change');
    assert.equal(element('crossCorrectionFrontVideo').currentTime, index + 0.25);
    assert.equal(element('crossCorrectionSideVideo').currentTime, index + 0.75);
    fire('FrontVideo', 'seeked');
    fire('SideVideo', 'seeked');
    assert.match(element('crossCorrectionStatus').textContent, /정면 \d+\/\d+: 필요 점 확인 완료/);
    assert.match(element('crossCorrectionStatus').textContent, /측면 \d+\/\d+: 필요 점 확인 완료/);
  }
});

test('editor restores saved analysis landmarks and reports only the missing point', () => {
  const { c, element, fire, files } = setupEditor();
  c.crossViewCorrectionData = { version: 2, workflow: 'frame-pairs', references: {}, entries: {}, backswingEntries: {}, sources: {} };
  for (const view of ['front', 'side']) {
    const types = c.CROSS_CORRECTION_POINTS.frame1[view].filter(type => type !== 'clubHead');
    c.frameStateHistory[view].frame1 = {
      points: types.map((type, index) => ({ type, x: 0.3 + index * 0.04, y: 0.2 + index * 0.03 })),
      videoTime: 0, lines: [], aspectRatio: 1,
    };
  }
  files.front = { id: 'front-source', name: 'front.mp4' };
  files.side = { id: 'independent-side-source', name: 'side.mp4' };
  element('crossCorrectionSetup').open = true;
  fire('Setup', 'toggle');
  assert.match(element('crossCorrectionStatus').textContent, /정면 5\/6: 클럽헤드/);
  assert.match(element('crossCorrectionStatus').textContent, /측면 5\/6: 클럽헤드/);
  fire('FrontCanvas', 'click', { clientX: 240, clientY: 240 });
  assert.match(element('crossCorrectionStatus').textContent, /정면 6\/6: 필요 점 확인 완료/);
  fire('SideCanvas', 'click', { clientX: 240, clientY: 240 });
  assert.match(element('crossCorrectionStatus').textContent, /측면 6\/6: 필요 점 확인 완료/);
});

test('side frame is not forced to a backswing checkpoint and requires front-matched points', () => {
  const { c, element, fire, files } = setupEditor();
  const sideSource = 'backswing-side-source';
  c.videoFileIdentity.side = 'comparison-side-source';
  c.backswingSourceIdentity = sideSource;
  c.backswingFrames.address = {
    points: [
      { x: 0.4, y: 0.75 },
      { x: 0.45, y: 0.5 },
      { x: 0.5, y: 0.4 },
    ],
    time: 0.15,
    aspectRatio: 1,
  };
  c.backswingFrames.top = {
    points: [
      { x: 0.35, y: 0.2 },
      { x: 0.45, y: 0.35 },
      { x: 0.6, y: 0.1 },
    ],
    time: 1.25,
    aspectRatio: 1,
  };
  files.side = { id: sideSource, name: 'backswing-side.mp4' };
  element('crossCorrectionSetup').open = true;
  fire('Setup', 'toggle');
  element('crossCorrectionFrame').value = 'frame1';
  element('crossCorrectionSideVideo').currentTime = 0;
  fire('Frame', 'change');
  assert.equal(element('crossCorrectionSideVideo').currentTime, 0);
  fire('SideVideo', 'seeked');
  assert.match(element('crossCorrectionStatus').textContent, /측면 0\/6:/);
  assert.equal(element('crossCorrectionFrame').options.length, 6);
  assert.equal(Object.keys(c.crossViewCorrectionData.entries).length, 0);
});

test('saved legacy F1 pairs are cleared when the new F1-F6 alignment signature differs', () => {
  const { c, element, fire, files } = setupEditor();
  const sideSource = 'independent-side-source';
  files.front = { id: 'front-source', name: 'front.mp4' };
  files.side = { id: sideSource, name: 'side.mp4' };
  c.crossViewCorrectionData.sources = { front: 'front-source', side: sideSource };
  c.crossViewCorrectionData.entries.frame1 = { frontTime: 0, sideTime: 0 };
  c.crossViewCorrectionData.analysisSignature = 'legacy-alignment-signature';
  element('crossCorrectionSetup').open = true;
  fire('Setup', 'toggle');
  assert.equal(c.crossViewCorrectionData.entries.frame1, undefined);
  assert.equal(c.crossViewCorrectionData.analysisSignature, c.getCrossCorrectionAnalysisSignature());
  assert.equal(element('crossCorrectionFrame').options.length, 6);
});

test('calculate identifies unsaved frames and tells the user to save selected landmarks', () => {
  const { c, element, fire } = setupEditor();
  c.crossViewCorrectionData.entries = {};
  fire('Calculate', 'click');
  assert.match(element('crossCorrectionStatus').textContent, /저장되지 않은 분석 프레임: F1, F2, F3, F4, F5, F6/);
  assert.match(element('crossCorrectionStatus').textContent, /정면·측면 프레임 저장/);
});

test('opening correction reuses both analysis files, preserves same-source inputs and respects manual overrides', () => {
  const { c, element, fire, files } = setupEditor();
  files.front = { id: 'front-source', name: 'front.mp4' };
  files.side = { id: 'independent-side-source', name: 'side.mp4' };
  const entries = c.crossViewCorrectionData.entries;
  element('crossCorrectionSetup').open = true;
  fire('Setup', 'toggle');
  assert.equal(element('crossCorrectionFrontVideo').src, 'blob:front-source');
  assert.equal(element('crossCorrectionSideVideo').src, 'blob:independent-side-source');
  assert.match(element('crossCorrectionFrontSource').textContent, /2번 정면 자동 연결/);
  assert.match(element('crossCorrectionSideSource').textContent, /1번 측면 자동 연결/);
  assert.equal(c.crossViewCorrectionData.entries, entries);
  c.crossCorrectionMode = 'cross';
  fire('Setup', 'toggle');
  assert.equal(c.crossCorrectionMode, 'cross', 'reopening unchanged files does not reset calculation');
  c.crossViewCorrectionData = { version: 2, references: {}, entries: {}, sources: {} };
  fire('Setup', 'toggle');
  assert.equal(c.crossViewCorrectionData.sources.front, 'front-source', 'project restore reconnects already loaded files');
  assert.equal(c.crossViewCorrectionData.sources.side, 'independent-side-source');
  files.side = { id: 'new-side', name: 'new-side.mp4' };
  fire('Setup', 'toggle');
  assert.equal(element('crossCorrectionSideVideo').src, 'blob:new-side');
  assert.equal(Object.keys(c.crossViewCorrectionData.entries).length, 0);
  fire('SideFile', 'change', { target: { files: [{ id: 'manual-side', name: 'manual.mp4' }] } });
  fire('Setup', 'toggle');
  assert.equal(element('crossCorrectionSideVideo').src, 'blob:manual-side');
});

test('unavailable analysis originals explicitly request manual files', () => {
  const { element, fire } = setupEditor();
  element('crossCorrectionSetup').open = true;
  fire('Setup', 'toggle');
  for (const view of ['Front', 'Side']) assert.match(element(`crossCorrection${view}Source`).textContent, /파일을 선택/);
});

test('audio-only metadata explicitly reports an unusable video instead of silently playing sound', () => {
  const { element, fire } = setupEditor();
  const video = element('crossCorrectionFrontVideo');
  video.videoWidth = 0;
  video.videoHeight = 0;
  video.paused = false;
  fire('FrontVideo', 'loadedmetadata');
  assert.equal(video.paused, true);
  assert.match(element('crossCorrectionStatus').textContent, /코덱/);
});

test('analysis upload retains File objects independently from revoked preview URLs', () => {
  const c = vm.createContext({
    analysisVideoFiles: { front: null, side: null, backswing: null }, backswingActive: true,
    backswingOriginalVideo: null, backswingSourceIdentity: 'side-id',
    frontVideo: { src: 'blob:old' }, sideVideo: { src: '' },
    videoFileIdentity: { front: 'front-id', side: 'stale-side-id' },
    getVideoFileIdentity: file => file.id, applyPlaybackRates() {},
    URL: { revokeObjectURL() {}, createObjectURL: file => `blob:${file.id}` },
  });
  for (const name of ['loadVideo', 'getAnalysisVideoIdentity', 'getCrossCorrectionSourceFiles', 'retainRestoredBackswingVideoFile']) {
    vm.runInContext(html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`))[0], c);
  }
  const side = { id: 'side-id' }, front = { id: 'front-id' };
  c.loadVideo(c.sideVideo, side);
  assert.equal(c.getAnalysisVideoIdentity('side'), 'side-id',
    'project validation uses the retained side File instead of stale identity metadata');
  c.videoFileIdentity.side = 'side-id';
  assert.equal(c.getCrossCorrectionSourceFiles().side, side,
    'correction auto-link prefers the retained B/side source');
  c.loadVideo(c.frontVideo, side);
  c.backswingActive = false;
  c.loadVideo(c.frontVideo, front);
  c.videoFileIdentity.front = 'stale-front-id';
  assert.equal(c.getAnalysisVideoIdentity('front'), 'front-id',
    'project validation uses retained front File metadata when the cached identity drifts');
  c.videoFileIdentity.front = 'front-id';
  assert.equal(c.getCrossCorrectionSourceFiles().side, side);
  assert.equal(c.getCrossCorrectionSourceFiles().front, front);
  c.analysisVideoFiles.side = front;
  c.videoFileIdentity.side = 'front-id';
  c.analysisVideoFiles.backswing = side;
  c.backswingSourceIdentity = 'side-id';
  assert.equal(c.getCrossCorrectionSourceFiles().side, side,
    'step 6 must use the retained step 1 side video instead of reusing the front video');
  assert.match(html, /const currentIdentity = getAnalysisVideoIdentity\(view\);/);
  c.backswingActive = true;
  c.backswingOriginalVideo = { identity: 'front-id' };
  assert.equal(c.getCrossCorrectionSourceFiles().front, front, 'temporary backswing window does not replace engine source');
  c.backswingSourceIdentity = 'other-side';
  c.videoFileIdentity.side = 'other-side';
  assert.equal(c.getCrossCorrectionSourceFiles().side, null, 'restored project cannot reuse an unrelated retained file');
});

test('restoring step 1 retains its uploaded file even if the upload happened outside backswing mode', () => {
  const c = vm.createContext({
    analysisVideoFiles: { front: { id: 'side-id' }, backswing: null },
    backswingActive: false, backswingSourceIdentity: 'side-id',
    videoFileIdentity: { front: 'side-id' }, getVideoFileIdentity: file => file.id,
  });
  for (const name of ['getCrossCorrectionSourceFiles', 'retainBackswingVideoFile', 'retainRestoredBackswingVideoFile']) {
    vm.runInContext(html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`))[0], c);
  }
  const side = c.analysisVideoFiles.front;
  c.retainRestoredBackswingVideoFile({ analysis: { backswingSourceIdentity: 'side-id', backswingClassified: true }, media: { front: 'side-id' } }, false);
  c.analysisVideoFiles.front = { id: 'front-id' };
  c.videoFileIdentity.front = 'front-id';
  assert.equal(c.getCrossCorrectionSourceFiles().side, side);
  assert.equal(c.getCrossCorrectionSourceFiles().front.id, 'front-id');
  c.analysisVideoFiles.backswing = null;
  c.retainRestoredBackswingVideoFile({ analysis: { backswingSourceIdentity: 'unrelated-id' }, media: { front: 'front-id' } }, true);
  assert.equal(c.analysisVideoFiles.backswing, null);
});

test('opening step 1 retains a preloaded side file before step 2 replaces the main video', () => {
  const side = { id: 'side-id' }, front = { id: 'front-id' };
  const c = vm.createContext({
    analysisVideoFiles: { front: side, side: null, backswing: null },
    backswingActive: false,
    backswingSourceIdentity: 'side-id',
    videoFileIdentity: { front: 'front-id', side: 'side-id' },
    getVideoFileIdentity: file => file.id,
  });
  for (const name of ['getCrossCorrectionSourceFiles', 'retainBackswingVideoFile']) {
    vm.runInContext(html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`))[0], c);
  }
  const stage = html.match(/  function setBackswingMode\([\s\S]*?\n  }/)[0];
  assert.match(stage, /retainBackswingVideoFile\(analysisVideoFiles\.front, backswingSourceIdentity\)/);
  c.retainBackswingVideoFile(c.analysisVideoFiles.front, c.backswingSourceIdentity);
  c.analysisVideoFiles.front = front;
  assert.equal(c.getCrossCorrectionSourceFiles().front, front);
  assert.equal(c.getCrossCorrectionSourceFiles().side, side);
});

test('correction video escapes absolute main-video positioning and hidden overlays are not painted', () => {
  const css = html.match(/\.cross-correction-stage video \{([^}]+)\}/)[1];
  assert.match(css, /position: static/);
  assert.match(css, /height: auto/);
  assert.match(css, /transform: none/);
  const draw = html.match(/  function drawOverlay\([\s\S]*?\n  }/)[0];
  assert.ok(draw.indexOf('if (rect.width <= 0 || rect.height <= 0) return;') < draw.indexOf("ctx.fillStyle = 'yellow'"));
  assert.match(html, /new ResizeObserver\(resizeVideosAndCanvases\)/);
});
