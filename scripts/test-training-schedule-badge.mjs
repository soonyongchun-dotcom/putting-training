import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const indexHtml = readFileSync(new URL('../index3.html', import.meta.url), 'utf8');
const scheduleHtml = readFileSync(new URL('../schedule.html', import.meta.url), 'utf8');

function extractBlock(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `missing source block: ${start}`);
  assert.notEqual(endIndex, -1, `missing source boundary: ${end}`);
  return source.slice(startIndex, endIndex);
}

function createBadgeHarness(session, seenAt, records) {
  const storage = new Map();
  if (session) storage.set('sytpt_session', JSON.stringify(session));
  if (seenAt) storage.set('sytpt_training_schedule_seen:' + session.id, seenAt);
  const badge = { hidden: true, textContent: '' };
  const attributes = new Map();
  const link = {
    title: '',
    setAttribute(name, value) { attributes.set(name, value); },
  };
  let queryCount = 0;
  const query = {
    select(column) {
      assert.equal(column, 'schedule_id');
      return query;
    },
    gt(column, value) {
      assert.equal(column, 'created_at');
      assert.equal(value, seenAt);
      queryCount++;
      return Promise.resolve({ data: records, error: null });
    },
  };
  const context = vm.createContext({
    appLanguage: 'ko',
    document: {
      getElementById(id) { return id === 'trainingScheduleBadge' ? badge : null; },
      querySelector(selector) { return selector === '.schedule-link' ? link : null; },
    },
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, value); },
    },
    sb: {
      from(table) {
        assert.equal(table, 'sytpt_training_schedules');
        return query;
      },
    },
    console,
  });
  const functionSource = extractBlock(
    indexHtml,
    '    async function updatePlayerTrainingScheduleBadge(){',
    '    // ─── 코치 선택 선수'
  );
  vm.runInContext(
    'const STORAGE_TRAINING_SCHEDULE_SEEN_PREFIX="sytpt_training_schedule_seen:";' +
    'let trainingScheduleBadgeRequestId=0;' +
    'function getSession(){return JSON.parse(localStorage.getItem("sytpt_session")||"null");}' +
    functionSource +
    'globalThis.updateBadge=updatePlayerTrainingScheduleBadge;',
    context
  );
  return { context, badge, attributes, getQueryCount: () => queryCount };
}

test('player badge counts newly created schedules after their read cursor', async () => {
  const harness = createBadgeHarness(
    { id: 'player-1', role: 'player' },
    '2026-11-14T00:00:00.000Z',
    [{ schedule_id: 'new-1' }, { schedule_id: 'new-2' }]
  );

  await harness.context.updateBadge();

  assert.equal(harness.badge.hidden, false);
  assert.equal(harness.badge.textContent, '2');
  assert.equal(harness.attributes.get('aria-label'), '훈련 스케줄 열기 (새 일정 2개)');
  assert.equal(harness.getQueryCount(), 1);
});

test('non-player sessions never query or show the schedule badge', async () => {
  const harness = createBadgeHarness(
    { id: 'coach-1', role: 'coach' },
    null,
    [{ schedule_id: 'new-1' }]
  );

  await harness.context.updateBadge();

  assert.equal(harness.badge.hidden, true);
  assert.equal(harness.getQueryCount(), 0);
});

test('player badge stays hidden when there are no unread schedules', async () => {
  const harness = createBadgeHarness(
    { id: 'player-1', role: 'player' },
    '2026-11-14T00:00:00.000Z',
    []
  );

  await harness.context.updateBadge();

  assert.equal(harness.badge.hidden, true);
  assert.equal(harness.badge.textContent, '0');
});

test('opening the schedule records the newest visible schedule as read for that player', () => {
  const storage = new Map([['sytpt_session', JSON.stringify({ id: 'player-1', role: 'player' })]]);
  const context = vm.createContext({
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, value); },
    },
    console,
  });
  const functionSource = extractBlock(
    scheduleHtml,
    '    function markVisibleTrainingSchedulesRead(records){',
    '    function hasCoachEditAccess'
  );
  vm.runInContext(
    'function getCurrentUser(){return JSON.parse(localStorage.getItem("sytpt_session")||"null");}' +
    functionSource +
    'globalThis.markRead=markVisibleTrainingSchedulesRead;',
    context
  );

  context.markRead([
    { created_at: '2026-11-13T23:00:00.000Z' },
    { created_at: '2026-11-14T01:00:00.000Z' },
    { created_at: '2026-11-14T00:00:00.000Z' },
  ]);

  assert.equal(storage.get('sytpt_training_schedule_seen:player-1'), '2026-11-14T01:00:00.000Z');
});
