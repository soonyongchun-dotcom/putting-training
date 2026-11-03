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
        getContext: () => ({ drawImage() {} }),
        toDataURL: () => 'data:image/jpeg;base64,test',
      }),
    },
    analysisWorkflowState: { index: 0 }, ANALYSIS_WORKFLOW_STEPS: [{ id: stage }],
    backswingActive: false, r10Analysis: { shots: [{}, {}] },
    analysisPanel: panel, r10AnalysisPanel: panel, frontFileInput: null,
    computeEstimatedCarryDistance: () => ({ estimateMeters: 225 }),
    downloadBackswingAnalysisPDF: async () => { backswingExports++; },
    getSwingUiText: (ko, en) => en, alert: message => alerts.push(message),
    console: { warn() {} },
  });
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
  assert.match(t.saved[0], /_r10_.*\.pdf$/);
});

test('distance PDF saves a stage-specific result', async () => {
  const t = setup('distance');
  await t.c.downloadAnalysisPDF();
  assert.match(t.saved[0], /_distance_.*\.pdf$/);
});

test('failed capture reports failure without saving a blank PDF and removes the clone', async () => {
  const t = setup('engine');
  t.c.html2canvas = async () => { throw new Error('capture failed'); };
  await t.c.downloadAnalysisPDF();
  assert.equal(t.alerts.length, 1);
  assert.equal(t.saved.length, 0);
  assert.equal(t.state().removed, true);
});
