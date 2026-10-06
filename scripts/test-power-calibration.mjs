import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const start = html.indexOf('  function getPowerCalibrationEvidence()');
const end = html.indexOf('  function getR10SpeedHeightEvidence()', start);
assert.ok(start >= 0 && end > start);

function setup() {
  const context = vm.createContext({
    analysisHeightInput: { value: '175' },
    analysisBodyMassInput: { value: '80' },
    analysisLeanMassInput: { value: '' },
    segmentDeltaHistory: {
      frame1: { fm: { xFactorDelta: -153.2 } },
      frame2: { fm: { radiusCompressionRatio: 0.577 } },
      frame3: { fm: { lateRadiusExpansionRatio: -0.25 } },
      frame6: { fm: { timeDeltaSec: 0.0832 } },
    },
    hasMetric: value => typeof value === 'number' && Number.isFinite(value),
    getLateRadiusExpansion: fm => fm.lateRadiusExpansionRatio ?? null,
    areVideoSourcesSame: () => true,
    getSwingUiText: (ko, en) => en,
    getDistanceMotionSummary: () => { throw new Error('Motion score must not be read'); },
    getStoredSegmentScore: () => 9,
  });
  vm.runInContext(html.slice(start, end), context);
  return context;
}

test('observations have no composite, weights or dependence on motion scores', () => {
  const context = setup();
  const result = context.getPowerCalibrationEvidence();
  assert.equal(result.heightCm, 175);
  assert.equal(result.bodyMassKg, 80);
  assert.equal(result.leanMassKg, null);
  assert.equal(result.turnDeg, -153.2);
  assert.equal(result.expansionRatio, -0.25);
  assert.equal(result.phaseDeltaSec, 0.0832);
  assert.equal('value' in result, false);
  assert.equal('weightCoverage' in result, false);
  assert.doesNotMatch(html, /getProvisionalPowerProxy|proxy\.components|motionScore \/ 9/);
});

test('partial evidence remains visible without zero-filling missing data', () => {
  const context = setup();
  context.segmentDeltaHistory = {};
  context.analysisBodyMassInput.value = '';
  const result = context.getPowerCalibrationEvidence();
  assert.equal(result.heightCm, 175);
  assert.equal(result.bodyMassKg, null);
  const rendered = context.formatPowerCalibrationEvidence(result);
  assert.match(rendered, /Height: 175 cm/);
  assert.match(rendered, /Body mass: not measured/);
  assert.doesNotMatch(rendered, /NaN|undefined/);
});

test('rendering preserves signed geometry and uses milliseconds, not a speed score', () => {
  const context = setup();
  const rendered = context.formatPowerCalibrationEvidence(context.getPowerCalibrationEvidence());
  assert.match(rendered, /-153.2 °/);
  assert.match(rendered, /57.7 %/);
  assert.match(rendered, /-25.0 %/);
  assert.match(rendered, /83.2 ms/);
  assert.doesNotMatch(rendered, /<div>|<br/);
  assert.doesNotMatch(rendered, /[\uAC00-\uD7AF]/);
});

test('invalid biometrics and cross-video or reversed timing remain missing', () => {
  const context = setup();
  context.analysisLeanMassInput.value = '100';
  assert.equal(context.getPowerCalibrationEvidence().leanMassKg, null);
  context.analysisLeanMassInput.value = '40';
  assert.equal(context.getPowerCalibrationEvidence().leanMassKg, 40);
  context.areVideoSourcesSame = () => false;
  assert.equal(context.getPowerCalibrationEvidence().phaseDeltaSec, null);
  context.areVideoSourcesSame = () => true;
  context.segmentDeltaHistory.frame6.fm.timeDeltaSec = -0.1;
  assert.equal(context.getPowerCalibrationEvidence().phaseDeltaSec, null);
});

test('both experimental formulas equal one at their reference inputs', () => {
  const context = setup();
  const result = context.computeExperimentalPowerEstimates({
    heightCm: 170, bodyMassKg: 75, leanMassKg: 60, turnDeg: -45,
    compressionRatio: 0.35, expansionRatio: 0.20, phaseDeltaSec: 0.05,
  });
  assert.ok(Math.abs(result.additive - 1) < 1e-12);
  assert.ok(Math.abs(result.multiplicative - 1) < 1e-12);
  assert.equal(result.leanIncluded, true);
});

test('missing muscle mass is omitted and the formulas respond differently to joint changes', () => {
  const context = setup();
  const reference = {
    heightCm: 170, bodyMassKg: 75, leanMassKg: null, turnDeg: -45,
    compressionRatio: 0.35, expansionRatio: 0.20, phaseDeltaSec: 0.05,
  };
  const baseline = context.computeExperimentalPowerEstimates(reference);
  assert.ok(Math.abs(baseline.additive - 1) < 1e-12);
  assert.ok(Math.abs(baseline.multiplicative - 1) < 1e-12);
  assert.equal(baseline.leanIncluded, false);
  const changed = context.computeExperimentalPowerEstimates({ ...reference, bodyMassKg: 150, phaseDeltaSec: 0.025 });
  assert.ok(changed.additive > 1);
  assert.ok(Math.abs(changed.multiplicative - 3.2) < 1e-12);
  assert.notEqual(changed.additive, changed.multiplicative);
  assert.doesNotMatch(context.formatExperimentalPowerEstimates(changed), /[\uAC00-\uD7AF]/);
});

test('missing required evidence holds both estimates instead of filling in defaults', () => {
  const context = setup();
  const result = context.computeExperimentalPowerEstimates(context.getPowerCalibrationEvidence());
  assert.ok(Number.isFinite(result.additive));
  context.segmentDeltaHistory.frame6.fm.timeDeltaSec = 0;
  const missing = context.computeExperimentalPowerEstimates(context.getPowerCalibrationEvidence());
  assert.equal(missing.additive, null);
  assert.equal(missing.multiplicative, null);
  assert.ok(missing.missing.some(label => label.endsWith('interval')));
});

test('high complete scores recommend checking delivery factors, not predicted distance', () => {
  const context = setup();
  context.getDistanceMotionSummary = () => ({ score: 9 });
  const rendered = context.formatPowerMotionComparison(210);
  assert.doesNotMatch(rendered, /Power observation indices|utilization assumption/);
  assert.match(rendered, /9.0 \/ 10/);
  assert.match(rendered, /210.0 m/);
  assert.match(rendered, /little basis for a major swing change/);
  assert.match(rendered, /not currently calculated/);
  assert.doesNotMatch(rendered, /[\uAC00-\uD7AF]/);
});

test('individual low frames take priority even if the average is high', () => {
  const context = setup();
  context.getDistanceMotionSummary = () => ({ score: 9 });
  context.getStoredSegmentScore = id => id === 'frame3' ? 7 : 10;
  const rendered = context.formatPowerMotionComparison(210);
  assert.match(rendered, /Motion-review candidates: F3 7.0\/10/);
  assert.doesNotMatch(rendered, /little basis/);
});

test('missing frames hold advice and missing measured distance is explicit', () => {
  const context = setup();
  context.getDistanceMotionSummary = () => ({ score: 9 });
  context.getStoredSegmentScore = () => null;
  const rendered = context.formatPowerMotionComparison(NaN);
  assert.match(rendered, /Complete F1.F4/);
  assert.match(rendered, /Enter measured total distance/);
  assert.doesNotMatch(rendered, /NaN|undefined/);
});

test('utilization explicitly labels the linear score mapping as an assumption', () => {
  const context = setup();
  const rendered = context.formatMotionUtilizationAssumption(8.9);
  assert.match(rendered, /89.0% \(8.9\/10\)/);
  assert.match(rendered, /utilization assumption/);
  assert.match(rendered, /not actual power utilization/);
  const compact = context.formatMotionUtilizationAssumption(8.88, true);
  assert.match(compact, /88.8%$/);
  assert.doesNotMatch(compact, /8.9\/10|actual power|<div>/);
  assert.match(html, /referenceRows\.push\(`<section class="analysis-type-section analysis-profile-warning"><div class="analysis-type-heading">/);
  for (const score of [null, NaN, -1, 11]) {
    assert.match(context.formatMotionUtilizationAssumption(score), /not measured/);
  }
  assert.match(html, /<em class="analysis-power-evidence-line">/);
});

test('engine total is alongside equal-weight combined efficiency', () => {
  const context = setup();
  const result = {
    scores: { type1: 0.919, type2: 1, type3: 0.833 },
    linearEvidence: { fit: 1 }, type3CombinedEvidence: { fit: 0.833 },
  };
  const rendered = context.formatEngineUtilizationSummary(result, 9.25);
  assert.match(rendered, /Estimated Potential-Power Utilization Efficiency: calculation held/);
  assert.match(rendered, /Swing Engine Index Total: 2.752/);
  assert.match(rendered, /analysis-power-summary/);
  assert.match(context.formatEngineUtilizationSummary(result, { status: 'ready', efficiency: 105.25 }, 9), /Efficiency: 97.6%/);
  result.type3CombinedEvidence.fit = null;
  assert.match(context.formatEngineUtilizationSummary(result, 9.25), /Index Total: not measured/);
  assert.match(context.formatEngineUtilizationSummary(null, null), /calculation held/);
  assert.doesNotMatch(html, /\$\{headline\}/);
});

test('combined efficiency averages unrounded distance and motion percentages', () => {
  const context = setup();
  const physical = { status: 'ready', efficiency: 69.70759599361588 };
  assert.equal(context.computeCombinedPowerEfficiency(physical, 8.9), (physical.efficiency + 89) / 2);
  assert.equal(context.computeCombinedPowerEfficiency(physical, 0), physical.efficiency / 2);
  assert.equal(context.computeCombinedPowerEfficiency({ status: 'ready', efficiency: 130 }, 10), 115);
  const low = context.computeCombinedPowerEfficiency(physical, 8);
  const high = context.computeCombinedPowerEfficiency(physical, 9);
  assert.equal(high - low, 5);
  for (const score of [null, NaN, -1, 11]) assert.equal(context.computeCombinedPowerEfficiency(physical, score), null);
  assert.equal(context.computeCombinedPowerEfficiency({ status: 'inputs' }, 9), null);
  assert.equal(context.computeCombinedPowerEfficiency({ status: 'ready', efficiency: NaN }, 9), null);
});
