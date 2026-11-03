import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const begin = html.indexOf('  function invalidateLinkedAnalysisReports()');
const end = html.indexOf("  document.getElementById('analysisWorkflowReset').addEventListener", begin);
function setup(id) {
  const control = () => ({ value: 'retained', textContent: '', disabled: false, hidden: false,
    style: {}, setAttribute() {}, replaceChildren() {} });
  const calls = [];
  const c = vm.createContext({
    computing2dCorrectionScenario: false, linkedAnalysisReportsReady: true,
    r10GeneratedReport: { old: true }, r10ReportPreview: control(),
    geminiReportLanguage: 'ko', geminiReportBlock: control(),
    analysisWorkflowState: { index: 0 }, ANALYSIS_WORKFLOW_STEPS: [{ id }],
    analysisGeneration: 0, distanceEstimateMuscleAnchor: { old: true },
    getSwingUiText: (ko, en) => en, confirm: () => true,
    analysisKnownDistanceInput: control(), analysisBodyMassInput: control(),
    geminiAnalysisBtn: control(), languageSelect: control(),
    r10ClearBtn: { click: () => calls.push('clear-r10') },
    document: { getElementById: control },
    pauseBothVideos() {}, cancelPointer() {},
    resetBackswing: () => calls.push('reset-backswing'),
    refreshScoresForBackswingEvidence: () => calls.push('scores'),
    refreshSwingClassificationViews: () => calls.push('views'),
    update2dCorrectionDiagnostics() {}, checkButtonsEnabled() {},
    refreshAnalysisWorkflow() {}, openAnalysisWorkflowStage: () => calls.push('open'),
    motionAnalysisFrame: null, frameStateHistory: { front: { old: true }, side: { old: true } },
    analysisSegmentSelect: control(), distanceReferenceBtn: control(), distanceMeasureBtn: control(),
    stanceReferenceBtn: control(), translateUiText: text => text,
    frontVideo: {}, sideVideo: {}, frontCanvas: {}, sideCanvas: {}, frontCtx: {}, sideCtx: {},
    frontZoom: 1, sideZoom: 1,
    clearDerivedAnalysisState: () => calls.push('derived'),
    clearAnalysisResults() {}, resetViewAnalysis() {}, updateAllFramesMetricBar() {},
    showGuide() {}, drawOverlay() {},
  });
  vm.runInContext(html.slice(begin, end), c);
  return { c, calls };
}
for (const id of ['backswing', 'engine', 'distance', 'r10']) {
  test(`${id} reset clears only its inputs and invalidates linked outputs`, () => {
    const { c, calls } = setup(id);
    c.resetCurrentAnalysisStage();
    assert.equal(c.analysisBodyMassInput.value, 'retained');
    assert.equal(c.r10GeneratedReport, null);
    assert.equal(c.r10ReportPreview.hidden, true);
    assert.equal(c.geminiReportBlock.textContent, '');
    assert.equal(c.distanceEstimateMuscleAnchor, null);
    assert.ok(calls.includes('scores'));
    assert.ok(calls.includes('views'));
    if (id === 'backswing') assert.ok(calls.includes('reset-backswing'));
    if (id === 'engine') {
      assert.equal(Object.keys(c.frameStateHistory.front).length, 0);
      assert.equal(c.selectedSegment, 'frame1');
      assert.ok(calls.includes('derived'));
    }
    if (id === 'distance') assert.equal(c.analysisKnownDistanceInput.value, '');
    if (id === 'r10') assert.ok(calls.includes('clear-r10'));
  });
}
test('cancelled reset leaves input and report untouched', () => {
  const { c, calls } = setup('distance');
  c.confirm = () => false;
  c.resetCurrentAnalysisStage();
  assert.equal(c.analysisKnownDistanceInput.value, 'retained');
  assert.notEqual(c.r10GeneratedReport, null);
  assert.equal(calls.length, 0);
});
