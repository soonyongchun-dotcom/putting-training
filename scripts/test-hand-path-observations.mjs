import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
function setup() {
  const c = vm.createContext({
    Math, Number, getSwingUiText: (ko, en) => en,
    document: { createElement: tag => ({ tag, children: [], append(...items) { this.children.push(...items); } }) },
  });
  for (const name of ['clamp', 'computeHandPathObservations', 'createHandPathObservationSummary']) {
    vm.runInContext(html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`))[0], c);
  }
  return c;
}
const point = (phase, x, y, sources) => ({ phase, x, y, sources });

test('selected checkpoints produce exact top angles and signed distances', () => {
  const c = setup();
  const result = c.computeHandPathObservations([
    point('address', 0, 0), point('top', 0, 10), point('transition', 5, 5),
    point('p3', -2, 5), point('backShoulder', -3, 8), point('downShoulder', 1, 8),
  ]);
  assert.ok(Math.abs(result.topAngle - 45) < 1e-10);
  assert.equal(result.downOffset, 5);
  assert.equal(result.p3P5GapX, 7);
  assert.equal(result.shoulderGapX, 4);
  assert.equal(result.downLabel, 'P5');
});

test('retracing yields zero angle and missing or coincident checkpoints stay unavailable', () => {
  const c = setup();
  assert.equal(c.computeHandPathObservations([
    point('address', 0, 0), point('top', 0, 10), point('transition', 0, 5),
  ]).topAngle, 0);
  for (const points of [[], [point('address', 0, 0), point('top', 0, 0), point('transition', 2, 2)]]) {
    const result = c.computeHandPathObservations(points);
    assert.equal(result.topAngle, null);
    assert.equal(result.downOffset, null);
  }
});

test('front-view summary identifies F2 B rather than claiming a P5 checkpoint', () => {
  const c = setup();
  const points = [point('address', 0, 0), point('top', 0, 10),
    point('frame2-side', -5, 5, ['F2 B'])];
  const before = JSON.stringify(points);
  const summary = c.createHandPathObservationSummary(points);
  const text = summary.children.map(child => child.textContent).join('\n');
  assert.match(text, /Address–top–F2 B interior angle: 45.0°/);
  assert.match(text, /signed distance.*: -5.00/);
  assert.match(text, /1% of image height/);
  assert.equal(JSON.stringify(points), before);
});
