import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const start = html.indexOf('  function getPosePathIndex(');
const end = html.indexOf('  function getMotionSearchRequest(', start);
assert.ok(start >= 0 && end > start);
const context = vm.createContext({ backswingActive: true, uiLanguage: 'en' });
vm.runInContext(html.slice(start, end), context);

function samples(heights, times = heights.map((_, index) => index * 0.12)) {
  return heights.map((handHeight, index) => ({
    time: times[index], handHeight, handX: 0, hipX: 0.5, hipY: 0.5,
  }));
}

const address = Array(8).fill(0);
const rise = [0.05, 0.15, 0.3, 0.5, 0.7, 0.9, 1, 1];
const fall = [0.8, 0.5, 0.2, 0, -0.1];

test('normal swing resolves top, backswing checkpoints and P5', () => {
  const input = samples([...address, ...rise, ...fall]);
  const top = context.findPoseTargetIndex(input, 'top');
  assert.ok(top >= 13 && top <= 16);
  const startIndex = context.findPoseTargetIndex(input, 'backswingStart');
  assert.ok(startIndex >= 6 && startIndex <= 9);
  let previous = startIndex;
  for (const target of ['backswing25', 'backswing50', 'backswing82', 'top', 'downswingP5']) {
    const index = context.findPoseTargetIndex(input, target);
    assert.ok(index >= previous && index < input.length, target);
    previous = index;
  }
});

test('early waggle does not restrict the real swing to the first 3.5 seconds', () => {
  const input = samples([...address, 0.16, 0.16, 0, ...Array(40).fill(0), ...rise, ...fall]);
  const top = context.findPoseTargetIndex(input, 'top');
  assert.ok(input[top].time > 6);
});

test('video ending in a held top is accepted without downswing', () => {
  const input = samples([...address, ...rise, ...Array(5).fill(1)]);
  assert.ok(context.findPoseTargetIndex(input, 'top') >= 13);
  assert.throws(() => context.findPoseTargetIndex(input, 'downswingP5'), /P5/);
  assert.throws(() => context.findPoseTargetIndex(input, 'downswing78'), /P6/);
});

test('still-rising or stationary footage is not reported as a top', () => {
  for (const heights of [Array(25).fill(0), [...address, 0.1, 0.3, 0.5, 0.7, 0.9]]) {
    assert.throws(() => context.findPoseTargetIndex(samples(heights), 'top'), /confirm the backswing/);
  }
});

test('irregular timestamps from missed detections still resolve the top', () => {
  const heights = [...address, ...rise, ...fall];
  const input = samples(heights, heights.map((_, index) => index * 0.12 + (index >= 10 ? 0.24 : 0)));
  assert.ok(context.findPoseTargetIndex(input, 'top') >= 13);
});

test('isolated tracking spike does not establish a backswing', () => {
  const input = samples([...address, 1, ...Array(10).fill(0)]);
  assert.equal(context.detectBackswingInterval(input, 0), null);
});

test('full-swing mode retains its existing target selection', () => {
  context.backswingActive = false;
  try {
    const input = samples([...address, ...rise, ...fall]);
    for (const target of ['address', 'top', 'downswing62', 'downswing78', 'preImpact', 'impact']) {
      const index = context.findPoseTargetIndex(input, target);
      assert.ok(Number.isInteger(index) && index >= 0 && index < input.length, target);
    }
  } finally {
    context.backswingActive = true;
  }
});
