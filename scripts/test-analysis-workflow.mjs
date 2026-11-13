import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const start = html.indexOf('  const ANALYSIS_WORKFLOW_STEPS =');
const end = html.indexOf('\n</script>', start);
assert.ok(start > 0 && end > start);

test('workflow does not forcibly hide the title-triggered swing profile introduction', () => {
  assert.doesNotMatch(html, /body\[data-workflow-stage\] #appIntroPanel/);
  assert.match(html, /appIntroToggleBtn\.addEventListener\('click', \(\) => setAppIntroOpen\(appIntroPanel.hidden\)\)/);
});

test('A/B comparison remains accessible outside the stage-specific analysis toolbar', () => {
  assert.match(html, /workflowFiles\.append\(swingCompareToggleBtn\)/);
  assert.doesNotMatch(html, /body\[data-workflow-stage\] #swingCompare(?:Panel|ToggleBtn)/);
  assert.match(html, /body\[data-swing-compare="active"\] #analysisVideoWorkspace/);
  assert.match(html, /body\[data-swing-compare="active"\] #sideWrapper/);
  assert.match(html, /body\[data-swing-compare="active"\] #analysisWorkflowFiles > :not\(#swingCompareToggleBtn\)/);
  assert.match(html, /id="analysisContextBtn"/);
});

test('comparison can open before video upload and closes without losing the selected workflow stage', () => {
  const element = () => ({ textContent: '', classList: { toggle() {} }, setAttribute(key, value) { this[key] = value; } });
  const c = vm.createContext({
    document: { body: { dataset: { workflowStage: 'backswing' } } },
    backswingActive: true, swingCompareActive: false, frontVideo: {}, sideVideo: {},
    stanceReferenceActive: true, stanceReferencePendingPoints: [{}],
    stanceReferenceBtn: element(), statusSpan: element(), swingComparePanel: element(),
    analysisContextDialog: { open: false, close() { this.open = false; } },
    swingCompareToggleBtn: element(), swingCompareStatus: element(),
    distanceMeasureActive: true, distanceReferenceActive: true,
    cancelPointer() {}, translateUiText: text => text, getSwingUiText: (ko, en) => en,
    setBackswingMode(active) { c.backswingActive = active; },
    showGuide() {}, updateSwingCompareGuide() {}, redrawSwingCompareOverlays() {}, updateSwingComparePresentation() {},
  });
  vm.runInContext(html.match(/  function toggleSwingCompareMode\(\)[\s\S]*?\n  }/)[0], c);
  c.analysisContextDialog.open = true;
  c.toggleSwingCompareMode();
  assert.equal(c.swingCompareActive, true);
  assert.equal(c.analysisContextDialog.open, false);
  assert.equal(c.document.body.dataset.swingCompare, 'active');
  assert.equal(c.backswingActive, false);
  assert.equal(c.stanceReferenceActive, false);
  assert.equal(c.swingCompareToggleBtn['aria-pressed'], 'true');
  assert.match(c.swingCompareStatus.textContent, /Load the swings/);
  c.toggleSwingCompareMode();
  assert.equal(c.document.body.dataset.swingCompare, undefined);
  assert.equal(c.document.body.dataset.workflowStage, 'backswing');
  assert.equal(c.swingCompareToggleBtn['aria-pressed'], 'false');
});

function setup() {
  const elements = new Map();
  const element = () => ({
    hidden: false, open: false, textContent: '', children: [], listeners: {}, dataset: {},
    setAttribute() {}, removeAttribute(name) { if (name === 'data-workflow-stage') delete this.dataset.workflowStage; },
    scrollIntoView() { this.scrolled = true; }, click() { this.clicked = true; },
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
    addEventListener(event, callback) { this.listeners[event] = callback; },
  });
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const c = vm.createContext({
    console, analysisWorkflowState: null, computing2dCorrectionScenario: false,
    crossCorrectionMode: 'roll', stanceReferenceLineFront: null,
    window: { syncCrossCorrectionAnalysisSources() { c.sourceSyncCount = (c.sourceSyncCount || 0) + 1; } },
    updateSwingComparePresentation() {},
    renderCrossViewDiagnostics() {},
    update2dCorrectionDiagnostics() { c.diagnosticUpdateCount = (c.diagnosticUpdateCount || 0) + 1; },
    get2dVirtualCorrectionScenario: () => null,
    getCrossCorrectionScenario: () => null,
    document: { getElementById: get, createElement: element, body: element() },
    getSwingUiText: (ko, en) => en, languageSelect: null,
    backswingActive: false, backswingClassification: null, swingCompareActive: false,
    stanceReferenceActive: false, stanceReferencePendingPoints: [], statusSpan: element(),
    stanceReferenceBtn: element(), translateUiText: text => text, cancelPointer() {},
    r10Analysis: null, r10SourceName: '',
    getBackswingProfileCode: result => result?.profileCode || null,
    getSwingTypeReadiness: () => ({ ready: false, missing: ['F1–F4 points required'] }),
    getDistanceMotionSummary: () => ({ complete: false, score: null }),
    formatDistanceMotionSummary: () => 'Distance Motion Average: 8.0 / 10',
    classifySwingType: () => null,
    getPowerEngineDecision: result => result?.decision || null,
    computeEstimatedCarryDistance: () => ({ missing: ['Body mass', 'Backswing', 'Engine'] }),
    analysisPanel: { ...element(), classList: { contains: () => false } },
    r10AnalysisPanel: element(), r10EvaluationToggleBtn: element(),
    drawR10Dispersion() {},
    toggleSwingCompareMode() { c.swingCompareActive = !c.swingCompareActive; },
    setBackswingMode(active) { c.backswingActive = active; },
  });
  vm.runInContext(html.slice(start, end), c);
  c.actualOpenAnalysisWorkflowStage = c.openAnalysisWorkflowStage;
  c.openedStages = [];
  c.openAnalysisWorkflowStage = index => c.openedStages.push(index);
  return { c, get };
}

test('compact bar replaces duplicate workflow navigation and question', () => {
  const { c, get } = setup();
  assert.equal(c.analysisWorkflowState.index, 0);
  assert.equal(get('analysisWorkflowProgress').children.length, 6);
  assert.match(html, /id: 'backswing', ko: '백스윙 유형 분석', en: 'Backswing type analysis'/);
  assert.match(html, /aria-label="백스윙 유형 분석"/);
  assert.match(html, /id="backswingToggleBtn"[^>]*>백스윙 유형 분석/);
  assert.doesNotMatch(html, /백스윙 유형 결정/);
  assert.match(html, /ko: '비거리 모션 분석'/);
  assert.match(html, /ko: '스윙 유형 분석'/);
  assert.match(html, /id: 'correction', ko: '2D 왜곡 보정 분석'/);
  assert.match(html, /<summary>2D 왜곡 보정 분석<\/summary>/);
  assert.match(html, /body\[data-workflow-stage="correction"\] #analysisPanelBody > :not\(#analysis2dDiagnostics\)/);
  assert.match(html, /body\[data-workflow-stage="swingtype"\] #analysisSwingType > \.analysis-power-summary/);
  assert.match(html, /current\.id === 'swingtype'[\s\S]*스윙유형 추정 근거/);
  assert.match(html, /data-workflow-for="swingtype">[\s\S]*?id="analysisTypeReference"/);
  assert.match(html, /data-workflow-for="engine swingtype distance r10 correction"/);
  assert.doesNotMatch(html, /id="analysisWorkflow(?:Start|Yes|Skip|Open|Check|Next|Back|Return|Question|Prerequisites|Results)"/);
  assert.match(html, /ver 26\.1105-f1-ad/);
});

test('every progress button directly opens the selected analysis', () => {
  const { c, get } = setup();
  for (const index of [1, 2, 3, 4, 5, 0]) {
    get('analysisWorkflowProgress').children[index].children[0].listeners.click();
    assert.equal(c.analysisWorkflowState.index, index);
    assert.equal(c.openedStages.at(-1), index);
  }
});

test('live statuses change from pending to active to complete and invalidate correctly', () => {
  const { c, get } = setup();
  const statuses = () => get('analysisWorkflowProgress').children.map(item => item.children[0].dataset.status);
  assert.deepEqual(statuses(), ['pending', 'pending', 'pending', 'pending', 'pending', 'pending']);
  c.selectAnalysisWorkflowStage(0);
  assert.deepEqual(statuses(), ['active', 'pending', 'pending', 'pending', 'pending', 'pending']);
  c.backswingClassification = { profileCode: 'OPA' };
  c.refreshAnalysisWorkflow();
  assert.deepEqual(statuses(), ['complete', 'pending', 'pending', 'pending', 'pending', 'pending']);
  c.selectAnalysisWorkflowStage(4);
  c.r10Analysis = { shots: [{}, {}] };
  c.refreshAnalysisWorkflow();
  assert.deepEqual(statuses(), ['complete', 'pending', 'pending', 'pending', 'complete', 'pending']);
  c.backswingClassification = null;
  c.refreshAnalysisWorkflow();
  assert.deepEqual(statuses(), ['active', 'pending', 'pending', 'pending', 'complete', 'pending']);
  assert.equal(c.analysisWorkflowState.index, 4);
});

test('switching completed stages preserves data without auto advancing', () => {
  const { c } = setup();
  const classification = { profileCode: 'OPA' };
  c.backswingClassification = classification;
  c.selectAnalysisWorkflowStage(0);
  c.selectAnalysisWorkflowStage(3);
  c.selectAnalysisWorkflowStage(0);
  assert.equal(c.backswingClassification, classification);
  assert.equal(c.analysisWorkflowState.index, 0);
});

test('opening engine or R10 preserves current frame and partial inputs', () => {
  const { c } = setup();
  c.selectedSegment = 'frame3';
  const points = [{ x: 0.1, y: 0.2 }];
  c.frontPoints = points;
  c.swingCompareActive = true;
  c.actualOpenAnalysisWorkflowStage(1);
  assert.equal(c.swingCompareActive, false);
  c.backswingActive = true;
  c.actualOpenAnalysisWorkflowStage(4);
  assert.equal(c.backswingActive, false);
  assert.equal(c.r10AnalysisPanel.hidden, false);
  assert.equal(c.selectedSegment, 'frame3');
  assert.equal(c.frontPoints, points);
});

test('motion, swing-type and distance steps report their own required evidence', () => {
  const { c } = setup();
  assert.equal(c.getAnalysisWorkflowResult('engine').ready, false);
  c.getDistanceMotionSummary = () => ({ complete: true, score: 8 });
  assert.match(c.getAnalysisWorkflowResult('engine').text, /Distance Motion Average/);
  assert.match(c.getAnalysisWorkflowResult('engine').text, /supplemental/);
  assert.equal(c.getAnalysisWorkflowResult('swingtype').ready, false);
  c.getSwingTypeReadiness = () => ({ ready: true });
  c.classifySwingType = () => ({ decision: { code: 'RLH' }, pct: { type1: 40, type2: 35, type3: 25 } });
  assert.match(c.getAnalysisWorkflowResult('swingtype').text, /RLH/);
  assert.equal(c.getAnalysisWorkflowResult('distance').ready, false);
  c.computeEstimatedCarryDistance = () => ({ estimateMeters: 225 });
  assert.match(c.getAnalysisWorkflowResult('distance').text, /225.0 m/);
});

test('2D correction is its own final stage and reports correction readiness', () => {
  const { c, get } = setup();
  assert.equal(c.getAnalysisWorkflowResult('correction').ready, false);
  get('analysis2dDiagnostics').open = true;
  c.crossCorrectionMode = 'cross';
  c.getCrossCorrectionScenario = () => ({ unavailable: null });
  assert.equal(c.getAnalysisWorkflowResult('correction').ready, true);
  c.getCrossCorrectionScenario = () => ({ unavailable: 'Matched front and side inputs are required.' });
  assert.equal(c.getAnalysisWorkflowResult('correction').ready, false);

  get('analysis2dDiagnostics').open = false;
  c.actualOpenAnalysisWorkflowStage(5);
  assert.equal(get('analysis2dDiagnostics').open, true);
  assert.equal(get('crossCorrectionSetup').open, true);
  assert.equal(c.sourceSyncCount, 1, 'entering correction synchronizes analysis video files even if details were already open');
  assert.equal(get('analysis2dDiagnostics').scrolled, true);
  assert.equal(c.diagnosticUpdateCount, 1);
});

test('errors remain visible without removed navigation controls', () => {
  const { c, get } = setup();
  c.console = { error() {} };
  c.getAnalysisWorkflowResult = () => { throw new Error('test calculation error'); };
  c.selectAnalysisWorkflowStage(0);
  assert.match(get('analysisWorkflowStatus').textContent, /test calculation error/);
  assert.equal(get('analysisWorkflowStatus').hidden, false);
});

test('virtual correction does not change progress presentation', () => {
  const { c, get } = setup();
  const progress = get('analysisWorkflowProgress').children;
  c.computing2dCorrectionScenario = true;
  c.refreshAnalysisWorkflow();
  assert.equal(get('analysisWorkflowProgress').children, progress);
});

test('cancelled reset preserves analysis presentation', () => {
  const { c } = setup();
  const state = c.analysisWorkflowState;
  const begin = html.indexOf('  function resetAll() {');
  vm.runInContext(html.slice(begin, html.indexOf('\n  let frontPoints =', begin)), c);
  c.confirm = () => false;
  c.resetAll();
  assert.equal(c.analysisWorkflowState, state);
});

test('reviewing completed backswing does not request another video', () => {
  const { c } = setup();
  c.backswingClassification = { profileCode: 'OPA' };
  let prompt;
  c.setBackswingMode = (active, options) => { prompt = options.promptForVideo; };
  c.renderBackswingClassification = () => {};
  c.actualOpenAnalysisWorkflowStage(0);
  assert.equal(prompt, false);
});

test('workflow notice explains shared frame inputs in motion and swing-type steps', () => {
  const { c, get } = setup();
  c.selectAnalysisWorkflowStage(1);
  assert.match(get('analysisWorkflowEngineNotice').textContent, /same swing into A and B/);
  c.selectAnalysisWorkflowStage(2);
  assert.match(get('analysisWorkflowEngineNotice').textContent, /return to distance-motion analysis/);
  c.selectAnalysisWorkflowStage(3);
  assert.equal(get('analysisWorkflowEngineNotice').hidden, true);
});

test('distance missing data remains a small reference below inputs', () => {
  const { c, get } = setup();
  const begin = html.indexOf('  function renderEstimatedCarryDistance(');
  vm.runInContext(html.slice(begin, html.indexOf('\n  function ', begin + 1)), c);
  c.renderEstimatedCarryDistance(get('distanceEstimateResult'));
  const note = get('distanceEstimateResult').children[0];
  assert.equal(note.className, 'analysis-distance-missing');
  assert.match(note.textContent, /Body mass\nBackswing\nEngine/);
});

test('R10 upload opens existing CSV picker', () => {
  const { get } = setup();
  get('r10UploadBtn').listeners.click();
  assert.equal(get('r10CsvInput').clicked, true);
});

test('switching stages cancels unfinished stance selection and clears its stale message', () => {
  const { c } = setup();
  c.stanceReferenceActive = true;
  c.stanceReferencePendingPoints = [{ x: 0.1, y: 0.2 }];
  c.statusSpan.textContent = 'Select stance endpoints';
  c.actualOpenAnalysisWorkflowStage(4);
  assert.equal(c.stanceReferenceActive, false);
  assert.equal(c.stanceReferencePendingPoints.length, 0);
  assert.equal(c.statusSpan.textContent, '');
});
