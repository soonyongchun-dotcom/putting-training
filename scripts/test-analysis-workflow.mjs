import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const start = html.indexOf('  const ANALYSIS_WORKFLOW_STEPS =');
const end = html.indexOf('\n</script>', start);
assert.ok(start > 0 && end > start);

function setup() {
  const elements = new Map();
  const element = () => ({
    hidden: false, textContent: '', children: [], listeners: {}, dataset: {},
    setAttribute() {}, removeAttribute(name) { if (name === 'data-workflow-stage') delete this.dataset.workflowStage; },
    scrollIntoView() {}, click() { this.clicked = true; },
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
    document: { getElementById: get, createElement: element, body: element() },
    getSwingUiText: (ko, en) => en, languageSelect: null,
    backswingActive: false, backswingClassification: null, swingCompareActive: false,
    stanceReferenceActive: false, stanceReferencePendingPoints: [], statusSpan: element(),
    stanceReferenceBtn: element(), translateUiText: text => text, cancelPointer() {},
    r10Analysis: null, r10SourceName: '',
    getBackswingProfileCode: result => result?.profileCode || null,
    getSwingTypeReadiness: () => ({ ready: false, missing: ['F1–F4 points required'] }),
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
  assert.equal(get('analysisWorkflowProgress').children.length, 4);
  assert.doesNotMatch(html, /id="analysisWorkflow(?:Start|Yes|Skip|Open|Check|Next|Back|Return|Question|Prerequisites|Results)"/);
  assert.match(html, /ver 26\.1103-f-ad/);
});

test('every progress button directly opens the selected analysis', () => {
  const { c, get } = setup();
  for (const index of [1, 2, 3, 0]) {
    get('analysisWorkflowProgress').children[index].children[0].listeners.click();
    assert.equal(c.analysisWorkflowState.index, index);
    assert.equal(c.openedStages.at(-1), index);
  }
});

test('live statuses change from pending to active to complete and invalidate correctly', () => {
  const { c, get } = setup();
  const statuses = () => get('analysisWorkflowProgress').children.map(item => item.children[0].dataset.status);
  assert.deepEqual(statuses(), ['pending', 'pending', 'pending', 'pending']);
  c.selectAnalysisWorkflowStage(0);
  assert.deepEqual(statuses(), ['active', 'pending', 'pending', 'pending']);
  c.backswingClassification = { profileCode: 'OPA' };
  c.refreshAnalysisWorkflow();
  assert.deepEqual(statuses(), ['complete', 'pending', 'pending', 'pending']);
  c.selectAnalysisWorkflowStage(3);
  c.r10Analysis = { shots: [{}, {}] };
  c.refreshAnalysisWorkflow();
  assert.deepEqual(statuses(), ['complete', 'pending', 'pending', 'complete']);
  c.backswingClassification = null;
  c.refreshAnalysisWorkflow();
  assert.deepEqual(statuses(), ['active', 'pending', 'pending', 'complete']);
  assert.equal(c.analysisWorkflowState.index, 3);
});

test('switching completed stages preserves data without auto advancing', () => {
  const { c } = setup();
  const classification = { profileCode: 'OPA' };
  c.backswingClassification = classification;
  c.selectAnalysisWorkflowStage(0);
  c.selectAnalysisWorkflowStage(2);
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
  c.actualOpenAnalysisWorkflowStage(3);
  assert.equal(c.backswingActive, false);
  assert.equal(c.r10AnalysisPanel.hidden, false);
  assert.equal(c.selectedSegment, 'frame3');
  assert.equal(c.frontPoints, points);
});

test('engine and distance readiness still require actual evidence', () => {
  const { c } = setup();
  assert.equal(c.getAnalysisWorkflowResult('engine').ready, false);
  c.getSwingTypeReadiness = () => ({ ready: true });
  c.classifySwingType = () => ({ decision: { code: 'RLH' }, pct: { type1: 40, type2: 35, type3: 25 } });
  assert.match(c.getAnalysisWorkflowResult('engine').text, /RLH/);
  assert.equal(c.getAnalysisWorkflowResult('distance').ready, false);
  c.computeEstimatedCarryDistance = () => ({ estimateMeters: 225 });
  assert.match(c.getAnalysisWorkflowResult('distance').text, /225.0 m/);
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

test('engine notice is displayed only in engine stage', () => {
  const { c, get } = setup();
  c.selectAnalysisWorkflowStage(1);
  assert.match(get('analysisWorkflowEngineNotice').textContent, /same swing video into both A and B/);
  c.selectAnalysisWorkflowStage(2);
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
  c.actualOpenAnalysisWorkflowStage(3);
  assert.equal(c.stanceReferenceActive, false);
  assert.equal(c.stanceReferencePendingPoints.length, 0);
  assert.equal(c.statusSpan.textContent, '');
});
