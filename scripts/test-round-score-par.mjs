import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../golf_rounddatanput(26.8.6f).html', import.meta.url), 'utf8');
const helper = html.match(/function getPlayedRoundPar\(holes, holeShots\)\{[\s\S]*?\n\}/);
assert.ok(helper, 'getPlayedRoundPar');

const context = vm.createContext({});
vm.runInContext(helper[0], context);

test('nine-hole round compares strokes with par through the final played hole', () => {
  const holes = Array.from({ length: 19 }, (_, i) => ({ par: i >= 1 && i <= 18 ? 4 : 0 }));
  const shotsByHole = {};
  for (let i = 1; i <= 9; i++) shotsByHole[i] = [{}];

  const playedPar = context.getPlayedRoundPar(holes, shotsByHole);

  assert.equal(playedPar, 36);
  assert.equal(39 - playedPar, 3);
});

test('manual scores count and unplayed holes do not add their par', () => {
  const holes = Array.from({ length: 19 }, (_, i) => ({ par: i >= 1 && i <= 18 ? 4 : 0 }));
  holes[10].par = 5;
  holes[10].manualScore = true;
  holes[10].score = 6;
  const shotsByHole = { 11: [{}], 12: [{}] };

  assert.equal(context.getPlayedRoundPar(holes, shotsByHole), 13);
});

test('summary report metadata uses the same played-hole par calculation', () => {
  assert.match(html, /Par: \$\{getPlayedRoundPar\(HOLES, shotsByHole\)\}/);
  assert.match(html, /const totalPar = getPlayedRoundPar\(HOLES, shotsByHole\);/);
});
