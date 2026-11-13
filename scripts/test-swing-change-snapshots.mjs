import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { randomUUID, webcrypto } from 'node:crypto';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');

function setup() {
  const context = vm.createContext({
    clamp: (value, min, max) => Math.min(Math.max(value, min), max),
    hasMetric: value => typeof value === 'number' && Number.isFinite(value),
    crypto: { randomUUID, subtle: webcrypto.subtle },
    TextEncoder,
    getSwingUiText: (ko, en) => en,
    frameStateHistory: { front: {}, side: {} },
    backswingFrames: {},
    areVideoSourcesSame: () => { throw new Error('Must not read active videos for a saved project'); },
    swingChangePlayers: [],
    swingChangePlayerIdSelect: { value: '', dataset: {} },
    analysisClubTypeSelect: { value: '' },
    videoFileIdentity: { front: null, side: null },
    r10SourceName: '',
    swingChangeRecords: [],
    swingChangeSelectedIds: new Set(),
    swingChangeCompareBtn: {},
    swingChangeLoadBtn: {},
    swingChangeRemoveBtn: {},
    swingChangePdfBtn: {},
    swingChangePdfExporting: false,
    swingChangeStatus: { textContent: '' },
    swingChangeResults: { children: [], replaceChildren() { this.children = []; } },
    swingChangeFilterPlayer: { value: '' },
    swingChangeFilterClub: { value: '' },
    swingChangeFilterDate: { value: '' },
  });
  vm.runInContext(html.match(/  const BACKSWING_PHASES = .*;/)[0], context);
  for (const name of [
    'normalizeSwingChangePoints', 'isSwingChangeSnapshot',
    'sanitizeAnalysisFileNamePart', 'createAnalysisExportFileName', 'copyProjectValue',
    'getLocalDateInputValue', 'getSwingChangeScale', 'getBackswingHandPathPoints',
    'getEngineImpactReference', 'getEngineHandPathData', 'getEngineVerticalMotionData', 'getFrontGraphDirectionLabels', 'createSwingChangeSnapshot',
    'getOrderedSwingChangePoints', 'createSwingChangeFileRecord', 'getFilteredSwingChangeRecords', 'setSwingChangeFileSelected',
    'renderSwingChangeRecordList',
    'removeSelectedSwingChangeFiles',
    'updateSwingChangeCompareButton',
  ]) {
    const source = html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`))?.[0];
    assert.ok(source, `Could not find ${name}`);
    vm.runInContext(source, context);
  }
  vm.runInContext(html.match(/  async function getAnalysisDownloadFileName\([\s\S]*?\n  }/)[0], context);
  return context;
}

function makeProject() {
  const points = [
    { x: 0.5, y: 0.3 }, { x: 0.5, y: 0.7 }, { x: 0.4, y: 0.8 },
    { x: 0.5, y: 0.6 }, { x: 0.6, y: 0.7 },
  ];
  return {
    savedAt: '2026-11-13T04:30:00Z',
    media: { front: 'front.mp4|1|1', side: 'front.mp4|1|1' },
    analysis: {
      athleteSelection: { playerId: 'player-1', playerName: 'Player One', clubType: 'driver' },
      frameStateHistory: {
        front: { frame1: { points, videoTime: 0, aspectRatio: 2 } },
        side: {
          frame1: { points: points.map(point => ({ x: point.x + 0.1, y: point.y - 0.1 })), videoTime: 1, aspectRatio: 2 },
          frame6: { points: [points[0], points[3], points[4]], videoTime: 2, aspectRatio: 2 },
        },
      },
      backswingFrames: {
        address: { points: [{ x: 0.5, y: 0.9 }, { x: 0.5, y: 0.6 }, { x: 0.4, y: 0.4 }], aspectRatio: 2 },
        top: { points: [{ x: 0.5, y: 0.3 }, { x: 0.6, y: 0.2 }, { x: 0.7, y: 0.1 }], aspectRatio: 2 },
      },
    },
  };
}

function makeAnalysis2Project() {
  const project = makeProject();
  delete project.analysis.frameStateHistory.side.frame6;
  project.analysis.frameStateHistory.side.frame4 = {
    points: [
      { x: 0.52, y: 0.28 }, { x: 0.4, y: 0.4 }, { x: 0.5, y: 0.7 },
      { x: 0.7, y: 0.9 }, { x: 0.54, y: 0.59 }, { x: 0.62, y: 0.7 },
    ],
    videoTime: 2, aspectRatio: 2,
  };
  project.analysis.backswingFrames = {};
  return project;
}

test('swing paths normalize to the within-view reference length and retain time progress', () => {
  const context = setup();
  const points = context.normalizeSwingChangePoints([
    { x: -15, y: 7.5, phase: 'top', time: 1.5 },
    { x: Number.NaN, y: 0, phase: 'invalid', time: 2 },
  ], 30, { start: 1, duration: 2 });

  assert.equal(points.length, 1);
  assert.equal(points[0].x, -50);
  assert.equal(points[0].y, 25);
  assert.equal(points[0].phase, 'top');
  assert.equal(points[0].progress, 25);
  assert.equal(context.normalizeSwingChangePoints([{ x: 1, y: 2 }], 0).length, 0);
});

test('analysis filename includes registered player and club, omitting an unregistered player name', () => {
  const context = setup();
  assert.equal(context.createAnalysisExportFileName(
    '김철수', '드라이버', '2026-11-13', '스윙 영상'
  ), '김철수-드라이버-2026-11-13-스윙_영상_analysis.json');
  assert.equal(context.createAnalysisExportFileName(
    '', '아이언', '2026-11-13', '스윙 영상'
  ), '아이언-2026-11-13-스윙_영상_analysis.json');
});

test('all export formats share sanitized player-club-date-source ordering', () => {
  const context = setup();
  for (const [kind, extension] of [['analysis', 'json'], ['backswing', 'pdf'], ['frame_capture_side', 'png'], ['r10_profile_07_report', 'pdf']]) {
    assert.equal(context.createAnalysisExportFileName('김/철수', '드라이버', '2026-11-13', '스윙 영상.mp4', kind, extension),
      `김_철수-드라이버-2026-11-13-스윙_영상_${kind}.${extension}`);
  }
});

test('download naming uses the selected source view, CSV source and restored registered player', async () => {
  const context = setup();
  context.document = { getElementById: () => ({ textContent: '' }) };
  context.videoFileIdentity = { front: 'front.mp4|1|1', side: 'side.mp4|2|2' };
  context.swingChangePlayerIdSelect = { value: '', dataset: { selectedPlayerId: 'player-1' } };
  context.ensureSwingChangePlayers = async () => {
    context.swingChangePlayers = [{ id: 'player-1', name: '김철수' }];
    context.swingChangePlayerIdSelect.value = 'player-1';
  };
  context.analysisClubTypeSelect = { value: 'iron', selectedOptions: [{ textContent: '아이언' }] };
  const options = { view: 'side', date: '2026-11-13' };
  assert.equal(await context.getAnalysisDownloadFileName('frame_capture_side', 'png', options),
    '김철수-아이언-2026-11-13-side_frame_capture_side.png');
  assert.equal(await context.getAnalysisDownloadFileName('r10', 'pdf', { ...options, sourceName: 'launch monitor.csv' }),
    '김철수-아이언-2026-11-13-launch_monitor_r10.pdf');
  context.swingChangePlayerIdSelect.value = '';
  context.swingChangePlayerIdSelect.dataset.selectedPlayerId = '';
  assert.equal(await context.getAnalysisDownloadFileName('analysis', 'json', options),
    '아이언-2026-11-13-side_analysis.json');
});

test('swing snapshots reject malformed dates, excessive coordinates, and invalid progress', () => {
  const context = setup();
  const snapshot = {
    version: 1,
    id: 'snapshot-id',
    sessionDate: '2025-01-02',
    graphs: {
      frontHand: [{ x: 10, y: -10, phase: 'top', progress: 50 }],
      frontC7: [],
      frontCore: [],
      sideHand: [],
    },
  };

  assert.equal(context.isSwingChangeSnapshot(snapshot), true);
  assert.equal(context.isSwingChangeSnapshot({ ...snapshot, sessionDate: 'not-a-date' }), false);
  assert.equal(context.isSwingChangeSnapshot({ ...snapshot, sessionDate: '2025-02-31' }), false);
  assert.equal(context.isSwingChangeSnapshot({
    ...snapshot,
    graphs: { ...snapshot.graphs, frontHand: [{ ...snapshot.graphs.frontHand[0], x: 550 }] },
  }), true);
  assert.equal(context.isSwingChangeSnapshot({
    ...snapshot,
    graphs: { ...snapshot.graphs, frontHand: [{ ...snapshot.graphs.frontHand[0], x: 100001 }] },
  }), false);
  assert.equal(context.isSwingChangeSnapshot({
    ...snapshot,
    graphs: { ...snapshot.graphs, frontHand: [{ ...snapshot.graphs.frontHand[0], progress: 101 }] },
  }), false);
});

test('saved projects reconstruct analysis 1 and 3 graphs without active videos or modifying analysis', () => {
  const context = setup();
  const project = makeProject();
  const before = JSON.stringify(project);
  const snapshot = context.createSwingChangeSnapshot('2026-11-13', '', project);
  assert.equal(context.isSwingChangeSnapshot(snapshot), true);
  for (const key of ['frontHand', 'frontC7', 'frontCore', 'sideHand']) {
    assert.ok(snapshot.graphs[key].length >= 2, key);
  }
  assert.equal(snapshot.graphs.frontHand[1].x, 66.667);
  assert.equal(snapshot.graphs.sideHand[1].x, 66.667);
  assert.equal(snapshot.graphs.frontHand[1].progress, 50);
  assert.equal(JSON.stringify(project), before);
});

test('analysis 1 alone supplies a side path without depending on analysis 3 reference points', () => {
  const context = setup();
  const project = makeProject();
  project.analysis.frameStateHistory = { front: {}, side: {} };
  const snapshot = context.createSwingChangeSnapshot('2026-11-13', '', project);
  assert.equal(snapshot.graphs.sideHand.length, 2);
  assert.equal(snapshot.graphs.frontHand.length, 0);
  project.analysis.backswingFrames = {};
  assert.equal(context.createSwingChangeSnapshot('2026-11-13', '', project), null);
});

test('analysis 2 JSON reconstructs front hand, C7 and core paths from F4 impact without F6 or side backswing data', () => {
  const context = setup();
  const project = makeAnalysis2Project();
  const before = JSON.stringify(project);
  const snapshot = context.createSwingChangeSnapshot('2026-11-13', '', project);
  for (const key of ['frontHand', 'frontC7', 'frontCore']) assert.equal(snapshot.graphs[key].length, 3, key);
  assert.equal(snapshot.graphs.sideHand.length, 0);
  assert.equal(snapshot.graphs.frontHand.at(-1).phase, 'impact');
  assert.equal(snapshot.graphs.frontHand.at(-1).progress, 100);
  assert.equal(snapshot.graphs.frontHand.at(-1).x, 13.333);
  assert.equal(snapshot.graphs.frontC7.at(-1).x, 13.333);
  assert.equal(snapshot.graphs.frontC7.at(-1).y, 6.667);
  assert.equal(snapshot.graphs.frontCore.at(-1).x, 26.667);
  assert.equal(snapshot.graphs.frontCore.at(-1).y, 3.333);
  assert.equal(JSON.stringify(project), before);
  context.validateAnalysisProject = () => {};
  const record = context.createSwingChangeFileRecord(project, 'analysis2.json', 'analysis2');
  assert.deepEqual(JSON.parse(JSON.stringify(record.snapshot.graphs)), JSON.parse(JSON.stringify(snapshot.graphs)));
});

test('analysis 2 paths still reject mismatched videos, invalid F4 time and incompatible source aspects', () => {
  const context = setup();
  const project = makeAnalysis2Project();
  project.media.side = 'different.mp4|1|1';
  assert.equal(context.createSwingChangeSnapshot('2026-11-13', '', project), null);
  project.media.side = project.media.front;
  project.analysis.frameStateHistory.side.frame4.videoTime = 0.5;
  assert.match(context.getEngineHandPathData(project).reason, /increasing saved times/);
  assert.match(context.getEngineVerticalMotionData('xy', project).reason, /increasing saved times/);
  project.analysis.frameStateHistory.side.frame4.videoTime = 2;
  project.analysis.frameStateHistory.side.frame4.aspectRatio = 1;
  assert.match(context.getEngineHandPathData(project).reason, /aspects differ/);
  assert.ok(context.getEngineVerticalMotionData('xy', project).omitted.includes('C7 F4 B'));
});

test('dedicated F6 impact retains precedence over a different F4 impact sample', () => {
  const context = setup();
  const project = makeProject();
  const before = JSON.stringify(context.getEngineHandPathData(project).points);
  project.analysis.frameStateHistory.side.frame4 = makeAnalysis2Project().analysis.frameStateHistory.side.frame4;
  const points = context.getEngineHandPathData(project).points;
  assert.equal(points.at(-1).x, JSON.parse(before).at(-1).x);
  assert.equal(points.at(-1).y, JSON.parse(before).at(-1).y);
  assert.ok(points.at(-1).sources.includes('F4 B'));
  assert.ok(points.at(-1).sources.includes('F6 B'));
});

test('reading saved frame inputs preserves the existing live graph output', () => {
  const context = setup();
  const project = makeProject();
  context.frameStateHistory = project.analysis.frameStateHistory;
  context.areVideoSourcesSame = () => true;
  assert.equal(JSON.stringify(context.getEngineHandPathData()), JSON.stringify(context.getEngineHandPathData(project)));
  assert.equal(JSON.stringify(context.getEngineVerticalMotionData('xy')), JSON.stringify(context.getEngineVerticalMotionData('xy', project)));
});

test('front C7 and core connect by saved video time, not frame number or input insertion order', () => {
  const context = setup();
  const project = makeProject();
  const address = project.analysis.frameStateHistory.front.frame1;
  const entry = time => ({
    points: Array.from({ length: 7 }, (_, index) => ({ x: 0.4 + index * 0.01, y: 0.6 - index * 0.01 })),
    videoTime: time, aspectRatio: 2,
  });
  project.analysis.frameStateHistory = {
    front: { frame6: entry(12), frame3: entry(13), frame4: entry(0), frame2: entry(0), frame5: entry(0), frame1: address },
    side: { frame4: entry(15), frame3: entry(14), frame6: entry(15), frame5: entry(12), frame2: entry(11), frame1: entry(10) },
  };
  const data = context.getEngineVerticalMotionData('xy', project);
  assert.equal(data.reason, undefined);
  for (const series of data.series) {
    assert.deepEqual(Array.from(series.points, point => point.time), [0, 10, 11, 12, 13, 14, 15]);
    assert.ok(series.points[0].sources.includes('F1 A'));
    assert.ok(series.points[1].sources.includes('F1 B'));
    assert.ok(series.points[3].sources.includes('F5 B'));
    assert.ok(series.points[3].sources.includes('F6 A'));
    assert.ok(series.points.at(-1).sources.includes('F6 B'));
  }
});

test('older JSON without a separate history snapshot loads player, club and save date', () => {
  const context = setup();
  context.validateAnalysisProject = (project, requireMatchingMedia) => {
    assert.equal(requireMatchingMedia, false);
  };
  const record = context.createSwingChangeFileRecord(makeProject(), 'saved-analysis.json', 'folder/saved-analysis.json');
  assert.equal(record.player_id, 'player-1');
  assert.equal(record.session_date, '2026-11-13');
  assert.equal(record.clubType, 'driver');
  assert.match(record.displayLabel, /Player One.*Driver.*2026-11-13/);
  const missing = makeProject();
  missing.analysis.frameStateHistory = { front: {}, side: {} };
  missing.analysis.backswingFrames = {};
  assert.throws(() => context.createSwingChangeFileRecord(missing, 'empty.json', 'empty'), /No comparable graphs/);
});

test('import preserves all saved graph series even when raw inputs no longer reconstruct them', () => {
  const context = setup();
  context.validateAnalysisProject = () => {};
  const project = makeProject();
  const stored = context.createSwingChangeSnapshot('2026-11-13', '', project);
  project.analysis.swingChangeRecord = JSON.parse(JSON.stringify(stored));
  project.analysis.frameStateHistory = { front: {}, side: {} };
  project.analysis.backswingFrames = {};
  const before = JSON.stringify(project);
  const record = context.createSwingChangeFileRecord(project, 'analysis2.json', 'saved');
  for (const key of ['frontHand', 'frontC7', 'frontCore', 'sideHand']) {
    assert.deepEqual(JSON.parse(JSON.stringify(record.snapshot.graphs[key])), JSON.parse(JSON.stringify(stored.graphs[key])));
  }
  assert.equal(JSON.stringify(project), before);
  record.snapshot.graphs.frontC7[0].x = 123;
  assert.equal(project.analysis.swingChangeRecord.graphs.frontC7[0].x, 0);
});

test('import reconstructs missing saved front graphs without discarding the saved side hand path', () => {
  const context = setup();
  context.validateAnalysisProject = () => {};
  const project = makeAnalysis2Project();
  const sideProject = makeProject();
  project.analysis.swingChangeRecord = context.createSwingChangeSnapshot('2026-11-13', '', sideProject);
  for (const key of ['frontHand', 'frontC7', 'frontCore']) project.analysis.swingChangeRecord.graphs[key] = [];
  const before = JSON.stringify(project);
  const record = context.createSwingChangeFileRecord(project, 'analysis2.json', 'partial');
  assert.equal(record.snapshot.graphs.frontHand.length, 3);
  assert.equal(record.snapshot.graphs.frontC7.length, 3);
  assert.equal(record.snapshot.graphs.frontCore.length, 3);
  assert.equal(record.snapshot.graphs.sideHand.length, 2);
  assert.equal(JSON.stringify(project), before);
});

test('import orders stored front paths by saved progress without changing the source JSON or untimed side path', () => {
  const context = setup();
  context.validateAnalysisProject = () => {};
  const project = makeProject();
  project.analysis.swingChangeRecord = context.createSwingChangeSnapshot('2026-11-13', '', project);
  for (const key of ['frontHand', 'frontC7', 'frontCore']) project.analysis.swingChangeRecord.graphs[key].reverse();
  const before = JSON.stringify(project);
  const sideBefore = JSON.stringify(project.analysis.swingChangeRecord.graphs.sideHand);
  const record = context.createSwingChangeFileRecord(project, 'out-of-order.json', 'ordered');
  for (const key of ['frontHand', 'frontC7', 'frontCore']) {
    assert.deepEqual(Array.from(record.snapshot.graphs[key], point => point.progress), [0, 50, 100]);
  }
  assert.equal(JSON.stringify(record.snapshot.graphs.sideHand), sideBefore);
  assert.equal(JSON.stringify(project), before);
});

class Element {
  children = [];
  style = {};
  attributes = {};
  listeners = {};
  constructor(tagName) { this.tagName = tagName; }
  append(...items) {
    items.forEach(item => { if (typeof item === 'object') item.parentNode = this; });
    this.children.push(...items);
  }
  replaceChildren(...items) { this.children = []; this.append(...items); }
  replaceWith(replacement) {
    this.parentNode.children[this.parentNode.children.indexOf(this)] = replacement;
    replacement.parentNode = this.parentNode;
  }
  querySelectorAll(tagName) {
    return this.children.filter(child => typeof child === 'object')
      .flatMap(child => [...(child.tagName === tagName ? [child] : []), ...child.querySelectorAll(tagName)]);
  }
  focus() { this.focused = true; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
}

function setupComparisonCharts() {
  const context = setup();
  context.document = {
    createElement: tag => new Element(tag),
    createElementNS: (_, tag) => new Element(tag),
    createTextNode: text => text,
  };
  context.swingChangeResults = new Element('div');
  for (const name of ['createGraphSvgElement', 'getSwingChangeCheckpointPhase', 'createSwingChangeChart', 'renderSwingChangeComparison']) {
    vm.runInContext(html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`))[0], context);
  }
  context.swingChangeRecords = [0, 1].map(index => {
    const snapshot = context.createSwingChangeSnapshot(`2026-11-${12 + index}`, '', makeProject());
    snapshot.graphs.frontC7 = [
      { x: 0, y: 0, phase: 'address', progress: 0 },
      { x: 10, y: -5, phase: 'top', progress: 40 },
      { x: -4, y: 12, phase: 'impact', progress: 100 },
    ];
    return { id: `chart-${index}`, player_id: 'player-1', session_date: snapshot.sessionDate, snapshot };
  });
  context.swingChangeRecords.forEach(record => context.swingChangeSelectedIds.add(record.id));
  return context;
}

test('comparison shows separate hand paths and C7/core XY, signed X and signed Y graphs', () => {
  const context = setupComparisonCharts();
  context.renderSwingChangeComparison();
  const sections = context.swingChangeResults.children;
  assert.equal(sections.length, 6);
  assert.match(sections[0].children[0].textContent, /Front-view hand/);
  assert.match(sections[1].children[0].textContent, /Side-view hand/);
  assert.match(sections[2].children[0].textContent, /C7.*Core.*XY/);
  assert.match(sections[3].children[0].textContent, /Horizontal X/);
  assert.match(sections[4].children[0].textContent, /Vertical Y/);
  const charts = sections.slice(0, 5).map(section => section.children.find(node => node.tagName === 'svg'));
  assert.deepEqual(charts.map(svg => svg.children.filter(node => node.tagName === 'path').length), [2, 2, 4, 4, 4]);
  const topTooltip = svg => svg.children.at(-1).children.find(group =>
    group.attributes['data-series'] === 'frontC7' && group.attributes['data-phase'] === 'top')
    .children[0].children[0].textContent;
  assert.match(topTooltip(charts[3]), /Progress 40\.0% · X 10\.0%/);
  assert.match(topTooltip(charts[4]), /Progress 40\.0% · Y -5\.0%/);
  const xPath = charts[3].children.find(node => node.tagName === 'path'
    && node.attributes['data-series'] === 'frontC7').attributes.d.split(' ');
  assert.deepEqual([xPath[1], xPath[4], xPath[7]].map(Number), [100, 324, 660]);
});

test('axis comparisons disclose missing timing instead of inventing progress, leaving XY available', () => {
  const context = setupComparisonCharts();
  context.swingChangeRecords.forEach(record => {
    for (const key of ['frontC7', 'frontCore']) record.snapshot.graphs[key].forEach(point => { point.progress = null; });
  });
  context.renderSwingChangeComparison();
  const sections = context.swingChangeResults.children;
  assert.ok(sections[2].children.some(node => node.tagName === 'svg'));
  assert.match(sections[2].children.find(node => node.tagName === 'p').textContent, /chronological connection cannot be verified/);
  for (const section of sections.slice(3, 5)) {
    assert.equal(section.children.some(node => node.tagName === 'svg'), false);
    assert.match(section.children.find(node => node.tagName === 'p').textContent, /saved timing.*Progress is not invented/);
  }
});

test('comparison paths restore saved progress order and disclose each point sequence in tooltips', () => {
  const context = setupComparisonCharts();
  context.renderSwingChangeComparison();
  const paths = () => context.swingChangeResults.children.slice(2, 5).map(section =>
    section.children.find(node => node.tagName === 'svg').children
      .filter(node => node.tagName === 'path').map(node => node.attributes.d));
  const expected = paths();
  context.swingChangeRecords.forEach(record => {
    for (const key of ['frontC7', 'frontCore']) record.snapshot.graphs[key].reverse();
  });
  const before = JSON.stringify(context.swingChangeRecords);
  context.renderSwingChangeComparison();
  assert.deepEqual(paths(), expected);
  const svg = context.swingChangeResults.children[2].children.find(node => node.tagName === 'svg');
  const c7 = svg.children.at(-1).children.filter(group => group.attributes['data-series'] === 'frontC7');
  const tooltip = group => group.children[0].children[0].textContent;
  assert.match(tooltip(c7[0]), /Address.*Path order 1\/3 · Progress 0\.0%/);
  assert.match(tooltip(c7[1]), /Backswing top.*Path order 2\/3 · Progress 40\.0%/);
  assert.match(tooltip(c7[2]), /Impact.*Path order 3\/3 · Progress 100\.0%/);
  assert.equal(JSON.stringify(context.swingChangeRecords), before);
});

test('only the first comparison chart starts expanded', () => {
  const context = setupComparisonCharts();
  context.renderSwingChangeComparison();
  const charts = context.swingChangeResults.children.slice(0, 5);
  assert.deepEqual(charts.map(chart => chart.tagName), Array(5).fill('details'));
  assert.deepEqual(charts.map(chart => chart.open), [true, false, false, false, false]);
  assert.ok(charts.every(chart => chart.children[0].tagName === 'summary'));
});

test('analysis 2/3 and comparison front graphs share player-based labels without flipping coordinates or side graphs', () => {
  const context = setupComparisonCharts();
  for (const name of ['getXYGraphLayout', 'getBackswingHandCurve', 'createEngineXYMotionFigure', 'createEngineMotionFigure', 'createEngineHandPath']) {
    vm.runInContext(html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`))[0], context);
  }
  const project = makeProject();
  const motionData = context.getEngineVerticalMotionData;
  const handData = context.getEngineHandPathData;
  context.getEngineVerticalMotionData = axis => motionData(axis, project);
  context.getEngineHandPathData = () => handData(project);
  context.createHandPathFigure = (_, options) => options;
  const before = JSON.stringify(project);
  for (const language of ['en', 'ko']) {
    context.getSwingUiText = (ko, en) => language === 'ko' ? ko : en;
    context.renderSwingChangeComparison();
    const directions = context.getFrontGraphDirectionLabels();
    const hand = context.createEngineHandPath();
    assert.ok(hand.note.includes(directions.note));
    assert.equal(hand.frontView, true);
    for (const axis of ['xy', 'horizontal']) {
      const figure = context.createEngineMotionFigure(axis);
      assert.ok(figure.children.at(-1).textContent.includes(directions.note));
      if (axis === 'xy') {
        const svg = figure.children.find(node => node.tagName === 'svg');
        assert.ok(svg.children.some(node => node.textContent === directions.positive));
        assert.ok(svg.children.some(node => node.textContent === directions.negative));
      }
    }
    for (const index of [0, 2, 3, 4]) {
      const section = context.swingChangeResults.children[index];
      assert.ok(section.children.find(node => node.tagName === 'p').textContent.includes(directions.note));
      if (index < 3) {
        const svg = section.children.find(node => node.tagName === 'svg');
        assert.ok(svg.children.some(node => node.textContent === directions.positive));
        assert.ok(svg.children.some(node => node.textContent === directions.negative));
      }
    }
    const side = context.swingChangeResults.children[1];
    assert.equal(side.children.find(node => node.tagName === 'p').textContent.includes(directions.note), false);
    assert.ok(side.children.find(node => node.tagName === 'svg').children.some(node => node.textContent === 'X (%)'));
    assert.equal(JSON.stringify(project), before);
  }
});

test('C7 can be isolated and rescaled without changing the saved data or other charts', () => {
  const context = setupComparisonCharts();
  context.renderSwingChangeComparison();
  const before = JSON.stringify(context.swingChangeRecords);
  const otherChart = context.swingChangeResults.children[3];
  const chart = () => context.swingChangeResults.children[2];
  const inputs = () => chart().children.find(node => node.className === 'swing-change-series-controls')
    .children.map(label => label.children[0]);
  const svg = () => chart().children.find(node => node.tagName === 'svg');
  const c7Path = () => svg().children.find(node => node.tagName === 'path'
    && node.attributes['data-series'] === 'frontC7');
  const originalPath = c7Path().attributes.d;
  chart().open = true;
  context.document.activeElement = inputs()[1];
  inputs()[1].checked = false;
  inputs()[1].listeners.change();
  assert.equal(chart().open, true);
  assert.equal(inputs()[1].focused, true, 'Changing a metric must preserve keyboard focus');
  assert.equal(svg().children.filter(node => node.tagName === 'path').length, 2);
  assert.notEqual(c7Path().attributes.d, originalPath, 'C7-only plots must fit C7 instead of the larger core path');
  const c7Markers = svg().children.at(-1).children;
  assert.ok(c7Markers.every(group => group.attributes['data-series'] === 'frontC7'
    && group.children[0].attributes.fill === 'none'));
  assert.equal(context.swingChangeResults.children[3], otherChart);
  inputs()[0].checked = false;
  inputs()[0].listeners.change();
  assert.equal(svg(), undefined);
  assert.match(chart().children.find(node => node.tagName === 'p').textContent, /Select a metric/);
  inputs()[1].checked = true;
  inputs()[1].listeners.change();
  assert.ok(svg());
  assert.ok(svg().children.filter(node => node.tagName === 'path')
    .every(node => node.attributes['data-series'] === 'frontCore'));
  assert.equal(JSON.stringify(context.swingChangeRecords), before);
});

test('C7 is drawn above overlapping core paths and missing C7 data is explicitly identified', () => {
  const context = setupComparisonCharts();
  context.swingChangeRecords.forEach(record => {
    record.snapshot.graphs.frontCore = record.snapshot.graphs.frontC7.map(point => ({ ...point }));
  });
  context.renderSwingChangeComparison();
  let chart = context.swingChangeResults.children[2];
  const svg = chart.children.find(node => node.tagName === 'svg');
  assert.equal(svg.children.filter(node => node.tagName === 'path').at(-1).attributes['data-series'], 'frontC7');
  const markers = svg.children.at(-1).children;
  assert.equal(markers.at(-1).attributes['data-series'], 'frontC7');
  assert.equal(markers.at(-1).children[0].attributes.fill, 'none');
  context.swingChangeRecords.forEach(record => { record.snapshot.graphs.frontC7 = []; });
  context.renderSwingChangeComparison();
  chart = context.swingChangeResults.children[2];
  const labels = chart.children.find(node => node.className === 'swing-change-series-controls').children;
  assert.equal(labels[0].children[0].disabled, true);
  assert.equal(labels[0].children[0].checked, false);
  assert.match(labels[0].children[1], /C7.*no data/);
  assert.equal(labels[1].children[0].disabled, false);
});

  test('comparison marks checkpoints without repeated labels and retains C7/core tooltip details', () => {
    const context = setupComparisonCharts();
    context.renderSwingChangeComparison();
    const sections = context.swingChangeResults.children.slice(0, 5);
    const charts = sections.map(section => section.children.find(node => node.tagName === 'svg'));
    const annotations = charts.map(svg => svg.children.at(-1).children);
    assert.deepEqual(annotations.map(groups => groups.length), [6, 4, 12, 12, 12]);
    for (const groups of [annotations[0], ...annotations.slice(2)]) {
      for (const key of new Set(groups.map(group => group.attributes['data-series']))) {
        const marks = groups.filter(group => group.attributes['data-series'] === key).slice(0, 3);
        assert.deepEqual(marks.map(mark => mark.attributes['data-phase']), ['address', 'top', 'impact']);
        assert.deepEqual(marks.map(mark => mark.children[0].tagName), ['circle', 'polygon', 'rect']);
        assert.equal(marks[1].children.length, 1, 'Only a marker is drawn, without a callout label');
        assert.match(marks[1].children[0].children[0].textContent, /2026-11-12.*Backswing top/);
      }
    }
    for (const index of [2, 3, 4]) {
      const tooltips = annotations[index].map(group => group.children[0].children[0].textContent);
      assert.ok(tooltips.some(text => /C7 · Address ·/.test(text)));
      assert.ok(tooltips.some(text => /Core · Impact ·/.test(text)));
      const legend = sections[index].children.find(node => node.children.some(child =>
        child.children?.some(text => typeof text === 'string' && text.includes('pelvis center'))));
      assert.ok(legend, 'C7/core charts must explain their line styles and the core reference');
    }
    assert.ok(annotations[1].every(group => group.attributes['data-phase'] !== 'impact'),
      'Missing side-view impact must not be fabricated');
  });

  test('legacy frame labels identify checkpoints without treating an intermediate F4 as impact', () => {
    const context = setupComparisonCharts();
    const phase = (value, progress = null) => context.getSwingChangeCheckpointPhase({ phase: value, progress });
    assert.equal(phase('F1 A'), 'address');
    assert.equal(phase('F1 B/F2 A'), 'top');
    assert.equal(phase('F4 B/F6 B'), 'impact');
    assert.equal(phase('F4 B', 100), 'impact');
    assert.equal(phase('F4 B', 75), null);
    assert.equal(phase('F4 B'), null);
    assert.equal(phase('p1'), null);
  });

  test('four comparison records keep the plot free of callout text and leader lines', () => {
    const context = setupComparisonCharts();
    const templates = context.swingChangeRecords;
    context.swingChangeRecords = Array.from({ length: 4 }, (_, index) => ({
      ...templates[index % 2], id: `close-${index}`,
    }));
    context.swingChangeSelectedIds = new Set(context.swingChangeRecords.map(record => record.id));
    context.renderSwingChangeComparison();
    for (const section of context.swingChangeResults.children.slice(0, 5)) {
      const svg = section.children.find(node => node.tagName === 'svg');
      const groups = svg.children.filter(node => node.tagName === 'g');
      assert.equal(groups.length, 1, 'Only the marker group remains; no leader-line layer');
      assert.ok(groups[0].children.every(group => group.children.length === 1
        && ['circle', 'polygon', 'rect'].includes(group.children[0].tagName)));
      assert.equal(svg.children.filter(node => node.tagName === 'circle').length, 0,
        'Checkpoint shapes must not also draw a duplicate sample dot');
      const text = svg.children.filter(node => node.tagName === 'text').map(node => node.textContent);
      assert.ok(text.every(value => !/Address|Backswing|Impact|C7|Core|\[\d+\]/.test(value)),
        'Visible plot text is limited to axis labels and ticks');
      assert.ok(section.children.find(node => node.className === 'swing-change-legend').children.every(item =>
        item.children.filter(child => typeof child === 'string').every(value => !/\[\d+\]/.test(value))),
      'Date legends do not retain obsolete file numbers');
    }
  });
test('date and player filtering keeps selected files and rejects a fifth file', () => {
  const context = setup();
  context.document = { createElement: () => new Element() };
  context.swingChangeRecordList = new Element();
  context.swingChangeCompareBtn = {};
  context.swingChangeRecords = Array.from({ length: 5 }, (_, i) => ({
    id: `file-${i}`, player_id: i < 3 ? 'one' : 'two',
    clubType: 'iron', session_date: `2026-11-${10 + i}`, snapshot: { graphs: { sideHand: [{}, {}] } },
  }));
  for (let i = 0; i < 4; i++) assert.equal(context.setSwingChangeFileSelected(`file-${i}`, true), true);
  assert.equal(context.setSwingChangeFileSelected('file-4', true), false);
  assert.match(context.swingChangeStatus.textContent, /four/);
  context.swingChangeFilterPlayer.value = 'two';
  context.swingChangeFilterDate.value = '2026-11-14';
  context.renderSwingChangeRecordList();
  assert.equal(context.swingChangeRecordList.children.length, 5);
  assert.equal(context.swingChangeRecordList.children.filter(option => option.children[0].checked).length, 4);
  assert.equal(context.swingChangeCompareBtn.disabled, false);
  assert.equal(context.swingChangeSelectedIds.size, 4);
  assert.equal(context.setSwingChangeFileSelected('file-0', false), true);
  assert.equal(context.setSwingChangeFileSelected('file-4', true), true);
});

test('club filter removes incompatible selections and brackets filenames on matching cards', () => {
  const context = setup();
  context.document = { createElement: () => new Element() };
  context.swingChangeRecordList = new Element();
  context.swingChangeResults = new Element();
  context.swingChangeResults.append('previous comparison');
  context.swingChangeRecords = ['iron', 'driver', ''].map((clubType, index) => ({
    id: `club-${index}`, player_id: 'one', clubType,
    session_date: '2026-11-13', displayLabel: `Player · ${clubType || 'unspecified'} · 2026-11-13`,
    label: `swing-${index}.json`, snapshot: { graphs: { sideHand: [{}, {}] } },
  }));
  context.swingChangeRecords.forEach(record => context.swingChangeSelectedIds.add(record.id));
  context.swingChangeFilterClub.value = 'driver';
  context.renderSwingChangeRecordList();
  assert.equal(context.swingChangeRecordList.children.length, 1);
  const card = context.swingChangeRecordList.children[0];
  assert.equal(card.children[0].value, 'club-1');
  assert.equal(card.children[0].checked, true);
  assert.match(card.children[1].textContent, / \(swing-1\.json\)$/);
  assert.deepEqual([...context.swingChangeSelectedIds], ['club-1']);
  assert.equal(context.swingChangeResults.children.length, 0);
  assert.equal(context.swingChangePdfBtn.disabled, true);
  assert.equal(context.swingChangeCompareBtn.disabled, true);
  assert.match(context.swingChangeStatus.textContent, /Deselected 2 files/);
  context.swingChangeFilterClub.value = 'iron';
  context.renderSwingChangeRecordList();
  assert.equal(context.swingChangeRecordList.children[0].children[0].value, 'club-0');
  assert.equal(context.swingChangeSelectedIds.size, 0);
});

test('iron-only folder shows no cards under driver even if iron files were selected', () => {
  const context = setup();
  context.document = { createElement: () => new Element() };
  context.swingChangeRecordList = new Element();
  context.swingChangeRecords = [{
    id: 'iron-file', player_id: 'one', clubType: 'iron', session_date: '2026-11-13',
    snapshot: { graphs: { sideHand: [{}, {}] } },
  }];
  context.swingChangeSelectedIds.add('iron-file');
  context.swingChangeFilterClub.value = 'driver';
  context.renderSwingChangeRecordList();
  assert.equal(context.swingChangeSelectedIds.size, 0);
  assert.match(context.swingChangeRecordList.children[0].textContent, /No analysis JSON files match/);
  assert.equal(context.swingChangeCompareBtn.textContent, 'Compare selected files (0/4)');
});

test('normal project save automatically downloads graphs with the requested name and no history service', async () => {
  const context = setup();
  const project = makeProject();
  let downloaded, savedBlob;
  Object.assign(context, {
    buildAnalysisProject: () => project,
    saveAnalysisProjectBtn: {},
    swingChangePlayers: [{ id: 'player-1', name: 'Player One' }],
    swingChangePlayerIdSelect: { value: 'player-1', dataset: {} },
    analysisClubTypeSelect: { value: 'driver', selectedOptions: [{ textContent: 'Driver' }] },
    ANALYSIS_PROJECT_MAX_BYTES: 25 * 1024 * 1024,
    Blob,
    URL: { createObjectURL(blob) { savedBlob = blob; return 'blob:project'; }, revokeObjectURL() {} },
    setTimeout: fn => fn(),
    document: {
      body: { appendChild() {} },
      getElementById: () => ({ textContent: 'swing.mp4' }),
      createElement: () => ({ click() { downloaded = this.download; }, remove() {} }),
    },
    alert(message) { assert.fail(message); },
  });
  for (const key of ['analysisBodyMassInput', 'analysisLeanMassInput', 'analysisBodyFatInput', 'analysisKnownDistanceInput']) {
    context[key] = { checkValidity: () => true };
  }
  vm.runInContext(html.match(/  async function saveAnalysisProject\([\s\S]*?\n  }/)[0], context);
  await context.saveAnalysisProject();
  assert.equal(downloaded, 'Player_One-Driver-2026-11-13-swing_analysis.json');
  const saved = JSON.parse(await savedBlob.text());
  assert.equal(saved.analysis.swingChangeRecord.graphs.sideHand.length, 2);
  assert.equal(saved.analysis.swingChangeRecord.graphs.frontC7.length, 3);
  assert.equal(context.saveAnalysisProjectBtn.disabled, false);
});

test('folder import reports broken or oversized JSON while retaining readable graph files', async () => {
  const context = setup();
  const errors = [];
  Object.assign(context, {
    console: { error: (...args) => errors.push(args) },
    validateAnalysisProject() {},
    ANALYSIS_PROJECT_MAX_BYTES: 25 * 1024 * 1024,
    swingChangeLoadBtn: {},
    updateSwingChangeFileFilters() {},
    renderSwingChangeRecordList() {},
  });
  vm.runInContext(html.match(/  async function loadSwingChangeFolder\([\s\S]*?\n  }/)[0], context);
  await context.loadSwingChangeFolder([
    { name: 'good.json', size: 1000, webkitRelativePath: 'folder/good.json', text: async () => JSON.stringify(makeProject()) },
    { name: 'broken.json', size: 20, text: async () => '{invalid' },
    { name: 'oversized.json', size: 26 * 1024 * 1024, text: () => assert.fail('Must check size before reading') },
    { name: 'video.mp4', size: 1000, text: () => assert.fail('Must skip non-JSON files') },
  ]);
  assert.equal(context.swingChangeRecords.length, 1);
  assert.equal(context.swingChangeRecords[0].label, 'good.json');
  assert.match(context.swingChangeStatus.textContent, /broken\.json/);
  assert.match(context.swingChangeStatus.textContent, /oversized\.json/);
  assert.equal(errors.length, 2);
  assert.equal(context.swingChangeLoadBtn.disabled, false);
  const existing = context.swingChangeRecords[0];
  context.swingChangeSelectedIds.add(existing.id);
  context.swingChangeResults.children.push('existing comparison');
  await context.loadSwingChangeFolder([
    { name: 'another-broken.json', size: 20, text: async () => '{invalid' },
  ]);
  assert.equal(context.swingChangeRecords[0], existing);
  assert.equal(context.swingChangeSelectedIds.has(existing.id), true);
  assert.deepEqual(context.swingChangeResults.children, ['existing comparison']);
  assert.match(context.swingChangeStatus.textContent, /another-broken\.json/);
});

function setupFolderImport() {
  const context = setup();
  const filterCalls = [];
  Object.assign(context, {
    validateAnalysisProject() {},
    ANALYSIS_PROJECT_MAX_BYTES: 25 * 1024 * 1024,
    document: { createElement: () => new Element() },
    swingChangeRecordList: new Element(),
    swingChangeResults: new Element(),
    updateSwingChangeFileFilters: useAnalysisSelection => filterCalls.push(useAnalysisSelection),
  });
  vm.runInContext(html.match(/  async function loadSwingChangeFolder\([\s\S]*?\n  }/)[0], context);
  return { context, filterCalls };
}

function folderFile(project, path = 'folder/swing.json') {
  const content = JSON.stringify(project);
  return {
    name: path.split('/').pop(), webkitRelativePath: path, size: Buffer.byteLength(content),
    text: async () => content,
  };
}

test('additional folders preserve selections, filters and results while deduplicating content rather than filenames', async () => {
  const { context, filterCalls } = setupFolderImport();
  const firstFile = folderFile(makeProject());
  await context.loadSwingChangeFolder([firstFile]);
  const first = context.swingChangeRecords[0];
  context.setSwingChangeFileSelected(first.id, true);
  context.swingChangeResults.append('existing comparison');
  context.swingChangeFilterPlayer.value = 'player-1';
  context.swingChangeFilterClub.value = 'driver';
  context.swingChangeFilterDate.value = '2026-11-13';
  const secondProject = makeProject();
  secondProject.savedAt = '2026-11-14T04:30:00Z';
  const secondFile = folderFile(secondProject);
  const copiedFirst = folderFile(makeProject(), 'another-folder/copied.json');
  await context.loadSwingChangeFolder([secondFile, copiedFirst, secondFile]);
  assert.equal(context.swingChangeRecords.length, 2);
  assert.equal(new Set(context.swingChangeRecords.map(record => record.id)).size, 2);
  assert.equal(context.swingChangeRecords.find(record => record.id === first.id), first);
  assert.deepEqual([...context.swingChangeSelectedIds], [first.id]);
  assert.deepEqual(context.swingChangeResults.children, ['existing comparison']);
  assert.equal(context.swingChangeFilterPlayer.value, 'player-1');
  assert.equal(context.swingChangeFilterClub.value, 'driver');
  assert.equal(context.swingChangeFilterDate.value, '2026-11-13');
  assert.deepEqual(filterCalls, [true, false]);
  assert.match(context.swingChangeStatus.textContent, /Added 1, skipped 2 duplicates/);
  await context.loadSwingChangeFolder([firstFile, secondFile]);
  assert.equal(context.swingChangeRecords.length, 2);
  assert.match(context.swingChangeStatus.textContent, /Added 0, skipped 2 duplicates/);
  assert.equal(context.swingChangePdfBtn.disabled, false);
});

test('removing selected files requires confirmation, preserves other records and permits reimport', async () => {
  const { context } = setupFolderImport();
  const firstFile = folderFile(makeProject());
  const secondProject = makeProject();
  secondProject.savedAt = '2026-11-14T04:30:00Z';
  await context.loadSwingChangeFolder([firstFile, folderFile(secondProject)]);
  const first = context.swingChangeRecords.find(record => record.session_date === '2026-11-13');
  context.setSwingChangeFileSelected(first.id, true);
  context.swingChangeResults.append('comparison');
  context.confirm = message => {
    assert.match(message, /Original JSON files on this PC will not be deleted/);
    return false;
  };
  context.removeSelectedSwingChangeFiles();
  assert.equal(context.swingChangeRecords.length, 2);
  assert.equal(context.swingChangeSelectedIds.size, 1);
  assert.equal(context.swingChangeResults.children.length, 1);
  context.confirm = () => true;
  context.removeSelectedSwingChangeFiles();
  assert.equal(context.swingChangeRecords.length, 1);
  assert.notEqual(context.swingChangeRecords[0].id, first.id);
  assert.equal(context.swingChangeSelectedIds.size, 0);
  assert.equal(context.swingChangeResults.children.length, 0);
  assert.equal(context.swingChangePdfBtn.disabled, true);
  assert.equal(context.swingChangeRemoveBtn.disabled, true);
  await context.loadSwingChangeFolder([firstFile]);
  assert.equal(context.swingChangeRecords.length, 2);
  assert.equal(context.swingChangeRecords.some(record => record.id === first.id), true);
  context.swingChangeRecords.forEach(record => context.setSwingChangeFileSelected(record.id, true));
  context.removeSelectedSwingChangeFiles();
  assert.equal(context.swingChangeRecords.length, 0);
  assert.equal(context.swingChangeCompareBtn.disabled, true);
  assert.match(context.swingChangeStatus.textContent, /0 files remain/);
});
