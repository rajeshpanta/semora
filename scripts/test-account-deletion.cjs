// Exercises the real screen handler with simulated auth, device and backend
// responses. Never connects to Supabase, Apple, Google, or a real account.
// Run: node --test scripts/test-account-deletion.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(relative, imports) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require(name) {
      if (!(name in imports)) throw new Error(`Unexpected dependency: ${name}`);
      return imports[name];
    },
    Set, Error,
  }, { filename: relative });
  return exports;
}

const verification = load('lib/accountVerification.ts', {});
const userHelpers = load('lib/user.ts', {});

function setup(options = {}) {
  const calls = [];
  const alerts = [];
  const user = {
    id: 'account-to-delete', email: 'test@example.invalid',
    identities: [{ provider: 'email' }, { provider: options.provider ?? 'google' }],
    app_metadata: { provider: 'email' },
    ...options.user,
  };
  let sessionUser = options.initialSessionUser === undefined ? user : options.initialSessionUser;
  const authenticate = async (provider) => {
    calls.push(provider);
    if (options.authError) throw options.authError;
    if (options.afterAuthUser !== undefined) sessionUser = options.afterAuthUser;
  };
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: sessionUser ? { user: sessionUser } : null } }),
      signInWithPassword: async () => {
        calls.push('password');
        return { error: options.passwordError ?? null };
      },
    },
    functions: { invoke: async () => { calls.push('cancel-subscription'); return { error: options.subscriptionError ?? null }; } },
    from: () => ({ select: () => ({ eq: async () => ({ data: [{ id: 'connection' }] }) }) }),
    rpc: async (name) => { calls.push(name); return { error: options.rpcError ?? null }; },
  };
  let stateIndex = 0;
  const jsx = (type, props) => ({ type, props });
  const { default: Screen } = load('app/settings/delete-account.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    react: { useState: (initial) => [stateIndex++ === 0 ? options.password ?? initial : initial, () => {}] },
    'react-native': { View: 'View', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator', Platform: { OS: options.platform ?? 'ios' }, StyleSheet: { create: (s) => s } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { Stack: { Screen: 'StackScreen' }, useRouter: () => ({ back() {} }) },
    '@expo/vector-icons/FontAwesome': { default: 'Icon' },
    'expo-local-authentication': {
      hasHardwareAsync: async () => options.hardware !== false,
      authenticateAsync: async () => options.deviceResult ?? { success: true },
    },
    '@/components/LocalizedReactNative': { Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'Button', Alert: { alert: (...args) => alerts.push(args) } },
    '@/lib/i18n': { translate: (s) => s },
    '@/lib/supabase': { supabase },
    '@/lib/auth': { signInWithApple: () => authenticate('apple'), signInWithGoogle: () => authenticate('google'), signOut: async () => { calls.push('sign-out'); } },
    '@/lib/calendarSync': { unsyncAll: async () => { calls.push('remove-calendar'); } },
    '@/lib/accountDeletion': { deleteAccountStorage: async (id) => { assert.equal(id, user.id); calls.push('remove-storage'); } },
    '@/app/_layout': { useSession: () => ({ session: { user } }) },
    '@/lib/theme': { useColors: () => ({}) },
    '@/lib/responsive': { useResponsive: () => ({ contentMaxWidth: 390 }) },
    '@/lib/constants': { SCREEN_MAX_WIDTH: 640 },
    '@/lib/user': userHelpers,
    '@/lib/accountVerification': verification,
    '@/store/appStore': { useAppStore: (select) => select({ isPro: false }) },
    '@/lib/lmsCredentialStore': { removeLmsCredentials: async () => { calls.push('remove-credentials'); } },
  });
  const nodes = [];
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    walk(node.props?.children);
  }
  walk(Screen());
  const button = nodes.find((n) => n.type === 'Button' && n.props.children?.props?.children === 'Delete My Account Forever');
  assert.ok(button, 'the real delete button is present');
  return { calls, alerts, nodes, run: button.props.onPress };
}

const destructive = ['cancel-subscription', 'remove-storage', 'delete_user_account', 'remove-credentials', 'remove-calendar', 'sign-out'];
function nothingDeleted(h) { assert.deepEqual(h.calls.filter((c) => destructive.includes(c)), []); }

for (const provider of ['google', 'apple']) {
  test(`${provider} linked to email uses OAuth, then deletes and clears local data`, async () => {
    const h = setup({ provider });
    assert.equal(h.nodes.some((n) => n.type === 'TextInput'), false);
    await h.run();
    assert.deepEqual(h.alerts, []);
    assert.deepEqual(h.calls, [provider, ...destructive]);
  });
  test(`${provider} cancellation never reaches destructive operations`, async () => {
    const h = setup({ provider, authError: { code: provider === 'google' ? 'SIGN_IN_CANCELLED' : 'ERR_REQUEST_CANCELED' } });
    await h.run();
    nothingDeleted(h);
    assert.deepEqual(h.alerts, []);
  });
  test(`${provider} verification with a different account cannot delete either account`, async () => {
    const h = setup({ provider, afterAuthUser: { id: 'other-account' } });
    await h.run();
    nothingDeleted(h);
    assert.equal(h.alerts[0][0], 'Different account');
  });
}

test('Apple without an email still completes verification', async () => {
  const h = setup({ provider: 'apple', user: { email: undefined } });
  await h.run();
  assert.deepEqual(h.calls, ['apple', ...destructive]);
});
test('device verification cancellation does not even open OAuth', async () => {
  const h = setup({ deviceResult: { success: false, error: 'user_cancel' } });
  await h.run();
  assert.deepEqual(h.calls, []);
});
test('session changed before verification cannot delete an account', async () => {
  const h = setup({ initialSessionUser: { id: 'other-account' } });
  await h.run();
  assert.deepEqual(h.calls, []);
  assert.equal(h.alerts[0][0], 'Error');
});
test('a failed OAuth request stops deletion', async () => {
  const h = setup({ authError: new Error('Network unavailable') });
  await h.run();
  nothingDeleted(h);
  assert.equal(h.alerts[0][0], 'Could not delete account');
});
test('legacy email-only account keeps password verification', async () => {
  const h = setup({ user: { identities: [{ provider: 'email' }] }, password: 'test-only-password' });
  assert.equal(h.nodes.some((n) => n.type === 'TextInput'), true);
  await h.run();
  assert.deepEqual(h.calls, ['password', ...destructive]);
});
test('incorrect legacy password stops deletion', async () => {
  const h = setup({ user: { identities: [{ provider: 'email' }] }, password: 'wrong', passwordError: new Error('Invalid credentials') });
  await h.run();
  nothingDeleted(h);
  assert.equal(h.alerts[0][0], 'Incorrect password');
});
test('subscription cancellation failure blocks storage and account deletion', async () => {
  const h = setup({ subscriptionError: new Error('Unavailable') });
  await h.run();
  assert.deepEqual(h.calls, ['google', 'cancel-subscription']);
  assert.equal(h.alerts[0][0], 'Could not cancel your subscription');
});
test('an account without a card subscription can still be deleted', async () => {
  const h = setup({ subscriptionError: { context: { json: async () => ({ code: 'NO_WEB_SUBSCRIPTION' }) } } });
  await h.run();
  assert.deepEqual(h.calls, ['google', ...destructive]);
});
test('starting an Apple browser redirect is not completed verification', async () => {
  const h = setup({ platform: 'web', provider: 'apple' });
  await h.run();
  nothingDeleted(h);
});
