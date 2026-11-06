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
    frameStateHistory: { front: {}, side: {} }, backswingFrames: {}, backswingSourceIdentity: null,
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
  vm.runInContext(html.match(/  function getBackswingPhaseForAnalysisFrame\([\s\S]*?\n  }/)[0], c);
  for (const name of ['computeFrameMetrics', 'computeThreePointSpread', 'clamp', 'hasMetric']) {
    vm.runInContext(html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`))[0], c);
  }
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
  assert.equal(model.frame1.front, undefined);
  assert.equal(model.frame1.side.points.wrist, model.frame1.side.points.c7);
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
  assert.equal(metrics.spineAngleDeg, null);
  assert.notEqual(metrics.shaftAngleDeg, 13);
  assert.notEqual(metrics.spineAngleDeg5, 14);
  assert.ok(Number.isFinite(metrics.shaftAngleDeg));
  assert.ok(Number.isFinite(metrics.lagAngleDeg5));
  assert.ok(metrics.threePointSpreadRaw > 0);
});

test('opposite vertical projections retain front reference height instead of averaging it away', () => {
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
  assert.ok(Math.abs(model.frame3.side.points.clubHead.y - front.vertical) < 1e-10);
});

test('correction never replaces A reference poses and B positions stay in front-camera units', () => {
  const c = setup(), model = c.getCrossCorrectionModel();
  for (const frame of frames) {
    const a = { c7NormX: 0.3, pelvisNormX: 0.4, lagAngleDeg6: 95 };
    c.applyCrossCorrectionMetrics(a, model, frame, 'front');
    assert.deepEqual(a, { c7NormX: 0.3, pelvisNormX: 0.4, lagAngleDeg6: 95 }, frame);
    const b = {};
    c.applyCrossCorrectionMetrics(b, model, frame, 'side');
    const entry = model[frame].side;
    const expected = c.computeFrameMetrics(entry.projectionPoints, [], frame, 1, 1, entry.aspect);
    for (const key of ['c7NormX', 'c7NormY', 'pelvisNormX', 'hipNormY', 'bodyLength',
      'c7NormX2', 'pelvisCenterNormX', 'kneeExtensionDeg', 'spineLen5',
      'handX', 'handY', 'c7X', 'c7Y', 'pelvisX', 'pelvisY', 'c7NormX6', 'comNormX6']) {
      assert.equal(b[key], expected[key], `${frame} ${key}`);
    }
    if (frame === 'frame6') {
      assert.equal(b.rotRadius6, expected.rotRadius6);
      assert.equal(b.lagAngleDeg6, expected.lagAngleDeg6);
    }
  }
});

test('shaft tilt cannot collapse when the side camera projects the clubhead on the opposite side vertically', () => {
  const c = setup(), pair = c.crossViewCorrectionData.entries.frame5;
  pair.frontPoints.find(p => p.type === 'handMid').y = 0.5;
  pair.frontPoints.find(p => p.type === 'clubHead').y = 0.3;
  pair.sidePoints.find(p => p.type === 'handMid').y = 0.5;
  pair.sidePoints.find(p => p.type === 'clubHead').y = 0.7;
  const model = c.getCrossCorrectionModel(), metrics = {};
  c.applyCrossCorrectionMetrics(metrics, model, 'frame5', 'side');
  const points = model.frame5.side.points;
  assert.ok(Math.abs(points.clubHead.y - points.handMid.y) > 1);
  assert.ok(metrics.shaftAngleDeg > 45);
});

test('frames with occluded landmarks remain uncorrected while complete frames are still fused', () => {
  const c = setup();
  for (const view of ['front', 'side']) {
    c.crossViewCorrectionData.entries.frame4[`${view}Points`] =
      c.crossViewCorrectionData.entries.frame4[`${view}Points`].filter(point => point.type !== 'pelvisCenter');
  }
  c.crossViewCorrectionData.analysisSignature = c.getCrossCorrectionAnalysisSignature();
  assert.equal(c.validateCrossCorrectionData(c.crossViewCorrectionData), true);
  const model = c.getCrossCorrectionModel();
  assert.ok(!model.correctedFrames.includes('frame4'));
  assert.ok(model.retainedFrames.includes('frame4'));
  assert.deepEqual(Array.from(model.retainedDetails.frame4.front), ['pelvisCenter']);
  assert.deepEqual(Array.from(model.retainedDetails.frame4.side), ['pelvisCenter']);
  const metrics = { coreHandRadiusRaw: 0.123 };
  c.applyCrossCorrectionMetrics(metrics, model, 'frame4', 'front');
  assert.deepEqual(metrics, { coreHandRadiusRaw: 0.123 }, 'missing points never produce guessed corrected metrics');
});

function hidePoints(c, frame, view, types) {
  const pair = c.crossViewCorrectionData.entries[frame];
  pair[`${view}Points`] = pair[`${view}Points`].filter(point => !types.includes(point.type));
  pair[`${view}Hidden`] = [...types];
}

test('a hidden unrelated point cannot disable cross-view radius and spread corrections elsewhere', () => {
  for (const [frame, type] of [['frame1', 'clubHead'], ['frame2', 'shoulder'], ['frame5', 'clubHead'], ['frame6', 'c7']]) {
    const c = setup();
    const before = c.getCrossCorrectionModel(), expected = {};
    c.applyCrossCorrectionMetrics(expected, before, 'frame3', 'side');
    hidePoints(c, frame, 'side', [type]);
    const after = c.getCrossCorrectionModel(), actual = {};
    c.applyCrossCorrectionMetrics(actual, after, 'frame3', 'side');
    assert.equal(after.geometryBasis.radius, 'cross', `${frame} radius`);
    assert.equal(after.geometryBasis.spread, 'cross', `${frame} spread`);
    assert.equal(actual.coreHandRadiusRaw, expected.coreHandRadiusRaw);
    assert.equal(actual.threePointSpreadRaw, expected.threePointSpreadRaw);
  }
});

test('missing C7 changes only temporal spread basis, preserving radius and unrelated angles', () => {
  const c = setup(), before = c.getCrossCorrectionModel(), expected = {};
  c.applyCrossCorrectionMetrics(expected, before, 'frame2', 'side');
  hidePoints(c, 'frame2', 'side', ['c7']);
  const after = c.getCrossCorrectionModel(), actual = {};
  c.applyCrossCorrectionMetrics(actual, after, 'frame2', 'side');
  assert.equal(after.geometryBasis.radius, 'cross');
  assert.equal(after.geometryBasis.spread, 'front');
  assert.equal(actual.coreHandRadiusRaw, expected.coreHandRadiusRaw);
  assert.equal(actual.laggingAngleDeg, expected.laggingAngleDeg);
  for (const frame of ['frame1', 'frame2', 'frame3', 'frame4']) {
    const metrics = {}, entry = after[frame].side;
    c.applyCrossCorrectionMetrics(metrics, after, frame, 'side');
    const projected = c.computeFrameMetrics(entry.projectionPoints, [], frame, 1, 1, entry.aspect);
    assert.equal(metrics.threePointSpreadRaw, projected.threePointSpreadRaw, frame);
  }
});

test('a missing temporal radius endpoint never mixes projected and combined lengths across phases', () => {
  const c = setup();
  hidePoints(c, 'frame3', 'side', ['handMid']);
  const model = c.getCrossCorrectionModel();
  assert.equal(model.geometryBasis.radius, 'front');
  assert.equal(model.geometryBasis.spread, 'front');
  for (const frame of ['frame1', 'frame2', 'frame3', 'frame4']) {
    const metrics = {}, entry = model[frame].side;
    c.applyCrossCorrectionMetrics(metrics, model, frame, 'side');
    const projected = c.computeFrameMetrics(entry.projectionPoints, [], frame, 1, 1, entry.aspect);
    assert.equal(metrics.coreHandRadiusRaw, projected.coreHandRadiusRaw, frame);
  }
  const metrics = {};
  c.applyCrossCorrectionMetrics(metrics, model, 'frame5', 'side');
  const p = model.frame5.side.points;
  assert.equal(metrics.coreHandRadiusRaw,
    Math.hypot(p.handMid.x - p.pelvis.x, p.handMid.y - p.pelvis.y, p.handMid.z - p.pelvis.z) * model.frame5.side.scale);
});

test('one visible view supplies absolute angles, but never cross-camera temporal displacement', () => {
  const c = setup();
  hidePoints(c, 'frame2', 'front', ['handMid', 'club', 'shoulder', 'pelvis', 'c7']);
  const model = c.getCrossCorrectionModel(), metrics = { pelvisNormX: 123, c7NormX2: 456 };
  c.applyCrossCorrectionMetrics(metrics, model, 'frame2', 'side');
  const projected = c.computeFrameMetrics(model.frame2.side.sideProjectionPoints, [], 'frame2', 1, 1, 1);
  assert.equal(metrics.laggingAngleDeg, projected.laggingAngleDeg);
  assert.ok(Number.isFinite(metrics.laggingAngleDeg));
  assert.equal(metrics.pelvisNormX, undefined, 'must remove original hidden coordinates');
  assert.equal(metrics.c7NormX2, undefined);
  assert.equal(metrics.projectedLaggingAngleDeg, null, 'side-only angle cannot be subtracted from front A');
  assert.equal(model.projectedRadii, true);
  assert.equal(model.visibility.frame2.side, 5);
  assert.equal(model.retainedFrames.includes('frame2'), false);
});

test('front-only points use front geometry without retaining original scores or guessing depth', () => {
  const c = setup();
  hidePoints(c, 'frame5', 'side', [...c.CROSS_CORRECTION_POINTS.frame5.side]);
  const model = c.getCrossCorrectionModel(), metrics = {};
  c.applyCrossCorrectionMetrics(metrics, model, 'frame5', 'side');
  const projected = c.computeFrameMetrics(model.frame5.side.projectionPoints, [], 'frame5', 1, 1, 1);
  assert.equal(metrics.shaftAngleDeg, projected.shaftAngleDeg);
  assert.equal(metrics.lagAngleDeg5, projected.lagAngleDeg5);
  assert.equal(metrics.coreHandRadiusRaw, projected.coreHandRadiusRaw);
  assert.equal(model.visibility.frame5.front, 4);
  assert.deepEqual(Object.keys(model.frame5.side.points), []);
});

test('angles require all landmarks in one clear view and never mix unrelated visible endpoints', () => {
  const c = setup();
  hidePoints(c, 'frame4', 'front', ['pelvis']);
  hidePoints(c, 'frame4', 'side', ['club']);
  const model = c.getCrossCorrectionModel(), metrics = { armShaftAngleDeg: 170 };
  c.applyCrossCorrectionMetrics(metrics, model, 'frame4', 'side');
  assert.equal(metrics.armShaftAngleDeg, null);
  assert.equal(metrics.armShaftMissingReason, 'missingPoints');
});

test('visibility persistence rejects unknown, duplicate, overlapping or incomplete all-hidden input', () => {
  const c = setup();
  for (const hidden of [['invalid'], ['c7', 'c7'], 'c7', ['c7']]) {
    const data = structuredClone(c.crossViewCorrectionData);
    data.entries.frame5.frontHidden = hidden;
    assert.equal(c.validateCrossCorrectionData(data), false);
  }
  const data = structuredClone(c.crossViewCorrectionData);
  data.entries.frame5.frontPoints = [];
  data.entries.frame5.frontHidden = ['c7'];
  assert.equal(c.validateCrossCorrectionData(data), false);
  data.entries.frame5.frontHidden = [...c.CROSS_CORRECTION_POINTS.frame5.front];
  assert.equal(c.validateCrossCorrectionData(data), true);
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

test('changed analysis is withheld without repeated exception logging or input mutation', () => {
  const c = setup();
  const before = JSON.stringify(c.crossViewCorrectionData);
  let errors = 0, calculations = 0;
  c.console = { error() { errors++; } };
  c.get2dVirtualCorrectionScenario = () => { calculations++; };
  c.frameStateHistory.front.frame1.points[0].x += 0.01;
  for (let index = 0; index < 4; index++) {
    assert.match(c.getCrossCorrectionScenario().unavailable, /기존 분석이 변경/);
  }
  assert.equal(errors, 0);
  assert.equal(calculations, 0);
  assert.equal(JSON.stringify(c.crossViewCorrectionData), before);
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
  assert.ok(Number.isFinite(metrics.topShaftAngleDeg));
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

test('real scoring preserves temporal movement evidence while correcting only matched B geometry', () => {
  const c = setup(); loadCalculators(c);
  for (const [index, frame] of frames.entries()) {
    for (const point of c.frameStateHistory.side[frame].points) point.x += 0.06 + index * 0.01;
    c.crossViewCorrectionData.entries[frame].frontPoints =
      c.CROSS_CORRECTION_POINTS[frame].front.map(type => {
        const sourceType = frame === 'frame1' && type === 'clubHead' ? 'clubHeadTop' : type;
        const point = c.frameStateHistory.side[frame].points.find(p => p.type === sourceType);
        assert.ok(point, `${frame} ${sourceType}`);
        return { ...point, type };
      });
  }
  c.crossViewCorrectionData.analysisSignature = c.getCrossCorrectionAnalysisSignature();
  const original = JSON.stringify(c.frameStateHistory);
  const classify = c.classifySwingType;
  const deltas = [];
  c.classifySwingType = () => {
    deltas.push(structuredClone(c.segmentDeltaHistory));
    return classify();
  };
  c.computing2dCorrectionScenario = false;
  const rolled = c.get2dVirtualCorrectionScenario();
  const crossed = c.getCrossCorrectionScenario();
  assert.equal(rolled.unavailable, undefined);
  assert.equal(crossed.unavailable, undefined);
  assert.ok(crossed.engineShares.type2 > 0, 'real F2 movement must not become zero LSE');
  const fields = {
    frame1: ['spineAngleDelta', 'xFactorDelta', 'c7XPercent', 'c7YPercent'],
    frame2: ['pelvisLateralDelta', 'c7LateralDelta2', 'laggingAngleDelta'],
    frame3: ['kneeExtDelta', 'leadHipRiseBodyPercent', 'c7RisePercent'],
    frame4: ['armShaftDelta', 'c7XPercent', 'c7YPercent'],
    frame5: ['handOffsetDelta', 'handAlongDelta', 'c7SwayRatio', 'c7RiseRatio', 'pelvisShiftRatio'],
    frame6: ['timeDeltaSec', 'releaseIndex', 'lagAngleA6', 'sequenceIndex', 'pelvisNetP6', 'c7NetP7', 'c7TopShift6'],
  };
  for (const [frame, keys] of Object.entries(fields)) {
    for (const key of keys) {
      assert.ok(Math.abs(deltas[0][frame].fm[key] - deltas[1][frame].fm[key]) < 1e-10, `${frame} ${key}`);
    }
  }
  assert.equal(JSON.stringify(c.frameStateHistory), original);
  for (const pair of Object.values(c.crossViewCorrectionData.entries)) {
    pair.frontTime += 13;
    pair.sideTime += 29;
  }
  c.cached2dCorrectionScenarioKey = null;
  const independentTimes = c.getCrossCorrectionScenario();
  assert.deepEqual(independentTimes.scores, crossed.scores);
  assert.deepEqual(independentTimes.engineShares, crossed.engineShares,
    'independent file timestamps must not change scores for the same selected motion');
});

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

test('all-hidden frames withhold scores and engine classification without falling back to original points', () => {
  const c = setup(); loadCalculators(c);
  for (const frame of frames) {
    for (const view of ['front', 'side']) {
      hidePoints(c, frame, view, [...c.CROSS_CORRECTION_POINTS[frame][view]]);
    }
  }
  c.computing2dCorrectionScenario = false;
  const original = JSON.stringify([c.frameStateHistory, c.segmentScoreHistory, c.crossViewCorrectionData]);
  const result = c.getCrossCorrectionScenario();
  assert.equal(result.unavailable, undefined);
  for (const frame of frames) assert.equal(result.scores[frame], null, frame);
  assert.equal(result.engineShares, null);
  assert.equal(result.engineCode, null);
  assert.ok(result.engineMissing.length > 0);
  assert.equal(JSON.stringify([c.frameStateHistory, c.segmentScoreHistory, c.crossViewCorrectionData]), original);
});

test('skipping an unused side F6 point preserves corrected scores instead of reverting to roll-only scores', () => {
  const c = setup(); loadCalculators(c);
  c.computing2dCorrectionScenario = false;
  const rolled = c.get2dVirtualCorrectionScenario();
  const before = c.getCrossCorrectionScenario();
  assert.equal(before.unavailable, undefined);
  assert.notDeepEqual(before.scores, rolled.scores);
  hidePoints(c, 'frame6', 'side', ['clubHead']);
  const after = c.getCrossCorrectionScenario();
  assert.equal(after.unavailable, undefined);
  assert.deepEqual(after.scores, before.scores);
  assert.deepEqual(after.engineShares, before.engineShares);
  assert.notDeepEqual(after.scores, rolled.scores);
});

test('side-only F5 angles are scored while an entirely hidden shaft cannot receive a path-only score', () => {
  const c = setup(); loadCalculators(c);
  hidePoints(c, 'frame5', 'front', [...c.CROSS_CORRECTION_POINTS.frame5.front]);
  c.computing2dCorrectionScenario = false;
  const result = c.getCrossCorrectionScenario();
  assert.equal(result.unavailable, undefined);
  assert.ok(Number.isFinite(result.scores.frame5));
  hidePoints(c, 'frame5', 'side', ['handMid', 'clubHead']);
  c.cached2dCorrectionScenarioKey = null;
  const hidden = c.getCrossCorrectionScenario();
  assert.equal(hidden.unavailable, undefined);
  assert.equal(hidden.scores.frame5, null);
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

test('correction selector names the target motion and directs side alignment to the front reference', () => {
  const { element } = setupEditor();
  const options = element('crossCorrectionFrame').options;
  assert.equal(options.length, 6);
  assert.match(options[0].textContent, /백스윙 탑/);
  assert.match(options[1].textContent, /양손 허리 높이/);
  assert.match(options[2].textContent, /임팩트 직전/);
  assert.match(options[3].textContent, /임팩트/);
  assert.match(options[4].textContent, /양손 허리 높이/);
  assert.match(options[5].textContent, /임팩트/);
  assert.match(html, /F2\/F5와 F4\/F6은 서로 다른 지표의 점 구성이므로 각각 저장하세요/);
  assert.match(html, /정면은 분석2 B의 저장 동작을 연결하며 A의 어드레스 시점은 사용하지 않습니다/);
  assert.match(html, /두 영상의 시점은 별도로 맞추며 같은 초를 의미하지 않습니다/);
  assert.doesNotMatch(html, /이 화면을 열면 1번 측면·2번 정면 영상을 자동으로 가져옵니다/);
});

test('undo removes only the most recent point across views and restores the selected landmark', () => {
  const { c, element, fire } = setupEditor();
  fire('Points', 'click');
  assert.equal(element('crossCorrectionUndo').disabled, true);
  const saved = structuredClone(c.crossViewCorrectionData.entries);
  element('crossCorrectionFrontPointType').value = 'wrist';
  fire('FrontCanvas', 'click', { clientX: 120, clientY: 120 });
  element('crossCorrectionSidePointType').value = 'club';
  fire('SideCanvas', 'click', { clientX: 180, clientY: 180 });
  assert.equal(element('crossCorrectionUndo').disabled, false);
  fire('Undo', 'click');
  assert.match(element('crossCorrectionStatus').textContent, /정면 1\/6:/);
  assert.match(element('crossCorrectionStatus').textContent, /측면 0\/6:/);
  assert.equal(element('crossCorrectionSidePointType').value, 'club');
  fire('Undo', 'click');
  assert.match(element('crossCorrectionStatus').textContent, /정면 0\/6:/);
  assert.equal(element('crossCorrectionFrontPointType').value, 'wrist');
  assert.equal(element('crossCorrectionUndo').disabled, true);
  assert.deepEqual(structuredClone(c.crossViewCorrectionData.entries), saved);
});

test('not-visible replaces an existing point, advances, and is reversible without changing saved data', () => {
  const { c, element, fire, files } = setupEditor();
  files.front = { id: 'front-source' };
  files.side = { id: 'independent-side-source' };
  element('crossCorrectionSetup').open = true;
  fire('Setup', 'toggle');
  fire('FrontVideo', 'seeked');
  const saved = structuredClone(c.crossViewCorrectionData.entries);
  element('crossCorrectionFrontPointType').value = 'wrist';
  fire('FrontHidden', 'click');
  assert.match(element('crossCorrectionStatus').textContent, /정면 5\/6:.*안 보임 1/);
  assert.equal(element('crossCorrectionFrontPointType').value, '');
  assert.ok(element('crossCorrectionFrontPointType').options.some(option => /안 보임/.test(option.textContent)));
  fire('Undo', 'click');
  assert.match(element('crossCorrectionStatus').textContent, /정면 6\/6:/);
  assert.doesNotMatch(element('crossCorrectionStatus').textContent, /안 보임 1/);
  assert.equal(element('crossCorrectionFrontPointType').value, 'wrist');
  assert.deepEqual(structuredClone(c.crossViewCorrectionData.entries), saved);
});

test('not-visible advances through all points, persists empty-view input, and restores after JSON reload', () => {
  const { c, element, fire, files } = setupEditor();
  files.front = { id: 'front-source' };
  files.side = { id: 'independent-side-source' };
  element('crossCorrectionSetup').open = true;
  fire('Setup', 'toggle');
  fire('Points', 'click');
  const types = c.CROSS_CORRECTION_POINTS.frame1.front;
  for (const type of types) {
    assert.equal(element('crossCorrectionFrontPointType').value, type);
    fire('FrontHidden', 'click');
  }
  for (const type of c.CROSS_CORRECTION_POINTS.frame1.side) {
    element('crossCorrectionSidePointType').value = type;
    fire('SideCanvas', 'click', { clientX: 120, clientY: 180 });
  }
  assert.match(element('crossCorrectionStatus').textContent, /측면만 6/);
  assert.equal(element('crossCorrectionFrontHidden').disabled, true);
  fire('Capture', 'click');
  assert.equal(c.crossViewCorrectionData.entries.frame1.frontPoints.length, 0);
  assert.deepEqual(Array.from(c.crossViewCorrectionData.entries.frame1.frontHidden), Array.from(types));
  assert.equal(c.validateCrossCorrectionData(c.crossViewCorrectionData), true);
  c.crossViewCorrectionData = JSON.parse(JSON.stringify(c.crossViewCorrectionData));
  element('crossCorrectionFrame').value = 'frame1';
  fire('Frame', 'change');
  fire('FrontVideo', 'seeked');
  fire('SideVideo', 'seeked');
  assert.match(element('crossCorrectionStatus').textContent, /안 보임 6/);
  element('crossCorrectionFrontPointType').value = 'wrist';
  fire('FrontCanvas', 'click', { clientX: 100, clientY: 150 });
  assert.match(element('crossCorrectionStatus').textContent, /양쪽 명확 1/);
  fire('Capture', 'click');
  assert.equal(c.crossViewCorrectionData.entries.frame1.frontHidden.includes('wrist'), false);
  assert.equal(c.crossViewCorrectionData.entries.frame1.frontPoints.length, 1);
});

test('both-hidden inputs can be saved but cannot skip ground and shaft calibration', () => {
  const { c, element, fire, files } = setupEditor();
  files.front = { id: 'front-source' };
  files.side = { id: 'independent-side-source' };
  element('crossCorrectionSetup').open = true;
  fire('Setup', 'toggle');
  fire('Reference', 'click');
  assert.equal(element('crossCorrectionFrontHidden').disabled, true);
  assert.equal(element('crossCorrectionSideHidden').disabled, true);
  fire('FrontHidden', 'click');
  assert.match(element('crossCorrectionStatus').textContent, /지면선 0\/2/);
  fire('Points', 'click');
  for (const view of ['Front', 'Side']) {
    for (const type of c.CROSS_CORRECTION_POINTS.frame1[view.toLowerCase()]) {
      element(`crossCorrection${view}PointType`).value = type;
      fire(`${view}Hidden`, 'click');
    }
  }
  assert.match(element('crossCorrectionStatus').textContent, /양쪽 안 보임 6/);
  fire('Capture', 'click');
  assert.equal(c.crossViewCorrectionData.entries.frame1.frontPoints.length, 0);
  assert.equal(c.crossViewCorrectionData.entries.frame1.sidePoints.length, 0);
  assert.equal(c.validateCrossCorrectionData(c.crossViewCorrectionData), true);
});

test('a manually selected independent video restores both marked and hidden points from its own saved pair', () => {
  const { c, element, fire } = setupEditor();
  fire('FrontFile', 'change', { target: { files: [{ id: 'front-source' }] } });
  fire('SideFile', 'change', { target: { files: [{ id: 'manual-independent-side' }] } });
  c.crossViewCorrectionData.entries.frame1 = {
    frontPoints: [{ type: 'wrist', x: 0.2, y: 0.3 }],
    sidePoints: [{ type: 'wrist', x: 0.4, y: 0.3 }],
    frontHidden: ['club'], sideHidden: ['club'],
    frontTime: 2, sideTime: 5, frontAspect: 1, sideAspect: 1,
  };
  fire('Frame', 'change');
  fire('FrontVideo', 'seeked');
  fire('SideVideo', 'seeked');
  assert.match(element('crossCorrectionStatus').textContent, /측면 1\/6:.*안 보임 1/);
  assert.match(element('crossCorrectionStatus').textContent, /양쪽 명확 1/);
});

test('not-visible state is cleared on seeking, replay, frame reset and source replacement', () => {
  const { element, fire } = setupEditor();
  fire('Points', 'click');
  fire('FrontHidden', 'click');
  fire('FrontVideo', 'seeked');
  assert.doesNotMatch(element('crossCorrectionStatus').textContent, /안 보임 1/);
  fire('FrontHidden', 'click');
  fire('FrontVideo', 'play');
  assert.doesNotMatch(element('crossCorrectionStatus').textContent, /안 보임 1/);
  fire('FrontHidden', 'click');
  fire('Points', 'click');
  assert.doesNotMatch(element('crossCorrectionStatus').textContent, /안 보임 1/);
  fire('FrontHidden', 'click');
  fire('FrontFile', 'change', { target: { files: [{ id: 'new-source' }] } });
  assert.doesNotMatch(element('crossCorrectionStatus').textContent, /안 보임 1/);
});

test('undo restores the prior position when an existing point is replaced', () => {
  const { c, element, fire } = setupEditor();
  fire('FrontFile', 'change', { target: { files: [{ id: 'front-source' }] } });
  fire('SideFile', 'change', { target: { files: [{ id: 'independent-side-source' }] } });
  fire('Frame', 'change');
  fire('FrontVideo', 'seeked');
  fire('SideVideo', 'seeked');
  const original = structuredClone(c.crossViewCorrectionData.entries.frame1.frontPoints);
  element('crossCorrectionFrontPointType').value = 'wrist';
  fire('FrontCanvas', 'click', { clientX: 360, clientY: 360 });
  fire('Undo', 'click');
  assert.match(element('crossCorrectionStatus').textContent, /정면 6\/6:/);
  fire('Capture', 'click');
  assert.deepEqual(structuredClone(c.crossViewCorrectionData.entries.frame1.frontPoints), original);
  assert.equal(element('crossCorrectionUndo').disabled, true);
});

test('undo supports ground and shaft points without changing saved calibration', () => {
  const { c, element, fire } = setupEditor();
  const references = structuredClone(c.crossViewCorrectionData.references);
  fire('Reference', 'click');
  for (const [x, y] of [[60, 300], [300, 300], [120, 60]]) {
    fire('FrontCanvas', 'click', { clientX: x, clientY: y });
  }
  assert.match(element('crossCorrectionStatus').textContent, /정면: 지면선 2\/2 · 샤프트 1\/2/);
  fire('Undo', 'click');
  assert.match(element('crossCorrectionStatus').textContent, /정면: 지면선 2\/2 · 샤프트 0\/2/);
  fire('Undo', 'click');
  assert.match(element('crossCorrectionStatus').textContent, /정면: 지면선 1\/2 · 샤프트 0\/2/);
  assert.deepEqual(structuredClone(c.crossViewCorrectionData.references), references);
  fire('Points', 'click');
  assert.equal(element('crossCorrectionUndo').disabled, true);
});

test('undo history cannot cross frame changes, seeking or reset boundaries', () => {
  const { element, fire } = setupEditor();
  fire('Points', 'click');
  fire('FrontCanvas', 'click', { clientX: 120, clientY: 120 });
  fire('SideCanvas', 'click', { clientX: 180, clientY: 180 });
  fire('FrontVideo', 'seeked');
  fire('Undo', 'click');
  assert.equal(element('crossCorrectionUndo').disabled, true, 'seeking discards only that view undo entries');
  fire('Points', 'click');
  fire('FrontCanvas', 'click', { clientX: 120, clientY: 120 });
  element('crossCorrectionFrame').value = 'frame2';
  fire('Frame', 'change');
  assert.equal(element('crossCorrectionUndo').disabled, true);
  fire('FrontCanvas', 'click', { clientX: 120, clientY: 120 });
  fire('Clear', 'click');
  assert.equal(element('crossCorrectionUndo').disabled, true);
});

test('correction uses analysis B action and the exact independent backswing checkpoint, never analysis A', () => {
  const { c, element, fire } = setupEditor();
  fire('FrontFile', 'change', { target: { files: [{ id: 'front-source' }] } });
  fire('SideFile', 'change', { target: { files: [{ id: 'independent-side-source' }] } });
  delete c.crossViewCorrectionData.entries.frame2;
  c.videoFileIdentity.side = 'front-source';
  c.frameStateHistory.front.frame2.videoTime = 0.1;
  c.frameStateHistory.side.frame2.videoTime = 8;
  c.backswingSourceIdentity = 'independent-side-source';
  c.backswingFrames.address = { time: 0.2 };
  c.backswingFrames.downP6 = { time: 9 };

  element('crossCorrectionFrame').value = 'frame2';
  fire('Frame', 'change');

  assert.equal(element('crossCorrectionFrontVideo').currentTime, 8);
  assert.equal(element('crossCorrectionSideVideo').currentTime, 9);
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

test('reference selection seeks both addresses and saving calibration returns both views to F1', () => {
  const { c, element, fire, files } = setupEditor();
  files.front = { id: 'front-source', name: 'front.mp4' };
  files.side = { id: 'independent-side-source', name: 'side.mp4' };
  element('crossCorrectionSetup').open = true;
  fire('Setup', 'toggle');
  c.backswingSourceIdentity = 'independent-side-source';
  c.backswingFrames.address = { time: 0.35 };
  c.frameStateHistory.front.frame1.videoTime = 0.15;
  c.crossViewCorrectionData.entries.frame1 = { frontTime: 2.2, sideTime: 3.4 };
  c.crossViewCorrectionData.analysisSignature = c.getCrossCorrectionAnalysisSignature();
  element('crossCorrectionFrame').value = 'frame5';
  element('crossCorrectionFrontVideo').currentTime = 10;
  element('crossCorrectionSideVideo').currentTime = 11;
  fire('Reference', 'click');
  assert.equal(element('crossCorrectionFrame').value, 'frame5');
  assert.equal(element('crossCorrectionFrontVideo').currentTime, 0.15);
  assert.equal(element('crossCorrectionSideVideo').currentTime, 0.35);
  for (const view of ['Front', 'Side']) {
    fire(`${view}Video`, 'seeked');
    for (const [x, y] of [[80, 400], [300, 400], [180, 160], [200, 300]]) {
      fire(`${view}Canvas`, 'click', { clientX: x, clientY: y });
    }
  }
  fire('ReferenceSave', 'click');
  assert.equal(c.crossViewCorrectionData.references.front.time, 0.15);
  assert.equal(c.crossViewCorrectionData.references.side.time, 0.35);
  assert.equal(c.crossViewCorrectionData.references.front.shaftPoints.length, 2);
  assert.equal(c.crossViewCorrectionData.calibration, 'shaft-ground-v1');
  assert.equal(element('crossCorrectionFrame').value, 'frame1');
  assert.equal(element('crossCorrectionFrontVideo').currentTime, 2.2);
  assert.equal(element('crossCorrectionSideVideo').currentTime, 3.4);
  assert.equal(element('crossCorrectionUndo').disabled, true);
});

test('all six front frames restore analysis B actions and landmarks instead of A reference poses', () => {
  const { c, element, fire, files } = setupEditor();
  c.videoFileIdentity.side = 'front-source';
  files.front = { id: 'front-source', name: 'front.mp4' };
  files.side = { id: 'independent-side-source', name: 'side.mp4' };
  for (const [index, frame] of c.CROSS_CORRECTION_FRAMES.entries()) {
    c.frameStateHistory.front[frame].videoTime = frame === 'frame3' ? index + 0.75 : 0.1;
    c.frameStateHistory.side[frame] = {
      points: c.CROSS_CORRECTION_POINTS[frame].front.map((type, pointIndex) => ({
        type: frame === 'frame1' && type === 'clubHead' ? 'clubHeadTop' : type,
        x: 0.2 + pointIndex * 0.05, y: 0.3 + pointIndex * 0.04,
      })),
      videoTime: index + 0.75, lines: [], aspectRatio: 1,
    };
  }
  c.crossViewCorrectionData.entries = {};
  element('crossCorrectionSetup').open = true;
  fire('Setup', 'toggle');
  for (const [index, frame] of c.CROSS_CORRECTION_FRAMES.entries()) {
    element('crossCorrectionFrame').value = frame;
    fire('Frame', 'change');
    assert.equal(element('crossCorrectionFrontVideo').currentTime, index + 0.75);
    assert.equal(element('crossCorrectionSideVideo').currentTime, 0, 'unrelated source must not reuse B times');
    fire('FrontVideo', 'seeked');
    fire('SideVideo', 'seeked');
    assert.match(element('crossCorrectionStatus').textContent, /정면 \d+\/\d+: 필요 점 확인 완료/);
    assert.match(element('crossCorrectionStatus').textContent, /측면 0\/\d+:/);
    assert.match(element('crossCorrectionStatus').textContent, /같은 원본의 저장 동작 없음/);
  }
});

test('reference mode survives metadata loading and reports missing same-source address', () => {
  const { c, element, fire, files } = setupEditor();
  files.front = { id: 'front-source' };
  files.side = { id: 'independent-side-source' };
  element('crossCorrectionSetup').open = true;
  fire('Setup', 'toggle');
  c.frameStateHistory.front.frame1.videoTime = 0.25;
  const front = element('crossCorrectionFrontVideo');
  front.readyState = 0;
  front.currentTime = 8;
  element('crossCorrectionSideVideo').currentTime = 9;
  fire('Reference', 'click');
  assert.equal(front.currentTime, 8);
  assert.equal(element('crossCorrectionSideVideo').currentTime, 9);
  assert.match(element('crossCorrectionStatus').textContent, /저장된 어드레스 없음: 직접 어드레스로 이동/);
  front.readyState = 2;
  front.videoWidth = 480;
  front.videoHeight = 480;
  fire('FrontVideo', 'loadedmetadata');
  assert.equal(front.currentTime, 0.25);
  fire('FrontVideo', 'seeked');
  fire('FrontCanvas', 'click', { clientX: 80, clientY: 400 });
  assert.match(element('crossCorrectionStatus').textContent, /정면: 지면선 1\/2/);
  const references = structuredClone(c.crossViewCorrectionData.references);
  fire('ReferenceSave', 'click');
  assert.deepEqual(structuredClone(c.crossViewCorrectionData.references), references);
  assert.match(element('crossCorrectionStatus').textContent, /모두 선택한 뒤 저장/);
});

test('new calibration returns to unsaved F1 using B top and same-source side top', () => {
  const { c, element, fire, files } = setupEditor();
  c.videoFileIdentity.side = 'front-source';
  c.backswingSourceIdentity = 'independent-side-source';
  c.backswingFrames = { address: { time: 0.3 }, top: { time: 2.5 } };
  c.frameStateHistory.front.frame1.videoTime = 0.2;
  c.frameStateHistory.side.frame1.videoTime = 2;
  c.crossViewCorrectionData.entries = {};
  files.front = { id: 'front-source' };
  files.side = { id: 'independent-side-source' };
  element('crossCorrectionSetup').open = true;
  fire('Setup', 'toggle');
  fire('Reference', 'click');
  assert.equal(element('crossCorrectionFrontVideo').currentTime, 0.2);
  assert.equal(element('crossCorrectionSideVideo').currentTime, 0.3);
  for (const view of ['Front', 'Side']) {
    fire(`${view}Video`, 'seeked');
    for (const [x, y] of [[80, 400], [300, 400], [180, 160], [200, 300]]) {
      fire(`${view}Canvas`, 'click', { clientX: x, clientY: y });
    }
  }
  fire('ReferenceSave', 'click');
  assert.equal(element('crossCorrectionFrame').value, 'frame1');
  assert.equal(element('crossCorrectionFrontVideo').currentTime, 2);
  assert.equal(element('crossCorrectionSideVideo').currentTime, 2.5);
  fire('FrontVideo', 'seeked');
  fire('SideVideo', 'seeked');
  assert.match(element('crossCorrectionStatus').textContent, /보정 기준: 저장 완료/);
  assert.doesNotMatch(element('crossCorrectionStatus').textContent, /지면선 0\/2/);
});

test('only old A-time pairs are reset; custom motion pairs, calibration and analysis are preserved', () => {
  const { c, element, fire, files, updates } = setupEditor();
  c.videoFileIdentity.side = 'front-source';
  files.front = { id: 'front-source' };
  files.side = { id: 'independent-side-source' };
  for (const [index, frame] of frames.entries()) {
    c.frameStateHistory.front[frame].videoTime = 0.1;
    c.frameStateHistory.side[frame].videoTime = index + 1;
    c.crossViewCorrectionData.entries[frame].frontTime = 0.1;
  }
  c.crossViewCorrectionData.entries.frame4.frontTime = 15.4;
  c.crossViewCorrectionData.analysisSignature = c.getCrossCorrectionAnalysisSignature();
  const original = structuredClone(c.frameStateHistory);
  const references = c.crossViewCorrectionData.references;
  const custom = c.crossViewCorrectionData.entries.frame4;
  element('crossCorrectionSetup').open = true;
  fire('Setup', 'toggle');

  assert.deepEqual(Object.keys(c.crossViewCorrectionData.entries), ['frame3', 'frame4']);
  assert.equal(c.crossViewCorrectionData.references, references);
  assert.equal(c.crossViewCorrectionData.calibration, 'shaft-ground-v1');
  assert.equal(c.crossViewCorrectionData.entries.frame4, custom);
  assert.deepEqual(structuredClone(c.frameStateHistory), original);
  assert.equal(element('crossCorrectionFrontVideo').currentTime, 1);
  assert.match(element('crossCorrectionStatus').textContent, /기존 A 기준 시점으로 저장된 F1·F2·F5·F6/);
  assert.equal(c.crossCorrectionMode, 'roll');
  assert.ok(updates() > 0);

  element('crossCorrectionFrame').value = 'frame4';
  fire('Frame', 'change');
  assert.equal(element('crossCorrectionFrontVideo').currentTime, 15.4, 'manual matched time takes priority over B');
});

test('every side motion uses its exact same-source checkpoint and never interpolates F3', () => {
  const { c, element, fire, files } = setupEditor();
  files.side = { id: 'independent-side-source' };
  c.crossViewCorrectionData.entries = {};
  c.backswingSourceIdentity = 'independent-side-source';
  c.backswingFrames = {
    address: { time: 0.1 }, top: { time: 2 }, downP6: { time: 3 }, impact: { time: 4 },
  };
  element('crossCorrectionSetup').open = true;
  fire('Setup', 'toggle');
  const expected = [2, 3, 3, 4, 3, 4];
  for (const [index, frame] of frames.entries()) {
    element('crossCorrectionFrame').value = frame;
    fire('Frame', 'change');
    assert.equal(element('crossCorrectionSideVideo').currentTime, expected[index], frame);
    if (frame === 'frame3') assert.match(element('crossCorrectionStatus').textContent, /같은 원본의 저장 동작 없음/);
  }
});

test('missing B input never falls back to analysis A and late metadata loads the selected B action', () => {
  const { c, element, fire, files } = setupEditor();
  files.front = { id: 'front-source' };
  c.videoFileIdentity.side = 'front-source';
  c.crossViewCorrectionData.entries = {};
  c.frameStateHistory.front.frame2.videoTime = 0.1;
  c.frameStateHistory.side.frame2 = null;
  element('crossCorrectionSetup').open = true;
  fire('Setup', 'toggle');
  const video = element('crossCorrectionFrontVideo');
  video.currentTime = 5;
  element('crossCorrectionFrame').value = 'frame2';
  fire('Frame', 'change');
  assert.equal(video.currentTime, 5);
  assert.match(element('crossCorrectionStatus').textContent, /정면.*같은 원본의 저장 동작 없음/);

  video.readyState = 0;
  c.frameStateHistory.side.frame2 = { videoTime: 8, points: [] };
  fire('Frame', 'change');
  assert.equal(video.currentTime, 5, 'seek waits until metadata is ready');
  video.readyState = 1;
  video.videoWidth = 480;
  video.videoHeight = 480;
  fire('FrontVideo', 'loadedmetadata');
  assert.equal(video.currentTime, 8);

  fire('Reference', 'click');
  assert.equal(video.currentTime, c.frameStateHistory.front.frame1.videoTime, 'calibration uses address, not the F1 action');
});

test('editor restores saved analysis landmarks and reports only the missing point', () => {
  const { c, element, fire, files } = setupEditor();
  c.videoFileIdentity.side = 'front-source';
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
  assert.match(element('crossCorrectionStatus').textContent, /측면 0\/6:/);
  for (const view of ['Front', 'Side']) {
    element(`crossCorrection${view}PointType`).value = 'clubHead';
  }
  fire('FrontCanvas', 'click', { clientX: 240, clientY: 240 });
  assert.match(element('crossCorrectionStatus').textContent, /정면 6\/6: 필요 점 확인 완료/);
  fire('SideCanvas', 'click', { clientX: 240, clientY: 240 });
  assert.match(element('crossCorrectionStatus').textContent, /측면 1\/6:/);
});

test('editor can select a later visible landmark and save a partial frame without guessing occluded points', () => {
  const { c, element, fire, files } = setupEditor();
  files.front = { id: 'front-source', name: 'front.mp4' };
  files.side = { id: 'independent-side-source', name: 'side.mp4' };
  element('crossCorrectionSetup').open = true;
  fire('Setup', 'toggle');
  fire('Points', 'click');
  for (const view of ['Front', 'Side']) {
    const selector = element(`crossCorrection${view}PointType`);
    selector.value = 'clubHead';
    fire(`${view}PointType`, 'change');
    fire(`${view}Canvas`, 'click', { clientX: 240, clientY: 240 });
  }
  fire('Capture', 'click');
  const entry = c.crossViewCorrectionData.entries.frame1;
  assert.deepEqual(Array.from(entry.frontPoints, point => point.type), ['clubHead']);
  assert.deepEqual(Array.from(entry.sidePoints, point => point.type), ['clubHead']);
  assert.equal(c.validateCrossCorrectionData(c.crossViewCorrectionData), true);
  assert.equal(element('crossCorrectionFrame').value, 'frame2');
});

test('side frame reuses the same-source top checkpoint, not address, but requires its own landmarks', () => {
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
  assert.equal(element('crossCorrectionSideVideo').currentTime, 1.25);
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
  assert.match(element('crossCorrectionStatus').textContent, /분석 프레임 자료가 변경/);
  assert.equal(c.crossCorrectionMode, 'roll');
});

test('calculate identifies unsaved frames and tells the user to save selected landmarks', () => {
  const { c, element, fire, updates } = setupEditor();
  c.crossViewCorrectionData.entries = {};
  c.crossCorrectionMode = 'cross';
  const before = updates();
  fire('Calculate', 'click');
  assert.match(element('crossCorrectionStatus').textContent, /저장되지 않은 분석 프레임: F1, F2, F3, F4, F5, F6/);
  assert.match(element('crossCorrectionStatus').textContent, /선택한 점 저장/);
  assert.equal(c.crossCorrectionMode, 'roll');
  assert.equal(updates(), before + 1);
});

test('incomplete saved project lists calibration and F5-F6 without clearing F1-F4 visibility inputs', () => {
  const { c, element, fire } = setupEditor();
  delete c.crossViewCorrectionData.calibration;
  c.crossViewCorrectionData.references = {};
  delete c.crossViewCorrectionData.entries.frame5;
  delete c.crossViewCorrectionData.entries.frame6;
  hidePoints(c, 'frame1', 'side', ['wrist']);
  const before = JSON.stringify(c.crossViewCorrectionData);
  fire('Calculate', 'click');
  assert.match(element('crossCorrectionStatus').textContent, /보정 기준 미저장/);
  assert.match(element('crossCorrectionStatus').textContent, /저장되지 않은 분석 프레임: F5, F6/);
  assert.equal(JSON.stringify(c.crossViewCorrectionData), before);
  assert.equal(c.crossCorrectionMode, 'roll');
});

test('calculate preserves stale inputs and withholds cross mode until the pairs are saved again', () => {
  const { c, element, fire } = setupEditor();
  const entries = c.crossViewCorrectionData.entries;
  const signature = c.crossViewCorrectionData.analysisSignature;
  c.frameStateHistory.front.frame1.points[0].x += 0.01;
  c.crossCorrectionMode = 'cross';
  fire('Calculate', 'click');
  assert.match(element('crossCorrectionStatus').textContent, /기존 분석이 변경/);
  assert.equal(c.crossCorrectionMode, 'roll');
  assert.equal(c.crossViewCorrectionData.entries, entries);
  assert.equal(c.crossViewCorrectionData.analysisSignature, signature);
});

test('saving after analysis changes resets the signature once and retains calibration for retry', () => {
  const { c, element, fire, files } = setupEditor();
  files.front = { id: 'front-source', name: 'front.mp4' };
  files.side = { id: 'independent-side-source', name: 'side.mp4' };
  element('crossCorrectionSetup').open = true;
  fire('Setup', 'toggle');
  const references = c.crossViewCorrectionData.references;
  const stance = c.stanceReferenceLineFront;
  c.frameStateHistory.front.frame1.points[0].x += 0.01;
  fire('Points', 'click');
  for (const view of ['Front', 'Side']) {
    element(`crossCorrection${view}PointType`).value = 'clubHead';
    fire(`${view}Canvas`, 'click', { clientX: 240, clientY: 240 });
  }
  fire('Capture', 'click');
  assert.match(element('crossCorrectionStatus').textContent, /보정 기준은 유지/);
  assert.equal(c.crossViewCorrectionData.analysisSignature, c.getCrossCorrectionAnalysisSignature());
  assert.equal(c.crossViewCorrectionData.references, references);
  assert.equal(c.crossViewCorrectionData.calibration, 'shaft-ground-v1');
  assert.equal(c.stanceReferenceLineFront, stance);
  assert.equal(Object.keys(c.crossViewCorrectionData.entries).length, 0);

  fire('Points', 'click');
  for (const view of ['Front', 'Side']) {
    element(`crossCorrection${view}PointType`).value = 'clubHead';
    fire(`${view}Canvas`, 'click', { clientX: 240, clientY: 240 });
  }
  fire('Capture', 'click');
  assert.ok(c.crossViewCorrectionData.entries.frame1);
  assert.equal(element('crossCorrectionFrame').value, 'frame2');
  assert.equal(c.crossViewCorrectionData.references, references);
  for (const frame of frames.slice(1)) {
    fire('Points', 'click');
    for (const view of ['Front', 'Side']) {
      element(`crossCorrection${view}PointType`).value = c.CROSS_CORRECTION_POINTS[frame][view.toLowerCase()][0];
      fire(`${view}Canvas`, 'click', { clientX: 240, clientY: 240 });
    }
    fire('Capture', 'click');
    assert.ok(c.crossViewCorrectionData.entries[frame]);
  }
  fire('Calculate', 'click');
  assert.equal(c.crossCorrectionMode, 'cross');
  assert.equal(c.getCrossCorrectionScenario().unavailable, undefined);
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
