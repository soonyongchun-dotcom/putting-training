import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
function element(textContent = '') {
  const attributes = {};
  return {
    textContent, attributes,
    setAttribute: (name, value) => { attributes[name] = value; },
    removeAttribute: name => { delete attributes[name]; },
  };
}
function setup() {
  const ids = Object.fromEntries([
    'analysisSwingBalanceScore', 'analysisSwingBalanceLabel', 'analysisSwingBalanceClub',
    'analysisModernSwingProximityLabel', 'analysisModernSwingProximityClub', 'analysisModernSwingProximity',
    'analysisModernSwingProximityNote', 'analysisDistanceBonus', 'analysisBonusReference',
  ].map(id => [id, element()]));
  const c = vm.createContext({
    document: { getElementById: id => ids[id] || null },
    analysisClubTypeSelect: { value: 'iron' }, SWING_BALANCE_WEIGHTS: { iron: {} },
    getSwingUiText: (ko, en) => ko, classifySwingType: () => ({}), computeSwingBalanceScore: () => 80,
    computeModernSwingProximity: () => 90,
    getActive2dCorrectionOverride: () => null,
    get2dCorrectionDisplayTag: () => '(2D보정)',
    getC7HandExtensionEvidence: () => ({ available: true, changePoints: 6.2, score: 10 }),
    getC7HandExtensionReason: () => '필요한 포인트 없음',
    hasMetric: Number.isFinite, formatPercent: value => `+${value.toFixed(1)}%`,
    segmentScoreHistory: {}, segmentDeltaHistory: { frame1: {} }, computing2dCorrectionScenario: false,
    syncSegmentScoreSnapshots: () => {}, refreshSwingClassificationViews: () => {},
    updateConsistencyAverageDisplay: () => {}, refreshAnalysisWorkflow: () => {},
    analysisSegmentScoreF1: null, analysisSegmentScoreF2: null, analysisSegmentScoreF3: null,
    analysisSegmentScoreF4: null, analysisSegmentScoreF5: null, analysisSegmentScoreF6: null,
    analysisSegmentAverage: element(), getStoredSegmentScore: () => null,
    getDistanceMotionSummary: () => ({ score: 8.5, c7HandExtension: { available: true, changePoints: 6.2, score: 10 } }),
    formatDistanceMotionSummary: () => 'detail',
  });
  for (const name of ['setScoreExplanation', 'updateSwingBalanceDisplay', 'updateSegmentScoresDisplay']) {
    const source = html.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`));
    assert.ok(source, name);
    vm.runInContext(source[0], c);
  }
  return { c, ids };
}

test('score triggers support hover and keyboard focus', () => {
  for (const id of ['analysisSegmentAverage', 'analysisModernSwingProximity']) {
    const tag = html.match(new RegExp(`<[^>]*id="${id}"[^>]*>`))?.[0];
    assert.match(tag, /analysis-score-hover/);
    assert.match(tag, /tabindex="0"/);
  }
  assert.match(html, /analysis-score-hover\[data-tooltip\]:hover::before/);
  assert.match(html, /analysis-score-hover\[data-tooltip\]:focus::before/);
});

test('proximity contribution is attached to the score rather than displayed as a note', () => {
  const { c, ids } = setup();
  c.updateSwingBalanceDisplay();
  assert.equal(ids.analysisModernSwingProximity.textContent, '90.0%');
  assert.equal(ids.analysisModernSwingProximityNote.textContent, '');
  assert.match(ids.analysisModernSwingProximity.attributes['data-tooltip'], /F1–F4 평균 80% \(각 20%\).*\+6\.2%p.*10\.0\/10\) 20%/);
  assert.match(ids.analysisModernSwingProximity.attributes['aria-label'], /^90\.0%.*F1–F4/);
  c.getC7HandExtensionEvidence = () => ({ available: false, reason: 'points' });
  c.updateSwingBalanceDisplay();
  assert.match(ids.analysisModernSwingProximityNote.textContent, /보류/);
  c.computeModernSwingProximity = () => null;
  c.updateSwingBalanceDisplay();
  assert.equal(ids.analysisModernSwingProximity.attributes['data-tooltip'], undefined);
  assert.equal(ids.analysisModernSwingProximity.attributes['aria-label'], undefined);
});

test('distance score shows contribution on the score and keeps unavailable reasons visible', () => {
  const { c, ids } = setup();
  c.updateSegmentScoresDisplay();
  assert.match(c.analysisSegmentAverage.textContent, /8\.5/);
  assert.equal(ids.analysisDistanceBonus.textContent, '');
  assert.match(c.analysisSegmentAverage.attributes['data-tooltip'], /\+6\.2%p.*10\.0\/10 × 30%/);
  c.getDistanceMotionSummary = () => ({ score: 8.5, c7HandExtension: { available: false, reason: 'points' } });
  c.updateSegmentScoresDisplay();
  assert.match(ids.analysisDistanceBonus.textContent, /보류/);
  c.getDistanceMotionSummary = () => ({ score: null, c7HandExtension: { available: false, reason: 'points' } });
  c.updateSegmentScoresDisplay();
  assert.equal(c.analysisSegmentAverage.attributes['data-tooltip'], undefined);
  assert.equal(c.analysisSegmentAverage.attributes['aria-label'], undefined);
});

test('an active 2D correction override replaces mapped displays and marks them', () => {
  const { c, ids } = setup();
  c.analysisSegmentScoreF1 = element();
  c.getActive2dCorrectionOverride = () => ({
    scores: { frame1: 8.44 },
    engineResult: { pct: { type1: 50, type2: 30, type3: 20 }, missingEngineEvidence: [] },
    distanceMotion: { score: 7.7, c7HandExtension: { available: true, changePoints: 3.1, score: 2.8 } },
    modernProximity: 88,
    proximityEvidence: { available: true, changePoints: 3.1, score: 2.8 },
    crossCorrected: true,
  });
  c.updateSegmentScoresDisplay();
  assert.equal(c.analysisSegmentScoreF1.textContent, 'F1: 8.4(2D보정)');
  assert.match(c.analysisSegmentAverage.textContent, /7\.7 \/ 10\(2D보정\)/);
  assert.match(c.analysisSegmentAverage.attributes['data-tooltip'], /\+3\.1%p · 2\.8\/10 × 30%/);
  assert.match(ids.analysisBonusReference.textContent, /^2D 왜곡 보정 적용/);
  c.updateSwingBalanceDisplay();
  assert.equal(ids.analysisSwingBalanceScore.textContent, '80.0 / 100(2D보정)');
  assert.equal(ids.analysisModernSwingProximity.textContent, '88.0%(2D보정)');
  assert.match(ids.analysisModernSwingProximity.attributes['data-tooltip'], /^2D 왜곡 보정 기준 · F1–F4 평균 80%/);
  // Clearing the override restores the original displays without markers.
  c.getActive2dCorrectionOverride = () => null;
  c.updateSegmentScoresDisplay();
  assert.equal(c.analysisSegmentScoreF1.textContent, 'F1: 측정 불가');
  assert.match(c.analysisSegmentAverage.textContent, /8\.5 \/ 10$/);
  c.updateSwingBalanceDisplay();
  assert.equal(ids.analysisModernSwingProximity.textContent, '90.0%');
});
