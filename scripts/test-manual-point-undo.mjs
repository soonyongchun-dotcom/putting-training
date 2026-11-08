import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const point = (type, x, y) => ({ type, x, y });
const clone = value => JSON.parse(JSON.stringify(value));

function setup(points = [point('wrist', 0.5, 0.5)]) {
  const context = vm.createContext({
    analysisFramePointUndoBtn: { disabled: true },
    framePointUndoStack: [],
    selectedSegment: 'frame1',
    frameEditMode: true,
    guideView: 'front',
    guideStep: 1,
    frontPoints: clone(points),
    frontLines: [],
    sidePoints: [],
    sideLines: [],
    frontVideo: {},
    sideVideo: {},
    frontCanvas: {},
    sideCanvas: {},
    frontCtx: {},
    sideCtx: {},
    frontZoom: 1,
    sideZoom: 1,
    frameStateHistory: { front: {}, side: {} },
    motionAnalysisFrame: null,
    getAutoPointType: current => current.length < 3 ? ['club', 'shoulder'][current.length - 1] : null,
    getNormalizedCoords: () => ({ x: 0.505, y: 0.5 }),
    saveFrameInputState(view) {
      const isFront = view === 'front';
      context.frameStateHistory[view][context.selectedSegment] = {
        points: clone(isFront ? context.frontPoints : context.sidePoints),
        lines: clone(isFront ? context.frontLines : context.sideLines),
      };
    },
    update2dCorrectionDiagnostics() {},
    drawOverlay() {},
    getGuideStepForPoints: current => current.length + 1,
    getFrameMaxPoints: () => 3,
    showGuide() { context.updateFramePointUndoButton(); },
    areFramePointsComplete: () => false,
    getVideoMetrics: () => ({ drawWidth: 1000, drawHeight: 500 }),
    switchToSegment(segment, view) {
      context.selectedSegment = segment;
      context.guideView = view;
      for (const targetView of ['front', 'side']) {
        const isFront = targetView === 'front';
        const state = context.frameStateHistory[targetView][segment];
        context[isFront ? 'frontPoints' : 'sidePoints'] = clone(state?.points || []);
        context[isFront ? 'frontLines' : 'sideLines'] = clone(state?.lines || []);
      }
    },
  });
  for (const name of [
    'findNearestPointIndex', 'recordFramePointUndo', 'updateFramePointUndoButton',
    'clearFramePointUndoHistory', 'undoLastFramePointSelection', 'addPoint',
    'deletePoint', 'onCanvasClick',
  ]) {
    const source = html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`));
    assert.ok(source, name);
    vm.runInContext(source[0], context);
  }
  return context;
}

test('a nearby left-click adds the next landmark without deleting the prior point and can be undone', () => {
  const c = setup();
  const existing = clone(c.frontPoints[0]);
  const canvas = { getBoundingClientRect: () => ({ width: 1000, height: 500 }) };
  c.onCanvasClick({ preventDefault() {} }, c.frontPoints, c.frontLines, c.frontCtx,
    canvas, c.frontVideo, () => 1, 'front');

  assert.deepEqual(clone(c.frontPoints[0]), existing);
  assert.equal(c.frontPoints.length, 2);
  assert.equal(c.frontPoints[1].type, 'club');
  assert.equal(c.analysisFramePointUndoBtn.disabled, false);

  c.undoLastFramePointSelection();
  assert.deepEqual(clone(c.frontPoints), [existing]);
  assert.equal(c.analysisFramePointUndoBtn.disabled, true);
});

test('undo restores a point removed explicitly in the current frame', () => {
  const c = setup();
  const original = clone(c.frontPoints);
  const canvas = { getBoundingClientRect: () => ({ width: 1000, height: 500 }) };
  assert.equal(c.deletePoint(c.frontPoints, c.frontLines, { x: 0.5, y: 0.5 }, c.frontCtx,
    canvas, c.frontVideo, 1, 0.03, 'front'), true);
  assert.equal(c.frontPoints.length, 0);

  c.undoLastFramePointSelection();
  assert.deepEqual(clone(c.frontPoints), original);
  assert.equal(c.analysisFramePointUndoBtn.disabled, true);
});

test('undo remains available across automatic frame advance and returns to the last selection', () => {
  const c = setup();
  c.recordFramePointUndo('front', c.frontPoints, c.frontLines);
  c.selectedSegment = 'frame2';
  c.updateFramePointUndoButton();
  assert.equal(c.analysisFramePointUndoBtn.disabled, false);

  c.undoLastFramePointSelection();
  assert.equal(c.selectedSegment, 'frame1');
  assert.deepEqual(clone(c.frontPoints), [point('wrist', 0.5, 0.5)]);
  assert.equal(c.framePointUndoStack.length, 0);
  assert.equal(c.analysisFramePointUndoBtn.disabled, true);
});
