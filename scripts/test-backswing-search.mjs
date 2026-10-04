import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const start = html.indexOf('  function getPosePathIndex(');
const end = html.indexOf('  async function findVideoPosition(', start);
assert.ok(start >= 0 && end > start);
const context = vm.createContext({
  backswingActive: true, uiLanguage: 'en',
  backswingPhaseSelect: { value: 'address' }, selectedSegment: 'frame1',
});
vm.runInContext(html.slice(start, end), context);
const featureStart = html.indexOf('  function getPoseMotionFeatures(');
const featureEnd = html.indexOf('  async function scanVideoPoses(', featureStart);
assert.ok(featureStart >= 0 && featureEnd > featureStart);
vm.runInContext(html.slice(featureStart, featureEnd), context);

function samples(heights, times = heights.map((_, index) => index * 0.12)) {
  return heights.map((handHeight, index) => ({
    time: times[index], handHeight, handX: 0, hipX: 0.5, hipY: 0.5,
  }));
}

const address = Array(8).fill(0);
const rise = [0.05, 0.15, 0.3, 0.5, 0.7, 0.9, 1, 1];
const fall = [0.8, 0.5, 0.2, 0, -0.1];

test('side-view address remains trackable when either wrist is occluded', () => {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  landmarks[11].y = landmarks[12].y = 0.3;
  landmarks[15].y = landmarks[16].y = 0.55;
  for (const occluded of [15, 16]) {
    landmarks[15].visibility = landmarks[16].visibility = 1;
    landmarks[occluded].visibility = 0.1;
    const features = context.getPoseMotionFeatures(landmarks);
    assert.ok(features);
    assert.ok(Math.abs(features.handHeight + 0.25) < 1e-9);
  }
  landmarks[15].visibility = landmarks[16].visibility = 0.1;
  assert.equal(context.getPoseMotionFeatures(landmarks), null);
});

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

test('both modes use the same confirmed top despite an early small peak', () => {
  const input = samples([...address, 0.05, 0.16, 0.06, 0, ...address, ...rise, ...fall]);
  const backswingTop = context.findPoseTargetIndex(input, 'top');
  context.backswingActive = false;
  try {
    const top = context.findPoseTargetIndex(input, 'top');
    assert.equal(top, backswingTop);
    assert.ok(top >= 25 && top <= 28);
    for (const target of ['backswingStart', 'backswing25', 'backswing50', 'backswing82']) {
      const index = context.findPoseTargetIndex(input, target);
      assert.ok(index < top, target);
    }
    for (const target of ['downswingP5', 'downswing62', 'downswing78', 'preImpact', 'impact']) {
      const index = context.findPoseTargetIndex(input, target);
      assert.ok(index > top && index < input.length, target);
    }
  } finally {
    context.backswingActive = true;
  }
});

test('frame targets never fall back to a held top without a downswing', () => {
  const input = samples([...address, ...rise, ...Array(5).fill(1)]);
  context.backswingActive = false;
  try {
    for (const target of ['downswing62', 'downswing78', 'preImpact', 'impact']) {
      assert.throws(() => context.findPoseTargetIndex(input, target), /Include the downswing/);
    }
  } finally {
    context.backswingActive = true;
  }
});

test('downswing trough and rebound work even when address-height return is missed', () => {
  const input = samples([...Array(8).fill(-0.3), ...rise, 0.9, 0.65, 0.2, 0.7, 1.2, 1.3]);
  const top = context.findPoseTargetIndex(input, 'top');
  const end = context.getDownswingInterval(input, top, -0.3);
  assert.ok(end.hasImpactEvidence);
  assert.equal(input[end.endIndex].handHeight, 0.2);
  for (const target of ['downswingP5', 'downswing62', 'downswing78', 'preImpact', 'impact']) {
    const index = context.findPoseTargetIndex(input, target);
    assert.ok(index > top && index <= end.endIndex, target);
  }
});

test('partial downswing permits intermediate targets but not an unobserved impact', () => {
  const input = samples([...address, ...rise, 0.9, 0.65, 0.4]);
  const top = context.findPoseTargetIndex(input, 'top');
  assert.ok(context.findPoseTargetIndex(input, 'downswing62') > top);
  for (const target of ['preImpact', 'impact']) {
    assert.throws(() => context.findPoseTargetIndex(input, target), /Include the downswing/);
  }
});

test('P phases and F frame A/B requests stay on their intended side of the top', () => {
  const input = samples([...address, ...rise, ...fall]);
  const top = context.findPoseTargetIndex(input, 'top');
  try {
    context.backswingActive = true;
    for (const phase of ['p1', 'p2', 'p3', 'p4', 'transition', 'downP6']) {
      context.backswingPhaseSelect.value = phase;
      const request = context.getMotionSearchRequest('front');
      const index = context.findPoseTargetIndex(input, request.target);
      assert.ok(['transition', 'downP6'].includes(phase) ? index > top : index < top, phase);
      assert.equal(context.getMotionSearchRequest('side'), null);
    }
    context.backswingActive = false;
    const expected = {
      frame1: ['address', 'top'],
      frame2: ['address', 'downswing62'],
      frame3: ['downswing78', 'preImpact'],
      frame4: ['address', 'impact'],
      frame5: ['address', 'downswing62'],
      frame6: ['downswing78', 'impact'],
    };
    for (const [frame, targets] of Object.entries(expected)) {
      context.selectedSegment = frame;
      for (const [index, view] of ['front', 'side'].entries()) {
        const request = context.getMotionSearchRequest(view);
        assert.equal(request.target, targets[index], `${frame} ${view}`);
        const position = context.findPoseTargetIndex(input, request.target);
        assert.ok(request.target === 'address' ? position < top
          : request.target === 'top' ? position === top : position > top, `${frame} ${view}`);
      }
    }
  } finally {
    context.backswingActive = true;
    context.backswingPhaseSelect.value = 'address';
    context.selectedSegment = 'frame1';
  }
});
