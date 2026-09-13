import { assert, assertEquals, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildServiceAccountJwt,
  interpretSubscription,
  parseServiceAccount,
  playTransactionKey,
  type SubscriptionPurchaseV2,
} from '../google-play.ts';

const OURS = ['semora_pro_monthly', 'semora_pro_annual'];
const NOW = Date.parse('2026-09-13T12:00:00Z');
const FUTURE = '2026-10-13T12:00:00Z';
const PAST = '2026-09-01T12:00:00Z';

function sub(overrides: Partial<SubscriptionPurchaseV2>): SubscriptionPurchaseV2 {
  return {
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    lineItems: [{ productId: 'semora_pro_monthly', expiryTime: FUTURE }],
    ...overrides,
  };
}

Deno.test('an active subscription grants Pro until Google says it expires', () => {
  const r = interpretSubscription(sub({}), OURS, NOW);
  assertEquals(r.outcome.kind, 'active');
  if (r.outcome.kind !== 'active') return;
  assertEquals(r.outcome.productId, 'semora_pro_monthly');
  assertEquals(r.outcome.expiresAt.toISOString(), '2026-10-13T12:00:00.000Z');
  assertEquals(r.environment, 'Production');
  assertEquals(r.needsAcknowledgement, false);
});

// Cancelling stops the next renewal, not the time already paid for.
Deno.test('a cancelled subscription keeps Pro until its expiry', () => {
  const r = interpretSubscription(sub({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED' }), OURS, NOW);
  assertEquals(r.outcome.kind, 'active');
});

Deno.test('a cancelled subscription past its expiry has ended', () => {
  const r = interpretSubscription(
    sub({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', lineItems: [{ productId: 'semora_pro_annual', expiryTime: PAST }] }),
    OURS,
    NOW,
  );
  assertEquals(r.outcome.kind, 'ended');
});

Deno.test('grace period still grants Pro while Google retries the card', () => {
  const r = interpretSubscription(sub({ subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' }), OURS, NOW);
  assertEquals(r.outcome.kind, 'active');
});

Deno.test('expired, on hold and paused all end access', () => {
  for (const state of ['SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PAUSED']) {
    assertEquals(interpretSubscription(sub({ subscriptionState: state }), OURS, NOW).outcome.kind, 'ended', state);
  }
});

// The expensive confusion the Apple path already learned: an answer that says
// nothing about payment must never be written down as a cancellation.
Deno.test('pending and unrecognised states are unknown, never ended', () => {
  for (const state of [
    'SUBSCRIPTION_STATE_PENDING',
    'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED',
    'SUBSCRIPTION_STATE_UNSPECIFIED',
    'SOMETHING_GOOGLE_ADDS_LATER',
  ]) {
    assertEquals(interpretSubscription(sub({ subscriptionState: state }), OURS, NOW).outcome.kind, 'unknown', state);
  }
});

Deno.test("another product's token says nothing about Semora Pro", () => {
  const r = interpretSubscription(sub({ lineItems: [{ productId: 'citizen_pro', expiryTime: FUTURE }] }), OURS, NOW);
  assertEquals(r.outcome.kind, 'unknown');
});

Deno.test('an entitled state with no readable expiry is unknown, not expired', () => {
  const r = interpretSubscription(sub({ lineItems: [{ productId: 'semora_pro_monthly' }] }), OURS, NOW);
  assertEquals(r.outcome.kind, 'unknown');
});

Deno.test('an unacknowledged active purchase is flagged for acknowledgement', () => {
  const r = interpretSubscription(sub({ acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' }), OURS, NOW);
  assertEquals(r.needsAcknowledgement, true);
});

// Acknowledging something that grants nothing would stop Google's automatic
// refund of a purchase the student never got.
Deno.test('an ended purchase is never flagged for acknowledgement', () => {
  const r = interpretSubscription(
    sub({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' }),
    OURS,
    NOW,
  );
  assertEquals(r.needsAcknowledgement, false);
});

Deno.test('license-tester purchases are labelled Sandbox', () => {
  assertEquals(interpretSubscription(sub({ testPurchase: {} }), OURS, NOW).environment, 'Sandbox');
});

Deno.test('the transaction key is stable, prefixed, and does not contain the token', async () => {
  const token = 'abcdefghijklmnop.AO-J1Oexampletoken';
  const a = await playTransactionKey(token);
  assertEquals(a, await playTransactionKey(token));
  assertMatch(a, /^gp:[0-9a-f]{64}$/);
  assert(!a.includes(token));
});

Deno.test('service account JSON must carry an email and a private key', () => {
  assertEquals(parseServiceAccount(''), null);
  assertEquals(parseServiceAccount('not json'), null);
  assertEquals(parseServiceAccount(JSON.stringify({ client_email: 'x@y' })), null);
  const ok = parseServiceAccount(JSON.stringify({
    client_email: 'play@semora.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n',
  }));
  assertEquals(ok?.client_email, 'play@semora.iam.gserviceaccount.com');
});

Deno.test('the service account assertion is a verifiable RS256 JWT', async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  let bin = '';
  for (const b of pkcs8) bin += String.fromCharCode(b);
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(bin).match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;

  const jwt = await buildServiceAccountJwt({ client_email: 'play@semora.iam.gserviceaccount.com', private_key: pem }, 1_789_000_000);
  const [h, c, s] = jwt.split('.');
  const decode = (part: string) => {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  };
  const claims = JSON.parse(new TextDecoder().decode(decode(c)));
  assertEquals(JSON.parse(new TextDecoder().decode(decode(h))).alg, 'RS256');
  assertEquals(claims.iss, 'play@semora.iam.gserviceaccount.com');
  assertEquals(claims.scope, 'https://www.googleapis.com/auth/androidpublisher');
  assertEquals(claims.exp - claims.iat, 3600);

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    pair.publicKey,
    decode(s),
    new TextEncoder().encode(`${h}.${c}`),
  );
  assert(valid);
});
