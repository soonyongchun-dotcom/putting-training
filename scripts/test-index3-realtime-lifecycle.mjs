import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index3.html', import.meta.url), 'utf8');
const blockStart = html.indexOf('    // ====== 리얼타임 구독 ======');
const blockEnd = html.indexOf('    // ====== 이벤트 핸들러 ======', blockStart);

assert.notEqual(blockStart, -1);
assert.notEqual(blockEnd, -1);

const lifecycleSource = html.slice(blockStart, blockEnd);

function createHarness() {
  let now = 0;
  let nextTimerId = 1;
  const timers = new Map();
  const documentListeners = new Map();
  const windowListeners = new Map();
  const channels = [];
  const removedChannels = [];

  function addListener(target, name, callback) {
    const listeners = target.get(name) || [];
    listeners.push(callback);
    target.set(name, listeners);
  }

  const document = {
    hidden: false,
    addEventListener(name, callback) {
      addListener(documentListeners, name, callback);
    },
  };
  const window = {
    addEventListener(name, callback) {
      addListener(windowListeners, name, callback);
    },
  };
  const sb = {
    channel() {
      const channel = {
        callback: null,
        on() { return channel; },
        subscribe(callback) {
          channel.callback = callback;
          return channel;
        },
      };
      channels.push(channel);
      return channel;
    },
    removeChannel(channel) {
      removedChannels.push(channel);
      return Promise.resolve();
    },
  };

  const context = vm.createContext({
    console,
    document,
    window,
    navigator: { onLine: true },
    sb,
    getSession: () => ({ id: 'coach', role: 'coach' }),
    Date: { now: () => now },
    setInterval(callback, delay) {
      const id = nextTimerId++;
      timers.set(id, { callback, delay, interval: true });
      return id;
    },
    clearInterval(id) {
      timers.delete(id);
    },
    setTimeout(callback, delay) {
      const id = nextTimerId++;
      timers.set(id, { callback, delay, interval: false });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  });

  const noops = [
    'renderPlayerMessageThread', 'renderDashboardCoachMessages', 'renderCoachInboxDynamic',
    'renderCommCounts', 'renderReplyStatus', 'renderCoachKPIs', 'renderCoachDirectiveList',
    'renderMissionCardsForActivePlayer', 'renderCoachCompletedMissionList', 'renderPlayerViewContext',
    'renderCoachAthleteBoard', 'renderPendingApprovals', 'syncCoachAthleteSelectOptions',
    'syncCoachDirectiveTargetOptions', 'updateCoachAnalysisBadge', 'getUsers', 'getApprovedPlayers',
    'normalizeRoundPlayerKey', 'refreshPerformanceLevels', 'invalidateCoachDirectiveCache',
  ];
  for (const name of noops) context[name] = () => {};

  const declarations = `
    let realtimeChannel = null;
    let realtimePollingTimer = null;
    let realtimeReconnectTimer = null;
    let realtimeReconnectAttempts = 0;
    let realtimeSubscriptionEnabled = false;
    let lastUserActivityAt = Date.now();
    let lastLifecycleTickAt = Date.now();
    const REALTIME_POLL_INTERVAL_MS = 30000;
    const REALTIME_RECONNECT_BASE_MS = 5000;
    const REALTIME_RECONNECT_MAX_MS = 60000;
    const LIFECYCLE_HEARTBEAT_MS = 30000;
    const SLEEP_DETECTION_THRESHOLD_MS = 90000;
    const APP_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
    let timestampRefreshInterval = null;
    let messagesCache = [];
    let lastMessagesFetch = 0;
  `;
  const exports = `
    globalThis.lifecycleApi = {
      setupRealtimeSubscriptions,
      handleLifecycleHeartbeat,
      get channel() { return realtimeChannel; },
      get pollingTimer() { return realtimePollingTimer; },
      get reconnectTimer() { return realtimeReconnectTimer; },
      get refreshTimer() { return timestampRefreshInterval; },
      get enabled() { return realtimeSubscriptionEnabled; }
    };
  `;
  vm.runInContext(declarations + lifecycleSource + exports, context);

  return {
    api: context.lifecycleApi,
    channels,
    removedChannels,
    timers,
    setNow(value) { now = value; },
    dispatchDocument(name) {
      for (const callback of documentListeners.get(name) || []) callback();
    },
    runTimer(id) {
      const timer = timers.get(id);
      assert.ok(timer, `timer ${id} should exist`);
      if (!timer.interval) timers.delete(id);
      timer.callback();
    },
    setHidden(value) {
      document.hidden = value;
    },
  };
}

test('hidden tabs stop realtime, fallback polling, and periodic refresh', () => {
  const harness = createHarness();
  harness.api.setupRealtimeSubscriptions();
  assert.ok(harness.api.channel);
  assert.ok(harness.api.refreshTimer);

  harness.setHidden(true);
  harness.dispatchDocument('visibilitychange');

  assert.equal(harness.api.channel, null);
  assert.equal(harness.api.pollingTimer, null);
  assert.equal(harness.api.reconnectTimer, null);
  assert.equal(harness.api.refreshTimer, null);
  assert.equal(harness.api.enabled, false);
  assert.equal(harness.removedChannels.length, 1);
});

test('realtime failure polls temporarily, reconnects, and stops polling once subscribed', () => {
  const harness = createHarness();
  harness.api.setupRealtimeSubscriptions();
  const failedChannel = harness.channels[0];

  failedChannel.callback('CHANNEL_ERROR');

  assert.equal(harness.api.channel, null);
  assert.ok(harness.api.pollingTimer);
  assert.ok(harness.api.reconnectTimer);
  const reconnectTimer = harness.api.reconnectTimer;

  harness.runTimer(reconnectTimer);
  assert.equal(harness.channels.length, 2);
  assert.ok(harness.api.channel);

  harness.channels[1].callback('SUBSCRIBED');
  assert.equal(harness.api.pollingTimer, null);
  assert.equal(harness.api.reconnectTimer, null);
});

test('a sleep-sized timer drift replaces the stale realtime channel', () => {
  const harness = createHarness();
  harness.api.setupRealtimeSubscriptions();
  const firstChannel = harness.api.channel;

  harness.setNow(90000);
  harness.api.handleLifecycleHeartbeat();

  assert.equal(harness.removedChannels[0], firstChannel);
  assert.equal(harness.channels.length, 2);
  assert.ok(harness.api.channel);
});

test('fifteen minutes without user activity stops all database refresh loops', () => {
  const harness = createHarness();
  harness.api.setupRealtimeSubscriptions();

  harness.setNow(15 * 60 * 1000);
  harness.api.handleLifecycleHeartbeat();

  assert.equal(harness.api.channel, null);
  assert.equal(harness.api.pollingTimer, null);
  assert.equal(harness.api.reconnectTimer, null);
  assert.equal(harness.api.refreshTimer, null);
  assert.equal(harness.api.enabled, false);
});
