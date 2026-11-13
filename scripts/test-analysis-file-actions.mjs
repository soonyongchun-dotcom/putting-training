import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const begin = html.indexOf('  async function downloadAnalysisPDF()');
const end = html.indexOf('  async function downloadBackswingAnalysisPDF()', begin);

function setup(stage) {
  const saved = [], alerts = [], captures = [];
  let removed = false, copied = false, backswingExports = 0;
  const targetCanvas = {
    id: 'r10DispersionCanvas',
    getContext: () => ({ drawImage() { copied = true; } }),
  };
  const clone = {
    style: {}, classList: { remove() {} },
    querySelector: () => null,
    querySelectorAll: selector => selector === 'canvas' ? [targetCanvas] : [],
    remove() { removed = true; },
  };
  const panel = {
    cloneNode: () => clone,
    querySelectorAll: () => [{ id: 'r10DispersionCanvas', width: 400, height: 300 }],
  };
  const c = vm.createContext({
    window: {
      jspdf: { jsPDF: class {
        internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } };
        addPage() {}
        addImage() {}
        save(name) { saved.push(name); }
      } },
      html2canvas: true,
    },
    html2canvas: async element => { captures.push(element); return { width: 800, height: 600 }; },
    document: {
      body: { appendChild() {} },
      getElementById: () => ({ textContent: 'swing.mp4' }),
      createElement: () => ({
        style: {}, append() {}, remove() {},
        click() { saved.push(this.download); },
        getContext: () => ({ drawImage() {}, save() {}, translate() {}, restore() {} }),
        toBlob: callback => callback({}),
        toDataURL: () => 'data:image/jpeg;base64,test',
      }),
    },
    analysisWorkflowState: { index: 0 }, ANALYSIS_WORKFLOW_STEPS: [{ id: stage }],
    backswingActive: false, r10Analysis: { shots: [{}, {}] },
    analysisPanel: panel, r10AnalysisPanel: panel, frontFileInput: null,
    swingChangePlayers: [{ id: 'player-1', name: 'Player One' }],
    swingChangePlayerIdSelect: { value: 'player-1', dataset: {} },
    analysisClubTypeSelect: { value: 'driver', selectedOptions: [{ textContent: 'Driver' }] },
    videoFileIdentity: { front: 'swing.mp4|1|1', side: 'side.mp4|2|2' },
    r10SourceName: 'launch.csv',
    getLocalDateInputValue: () => '2026-11-13',
    computeEstimatedCarryDistance: () => ({ estimateMeters: 225 }),
    downloadBackswingAnalysisPDF: async () => { backswingExports++; },
    expandPdfDetails() {},
    addCanvasToPdfPages() {},
    getSwingUiText: (ko, en) => en, alert: message => alerts.push(message),
    console: { warn() {} },
  });
  for (const name of ['sanitizeAnalysisFileNamePart', 'createAnalysisExportFileName']) {
    vm.runInContext(html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`))[0], c);
  }
  vm.runInContext(html.match(/  async function getAnalysisDownloadFileName\([\s\S]*?\n  }/)[0], c);
  vm.runInContext(html.slice(begin, end), c);
  return { c, saved, alerts, captures, state: () => ({ removed, copied, backswingExports }) };
}

test('backswing PDF uses its own report even when manual backswing mode is inactive', async () => {
  const t = setup('backswing');
  await t.c.downloadAnalysisPDF();
  assert.equal(t.state().backswingExports, 1);
  assert.equal(t.captures.length, 0);
});

test('distance PDF is withheld with an explicit message when required inputs are missing', async () => {
  const t = setup('distance');
  t.c.computeEstimatedCarryDistance = () => ({ missing: ['Body mass'] });
  await t.c.downloadAnalysisPDF();
  assert.match(t.alerts[0], /required inputs/);
  assert.equal(t.saved.length, 0);
});

test('R10 PDF is withheld until R10 analysis exists', async () => {
  const t = setup('r10');
  t.c.r10Analysis = null;
  await t.c.downloadAnalysisPDF();
  assert.match(t.alerts[0], /R10 CSV/);
  assert.equal(t.saved.length, 0);
});

test('R10 PDF copies the rendered chart and saves a stage-specific file', async () => {
  const t = setup('r10');
  await t.c.downloadAnalysisPDF();
  assert.equal(t.state().copied, true);
  assert.equal(t.state().removed, true);
  assert.equal(t.saved[0], 'Player_One-Driver-2026-11-13-launch_r10.pdf');
});

test('distance PDF saves a stage-specific result', async () => {
  const t = setup('distance');
  await t.c.downloadAnalysisPDF();
  assert.equal(t.saved[0], 'Player_One-Driver-2026-11-13-swing_distance.pdf');
});

test('failed capture reports failure without saving a blank PDF and removes the clone', async () => {
  const t = setup('engine');
  t.c.html2canvas = async () => { throw new Error('capture failed'); };
  await t.c.downloadAnalysisPDF();
  assert.equal(t.alerts.length, 1);
  assert.equal(t.saved.length, 0);
  assert.equal(t.state().removed, true);
});

test('backswing report uses the same prefix with the original side-video name', async () => {
  const t = setup('backswing');
  t.c.backswingClassification = {};
  t.c.backswingSourceIdentity = 'backswing.mp4|3|3';
  t.c.backswingResult = t.c.analysisPanel;
  t.c.uiLanguage = 'en';
  vm.runInContext(html.match(/  async function downloadBackswingAnalysisPDF\([\s\S]*?\n  }/)[0], t.c);
  await t.c.downloadAnalysisPDF();
  assert.equal(t.saved[0], 'Player_One-Driver-2026-11-13-backswing_backswing.pdf');
});

test('R10 profile report retains its report number after the shared filename prefix', async () => {
  const t = setup('r10');
  t.c.r10GeneratedReport = { profile: { n: 7 } };
  t.c.r10ReportSheet = t.c.analysisPanel;
  t.c.r10ReportPdfBtn = {};
  vm.runInContext(html.match(/  async function downloadR10SwingReportPDF\([\s\S]*?\n  }/)[0], t.c);
  await t.c.downloadR10SwingReportPDF();
  assert.equal(t.saved[0], 'Player_One-Driver-2026-11-13-launch_r10_profile_07_report.pdf');
  assert.equal(t.c.r10ReportPdfBtn.disabled, false);
});

test('frame PNG uses the selected side video and the shared filename prefix', async () => {
  const t = setup('engine');
  let handler;
  Object.assign(t.c, {
    saveFrameBtn: { addEventListener(event, callback) { handler = callback; } },
    selectedView: 'side',
    frontVideo: { paused: true, src: 'front', videoWidth: 640, videoHeight: 360 },
    sideVideo: { paused: true, src: 'side', videoWidth: 640, videoHeight: 360 },
    frontPoints: [], sidePoints: [{}], frontLines: [], sideLines: [],
    frontZoom: 1, sideZoom: 1,
    drawPointsOnFrame() {}, drawLinesOnFrame() {},
    URL: { createObjectURL: () => 'blob:frame', revokeObjectURL() {} },
  });
  vm.runInContext(html.match(/  saveFrameBtn\.addEventListener\('click', async \(\) => \{[\s\S]*?\n  \}\);/)[0], t.c);
  await handler();
  assert.equal(t.saved[0], 'Player_One-Driver-2026-11-13-side_frame_capture_side.png');
});

function setupComparison() {
  const t = setup('engine');
  const reports = [], pagination = [];
  Object.assign(t.c, {
    swingChangePdfBtn: {},
    swingChangeCompareBtn: {},
    swingChangeLoadBtn: {},
    swingChangeRemoveBtn: {},
    swingChangePdfExporting: false,
    swingChangeSelectedIds: new Set(['first', 'second']),
    swingChangeRecords: [
      { id: 'first', player_id: 'p2', playerName: 'Compared Player', clubType: 'iron',
        session_date: '2026-11-12', displayLabel: 'Compared Player - Iron - Nov 12', label: 'first.json' },
      { id: 'second', player_id: 'p2', playerName: 'Compared Player', clubType: 'iron',
        session_date: '2026-11-13', displayLabel: 'Compared Player - Iron - Nov 13', label: 'second.json' },
    ],
    swingChangeResults: { children: [{}], cloneNode: () => ({ children: [{ chart: true }, { table: true }] }) },
    addCanvasToPdfPages: (...args) => pagination.push(args),
  });
  t.c.document.createElement = () => {
    const element = {
      style: {}, children: [], append(...items) { this.children.push(...items); },
      querySelectorAll(selector) {
        return selector === 'details' ? this.children.filter(child => child.tagName === 'details') : [];
      },
      remove() { this.removed = true; },
    };
    reports.push(element);
    return element;
  };
  for (const [prefix, name] of [['function', 'expandPdfDetails'], ['function', 'updateSwingChangeCompareButton'], ['async function', 'downloadSwingChangePDF']]) {
    vm.runInContext(html.match(new RegExp(`  ${prefix} ${name}\\([\\s\\S]*?\\n  }`))[0], t.c);
  }
  return { ...t, reports, pagination };
}

test('comparison PDF includes displayed results and sources, using compared player rather than main selection', async () => {
  const t = setupComparison();
  await t.c.downloadSwingChangePDF();
  assert.equal(t.saved[0], 'Compared_Player-Iron-2026-11-13-first_swing_comparison.pdf');
  assert.equal(t.captures[0], t.reports[0]);
  assert.equal(t.pagination.length, 1);
  assert.deepEqual(t.reports[0].children.slice(-2), [{ chart: true }, { table: true }]);
  assert.match(t.reports[0].children[1].textContent, /\(first\.json\)/);
  assert.match(t.reports[0].children[2].textContent, /\(second\.json\)/);
  assert.equal(t.reports[0].removed, true);
  assert.equal(t.c.swingChangePdfBtn.disabled, false);
});

test('comparison PDF rejects absent results or libraries without saving', async () => {
  const t = setupComparison();
  t.c.swingChangeResults.children = [];
  await t.c.downloadSwingChangePDF();
  assert.match(t.alerts[0], /Compare selected files/);
  t.c.swingChangeResults.children = [{}];
  t.c.window.html2canvas = false;
  await t.c.downloadSwingChangePDF();
  assert.match(t.alerts[1], /libraries/);
  assert.equal(t.saved.length, 0);
  assert.equal(t.reports.length, 0);
});

test('comparison PDF expands cloned charts without opening the on-screen originals', async () => {
  const t = setupComparison();
  const originals = Array.from({ length: 5 }, (_, index) => ({ tagName: 'details', open: index === 0 }));
  const clones = originals.map(chart => ({ ...chart }));
  t.c.swingChangeResults.children = originals;
  t.c.swingChangeResults.cloneNode = () => ({ children: clones });
  t.c.html2canvas = async report => {
    assert.ok(report.querySelectorAll('details').every(chart => chart.open));
    assert.equal(report.querySelectorAll('details').length, 5);
    return { width: 800, height: 600 };
  };
  await t.c.downloadSwingChangePDF();
  assert.equal(t.saved.length, 1);
  assert.deepEqual(originals.map(chart => chart.open), [true, false, false, false, false]);
});

test('failed comparison PDF capture is explicit, cleans up and allows retry', async () => {
  const t = setupComparison();
  t.c.html2canvas = async () => {
    assert.equal(t.c.swingChangePdfBtn.disabled, true);
    throw new Error('capture failed');
  };
  await t.c.downloadSwingChangePDF();
  assert.match(t.alerts[0], /Could not create/);
  assert.equal(t.saved.length, 0);
  assert.equal(t.reports[0].removed, true);
  assert.equal(t.c.swingChangePdfBtn.disabled, false);
  assert.equal(t.c.swingChangePdfExporting, false);
});

function setupKeypointComparison(view = 'front') {
  const t = setup('engine');
  const collapsed = new Set(['collapsed']);
  const table = { style: {}, classList: { remove: value => collapsed.delete(value) } };
  const sections = ['summary', 'opinion', 'table'].map(kind => ({ kind, style: {} }));
  const removedControls = [];
  const report = {
    style: {}, children: [...sections], classList: { remove() {} },
    removeAttribute() {},
    prepend(...items) { this.children.unshift(...items); },
    append(...items) { this.children.push(...items); },
    querySelectorAll(selector) {
      if (selector === '*') return [...sections, table];
      if (selector === '.swing-compare-table-wrap') return [table];
      return [{ remove() { removedControls.push(selector); } }];
    },
    remove() { this.removed = true; },
  };
  let refreshed = false;
  Object.assign(t.c, {
    swingComparePdfBtn: { disabled: false },
    swingCompareView: view,
    SWING_COMPARE_PHASES: [{ id: 'address' }, { id: 'impact' }],
    computeSwingComparePhaseMetrics: phase => phase === 'address' ? {} : null,
    updateSwingCompareResults() { refreshed = true; },
    swingComparePanel: { cloneNode: () => report },
  });
  return { ...t, report, collapsed, removedControls, refreshed: () => refreshed };
}

for (const view of ['front', 'side']) {
  test(`A/B ${view} PDF exports summary, opinion and expanded six-phase table separately from swing history`, async () => {
    const t = setupKeypointComparison(view);
    await t.c.downloadSwingComparePDF();
    assert.equal(t.saved[0], `Player_One-Driver-2026-11-13-swing_ab_comparison_${view}.pdf`);
    assert.equal(t.refreshed(), true);
    assert.equal(t.captures[0], t.report);
    assert.deepEqual(t.report.children.slice(2, 5).map(node => node.kind), ['summary', 'opinion', 'table']);
    assert.match(t.report.children[0].textContent, view === 'side' ? /Side/ : /Front/);
    assert.match(t.report.children[1].textContent, /A: swing.mp4 · B: side.mp4/);
    assert.equal(t.collapsed.has('collapsed'), false);
    assert.match(t.removedControls[0], /swingChangeView/);
    assert.equal(t.report.removed, true);
    assert.equal(t.c.swingComparePdfBtn.disabled, false);
  });
}

test('A/B PDF refuses missing paired points, free comparison and unavailable libraries', async () => {
  const t = setupKeypointComparison();
  t.c.computeSwingComparePhaseMetrics = () => null;
  await t.c.downloadSwingComparePDF();
  assert.match(t.alerts[0], /Complete A\/B points/);
  t.c.computeSwingComparePhaseMetrics = () => ({});
  t.c.swingCompareView = 'free';
  await t.c.downloadSwingComparePDF();
  assert.match(t.alerts[1], /front or side comparison/);
  t.c.swingCompareView = 'front';
  t.c.window.jspdf = null;
  await t.c.downloadSwingComparePDF();
  assert.match(t.alerts[2], /libraries/);
  assert.equal(t.captures.length, 0);
  assert.equal(t.saved.length, 0);
});

test('A/B PDF capture failure cleans up, reports failure and restores its button', async () => {
  const t = setupKeypointComparison();
  t.c.html2canvas = async () => {
    assert.equal(t.c.swingComparePdfBtn.disabled, true);
    throw new Error('capture failed');
  };
  await t.c.downloadSwingComparePDF();
  assert.match(t.alerts[0], /Could not create the A\/B comparison PDF/);
  assert.equal(t.saved.length, 0);
  assert.equal(t.report.removed, true);
  assert.equal(t.c.swingComparePdfBtn.disabled, false);
});
