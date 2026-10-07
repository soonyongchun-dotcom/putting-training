import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const phases = ['address', 'p1', 'p2', 'p3', 'backShoulder', 'p4', 'top', 'downShoulder', 'transition', 'downP6', 'impact'];
const positions = {
  address: [[0.65, 0.9], [0.52, 0.6], [0.45, 0.4]],
  p1: [[0.45, 0.5], [0.55, 0.85]], p2: [[0.4, 0.4], [0.55, 0.4]],
  p3: [[0.38, 0.3], [0.3, 0.1]], p4: [[0.42, 0.2], [0.3, 0.15]],
  top: [[0.5, 0.2], [0.42, 0.1], [0.6, 0.1]],
  transition: [[0.38, 0.3], [0.3, 0.2]], downP6: [[0.48, 0.6], [0.55, 0.6]],
  impact: [[0.52, 0.6], [0.65, 0.9]],
};
const clone = value => JSON.parse(JSON.stringify(value));
const checkpoints = () => Object.fromEntries(Object.entries(positions).map(([phase, points], time) => [
  phase, { time, aspectRatio: 16 / 9, points: points.map(([x, y]) => ({ x, y })) },
]));
const engineCheckpoints = () => {
  const indices = [4, 0, 6, 5, 0, 2];
  const times = { front: [0, 0, 4, 0, 0, 5], side: [2, 3, 4.5, 6, 3, 6] };
  return Object.fromEntries(['front', 'side'].map(view => [view, Object.fromEntries(indices.map((index, i) => {
    const time = times[view][i];
    const hand = time === 0 ? { x: 0.52, y: 0.6 } : time === 2 ? { x: 0.3, y: 0.15 }
      : { x: 0.35 + time * 0.025, y: 0.25 + time * 0.05 };
    const points = Array.from({ length: index + 1 }, () => ({ x: 0.8, y: 0.9 }));
    points[index] = hand;
    return [`frame${i + 1}`, { points, lines: [], videoTime: time, aspectRatio: 16 / 9 }];
  }))]));
};

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
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    listeners: {},
    addEventListener(name, callback) { this.listeners[name] = callback; },
  });
  const storage = new Map();
  const context = vm.createContext({
    console, uiLanguage: 'en',
    analysisGraphOpenState: new Map(),
    engineMotionAxis: 'xy',
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
    document: { getElementById: element, createElement: element, createElementNS: (_namespace, tag) => {
      const node = element();
      node.tagName = tag;
      return node;
    }, createTextNode: text => text },
    getBackswingPointLabels: phase => phase === 'address' || phase === 'top' ? [1, 2, 3] : [1, 2],
    getSwingUiText: (ko, en) => context.uiLanguage === 'ko' ? ko : en,
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
    'computeBackswingDeliveryObservations', 'createBackswingDeliveryCard',
    'getBackswingHandPathPoints', 'getBackswingHandCurve', 'createHandPathFigure', 'createBackswingHandPath',
    'getEngineHandPathData', 'createEngineHandPath', 'saveFrameInputState',
    'createCollapsibleGraph', 'getEngineVerticalMotionData', 'createGraphSvgElement', 'createEngineVerticalMotion', 'createEngineMotionFigure',
    'getXYGraphLayout', 'createEngineXYMotionFigure',
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
  assert.equal(c.backswingResult.children.length, 3);
  assert.equal(c.backswingResult.children[0].children[1].textContent, expected.profileCode);
});

test('delivery observations show exact geometry without changing scores or classification', () => {
  const c = sandbox();
  const frames = checkpoints();
  const m = c.computeBackswingDeliveryObservations(frames, 16 / 9);
  const reference = Math.hypot((0.5 - 0.65) * 16 / 9, 0.2 - 0.9);
  assert.equal(m.deliveryHandReturnPercent, 0);
  assert.ok(Math.abs(m.deliveryRelativeHeadDropPercent - (0.4 - 0.3) / reference * 100) < 1e-9);
  assert.ok(m.deliveryReorientation < 0);
  const hand = { x: 0.1 * 16 / 9, y: 0.3 };
  const head = { x: 0.25 * 16 / 9, y: 0.4 };
  const angle = Math.acos((hand.x * head.x + hand.y * head.y)
    / (Math.hypot(hand.x, hand.y) * Math.hypot(head.x, head.y))) * 180 / Math.PI;
  assert.ok(Math.abs(m.deliveryPathAngleDifference - angle) < 1e-9);
  const before = clone(c.segmentScoreHistory);
  c.backswingClassification = c.classifyBackswing(frames);
  const decision = clone(c.backswingClassification);
  c.renderBackswingClassification();
  assert.deepEqual(clone(c.segmentScoreHistory), before);
  assert.deepEqual(clone(c.backswingClassification), decision);
  const card = c.backswingResult.children[1];
  assert.equal(card.className, 'backswing-delivery-card');
  assert.equal(card.children[0].textContent, 'Downswing Delivery Pattern · 2D Observations');
  assert.equal(card.children[1].children.length, 5);
  assert.equal(card.children[1].children[0].children[1].textContent,
    `${m.deliveryP5Inclination.toFixed(1)}°`);
  assert.ok(card.children[1].children.every(row => row.children.length === 2),
    'definitions must not occupy visible metric rows');
  const definitions = card.children[1].children.map(row => row.attributes.title);
  assert.match(definitions[0], /Vertex: P5 hands\/grip/);
  assert.match(definitions[0], /0–90°/);
  assert.match(definitions[1], /subtract P3 from P5/);
  assert.match(definitions[2], /reference distance L/);
  assert.match(definitions[3], /image-down positive/);
  assert.match(definitions[4], /aligning their origins/);
  assert.match(definitions[4], /0–180°/);
  assert.match(card.children[3].textContent, /no new score contribution/);
  assert.match(card.children[3].attributes.title, /camera tilt/i);
  c.uiLanguage = 'ko';
  c.renderBackswingClassification();
  assert.equal(c.backswingResult.children[1].children[0].textContent, '다운스윙 전달 패턴 · 2D 관측');
  assert.match(c.backswingResult.children[1].children[1].children[0].attributes.title, /꼭짓점: P5 손\/그립/);
});

test('delivery metrics are mirror invariant and preserve zero-motion missing angles', () => {
  const c = sandbox();
  const frames = checkpoints();
  const expected = clone(c.computeBackswingDeliveryObservations(frames, 16 / 9));
  const mirrored = clone(frames);
  for (const frame of Object.values(mirrored)) {
    for (const point of frame.points) point.x = 1 - point.x;
  }
  const actual = c.computeBackswingDeliveryObservations(mirrored, 16 / 9);
  for (const key of Object.keys(expected)) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-9, key);
  frames.downP6.points[0] = clone(frames.transition.points[0]);
  assert.equal(c.computeBackswingDeliveryObservations(frames, 16 / 9).deliveryPathAngleDifference, null);
  frames.transition.points[1] = clone(frames.transition.points[0]);
  assert.equal(c.computeBackswingDeliveryObservations(frames, 16 / 9).deliveryP5Inclination, null);
  const card = c.createBackswingDeliveryCard({});
  assert.match(card.children[1].children[0].children[1].textContent, /Not measurable/);
});

test('impact extends only the hand chart, retaining classification and legacy cache compatibility', () => {
  const c = sandbox();
  const frames = checkpoints();
  const complete = c.classifyBackswing(frames);
  const old = clone(frames);
  delete old.impact;
  assert.deepEqual(clone(c.classifyBackswing(old)), clone(complete), 'P7 must not change existing scoring evidence');
  c.backswingFrames = old;
  c.backswingClassification = c.classifyBackswing(old);
  c.saveBackswingClassificationCache();
  const restored = c.loadBackswingClassificationCache(c.videoFileIdentity, c.frameStateHistory);
  assert.ok(restored);
  assert.equal(c.getBackswingHandPathPoints(restored.frames).length, 8);
  assert.match(c.createBackswingHandPath(old).children[2].textContent, /Legacy eight-checkpoint/);
  frames.impact.time = frames.downP6.time;
  assert.match(c.classifyBackswing(frames).error, /P7/);
  frames.impact.time++;
  frames.impact.points.pop();
  assert.match(c.classifyBackswing(frames).error, /both hand and head/);
});

test('completing P6 advances to P7 and classification runs after both impact points are selected', () => {
  const c = sandbox();
  delete c.backswingFrames.downP6;
  delete c.backswingFrames.impact;
  c.backswingPhaseSelect.value = 'downP6';
  c.frontVideo.currentTime = 7;
  let decisions = 0;
  c.document.getElementById = () => ({
    click() {
      decisions++;
      c.backswingClassification = c.classifyBackswing(c.backswingFrames);
    },
  });
  c.addBackswingPoint({ x: 0.48, y: 0.6 });
  c.addBackswingPoint({ x: 0.55, y: 0.6 });
  assert.equal(c.backswingPhaseSelect.value, 'impact');
  assert.equal(decisions, 0);
  c.frontVideo.currentTime = 8;
  c.addBackswingPoint({ x: 0.52, y: 0.6 });
  assert.equal(decisions, 0);
  c.addBackswingPoint({ x: 0.65, y: 0.9 });
  assert.equal(decisions, 1);
  assert.equal(c.backswingClassification.error, undefined);
  assert.equal(c.getBackswingHandPathPoints(c.backswingFrames).length, 9);
});

test('hand path uses the correct grip indices, address-hand origin and aspect-correct equal-scale coordinates', () => {
  const c = sandbox();
  const frames = checkpoints();
  const points = c.getBackswingHandPathPoints(frames);
  assert.equal(points.length, 9);
  assert.deepEqual(clone(points[0]), { phase: 'address', x: 0, y: 0 });
  const top = points.find(p => p.phase === 'top');
  assert.ok(Math.abs(top.x - (0.42 - 0.52) * 16 / 9 * 100) < 1e-9);
  assert.equal(top.y, (frames.address.points[1].y - frames.top.points[1].y) * 100);
  assert.equal(points.at(-1).phase, 'impact');
  const portrait = clone(frames);
  for (const frame of Object.values(portrait)) {
    frame.aspectRatio = 9 / 16;
    frame.points.forEach(point => { point.x *= (16 / 9) / (9 / 16); });
  }
  const corrected = c.getBackswingHandPathPoints(portrait);
  corrected.forEach((p, i) => {
    assert.ok(Math.abs(p.x - points[i].x) < 1e-9);
    assert.equal(p.y, points[i].y);
  });
  const figure = c.createBackswingHandPath(frames);
  const svg = figure.children[1];
  assert.equal(svg.attributes.role, 'img');
  assert.equal(svg.children.filter(node => node.tagName === 'circle').length, 9);
  const curves = svg.children.filter(node => node.tagName === 'path');
  assert.equal(curves.length, 2);
  assert.equal((curves[0].attributes.d.match(/ C /g) || []).length, 5);
  assert.equal((curves[1].attributes.d.match(/ C /g) || []).length, 3);
  assert.match(figure.children[2].textContent, /not measured continuous motion/);
  assert.match(figure.children[2].textContent, /Origin \(0,0\)=address hands/);
  const baseline = svg.children[0];
  const addressDot = svg.children.find(node => node.tagName === 'circle');
  assert.equal(Number(baseline.attributes.y1), Number(addressDot.attributes.cy));
  assert.ok(Number(baseline.attributes.y1) <= 375);
  delete frames.address.aspectRatio;
  assert.match(c.createBackswingHandPath(frames).children[1].textContent, /Path unavailable/);
});

test('address-hand origin is independent of ball height and reports missing hand coordinates', () => {
  const c = sandbox();
  const frames = checkpoints();
  const before = c.getBackswingHandPathPoints(frames);
  frames.address.points[0].y += 0.1;
  const after = c.getBackswingHandPathPoints(frames);
  after.forEach((point, i) => {
    assert.equal(point.x, before[i].x);
    assert.equal(point.y, before[i].y);
  });
  delete frames.address.points[0];
  assert.equal(c.getBackswingHandPathPoints(frames).length, 9);
  delete frames.address.points[1].y;
  assert.equal(c.getBackswingHandPathPoints(frames).length, 0);
  assert.match(c.createBackswingHandPath(frames).children[1].textContent, /hand checkpoints/);
});

test('region detail toggles independently and fans out labels without changing checkpoint coordinates', () => {
  const c = sandbox();
  const frames = checkpoints();
  frames.backShoulder = { time: 3.5, aspectRatio: 16 / 9, points: [{ x: 0.4, y: 0.25 }, { x: 0.3, y: 0.12 }] };
  frames.downShoulder = { time: 5.5, aspectRatio: 16 / 9, points: [{ x: 0.39, y: 0.25 }, { x: 0.32, y: 0.15 }] };
  const before = clone(frames);
  const figure = c.createBackswingHandPath(frames);
  const [overview, , button, detail] = figure.children.slice(1);
  assert.equal(detail.hidden, true);
  assert.equal(button.attributes['aria-expanded'], 'false');
  button.listeners.click();
  assert.equal(detail.hidden, false);
  assert.equal(button.attributes['aria-expanded'], 'true');
  const svg = detail.children[0];
  const dots = svg.children.filter(node => node.tagName === 'circle');
  assert.equal(dots.length, 6);
  assert.equal(svg.children.filter(node => node.tagName === 'path').length, 2);
  const overviewDots = overview.children.filter(node => node.tagName === 'circle');
  assert.deepEqual(dots.map(dot => dot.children[0].textContent),
    overviewDots.filter((_, i) => [0, 1, 2, 8, 9, 10].includes(i)).map(dot => dot.children[0].textContent));
  const labels = svg.children.filter(node => node.tagName === 'text' && /^\d+\./.test(node.textContent));
  assert.deepEqual(labels.map(node => node.textContent.split('.')[0]), ['1', '2', '3', '9', '10', '11']);
  assert.equal(new Set(labels.map(node => `${node.attributes.x},${node.attributes.y}`)).size, 6);
  assert.deepEqual(clone(frames), before);
  button.listeners.click();
  assert.equal(detail.hidden, true);
  button.listeners.click();
  assert.equal(detail.children.length, 2);
});

test('engine path gathers every frame hand index, merges equal times and keeps source annotations', () => {
  const c = sandbox();
  c.frameStateHistory = engineCheckpoints();
  const before = clone(c.frameStateHistory);
  const data = c.getEngineHandPathData();
  assert.equal(data.reason, undefined);
  assert.equal(data.omitted.length, 0);
  assert.deepEqual(clone(data.points.map(point => point.time)), [0, 2, 3, 4, 4.5, 5, 6]);
  assert.deepEqual(clone(data.points[0].sources), ['F1 A', 'F2 A', 'F4 A', 'F5 A']);
  assert.deepEqual(clone(data.points.at(-1).sources), ['F4 B', 'F6 B']);
  assert.equal(data.points[0].x, 0);
  assert.equal(data.points[0].y, 0);
  assert.equal(data.points[1].phase, 'top');
  assert.ok(Math.abs(data.points[1].x - (0.3 - 0.52) * 16 / 9 * 100) < 1e-9);
  const figure = c.createEngineHandPath();
  const svg = figure.children[1];
  assert.equal(svg.children.filter(node => node.tagName === 'circle').length, 7);
  const curves = svg.children.filter(node => node.tagName === 'path');
  assert.equal(curves.length, 2);
  assert.equal((curves[0].attributes.d.match(/ C /g) || []).length, 1);
  assert.equal((curves[1].attributes.d.match(/ C /g) || []).length, 5);
  assert.match(figure.children[2].textContent, /No intermediate backswing inputs/);
  assert.match(figure.children[2].textContent, /Excluded from scores/);
  figure.children[3].listeners.click();
  const detailSvg = figure.children[4].children[0];
  assert.equal(detailSvg.children.filter(node => node.tagName === 'circle').length, 6);
  assert.ok(detailSvg.children.filter(node => node.tagName === 'text' && /^\d+\./.test(node.textContent))
    .every(label => Number(label.attributes.y) >= 90 && Number(label.attributes.y) <= 330));
  assert.deepEqual(clone(c.frameStateHistory), before);
  assert.match(html, /createCollapsibleGraph\(createEngineHandPath\(\), 'engine-hand'\)/);
});

test('engine path rejects incompatible sources, invalid anchor times and missing anchor hands', () => {
  const c = sandbox();
  c.frameStateHistory = engineCheckpoints();
  c.areVideoSourcesSame = () => false;
  assert.match(c.createEngineHandPath().children[1].textContent, /different sources/);
  c.areVideoSourcesSame = () => true;
  c.frameStateHistory.side.frame1.videoTime = 0;
  assert.match(c.getEngineHandPathData().reason, /increasing saved times/);
  c.frameStateHistory = engineCheckpoints();
  c.frameStateHistory.side.frame6.points = [];
  assert.match(c.getEngineHandPathData().reason, /hand points/);
  c.frameStateHistory = engineCheckpoints();
  c.frameStateHistory.side.frame6.aspectRatio = 9 / 16;
  assert.match(c.getEngineHandPathData().reason, /aspects differ/);
});

test('engine path explicitly lists skipped inputs and preserves stored aspect across video changes and restoration', () => {
  const c = sandbox();
  c.frameStateHistory = engineCheckpoints();
  const baseline = clone(c.getEngineHandPathData().points);
  c.frontVideo.videoWidth = 900;
  c.frontVideo.videoHeight = 1600;
  c.frameStateHistory = clone(c.frameStateHistory);
  assert.deepEqual(clone(c.getEngineHandPathData().points), baseline);
  c.frameStateHistory.front.frame3.videoTime = 9;
  c.frameStateHistory.side.frame3.points = [];
  c.frameStateHistory.side.frame5.aspectRatio = 9 / 16;
  assert.deepEqual(clone(c.getEngineHandPathData().omitted), ['F3 A', 'F3 B', 'F5 B']);
  assert.match(c.createEngineHandPath().children[2].textContent, /Omitted inputs.*F3 A, F3 B, F5 B/);
  delete c.frameStateHistory.front.frame1.aspectRatio;
  delete c.frameStateHistory.side.frame1.aspectRatio;
  delete c.frameStateHistory.side.frame6.aspectRatio;
  assert.equal(c.getEngineHandPathData().legacyAspect, true);
  c.backswingActive = true;
  assert.match(c.getEngineHandPathData().reason, /source aspect ratio missing/);
});

test('saved engine input preserves source aspect without mutating selected points', () => {
  const c = sandbox();
  c.selectedSegment = 'frame1';
  c.frontPoints = [{ x: 0.3, y: 0.4 }];
  c.saveFrameInputState('front');
  assert.equal(c.frameStateHistory.front.frame1.aspectRatio, 16 / 9);
  c.frontPoints[0].x = 0.8;
  assert.equal(c.frameStateHistory.front.frame1.points[0].x, 0.3);
  c.saveFrameInputState('side');
  assert.equal(c.frameStateHistory.side.frame1.aspectRatio, 9 / 16);
});

test('project input validation accepts saved engine aspects and legacy entries but rejects invalid aspects', () => {
  const c = sandbox();
  c.ANALYSIS_FRAME_IDS = Array.from({ length: 6 }, (_, i) => `frame${i + 1}`);
  for (const name of ['isProjectPoint', 'isProjectCoordinate', 'isProjectLine', 'validateFrameInputs']) load(c, name);
  const history = engineCheckpoints();
  for (const entries of Object.values(history)) {
    for (const entry of Object.values(entries)) entry.points.forEach(point => { point.type = 'landmark'; });
  }
  assert.equal(c.validateFrameInputs(clone(history)), true);
  for (const entries of Object.values(history)) {
    for (const entry of Object.values(entries)) delete entry.aspectRatio;
  }
  assert.equal(c.validateFrameInputs(history), true);
  for (const aspect of [0, -1, Infinity, '1.7']) {
    history.front.frame1.aspectRatio = aspect;
    assert.equal(c.validateFrameInputs(history), false);
  }
});

test('vertical series use all frame-specific C7/core indices and actual time spacing with separate address baselines', () => {
  const c = sandbox();
  c.frameStateHistory = engineCheckpoints();
  const indices = { frame1: [0, 3], frame2: [4, 3], frame3: [3, 4], frame4: [0, 4], frame5: [1, 2], frame6: [0, 1] };
  for (const [frame, pair] of Object.entries(indices)) {
    for (const view of ['front', 'side']) {
      const entry = c.frameStateHistory[view][frame];
      pair.forEach((index, series) => {
        entry.points[index] = { x: 0.4, y: (series === 0 ? 0.3 : 0.6) - entry.videoTime * (series === 0 ? 0.01 : 0.02) };
      });
    }
  }
  const before = clone(c.frameStateHistory);
  const data = c.getEngineVerticalMotionData();
  assert.equal(data.reason, undefined);
  assert.equal(data.duration, 6);
  assert.equal(data.topTime, 2);
  assert.equal(data.omitted.length, 0);
  data.series.forEach((series, index) => {
    assert.deepEqual(clone(series.points.map(point => point.x)), [0, 2, 3, 4, 4.5, 5, 6]);
    for (const sample of series.points) assert.ok(Math.abs(sample.y - sample.x * (index + 1)) < 1e-9);
    assert.deepEqual(clone(series.points[0].sources), ['F1 A', 'F2 A', 'F4 A', 'F5 A']);
    assert.deepEqual(clone(series.points.at(-1).sources), ['F4 B', 'F6 B']);
  });
  const figure = c.createEngineMotionFigure();
  const svg = figure.children[1];
  assert.equal(svg.children.filter(node => node.tagName === 'path').length, 2);
  const dots = svg.children.filter(node => node.tagName === 'circle');
  assert.equal(dots.length, 14);
  const x = dots.slice(0, 7).map(dot => Number(dot.attributes.cx));
  assert.ok(Math.abs((x[2] - x[1]) / (x[4] - x[3]) - 2) < 1e-9);
  assert.match(figure.children[2].textContent, /own F1 A address height as zero/);
  assert.match(figure.children[2].textContent, /slow motion is not converted/);
  assert.deepEqual(clone(c.frameStateHistory), before);
  c.uiLanguage = 'ko';
  assert.match(c.createEngineMotionFigure().children[0].textContent, /상하 이동/);
});

test('vertical series reject invalid source/time/baselines and disclose independently missing landmarks', () => {
  const c = sandbox();
  c.frameStateHistory = engineCheckpoints();
  c.areVideoSourcesSame = () => false;
  assert.match(c.createEngineMotionFigure().children[1].textContent, /same front-view video/);
  c.areVideoSourcesSame = () => true;
  c.frameStateHistory.side.frame1.videoTime = 7;
  assert.match(c.getEngineVerticalMotionData().reason, /increasing saved times/);
  c.frameStateHistory = engineCheckpoints();
  delete c.frameStateHistory.front.frame1.points[3];
  assert.match(c.getEngineVerticalMotionData().reason, /pelvis center.*required/);
  c.frameStateHistory = engineCheckpoints();
  delete c.frameStateHistory.side.frame3.points[3];
  c.frameStateHistory.front.frame6.videoTime = 9;
  const data = c.getEngineVerticalMotionData();
  assert.ok(data.omitted.includes('C7 F3 B'));
  assert.ok(!data.omitted.includes('CORE F3 B'));
  assert.ok(data.omitted.includes('C7 F6 A'));
  assert.match(c.createEngineMotionFigure().children[2].textContent, /Omitted inputs/);
  c.frameStateHistory = clone(c.frameStateHistory);
  assert.deepEqual(clone(c.getEngineVerticalMotionData()), clone(data));
});

test('all graph wrappers independently collapse and preserve open state across rerenders', () => {
  const c = sandbox();
  c.frameStateHistory = engineCheckpoints();
  const back = c.createCollapsibleGraph(c.createBackswingHandPath(checkpoints()), 'backswing-hand');
  const hand = c.createCollapsibleGraph(c.createEngineHandPath(), 'engine-hand');
  const vertical = c.createCollapsibleGraph(c.createEngineVerticalMotion(), 'engine-vertical');
  assert.equal(back.open, true);
  assert.equal(hand.open, true);
  assert.equal(vertical.open, true);
  hand.open = false;
  hand.listeners.toggle();
  assert.equal(c.createCollapsibleGraph(c.createEngineHandPath(), 'engine-hand').open, false);
  assert.equal(c.createCollapsibleGraph(c.createEngineVerticalMotion(), 'engine-vertical').open, true);
  vertical.open = false;
  vertical.listeners.toggle();
  assert.equal(c.createCollapsibleGraph(c.createEngineVerticalMotion(), 'engine-vertical').open, false);
  assert.equal(back.children[0].textContent, back.children[1].children[0].textContent);
  assert.match(html, /createCollapsibleGraph\(createBackswingHandPath\(backswingFrames\), 'backswing-hand'\)/);
  assert.match(html, /createCollapsibleGraph\(createEngineVerticalMotion\(\), 'engine-vertical'\)/);
});

test('horizontal motion uses separate address X origins and stored aspect-correct signed displacement', () => {
  const c = sandbox();
  c.frameStateHistory = engineCheckpoints();
  const indices = { frame1: [0, 3], frame2: [4, 3], frame3: [3, 4], frame4: [0, 4], frame5: [1, 2], frame6: [0, 1] };
  for (const [frame, pair] of Object.entries(indices)) {
    for (const view of ['front', 'side']) {
      const entry = c.frameStateHistory[view][frame];
      pair.forEach((index, series) => {
        entry.points[index] = { x: (series === 0 ? 0.3 : 0.6) + entry.videoTime * (series === 0 ? 0.01 : -0.02), y: 0.4 };
      });
    }
  }
  c.frontVideo.videoWidth = 900;
  c.frontVideo.videoHeight = 1600;
  const data = c.getEngineVerticalMotionData('horizontal');
  assert.equal(data.omitted.length, 0);
  data.series.forEach((series, index) => {
    for (const point of series.points) {
      const expected = point.x * (index === 0 ? 1 : -2) * 16 / 9;
      assert.ok(Math.abs(point.y - expected) < 1e-9);
    }
  });
  assert.match(c.createEngineMotionFigure('horizontal').children[2].textContent, /Image right is \+/);
  const figure = c.createEngineVerticalMotion();
  const select = figure.children[1].children[1];
  assert.equal(select.value, 'xy');
  select.value = 'horizontal';
  select.listeners.change();
  assert.equal(c.engineMotionAxis, 'horizontal');
  assert.match(figure.children[2].children[0].attributes['aria-label'], /Horizontal/);
  assert.equal(c.createEngineVerticalMotion().children[1].children[1].value, 'horizontal');
  select.value = 'vertical';
  select.listeners.change();
  assert.match(figure.children[2].children[0].attributes['aria-label'], /Vertical/);
  const snapshot = clone(data);
  c.frameStateHistory = clone(c.frameStateHistory);
  assert.deepEqual(clone(c.getEngineVerticalMotionData('horizontal')), snapshot);
  for (const entries of Object.values(c.frameStateHistory)) {
    for (const entry of Object.values(entries)) delete entry.aspectRatio;
  }
  c.backswingActive = true;
  assert.match(c.getEngineVerticalMotionData('horizontal').reason, /source aspect missing/);
  assert.equal(c.getEngineVerticalMotionData('vertical').reason, undefined);
});

test('XY motion overlays individual address origins with equal scales and preserves time-ordered coordinates', () => {
  const c = sandbox();
  c.frameStateHistory = engineCheckpoints();
  const indices = { frame1: [0, 3], frame2: [4, 3], frame3: [3, 4], frame4: [0, 4], frame5: [1, 2], frame6: [0, 1] };
  for (const [frame, pair] of Object.entries(indices)) {
    for (const view of ['front', 'side']) {
      const entry = c.frameStateHistory[view][frame];
      entry.videoTime += 10;
      const elapsed = entry.videoTime - 10;
      pair.forEach((index, series) => {
        entry.points[index] = { x: (series === 0 ? 0.3 : 0.6) + elapsed * (series === 0 ? 0.01 : -0.02),
          y: (series === 0 ? 0.2 : 0.5) - elapsed * (series === 0 ? 0.02 : -0.01) };
      });
    }
  }
  const before = clone(c.frameStateHistory);
  const data = c.getEngineVerticalMotionData('xy');
  assert.equal(data.reason, undefined);
  assert.equal(data.addressTime, 10);
  data.series.forEach((series, index) => {
    assert.deepEqual(clone(series.points.map(point => point.time)), [10, 12, 13, 14, 14.5, 15, 16]);
    assert.equal(series.points[0].x, 0);
    assert.equal(series.points[0].y, 0);
    for (const point of series.points) {
      const elapsed = point.time - 10;
      assert.ok(Math.abs(point.x - elapsed * (index === 0 ? 1 : -2) * 16 / 9) < 1e-9);
      assert.ok(Math.abs(point.y - elapsed * (index === 0 ? 2 : -1)) < 1e-9);
    }
  });
  const figure = c.createEngineMotionFigure('xy');
  const svg = figure.children[1];
  const dots = svg.children.filter(node => node.tagName === 'circle');
  assert.equal(dots.length, 14);
  assert.equal(svg.children.filter(node => node.tagName === 'path').length, 2);
  assert.equal(dots[0].attributes.cx, dots[7].attributes.cx);
  assert.equal(dots[0].attributes.cy, dots[7].attributes.cy);
  assert.equal(Number(svg.children[0].attributes.y1), Number(dots[0].attributes.cy));
  assert.equal(Number(svg.children[1].attributes.x1), Number(dots[0].attributes.cx));
  const dxPixels = Number(dots[1].attributes.cx) - Number(dots[0].attributes.cx);
  const dyPixels = Number(dots[0].attributes.cy) - Number(dots[1].attributes.cy);
  const first = data.series[0].points[1];
  assert.ok(Math.abs(dxPixels / first.x - dyPixels / first.y) < 1e-9);
  assert.match(dots[1].children[0].textContent, /2\.000 s.*X.*Y/);
  assert.match(figure.children[2].textContent, /not actual body spacing/);
  const wrapper = c.createEngineVerticalMotion();
  const select = wrapper.children[1].children[1];
  assert.equal(select.value, 'xy');
  assert.equal(select.children.length, 3);
  select.value = 'vertical';
  select.listeners.change();
  select.value = 'xy';
  select.listeners.change();
  assert.match(wrapper.children[2].children[0].attributes['aria-label'], /XY Plane Paths/);
  assert.equal(c.createEngineVerticalMotion().children[1].children[1].value, 'xy');
  assert.deepEqual(clone(c.frameStateHistory), before);
  delete c.frameStateHistory.side.frame3.points[3].x;
  assert.ok(c.getEngineVerticalMotionData('xy').omitted.includes('C7 F3 B'));
  assert.ok(!c.getEngineVerticalMotionData('vertical').omitted.includes('C7 F3 B'));
});

test('shared XY layout handles zero motion without invalid paths or scales', () => {
  const c = sandbox();
  const layout = c.getXYGraphLayout([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
  assert.ok(Number.isFinite(layout.scale));
  assert.equal(layout.centerX, 0);
  assert.equal(layout.centerY, 0);
  c.frameStateHistory = engineCheckpoints();
  for (const entries of Object.values(c.frameStateHistory)) {
    for (const entry of Object.values(entries)) entry.points = Array.from({ length: 7 }, () => ({ x: 0.4, y: 0.5 }));
  }
  const svg = c.createEngineMotionFigure('xy').children[1];
  for (const path of svg.children.filter(node => node.tagName === 'path')) assert.doesNotMatch(path.attributes.d, /NaN|Infinity/);
  c.frontVideo.videoWidth = 0;
  for (const entries of Object.values(c.frameStateHistory)) {
    for (const entry of Object.values(entries)) delete entry.aspectRatio;
  }
  assert.match(c.getEngineVerticalMotionData('xy').reason, /source aspect missing/);
});

test('interpolated curves pass through every checkpoint and do not emit invalid coordinates', () => {
  const c = sandbox();
  for (const points of [
    [{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: -2, y: 12 }],
    [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
  ]) {
    const path = c.getBackswingHandCurve(points);
    assert.match(path, /^M 0 0/);
    for (const point of points.slice(1)) assert.ok(path.includes(`, ${point.x} ${point.y}`));
    assert.doesNotMatch(path, /NaN|Infinity/);
  }
});

test('shoulder-height checkpoints refine both paths without changing legacy classification', () => {
  const c = sandbox();
  const frames = checkpoints();
  const baseline = clone(c.classifyBackswing(frames));
  frames.backShoulder = { time: 3.5, aspectRatio: 16 / 9, points: [{ x: 0.4, y: 0.25 }, { x: 0.3, y: 0.12 }] };
  frames.downShoulder = { time: 5.5, aspectRatio: 16 / 9, points: [{ x: 0.39, y: 0.25 }, { x: 0.32, y: 0.15 }] };
  assert.deepEqual(clone(c.classifyBackswing(frames)), baseline);
  const points = c.getBackswingHandPathPoints(frames);
  assert.equal(points.length, 11);
  assert.equal(points[4].phase, 'backShoulder');
  assert.equal(points[7].phase, 'downShoulder');
  const svg = c.createBackswingHandPath(frames).children[1];
  const curves = svg.children.filter(node => node.tagName === 'path');
  assert.equal((curves[0].attributes.d.match(/ C /g) || []).length, 6);
  assert.equal((curves[1].attributes.d.match(/ C /g) || []).length, 4);
  c.backswingFrames = frames;
  c.backswingClassification = c.classifyBackswing(frames);
  c.saveBackswingClassificationCache();
  assert.equal(c.getBackswingHandPathPoints(c.loadBackswingClassificationCache(c.videoFileIdentity, c.frameStateHistory).frames).length, 11);
  frames.downShoulder.time = 6.5;
  assert.match(c.classifyBackswing(frames).error, /shoulder-height/);
});

test('hand selection advances through both shoulder-height phases in chronological order', () => {
  const c = sandbox();
  for (const [phase, next, time] of [['p3', 'backShoulder', 3], ['top', 'downShoulder', 5]]) {
    c.backswingPhaseSelect.value = phase;
    c.backswingFrames[phase].points.pop();
    c.frontVideo.currentTime = time;
    c.addBackswingPoint({ x: 0.3, y: 0.1 });
    assert.equal(c.backswingPhaseSelect.value, next);
  }
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
