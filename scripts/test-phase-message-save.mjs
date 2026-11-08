import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index3.html', import.meta.url), 'utf8');
const queueStart = html.indexOf('    const phaseMessageSaveQueues=new Map();');
const queueEnd = html.indexOf('    async function clearPhaseSelectionsForPlayer(playerId){', queueStart);
const saveStart = html.indexOf('    async function savePhaseConfig(playerId,config){');
const saveEnd = html.indexOf('    async function renderPhaseBoard(){', saveStart);
assert.ok(queueStart >= 0 && queueEnd > queueStart);
assert.ok(saveStart >= 0 && saveEnd > saveStart);
const source = html.slice(queueStart, queueEnd) + html.slice(saveStart, saveEnd);

function createHarness(options = {}) {
  const records = [{
    id: 'existing',
    player_id: 'player-1',
    author: 'coach',
    message_type: 'phase_config',
    text: JSON.stringify({
      pre: ['컨디션 체크 및 위험 신호 보고', '기존 항목'],
      in: ['샷 루틴 유지 및 플레이 템포 안정화'],
      post: ['자기평가 + 코치 피드백 상호 확인'],
    }),
    created_at: '2026-01-01T00:00:00.000Z',
  }];
  const calls = [];
  let nextId = 1;

  function query(filters = []) {
    return {
      eq(key, value) { filters.push([key, value]); return this; },
      neq(key, value) { filters.push([key, { neq: value }]); return this; },
      order() { return this; },
      limit() { return this; },
      async maybeSingle() {
        const row = records.filter(record => filters.every(([key, value]) =>
          typeof value === 'object' && value !== null && 'neq' in value
            ? record[key] !== value.neq
            : record[key] === value))[0];
        return { data: row ? { text: row.text, created_at: row.created_at } : null, error: null };
      },
    };
  }

  const sb = {
    from() {
      return {
        select() { return query(); },
        insert(payload) {
          return {
            select() {
              return {
                async single() {
                  calls.push('insert');
                  if (options.insertError) return { data: null, error: options.insertError };
                  const record = { ...payload, id: `inserted-${nextId++}` };
                  records.push(record);
                  return { data: { id: record.id }, error: null };
                },
              };
            },
          };
        },
        delete() {
          const filters = [];
          const builder = {
            eq(key, value) { filters.push([key, value]); return builder; },
            neq(key, value) { filters.push([key, { neq: value }]); return builder; },
            then(resolve, reject) {
              calls.push('delete');
              if (options.deleteError) return Promise.resolve({ error: options.deleteError }).then(resolve, reject);
              for (let index = records.length - 1; index >= 0; index--) {
                if (filters.every(([key, value]) =>
                  typeof value === 'object' && value !== null && 'neq' in value
                    ? records[index][key] !== value.neq
                    : records[index][key] === value)) records.splice(index, 1);
              }
              return Promise.resolve({ error: null }).then(resolve, reject);
            },
          };
          return builder;
        },
      };
    },
  };
  const context = vm.createContext({
    sb,
    console: { warn() {}, error() {} },
    Date,
    getItemText: item => typeof item === 'object' && item !== null ? item.text || '' : String(item || ''),
    LOCKED_PHASE_ITEMS: {
      pre: ['컨디션 체크 및 위험 신호 보고'],
      in: ['샷 루틴 유지 및 플레이 템포 안정화'],
      post: ['자기평가 + 코치 피드백 상호 확인'],
    },
  });
  vm.runInContext(source + '\nglobalThis.api = { savePhaseConfig, savePhaseSelectionsToServer };', context);
  return { api: context.api, records, calls };
}

test('failed insert keeps the prior phase configuration and skips cleanup', async () => {
  const harness = createHarness({ insertError: new Error('insert rejected') });
  await assert.rejects(harness.api.savePhaseConfig('player-1', config => {
    config.pre.push('새 항목');
    return config;
  }), /insert rejected/);
  assert.equal(harness.records.length, 1);
  assert.deepEqual(harness.calls, ['insert']);
  assert.deepEqual(JSON.parse(harness.records[0].text).pre, [
    '컨디션 체크 및 위험 신호 보고',
    '기존 항목',
  ]);
});

test('successful insert is retained and old versions are removed afterward', async () => {
  const harness = createHarness();
  const result = await harness.api.savePhaseConfig('player-1', config => {
    config.pre.push('새 항목');
    return config;
  });
  assert.deepEqual(harness.calls, ['insert', 'delete']);
  assert.equal(result.saved, true);
  assert.equal(result.cleanupFailed, false);
  assert.equal(harness.records.length, 1);
  assert.deepEqual(JSON.parse(harness.records[0].text).pre, [
    '컨디션 체크 및 위험 신호 보고',
    '기존 항목',
    '새 항목',
  ]);
});

test('cleanup failure reports the committed save and preserves the new version', async () => {
  const harness = createHarness({ deleteError: new Error('cleanup rejected') });
  const result = await harness.api.savePhaseConfig('player-1', config => {
    config.pre.push('새 항목');
    return config;
  });
  assert.equal(result.saved, true);
  assert.equal(result.cleanupFailed, true);
  assert.equal(harness.records.length, 2);
  const newest = harness.records.reduce((left, right) =>
    left.created_at > right.created_at ? left : right);
  assert.deepEqual(JSON.parse(newest.text).pre, [
    '컨디션 체크 및 위험 신호 보고',
    '기존 항목',
    '새 항목',
  ]);
});
