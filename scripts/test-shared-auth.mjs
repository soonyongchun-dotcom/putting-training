import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const helper = readFileSync(new URL('../sytpt-auth.js', import.meta.url), 'utf8');
const analysisHtml = readFileSync(new URL('../index4.html', import.meta.url), 'utf8');
const portalHtml = readFileSync(new URL('../index3.html', import.meta.url), 'utf8');

function localStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

function loadHelper(store) {
  const warnings = [];
  const context = vm.createContext({
    window: { localStorage: store }, TextEncoder,
    console: { warn: (...args) => warnings.push(args) },
  });
  vm.runInContext(helper, context);
  return { auth: context.window.SytptAuth, warnings };
}

test('both apps use persistent shared auth, and the analysis link stays on the same origin', () => {
  for (const html of [analysisHtml, portalHtml]) {
    assert.match(html, /src="sytpt-auth\.js"/);
    assert.match(html, /storage: SytptAuth\.storage, storageKey: SytptAuth\.storageKey/);
    assert.doesNotMatch(html, /authMemoryStorage|_memStore/);
  }
  assert.match(portalHtml, /window\.open\('index4\.html'/);
  const store = localStorage();
  const first = loadHelper(store).auth;
  first.storage.setItem(first.storageKey, '{"refresh_token":"test-token"}');
  const next = loadHelper(store).auth;
  assert.equal(next.storage.getItem(next.storageKey), '{"refresh_token":"test-token"}');
  next.storage.removeItem(next.storageKey);
  assert.equal(first.storage.getItem(first.storageKey), null);
});

test('email candidates preserve actual emails, hints, mapped users, and legacy aliases', () => {
  const { auth } = loadHelper(localStorage());
  assert.deepEqual(Array.from(auth.buildEmailCandidates('Coach')), ['coach@syegtp.app', 'coach@syegtp.local']);
  assert.equal(auth.buildEmailCandidates('coach@example.com')[0], 'coach@example.com');
  auth.setEmailHint('Coach', 'coach@syegtp.local');
  assert.equal(auth.buildEmailCandidates('COACH')[0], 'coach@syegtp.local');
  assert.equal(auth.buildEmailCandidates('Display Name', { id: 'actual-id', name: 'Display Name' })[0], 'actual-id@syegtp.app');
  assert.equal(auth.buildEmailCandidates('   ').length, 0);
  assert.equal(auth.buildAliasEmails('\uCF54\uCE58')[0], 'idecbd94ecb998@syegtp.app');
});

test('blocked storage reports the limitation and falls back to memory only', () => {
  const { auth, warnings } = loadHelper({
    getItem() { throw new Error('Storage blocked'); },
    setItem() { throw new Error('Storage blocked'); },
    removeItem() { throw new Error('Storage blocked'); },
  });
  assert.equal(auth.storage.getItem(auth.storageKey), null);
  assert.equal(auth.persistenceAvailable, false);
  assert.equal(warnings.length, 1);
  auth.storage.setItem(auth.storageKey, 'session');
  assert.equal(auth.storage.getItem(auth.storageKey), 'session');
  auth.storage.removeItem(auth.storageKey);
  assert.equal(auth.storage.getItem(auth.storageKey), null);
});

test('authentication errors distinguish credentials, confirmation, rate limits and network errors', () => {
  const { auth } = loadHelper(localStorage());
  assert.match(auth.errorMessage({ code: 'invalid_credentials' }, 'en'), /password/);
  assert.match(auth.errorMessage({ code: 'email_not_confirmed' }, 'en'), /confirmation/);
  assert.match(auth.errorMessage({ status: 429 }, 'en'), /Too many/);
  assert.match(auth.errorMessage({ message: 'Failed to fetch' }, 'en'), /connect/);
  assert.equal(auth.isInvalidCredentials({ code: 'email_not_confirmed' }), false);
});

function element() {
  return {
    value: '', disabled: false, style: {}, hidden: false, textContent: '',
    handlers: {},
    classList: { toggle() {} },
    addEventListener(event, callback) { this.handlers[event] = callback; },
    after() {},
  };
}

function analysisHarness(options = {}) {
  const store = options.store || localStorage();
  const { auth } = loadHelper(store);
  if (options.session) auth.storage.setItem(auth.storageKey, JSON.stringify(options.session));
  const elements = Object.fromEntries(
    ['loginEmail', 'loginPassword', 'loginBtn', 'loginStatus', 'loginOverlay', 'logoutBtn', 'mainContainer', 'mainControls']
      .map(name => [name, element()]),
  );
  const classes = new Set();
  let listener;
  const calls = { emails: [], user: 0, profiles: 0, signOut: 0 };
  const client = {
    auth: {
      async getSession() {
        return { data: { session: JSON.parse(auth.storage.getItem(auth.storageKey) || 'null') }, error: null };
      },
      async getUser() {
        calls.user++;
        return options.userError
          ? { data: { user: null }, error: options.userError }
          : { data: { user: options.user || options.session?.user }, error: null };
      },
      async signInWithPassword({ email }) {
        calls.emails.push(email);
        const error = options.signInError || (email !== options.successEmail
          ? { code: 'invalid_credentials', message: 'Invalid login credentials' } : null);
        if (error) return { data: {}, error };
        const session = { user: options.user, access_token: 'test-access', refresh_token: 'test-refresh' };
        auth.storage.setItem(auth.storageKey, JSON.stringify(session));
        listener?.('SIGNED_IN', session);
        return { data: { user: options.user, session }, error: null };
      },
      async signOut() {
        calls.signOut++;
        auth.storage.removeItem(auth.storageKey);
        listener?.('SIGNED_OUT', null);
        return { error: null };
      },
      onAuthStateChange(callback) { listener = callback; },
    },
    from() {
      calls.profiles++;
      return { select: () => ({ limit: async () => ({ data: options.profiles || [], error: options.profileError || null }) }) };
    },
  };
  const context = vm.createContext({
    ...elements, SytptAuth: auth, localStorage: store, uiLanguage: 'en',
    window: { supabase: { createClient: () => client } },
    document: {
      body: { classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } } },
      createElement: () => element(),
    },
    getSwingUiText: (ko, en) => en,
    console: { warn() {}, error() {} }, setTimeout,
  });
  const start = analysisHtml.indexOf('  const SUPABASE_URL =');
  const end = analysisHtml.indexOf('  initLogin().catch(', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(analysisHtml.slice(start, end), context);
  return { store, auth, context, elements, calls, classes, start: () => vm.runInContext('initLogin()', context) };
}

const coach = { email: 'coach@example.com', user_metadata: { login_id: 'coach-id' } };
const coachProfile = { id: 'coach-id', name: 'Coach', role: 'coach' };

test('saved session is verified with the server and DB before analysis is unlocked', async () => {
  const h = analysisHarness({ session: { user: coach }, profiles: [coachProfile] });
  await h.start();
  assert.equal(h.calls.user, 1);
  assert.equal(h.calls.profiles, 1);
  assert.equal(h.classes.has('authenticated'), true);
  assert.equal(h.elements.loginBtn.disabled, false);
});

test('revoked sessions and profile errors never unlock analysis', async () => {
  for (const extra of [
    { userError: { message: 'Session revoked' } },
    { profileError: { message: 'Permission denied' } },
    { profiles: [] },
  ]) {
    const h = analysisHarness({ session: { user: coach }, profiles: [coachProfile], ...extra });
    await h.start();
    assert.equal(h.classes.has('authenticated'), false);
    assert.ok(h.elements.loginStatus.textContent);
    if (extra.userError) assert.equal(h.calls.profiles, 0);
  }
});

test('player sessions remain available to index3 while analysis remains coach-only', async () => {
  const user = { email: 'player@syegtp.app', user_metadata: { login_id: 'player' } };
  const h = analysisHarness({ session: { user }, profiles: [{ id: 'player', role: 'player' }] });
  await h.start();
  assert.equal(h.classes.has('authenticated'), false);
  assert.match(h.elements.loginStatus.textContent, /Only coach/);
  assert.equal(h.calls.signOut, 0);
  assert.ok(h.auth.storage.getItem(h.auth.storageKey));
});

test('legacy candidate login saves the working email and restores on the next load', async () => {
  const user = { email: 'coach@syegtp.local', user_metadata: {} };
  const h = analysisHarness({ user, profiles: [{ id: 'coach', role: 'coach' }], successEmail: user.email });
  await h.start();
  h.elements.loginEmail.value = 'coach';
  h.elements.loginPassword.value = 'test-password';
  await h.elements.loginBtn.handlers.click();
  assert.deepEqual(h.calls.emails, ['coach@syegtp.app', 'coach@syegtp.local']);
  assert.equal(h.auth.getEmailHint('coach'), user.email);
  assert.equal(h.elements.loginPassword.value, '');
  const next = analysisHarness({ store: h.store, user, profiles: [{ id: 'coach', role: 'coach' }] });
  await next.start();
  assert.equal(next.classes.has('authenticated'), true);
  await next.elements.logoutBtn.handlers.click();
  const afterLogout = analysisHarness({ store: h.store });
  await afterLogout.start();
  assert.equal(afterLogout.classes.has('authenticated'), false);
  assert.equal(afterLogout.calls.user, 0);
});

test('non-credential failures stop alias retries and show the real cause', async () => {
  const h = analysisHarness({ signInError: { code: 'email_not_confirmed' } });
  await h.start();
  h.elements.loginEmail.value = 'coach';
  h.elements.loginPassword.value = 'test-password';
  await h.elements.loginBtn.handlers.click();
  assert.equal(h.calls.emails.length, 1);
  assert.match(h.elements.loginStatus.textContent, /confirmation/);
});

test('actual email login maps the DB profile through login_id metadata', async () => {
  const h = analysisHarness({ user: coach, profiles: [coachProfile], successEmail: coach.email });
  await h.start();
  h.elements.loginEmail.value = coach.email;
  h.elements.loginPassword.value = 'test-password';
  await h.elements.loginBtn.handlers.click();
  assert.deepEqual(h.calls.emails, [coach.email]);
  assert.equal(h.classes.has('authenticated'), true);
});

test('an in-flight restore cannot unlock analysis after a sign-out', async () => {
  const h = analysisHarness({ session: { user: coach }, profiles: [coachProfile] });
  await h.start();
  const restoration = vm.runInContext('restoreAnalysisSession()', h.context);
  await h.elements.logoutBtn.handlers.click();
  await restoration;
  assert.equal(h.classes.has('authenticated'), false);
  assert.equal(h.auth.storage.getItem(h.auth.storageKey), null);
});

test('portal restoration rejects unapproved players and trusts server user, not cached metadata', async () => {
  const start = portalHtml.indexOf('    let authSessionSyncVersion=0;');
  const end = portalHtml.indexOf('    async function safeAuthSignOut()', start);
  assert.ok(start >= 0 && end > start);
  for (const approvalStatus of ['approved', 'pending', 'inactive']) {
    let restored = null;
    let signedOut = false;
    const context = vm.createContext({
      sb: {
        auth: {
          getSession: async () => ({ data: { session: { user: coach } } }),
          getUser: async () => ({ data: { user: { email: 'player@syegtp.app' } } }),
        },
        from: () => ({ select: async () => ({ data: [{ id: 'player', role: 'player', approvalStatus }] }) }),
      },
      findUserForAuthSession: (users, user) => user.email === 'player@syegtp.app' ? users[0] : null,
      fromDbUser: user => user,
      setSession: session => { restored = session; },
      clearSession: () => { restored = null; },
      safeAuthSignOut: async () => { signedOut = true; },
    });
    vm.runInContext(portalHtml.slice(start, end), context);
    if (approvalStatus === 'approved') {
      await vm.runInContext('syncLocalSessionWithAuth()', context);
      assert.equal(restored.id, 'player');
      assert.equal(signedOut, false);
    } else {
      await assert.rejects(vm.runInContext('syncLocalSessionWithAuth()', context));
      assert.equal(restored, null);
      assert.equal(signedOut, true);
    }
  }
});
