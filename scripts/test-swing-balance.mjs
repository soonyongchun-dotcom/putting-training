import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const source = html.match(/  const SWING_BALANCE_WEIGHTS = \{[\s\S]*?\n  \};\n  const SWING_BALANCE_DEVIATION_PENALTY = [\s\S]*?\n\n  function computeSwingBalanceScore[\s\S]*?\n  \}/);
assert.ok(source, 'swing balance scoring source');

const context = vm.createContext({
  clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  hasMetric: Number.isFinite,
});
vm.runInContext(`${source[0]}\nglobalThis.computeSwingBalanceScore = computeSwingBalanceScore;`, context);

test('swing balance targets are swapped between driver and iron', () => {
  const driverTarget = { pct: { type1: 42.5, type2: 32.5, type3: 25 } };
  const ironTarget = { pct: { type1: 35, type2: 35, type3: 30 } };

  assert.equal(context.computeSwingBalanceScore(driverTarget, 'driver'), 100);
  assert.equal(context.computeSwingBalanceScore(driverTarget, 'iron'), 81.25);
  assert.equal(context.computeSwingBalanceScore(ironTarget, 'iron'), 100);
  assert.equal(context.computeSwingBalanceScore(ironTarget, 'driver'), 81.25);
});
