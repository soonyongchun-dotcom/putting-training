import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');

function setup() {
  const context = vm.createContext({
    clamp: (value, min, max) => Math.min(Math.max(value, min), max),
    hasMetric: value => typeof value === 'number' && Number.isFinite(value),
    crypto: { randomUUID },
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
    'sanitizeAnalysisFileNamePart', 'createAnalysisExportFileName',
    'getLocalDateInputValue', 'getSwingChangeScale', 'getBackswingHandPathPoints',
    'getEngineHandPathData', 'getEngineVerticalMotionData', 'createSwingChangeSnapshot',
    'createSwingChangeFileRecord', 'getFilteredSwingChangeRecords', 'setSwingChangeFileSelected',
    'renderSwingChangeRecordList',
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

test('reading saved frame inputs preserves the existing live graph output', () => {
  const context = setup();
  const project = makeProject();
  context.frameStateHistory = project.analysis.frameStateHistory;
  context.areVideoSourcesSame = () => true;
  assert.equal(JSON.stringify(context.getEngineHandPathData()), JSON.stringify(context.getEngineHandPathData(project)));
  assert.equal(JSON.stringify(context.getEngineVerticalMotionData('xy')), JSON.stringify(context.getEngineVerticalMotionData('xy', project)));
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

class Element {
  children = [];
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  addEventListener() {}
}

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
  assert.equal(context.swingChangeRecords[0].id, 'folder/good.json');
  assert.match(context.swingChangeStatus.textContent, /broken\.json/);
  assert.match(context.swingChangeStatus.textContent, /oversized\.json/);
  assert.equal(errors.length, 2);
  assert.equal(context.swingChangeLoadBtn.disabled, false);
});
