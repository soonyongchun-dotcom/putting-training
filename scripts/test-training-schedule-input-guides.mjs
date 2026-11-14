import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../schedule.html', import.meta.url), 'utf8');
const start = html.indexOf('    function clearScheduleGuide(cell) {');
const end = html.indexOf('    function addNewRow()', start);

assert.notEqual(start, -1);
assert.notEqual(end, -1);
const helperSource = html.slice(start, end);

function createHarness() {
  const updates = [];
  const context = vm.createContext({
    updateRowData(index, field, value) {
      updates.push({ index, field, value });
    },
  });
  vm.runInContext(helperSource + 'globalThis.guideApi={clearScheduleGuide,handleScheduleCellBlur};', context);
  return { api: context.guideApi, updates };
}

function createCell(fieldIndex, value) {
  return {
    cellIndex: fieldIndex,
    innerText: value,
    dataset: {},
    set textContent(value) { this.innerText = value; },
  };
}

test('typing into a guided schedule cell replaces the guide text', () => {
  const harness = createHarness();
  const cell = createCell(4, '세부 훈련 내용 입력');

  harness.api.clearScheduleGuide(cell);
  assert.equal(cell.innerText, '');
  cell.innerText = '거리별 웨지 연습';
  harness.api.handleScheduleCellBlur(2, 'detail', cell);

  assert.equal(cell.innerText, '거리별 웨지 연습');
  assert.deepEqual(harness.updates, [{ index: 2, field: 'detail', value: '거리별 웨지 연습' }]);
});

test('leaving a guided cell without editing restores its guide text', () => {
  const harness = createHarness();
  const cell = createCell(3, '새 소제목/주제');

  harness.api.clearScheduleGuide(cell);
  harness.api.handleScheduleCellBlur(1, 'category', cell);

  assert.equal(cell.innerText, '새 소제목/주제');
  assert.deepEqual(harness.updates, [{ index: 1, field: 'category', value: '새 소제목/주제' }]);
});
