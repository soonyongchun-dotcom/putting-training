import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
function setup() {
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', innerHTML: '' });
    return nodes.get(id);
  };
  const c = vm.createContext({
    Math, console, uiLanguage: 'ko', backswingActive: false,
    document: { getElementById: get, body: { dataset: {} }, querySelector: get, querySelectorAll: () => [] },
    swingCompareClearPhaseBtn: get('clear'),
    frontVideo: { videoWidth: 1000, videoHeight: 1000, currentTime: 1, pause() {} },
    sideVideo: { videoWidth: 1000, videoHeight: 1000, currentTime: 1, pause() {} },
    clamp: (x, a, b) => Math.min(b, Math.max(a, x)),
    translateUiText: x => x, getSwingUiText: (ko, en) => ko,
    cancelPointer() {}, showGuide() {}, frontGuideBubble: null, sideGuideBubble: null,
    swingCompareStatus: get('status'), swingCompareSummary: get('summary'),
    swingCompareOpinion: get('opinion'), swingCompareTableBody: get('table'),
  });
  const start = html.indexOf('  const SWING_COMPARE_PHASES =');
  const end = html.indexOf("\n  const SUPABASE_URL =", start);
  vm.runInContext(html.slice(start, end), c);
  c.redrawSwingCompareOverlays = () => {};
  const pointValidator = html.match(/  function isProjectPoint\([\s\S]*?\n  }/)[0];
  const coordinateValidator = html.match(/  function isProjectCoordinate\([\s\S]*?\n  }/)[0];
  vm.runInContext(coordinateValidator + pointValidator
    + html.match(/  function isProjectSwingCompareData\([\s\S]*?\n  }/)[0]
    + html.match(/  function isProjectSwingCompareFreeData\([\s\S]*?\n  }/)[0], c);
  const run = script => vm.runInContext(script, c);
  return { c, run, get };
}
const frontPoints = [
  { type: 'wristCenter', x: 0.6, y: 0.5 },
  { type: 'coreCenter', x: 0.4, y: 0.7 },
  { type: 'c7Center', x: 0.4, y: 0.3 },
  { type: 'clubHeadCenter', x: 0.8, y: 0.5 },
];
const sidePoints = [...frontPoints, { type: 'elbowCenter', x: 0.6, y: 0.3 }];
function fill(c, points) {
  for (const panel of ['front', 'side']) {
    for (const [i, phase] of ['address', 'top', 'shoulder', 'waist', 'preImpact', 'impact'].entries()) {
      const entry = c.getSwingCompareEntry(panel, phase);
      entry.points = structuredClone(points);
      entry.videoTime = i + 1;
      entry.aspectRatio = 1;
    }
  }
}

test('front retains four points and side requires five with independent data banks', () => {
  const { c, run, get } = setup();
  fill(c, frontPoints);
  const original = c.getSwingCompareEntry('front', 'address');
  assert.equal(c.computeSwingComparePhaseMetrics('address').lagScore, 100);
  c.setSwingCompareView('side');
  assert.equal(run('SWING_COMPARE_POINT_TYPES.length'), 5);
  assert.equal(c.computeSwingComparePhaseMetrics('address'), null);
  fill(c, sidePoints);
  c.updateSwingCompareResults();
  assert.match(get('table').innerHTML, /5\/5/);
  assert.match(get('swingCompareTableHead').innerHTML, /전경각/);
  assert.match(get('summary').innerHTML, /골반 궤적/);
  assert.match(get('summary').innerHTML, /팔꿈치–손–클럽/);
  c.setSwingCompareView('front');
  assert.equal(c.getSwingCompareEntry('front', 'address'), original);
  assert.equal(run('SWING_COMPARE_POINT_TYPES.length'), 4);
  assert.doesNotMatch(get('swingCompareTableHead').innerHTML, /전경각/);
  c.setSwingCompareView('side');
  assert.equal(c.getSwingCompareEntry('front', 'address').points.length, 5);
});

test('side angle uses the elbow rather than C7; tilt detects differences hidden by local pose rotation', () => {
  const { c } = setup();
  c.setSwingCompareView('side');
  fill(c, sidePoints);
  assert.equal(c.computeSwingCompareLagAngle('front', 'address'), 90);
  assert.equal(c.computeSwingCompareTrunkAngle('front', 'address'), 0);
  let metrics = c.computeSwingComparePhaseMetrics('address');
  assert.equal(metrics.trunkScore, 100);
  assert.equal(metrics.lagScore, 100);
  c.getSwingComparePoint('side', 'address', 'c7Center').x = 0.6;
  metrics = c.computeSwingComparePhaseMetrics('address');
  assert.ok(metrics.trunkAngleB > 26 && metrics.trunkAngleB < 27);
  assert.ok(metrics.trunkScore < 100);
  assert.equal(metrics.lagAngleB, 90);
  c.getSwingComparePoint('side', 'address', 'elbowCenter').y = 0.5;
  assert.equal(c.computeSwingCompareLagAngle('side', 'address'), null);
});

test('missing elbow or collapsed trunk cannot produce complete phase metrics', () => {
  const { c } = setup();
  c.setSwingCompareView('side');
  fill(c, sidePoints);
  c.getSwingCompareEntry('side', 'address').points.pop();
  assert.equal(c.computeSwingComparePhaseMetrics('address'), null);
  fill(c, sidePoints);
  const c7 = c.getSwingComparePoint('side', 'address', 'c7Center');
  Object.assign(c7, { x: 0.4, y: 0.7 });
  assert.equal(c.computeSwingComparePhaseMetrics('address'), null);
});

test('reset clears only current view, and deleted middle points are reinserted without duplicating types', () => {
  const { c } = setup();
  fill(c, frontPoints);
  c.setSwingCompareView('side');
  fill(c, sidePoints);
  const entry = c.getSwingCompareEntry('front', 'address');
  entry.points.splice(1, 1);
  c.addSwingComparePoint('front', { x: 0.4, y: 0.7 });
  assert.equal(entry.points.at(-1).type, 'coreCenter');
  assert.equal(new Set(entry.points.map(p => p.type)).size, 5);
  c.resetSwingCompareData();
  assert.equal(c.getSwingCompareEntry('front', 'address').points.length, 0);
  c.setSwingCompareView('front');
  assert.equal(c.getSwingCompareEntry('front', 'address').points.length, 4);
});

test('saved aspect ratio governs side geometry; incompatible phase aspect withholds trajectory', () => {
  const { c } = setup();
  c.setSwingCompareView('side');
  fill(c, sidePoints);
  c.frontVideo.videoWidth = 2000;
  assert.equal(c.getSwingCompareAspect('front', 'address'), 1);
  c.getSwingCompareEntry('front', 'top').aspectRatio = 2;
  assert.equal(c.getSwingCompareAddressFrame('front', 'top', 'wristCenter'), null);
});

test('project data accepts legacy front and side banks but rejects duplicate, invalid or wrong-view points', () => {
  const { c, run } = setup();
  fill(c, frontPoints);
  assert.equal(run("isProjectSwingCompareData(swingCompareData, 'front')"), true);
  c.setSwingCompareView('side');
  fill(c, sidePoints);
  assert.equal(run("isProjectSwingCompareData(swingCompareData, 'side')"), true);
  assert.equal(run("isProjectSwingCompareData(swingCompareData, 'front')"), false);
  c.getSwingCompareEntry('front', 'top').points.push({ ...sidePoints[0] });
  assert.equal(run("isProjectSwingCompareData(swingCompareData, 'side')"), false);
  c.getSwingCompareEntry('front', 'top').points.pop();
  c.getSwingCompareEntry('front', 'top').aspectRatio = -1;
  assert.equal(run("isProjectSwingCompareData(swingCompareData, 'side')"), false);
  assert.match(html, /swingCompareDataByView: \{ \.\.\.swingCompareDataByView/);
});

test('free comparison supports unlimited drawing and independent reference-based measurements without scored points', () => {
  const { c, run } = setup();
  fill(c, frontPoints);
  const original = c.getSwingCompareEntry('front', 'address');
  c.setSwingCompareView('free');
  for (let i = 0; i < 10; i++) c.addSwingCompareFreeSelection('front', { x: 0.1, y: i / 20 });
  c.addSwingCompareFreeSelection('front', { x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 });
  assert.equal(run('swingCompareFreeData.front.points.length'), 10);
  assert.equal(run('swingCompareFreeData.front.lines.length'), 1);
  c.setSwingCompareFreeTool('measure');
  c.addSwingCompareFreeSelection('side', { x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 });
  assert.equal(run('swingCompareFreeData.side.measurements.length'), 0);
  c.setSwingCompareFreeTool('reference');
  c.addSwingCompareFreeSelection('front', { x: 0.1, y: 0.1 });
  c.addSwingCompareFreeSelection('front', { x: 0.5, y: 0.1 });
  c.setSwingCompareFreeTool('measure');
  c.addSwingCompareFreeSelection('front', { x: 0.1, y: 0.2 }, { x: 0.3, y: 0.2 });
  const measurement = run('swingCompareFreeData.front.measurements[0]');
  assert.ok(Math.abs(c.getSwingCompareFreeMeasurement('front', measurement).percent - 50) < 1e-8);
  assert.equal(c.getSwingCompareFreeMeasurement('front', measurement).cm, null);
  run('swingCompareFreeData.referenceLengthCm = 100');
  assert.ok(Math.abs(c.getSwingCompareFreeMeasurement('front', measurement).cm - 50) < 1e-8);
  assert.equal(c.getSwingCompareFreeMeasurement('side', measurement), null);
  c.setSwingCompareView('front');
  assert.equal(c.getSwingCompareEntry('front', 'address'), original);
  c.setSwingCompareView('free');
  assert.equal(run('swingCompareFreeData.front.points.length'), 10);
  c.resetSwingCompareData();
  assert.equal(run('swingCompareFreeData.front.points.length'), 0);
  c.setSwingCompareView('front');
  assert.equal(c.getSwingCompareEntry('front', 'address'), original);
});

test('free comparison deletes line interiors and rejects collapsed references; data validates for projects', () => {
  const { c, run } = setup();
  c.setSwingCompareView('free');
  c.addSwingCompareFreeSelection('front', { x: 0.1, y: 0.2 }, { x: 0.7, y: 0.2 });
  c.deleteSwingCompareFreeSelection('front', { x: 0.4, y: 0.2 });
  assert.equal(run('swingCompareFreeData.front.lines.length'), 0);
  c.setSwingCompareFreeTool('reference');
  c.addSwingCompareFreeSelection('front', { x: 0.1, y: 0.2 }, { x: 0.1, y: 0.2 });
  assert.equal(run('swingCompareFreeData.front.reference'), null);
  assert.equal(run('isProjectSwingCompareFreeData(swingCompareFreeData)'), true);
  run('swingCompareFreeData.referenceLengthCm = -1');
  assert.equal(run('isProjectSwingCompareFreeData(swingCompareFreeData)'), false);
});

test('comparison titles follow side/front/free selection and restore normal titles on exit', () => {
  const { c, run, get } = setup();
  run('swingCompareActive = true');
  c.setSwingCompareView('side');
  assert.equal(get('#frontWrapper .video-header .title').textContent, '측면 A');
  assert.equal(get('#sideWrapper .video-header .title').textContent, '측면 B');
  c.setSwingCompareView('free');
  assert.equal(c.document.body.dataset.swingCompareView, 'free');
  assert.equal(get('#frontWrapper .video-header .title').textContent, '자유 비교 A');
  run('swingCompareActive = false');
  c.updateSwingComparePresentation();
  assert.equal(get('#frontWrapper .video-header .title').textContent, '정면 A');
  assert.equal(c.document.body.dataset.swingCompareView, undefined);
  c.document.body.dataset.workflowStage = 'backswing';
  c.updateSwingComparePresentation();
  assert.equal(get('#frontWrapper .video-header .title').textContent, '측면 A');
  c.document.body.dataset.workflowStage = 'engine';
  c.updateSwingComparePresentation();
  assert.equal(get('#frontWrapper .video-header .title').textContent, '정면 A');
});
