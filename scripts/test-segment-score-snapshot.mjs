import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const snapshotFunction = html.match(/  function syncSegmentScoreSnapshots\(\) \{[\s\S]*?\n  \}/);
assert.ok(snapshotFunction, 'score snapshot helper exists');

test('stored per-frame scores mirror canonical scores, not empty-metric estimates', () => {
  const context = vm.createContext({
    ANALYSIS_FRAME_IDS: ['frame1', 'frame2', 'frame3', 'frame4', 'frame5', 'frame6'],
    hasMetric: Number.isFinite,
    segmentScoreHistory: {
      frame1: 9.5, frame2: 7.5, frame3: 8, frame4: 8.5, frame5: 8.9, frame6: 9.3,
    },
    segmentDeltaHistory: {
      frame1: { segmentScores: { frame2: 5, frame3: 3.5, frame5: 3 } },
      frame2: { segmentScores: { frame2: 7.5, frame3: 3.5 } },
    },
  });
  vm.runInContext(snapshotFunction[0], context);
  context.syncSegmentScoreSnapshots();
  assert.equal(context.segmentDeltaHistory.frame1.segmentScores.frame2, 7.5);
  assert.equal(context.segmentDeltaHistory.frame1.segmentScores.frame3, 8);
  assert.equal(context.segmentDeltaHistory.frame1.segmentScores.frame5, 8.9);
  assert.equal(context.segmentDeltaHistory.frame2.segmentScores.frame3, 8);
  context.segmentScoreHistory.frame3 = null;
  context.syncSegmentScoreSnapshots();
  assert.equal(context.segmentDeltaHistory.frame1.segmentScores.frame3, null);
});
