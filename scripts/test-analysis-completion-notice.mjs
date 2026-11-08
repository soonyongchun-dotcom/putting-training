import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');

test('completed F1–F6 input produces an accessible, explicit completion message', () => {
  const context = vm.createContext({
    selectedSegment: 'frame6',
    guideView: 'side',
    uiLanguage: 'ko',
    frameProgressNotice: null,
    analysisSegmentSelect: { selectedOptions: [{ textContent: 'Frame 6 — Impact' }] },
    isPanelComplete: () => true,
    translateUiText: value => value,
  });
  const source = html.match(/  function getGuideMessage\(\) \{[\s\S]*?\n  }/);
  assert.ok(source);
  vm.runInContext(source[0], context);

  assert.match(context.getGuideMessage(), /전체 선택 완료!/);
  context.uiLanguage = 'en';
  assert.match(context.getGuideMessage(), /All selections complete!/);
  assert.match(html, /id="analysisGuide" role="status" aria-live="polite"/);
});
