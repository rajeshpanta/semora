import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { accountVerificationProvider } from './accountVerification';

Deno.test('Google and Apple accounts never require an email password, including linked accounts', () => {
  for (const provider of ['google', 'apple'] as const) {
    assertEquals(accountVerificationProvider({ identities: [{ provider }] }), provider);
    assertEquals(accountVerificationProvider({
      identities: [{ provider: 'email' }, { provider }],
      app_metadata: { provider: 'email', providers: ['email', provider] },
    }), provider);
  }
});

Deno.test('metadata-only sessions still prefer OAuth over email', () => {
  for (const provider of ['google', 'apple'] as const) {
    assertEquals(accountVerificationProvider({ app_metadata: { provider } }), provider);
    assertEquals(accountVerificationProvider({
      identities: [],
      app_metadata: { provider: 'email', providers: ['email', provider] },
    }), provider);
  }
});

Deno.test('an Apple account without an email address has a usable verification method', () => {
  assertEquals(accountVerificationProvider({
    identities: [{ provider: 'apple' }],
    app_metadata: { provider: 'apple' },
  }), 'apple');
});

Deno.test('multiple linked OAuth identities respect the primary provider when still linked', () => {
  for (const provider of ['google', 'apple'] as const) {
    assertEquals(accountVerificationProvider({
      identities: [{ provider: 'email' }, { provider: 'apple' }, { provider: 'google' }],
      app_metadata: { provider },
    }), provider);
  }
});

Deno.test('stale metadata cannot select an unlinked identity', () => {
  assertEquals(accountVerificationProvider({
    identities: [{ provider: 'google' }],
    app_metadata: { provider: 'apple', providers: ['apple', 'email'] },
  }), 'google');
  assertEquals(accountVerificationProvider({
    identities: [{ provider: 'email' }],
    app_metadata: { provider: 'apple' },
  }), 'email');
});

Deno.test('legacy email accounts retain password verification', () => {
  assertEquals(accountVerificationProvider({ identities: [{ provider: 'email' }] }), 'email');
  assertEquals(accountVerificationProvider({ app_metadata: { provider: 'email' } }), 'email');
});

Deno.test('missing or unsupported identities do not guess a verification method', () => {
  for (const user of [null, undefined, {}, { identities: [{ provider: 'unknown' }] }]) {
    assertEquals(accountVerificationProvider(user), null);
  }
});
