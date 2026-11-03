import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('./cross-view-correction.js', import.meta.url), 'utf8');
const setupStart = source.indexOf('(function setupCrossCorrectionInput()');
const phases = ['P1', 'P4', 'P6', 'P7'];
const times = { P1: 0, P4: 2, P6: 3, P7: 4 };

function setup() {
  const c = vm.createContext({
    console: { error() {} }, Math, structuredClone,
    getSwingUiText: (ko, en) => ko,
    ANALYSIS_FRAME_IDS: Array.from({ length: 6 }, (_, index) => `frame${index + 1}`),
    frameStateHistory: { front: {}, side: {} },
    videoFileIdentity: { front: 'front-source', side: 'front-source' },
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
  data.sources = { front: 'front-source', side: 'independent-side-source' };
  for (const view of ['front', 'side']) {
    data.references[view] = { aspect: 1, time: 0, points: [{ x: 0.4, y: 0.1 }, { x: 0.4, y: 0.25 }] };
  }
  for (const phase of phases) {
    const points = c.CROSS_CORRECTION_POINTS[phase].map((type, index) => ({
      type, x: 0.2 + index * 0.06, y: 0.25 + index * 0.05,
    }));
    data.entries[phase] = {
      frontPoints: points, sidePoints: points.map((point, index) => ({ ...point, x: 0.2 + (index % 2) * 0.15 })),
      frontTime: times[phase], sideTime: times[phase] * 2 + 5, frontAspect: 1, sideAspect: 1,
    };
  }
  data.references.side.time = 5;
  for (const frame of c.ANALYSIS_FRAME_IDS) {
    const pair = c.CROSS_CORRECTION_FRAME_PHASES[frame];
    for (const [index, panel] of ['front', 'side'].entries()) {
      c.frameStateHistory[panel][frame] = {
        points: c.getFramePointTypesForView(frame, panel).map((type, i) => ({ type, x: 0.2 + i * 0.06, y: 0.25 + i * 0.05 })),
        videoTime: pair ? times[pair[index]] : 3.5 + index * 0.1,
        lines: [], aspectRatio: 1,
      };
    }
  }
  data.analysisSignature = c.getCrossCorrectionAnalysisSignature();
  return c;
}

test('four shared motions map to F1/F2/F4/F5/F6, without inventing F3 observations', () => {
  const c = setup(), model = c.getCrossCorrectionModel();
  assert.deepEqual(Array.from(model.correctedFrames), ['frame1', 'frame2', 'frame4', 'frame5', 'frame6']);
  assert.deepEqual(Array.from(model.retainedFrames), ['frame3']);
  assert.equal(model.frame3, undefined);
  const original = { kneeExtensionDeg: 123 };
  c.applyCrossCorrectionMetrics(original, model, 'frame3', 'side');
  assert.deepEqual(original, { kneeExtensionDeg: 123 });
  assert.equal(model.frame1.front.points.wrist, model.frame1.front.points.c7);
  assert.equal(model.frame4.side.points.shoulder, model.frame4.side.points.leftWrist);
});

test('P1 head-to-chin scale is locked, not treated as a vertical camera reference', () => {
  const c = setup();
  const calibration = c.getCrossCorrectionCalibration({
    aspect: 1, points: [{ x: 0.2, y: 0.1 }, { x: 0.29, y: 0.22 }],
  });
  assert.ok(Math.abs(calibration.length - 0.15) < 1e-10);
  assert.equal(calibration.ux, 0);
  assert.equal(calibration.uy, -1);
  const model = c.getCrossCorrectionModel(), metrics = { spineAngleDeg: 12, shaftAngleDeg: 13, spineAngleDeg5: 14 };
  c.applyCrossCorrectionMetrics(metrics, model, 'frame5', 'side');
  const p = model.frame5.side.points;
  const expected = Math.hypot(p.pelvis.x - p.handMid.x, p.pelvis.y - p.handMid.y, p.pelvis.z - p.handMid.z) * 0.15;
  assert.ok(Math.abs(metrics.coreHandRadiusRaw - expected) < 1e-10);
  assert.equal(metrics.spineAngleDeg, 12);
  assert.equal(metrics.shaftAngleDeg, 13);
  assert.equal(metrics.spineAngleDeg5, 14);
  assert.ok(Number.isFinite(metrics.lagAngleDeg5));
  assert.ok(metrics.threePointSpreadRaw > 0);
});

test('independent source scales produce equal fused geometry and the same front-unit length', () => {
  const c = setup(), before = c.getCrossCorrectionModel();
  for (const view of ['front', 'side']) {
    const factor = view === 'front' ? 0.8 : 1.2;
    const transform = point => ({ ...point, x: point.x * factor, y: point.y * factor });
    c.crossViewCorrectionData.references[view].points = c.crossViewCorrectionData.references[view].points.map(transform);
    for (const entry of Object.values(c.crossViewCorrectionData.entries)) {
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

test('source mismatch, stale analysis, missing motion, reference time and bad synchronization withhold correction', () => {
  for (const change of [
    c => { c.videoFileIdentity.front = 'new'; },
    c => { c.frameStateHistory.front.frame1.points[0].x += 0.01; },
    c => { delete c.crossViewCorrectionData.entries.P4; },
    c => { c.crossViewCorrectionData.references.side.time = 6; },
    c => { c.crossViewCorrectionData.entries.P6.sideTime = 3; },
    c => { c.crossViewCorrectionData.entries.P4.sideTime += 1; },
    c => { c.crossViewCorrectionData.entries.P4.sidePoints[0].y += 0.2; },
    c => { c.crossViewCorrectionData.references.front.points[1] = { ...c.crossViewCorrectionData.references.front.points[0] }; },
  ]) {
    const c = setup(); change(c);
    assert.throws(() => c.getCrossCorrectionModel());
    assert.ok(c.getCrossCorrectionScenario().unavailable);
  }
});

test('nearby but different analysis phases retain their original metrics instead of substituting P6', () => {
  const c = setup();
  c.frameStateHistory.side.frame2.videoTime = 2.8;
  c.crossViewCorrectionData.analysisSignature = c.getCrossCorrectionAnalysisSignature();
  const model = c.getCrossCorrectionModel();
  assert.equal(model.frame2, undefined);
  assert.ok(model.retainedFrames.includes('frame2'));
});

test('persistence validates four-motion format and finite landmarks', () => {
  const c = setup(), data = c.crossViewCorrectionData;
  assert.equal(c.validateCrossCorrectionData(data), true);
  for (const change of [
    d => { d.entries.P4.sidePoints[0] = null; },
    d => { d.entries.P4.sidePoints[0].x = NaN; },
    d => { d.entries.P4.sidePoints[1].type = d.entries.P4.sidePoints[0].type; },
    d => { d.references.front.time = -1; },
    d => { d.entries.junk = d.entries.P1; },
  ]) {
    const copy = structuredClone(data); change(copy);
    assert.equal(c.validateCrossCorrectionData(copy), false);
  }
  assert.equal(c.validateCrossCorrectionData({ references: {}, entries: {}, sources: {} }), true, 'old project can still be opened');
});

function loadCalculators(c) {
  for (const match of html.matchAll(/^  (?:async )?function (\w+)\([^\n]*[\s\S]*?^  }/gm)) {
    if (!['getPanelReferenceLength', 'areVideoSourcesSame', 'getAnalysisAspect', 'getSwingUiText'].includes(match[1])) {
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
    getMatchedSwingProfile: () => null,
  });
  for (const view of ['Front', 'Side']) {
    for (const field of ['Moment', 'Radius', 'Timing', 'Acceleration', 'Transfer', 'Impact', 'Detail']) c[`analysis${view}${field}`] = null;
  }
  for (const method of ['updateAnalysisSection', 'updateSummary', 'updateComparisonSection', 'updateSegmentScoresDisplay',
    'updateAllFramesMetricBar', 'updateSwingNarrative', 'updateSegmentComparisonCard', 'showGuide']) c[method] = () => {};
}

test('real scoring pipeline changes scores and engine percentages while retaining F3 and all official state', () => {
  const c = setup(); loadCalculators(c);
  c.crossViewCorrectionData.entries.P7.sidePoints = c.crossViewCorrectionData.entries.P7.frontPoints.map(point => ({ ...point }));
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
  assert.equal(after.scores.frame3, original.segmentScoreHistory.frame3);
  assert.notDeepEqual(after.engineShares, before.engineShares);
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
      value: id === 'crossCorrectionFrame' ? 'P1' : '', style: {}, handlers: {}, options: [],
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
    getAnalysisAspect: () => 1, getVideoFileIdentity: file => file.id,
    getCrossCorrectionSourceFiles: () => files,
    update2dCorrectionDiagnostics() { updates++; }, confirm: () => true,
  });
  vm.runInContext(source.slice(setupStart), c);
  const fire = (id, event, value = {}) => element(`crossCorrection${id}`).handlers[event](value);
  return { c, element, fire, files, updates: () => updates };
}

test('independent upload editor accepts side files, guides four motions, stores and advances without A/B mutation', () => {
  const { c, element, fire, updates } = setupEditor();
  const original = c.frameStateHistory;
  fire('SideFile', 'change', { target: { files: [{ id: 'new-side-not-used-in-step1' }] } });
  assert.equal(element('crossCorrectionSideVideo').src, 'blob:new-side-not-used-in-step1');
  assert.equal(c.validateCrossCorrectionData(c.crossViewCorrectionData), true, 'partially loaded input remains saveable');
  fire('FrontFile', 'change', { target: { files: [{ id: 'front-source' }] } });
  assert.equal(element('crossCorrectionFrontVideo').src, 'blob:front-source');
  assert.equal(element('crossCorrectionFrame').options.length, 4);
  assert.equal(c.frameStateHistory, original);
  fire('Reference', 'click');
  for (const view of ['Front', 'Side']) {
    fire(`${view}Canvas`, 'click', { clientX: 200, clientY: 40 });
    fire(`${view}Canvas`, 'click', { clientX: 200, clientY: 100 });
  }
  fire('Points', 'click');
  for (const view of ['Front', 'Side']) {
    c.CROSS_CORRECTION_POINTS.P1.forEach((type, i) => fire(`${view}Canvas`, 'click', { clientX: 60 + i * 20, clientY: 100 + i * 20 }));
  }
  const prior = updates();
  fire('Capture', 'click');
  assert.equal(updates(), prior + 1);
  assert.ok(c.crossViewCorrectionData.entries.P1);
  assert.equal(element('crossCorrectionFrame').value, 'P4');
  assert.equal(element('crossCorrectionSideCanvas').height, 480);
  assert.match(element('crossCorrectionStatus').textContent, /측면 0\//);
  fire('Reference', 'click');
  assert.equal(element('crossCorrectionFrame').value, 'P1');
  for (const view of ['Front', 'Side']) {
    fire(`${view}Canvas`, 'click', { clientX: 200, clientY: 40 });
    fire(`${view}Canvas`, 'click', { clientX: 200, clientY: 100 });
  }
  assert.match(element('crossCorrectionStatus').textContent, /정면: 2\/2/);
  const sources = structuredClone(c.crossViewCorrectionData.sources);
  fire('Clear', 'click');
  assert.deepEqual(Object.keys(c.crossViewCorrectionData.entries), []);
  assert.deepEqual(structuredClone(c.crossViewCorrectionData.sources), sources);
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
    analysisVideoFiles: { front: null, backswing: null }, backswingActive: true,
    backswingOriginalVideo: null, backswingSourceIdentity: 'side-id',
    frontVideo: { src: 'blob:old' }, videoFileIdentity: { front: 'front-id' },
    getVideoFileIdentity: file => file.id, applyPlaybackRates() {},
    URL: { revokeObjectURL() {}, createObjectURL: file => `blob:${file.id}` },
  });
  for (const name of ['loadVideo', 'getCrossCorrectionSourceFiles', 'retainRestoredBackswingVideoFile']) {
    vm.runInContext(html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`))[0], c);
  }
  const side = { id: 'side-id' }, front = { id: 'front-id' };
  c.loadVideo(c.frontVideo, side);
  c.backswingActive = false;
  c.loadVideo(c.frontVideo, front);
  assert.equal(c.getCrossCorrectionSourceFiles().side, side);
  assert.equal(c.getCrossCorrectionSourceFiles().front, front);
  c.backswingActive = true;
  c.backswingOriginalVideo = { identity: 'front-id' };
  assert.equal(c.getCrossCorrectionSourceFiles().front, front, 'temporary backswing window does not replace engine source');
  c.backswingSourceIdentity = 'other-side';
  assert.equal(c.getCrossCorrectionSourceFiles().side, null, 'restored project cannot reuse an unrelated retained file');
});

test('restoring step 1 retains its uploaded file even if the upload happened outside backswing mode', () => {
  const c = vm.createContext({
    analysisVideoFiles: { front: { id: 'side-id' }, backswing: null },
    backswingActive: false, backswingSourceIdentity: 'side-id',
    videoFileIdentity: { front: 'side-id' }, getVideoFileIdentity: file => file.id,
  });
  for (const name of ['getCrossCorrectionSourceFiles', 'retainRestoredBackswingVideoFile']) {
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

test('correction video escapes absolute main-video positioning and hidden overlays are not painted', () => {
  const css = html.match(/\.cross-correction-stage video \{([^}]+)\}/)[1];
  assert.match(css, /position: static/);
  assert.match(css, /height: auto/);
  assert.match(css, /transform: none/);
  const draw = html.match(/  function drawOverlay\([\s\S]*?\n  }/)[0];
  assert.ok(draw.indexOf('if (rect.width <= 0 || rect.height <= 0) return;') < draw.indexOf("ctx.fillStyle = 'yellow'"));
  assert.match(html, /new ResizeObserver\(resizeVideosAndCanvases\)/);
});
