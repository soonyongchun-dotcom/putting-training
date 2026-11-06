import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const context = vm.createContext({
  uiLanguage: 'en',
  segmentDeltaHistory: {},
  frameSideMetricsHistory: {},
  areVideoSourcesSame: () => false,
  getSwingUiText: (korean, english) => english,
});

function loadFunction(name) {
  const source = html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`));
  assert.ok(source, name);
  vm.runInContext(source[0], context);
}

for (const name of ['clamp', 'hasMetric', 'smoothstep01', 'rampScore',
  'getLinearEngineEvidence', 'getImpactAlignment', 'getSwingTypeReadiness']) {
  loadFunction(name);
}

test('swing-type readiness holds LSE when same-video F2 evidence is unavailable', () => {
  context.segmentDeltaHistory = {
    frame1: { fm: { c7XPercent: 3, c7YPercent: 4, xFactorDelta: 50 } },
    frame2: { fm: { pelvisLateralDelta: 0.295, distanceComparable: false } },
    frame3: { fm: { kneeExtDelta: 5 } },
    frame4: { fm: { armShaftAngleBDeg: 160 } },
  };

  context.areVideoSourcesSame = () => false;
  const mismatchedSources = context.getSwingTypeReadiness();
  assert.equal(mismatchedSources.ready, false);
  assert.match(mismatchedSources.missing.join(' '), /not confirmed as the same video/);

  context.areVideoSourcesSame = () => true;
  const incomparableF2 = context.getSwingTypeReadiness();
  assert.equal(incomparableF2.ready, false);
  assert.match(incomparableF2.missing.join(' '), /same-video F2 core movement is missing/);

  context.segmentDeltaHistory.frame2.fm.distanceComparable = true;
  assert.equal(context.getSwingTypeReadiness().ready, true);
});
