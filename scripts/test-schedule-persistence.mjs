import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../schedule.html', import.meta.url), 'utf8');
const source = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));

function createHarness() {
  const elements = new Map();
  const listeners = new Map();
  const windowListeners = new Map();
  const cache = new Map([['sytpt_session', JSON.stringify({ id: 'coach', role: 'coach' })]]);
  const saved = new Map();
  const buttons = [{ disabled: false }, { disabled: false }];
  const errors = [];
  let reads = 0;
  let writeResult;
  let readResult;
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        value: '', dataset: {}, textContent: '', hidden: false,
        classList: { toggle() {}, add() {}, remove() {} },
        setAttribute() {},
        addEventListener(name, callback) { listeners.set(`${id}:${name}`, callback); },
      });
    }
    return elements.get(id);
  };
  const client = {
    auth: { async getSession() { return { data: { session: {} } }; } },
    from() {
      return {
        select() {
          return {
            async order() {
              reads++;
              return readResult ? await readResult : { data: [...saved.values()] };
            },
          };
        },
        upsert(records) {
          return {
            async select() {
              if (writeResult) return await writeResult;
              for (const record of records) saved.set(record.schedule_id, structuredClone(record));
              return { data: structuredClone(records) };
            },
          };
        },
      };
    },
  };
  const context = vm.createContext({
    console: { error: (...args) => errors.push(args) },
    localStorage: {
      getItem: (key) => cache.get(key) ?? null,
      setItem: (key, value) => cache.set(key, value),
      removeItem: (key) => cache.delete(key),
    },
    document: {
      hidden: false,
      activeElement: null,
      getElementById: element,
      querySelectorAll: (selector) => selector === '.schedule-save-button' ? buttons : [],
      addEventListener: (name, callback) => listeners.set(name, callback),
    },
    window: {
      supabase: { createClient: () => client },
      addEventListener: (name, callback) => windowListeners.set(name, callback),
    },
    SytptAuth: { storage: {}, storageKey: 'auth' },
    setTimeout() {},
  });
  vm.runInContext(source, context);
  vm.runInContext(`
    renderTabs=()=>{};
    renderApp=()=>{};
    updateEditAccess=()=>{};
    appData={training:{title:'New',period:'',location:'',rows:[{detail:''}],playerIds:['player-1'],playerNames:['Player']}};
    activeTabKey='training';
  `, context);
  return {
    context, element, cache, saved, buttons, errors, listeners, windowListeners,
    run: (code) => vm.runInContext(code, context),
    get reads() { return reads; },
    set writeResult(value) { writeResult = value; },
    set readResult(value) { readResult = value; },
  };
}

test('table input updates the payload before blur and blocks visibility reloads', async () => {
  const h = createHarness();
  const cell = { cellIndex: 4, innerText: ' Practice wedges ', parentElement: { sectionRowIndex: 0 } };
  h.listeners.get('table-body:input')({ target: { closest: () => cell } });
  assert.equal(h.run('appData.training.rows[0].detail'), 'Practice wedges');
  assert.equal(h.run('hasUnsavedChanges'), true);
  h.listeners.get('visibilitychange')();
  await Promise.resolve();
  assert.equal(h.reads, 0);
  assert.equal(h.run('appData.training.rows[0].detail'), 'Practice wedges');
});

test('saving persists metadata, dates, rows and player assignments through reload', async () => {
  const h = createHarness();
  h.run(`updateMeta('title','Wedge camp'); updateMeta('location','Range'); updateRowData(0,'detail','40m drills');`);
  h.element('meta-start-date').value = '2026-11-07';
  h.element('meta-end-date').value = '2026-11-09';
  h.run('updateSchedulePeriod()');
  await h.run('saveData()');
  const record = h.saved.get('training');
  assert.equal(record.schedule_payload.title, 'Wedge camp');
  assert.equal(record.schedule_payload.location, 'Range');
  assert.equal(record.schedule_payload.period, '2026.11.7 ~ 2026.11.9 (3일간)');
  assert.equal(record.schedule_payload.rows[0].detail, '40m drills');
  assert.deepEqual(record.player_ids, ['player-1']);
  assert.equal(h.run('hasUnsavedChanges'), false);
  h.run('appData={}');
  await h.run('loadCloudSchedules()');
  assert.equal(h.run('appData.training.rows[0].detail'), '40m drills');
  assert.equal(h.run('appData.training.title'), 'Wedge camp');
});

test('failed and unconfirmed saves retain edits and expose an error for retry', async () => {
  for (const result of [{ error: { message: 'Permission denied' } }, { data: [] }]) {
    const h = createHarness();
    h.run(`updateRowData(0,'detail','Retain me')`);
    h.writeResult = Promise.resolve(result);
    await h.run('saveData()');
    assert.equal(h.run('hasUnsavedChanges'), true);
    assert.equal(h.run('appData.training.rows[0].detail'), 'Retain me');
    assert.equal(h.element('schedule-data-status').hidden, false);
    assert.equal(h.errors.length, 1);
    assert.equal(h.buttons.every((button) => !button.disabled), true);
    h.writeResult = undefined;
    await h.run('saveData()');
    assert.equal(h.saved.get('training').schedule_payload.rows[0].detail, 'Retain me');
    assert.equal(h.run('hasUnsavedChanges'), false);
  }
});

test('edits during an in-flight save remain dirty and do not change its snapshot', async () => {
  const h = createHarness();
  let finish;
  h.writeResult = new Promise((resolve) => { finish = resolve; });
  h.run(`updateRowData(0,'detail','First')`);
  const saving = h.run('saveData()');
  assert.equal(h.buttons.every((button) => button.disabled), true);
  h.run(`updateRowData(0,'detail','Second')`);
  finish({ data: [{ schedule_id: 'training' }] });
  await saving;
  assert.equal(h.run('hasUnsavedChanges'), true);
  assert.equal(h.run('appData.training.rows[0].detail'), 'Second');
  assert.equal(JSON.parse(h.cache.get('golfSeedAppConfigV5')).training.rows[0].detail, 'First');
  h.writeResult = undefined;
  await h.run('saveData()');
  assert.equal(h.saved.get('training').schedule_payload.rows[0].detail, 'Second');
});

test('a load started before editing cannot overwrite new content', async () => {
  const h = createHarness();
  let finish;
  h.readResult = new Promise((resolve) => { finish = resolve; });
  const loading = h.run('loadCloudSchedules()');
  await Promise.resolve();
  h.run(`updateMeta('title','Do not overwrite')`);
  finish({ data: [{ schedule_id: 'training', schedule_payload: { title: 'Old', rows: [] } }] });
  await loading;
  assert.equal(h.run('appData.training.title'), 'Do not overwrite');
  assert.equal(h.run('hasUnsavedChanges'), true);
});

test('leaving prompts only for unsaved edits and unchanged blur stays clean', async () => {
  const h = createHarness();
  let prevented = false;
  const event = { preventDefault() { prevented = true; } };
  h.windowListeners.get('beforeunload')(event);
  assert.equal(prevented, false);
  h.run(`updateRowData(0,'detail','Drills')`);
  h.windowListeners.get('beforeunload')(event);
  assert.equal(prevented, true);
  await h.run('saveData()');
  h.run(`updateRowData(0,'detail','Drills')`);
  assert.equal(h.run('hasUnsavedChanges'), false);
});

test('player accounts cannot mutate or save schedules', async () => {
  const h = createHarness();
  h.cache.set('sytpt_session', JSON.stringify({ id: 'player-1', role: 'player' }));
  h.run(`updateMeta('title','Forbidden'); updateRowData(0,'detail','Forbidden')`);
  await h.run('saveData()');
  assert.equal(h.run('appData.training.title'), 'New');
  assert.equal(h.run('appData.training.rows[0].detail'), '');
  assert.equal(h.saved.size, 0);
});

test('both save controls and an inline favicon are present', () => {
  assert.equal((html.match(/onclick="saveData\(\)"/g) || []).length, 2);
  assert.match(html, /rel="icon" href="data:image\/svg\+xml,/);
});
