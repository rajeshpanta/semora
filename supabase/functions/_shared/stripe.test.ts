import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { priceIdList, resolvePlan } from './stripe.ts';

// The price ids in these tests are shaped like Stripe's but are invented.

const CURRENT_MONTHLY = 'price_current_monthly';
const CURRENT_ANNUAL = 'price_current_annual';
const OLD_MONTHLY = 'price_2026_monthly_399';
const OLD_ANNUAL = 'price_2026_annual_1999';

const monthly = [CURRENT_MONTHLY, OLD_MONTHLY];
const annual = [CURRENT_ANNUAL, OLD_ANNUAL];

Deno.test('resolves the prices we currently sell', () => {
  assertEquals(resolvePlan(CURRENT_MONTHLY, monthly, annual), 'monthly');
  assertEquals(resolvePlan(CURRENT_ANNUAL, monthly, annual), 'annual');
});

// The regression this file exists for. A grandfathered subscriber renews on
// the price they bought at, long after the env vars point somewhere else. If
// this returns null the webhook writes `plan: null`, and Settings then shows
// a paying customer the upgrade rows at the new price.
Deno.test('still resolves a price we no longer sell', () => {
  assertEquals(resolvePlan(OLD_MONTHLY, monthly, annual), 'monthly');
  assertEquals(resolvePlan(OLD_ANNUAL, monthly, annual), 'annual');
});

Deno.test('an unknown price resolves to null rather than guessing', () => {
  assertEquals(resolvePlan('price_never_seen', monthly, annual), null);
  assertEquals(resolvePlan(null, monthly, annual), null);
  assertEquals(resolvePlan(undefined, monthly, annual), null);
  assertEquals(resolvePlan('', monthly, annual), null);
});

// An unset legacy env var is the empty string. Splitting that naively yields
// [''], and an empty id must never match anything.
Deno.test('blank and unset legacy vars contribute no ids', () => {
  assertEquals(priceIdList(''), []);
  assertEquals(priceIdList('   '), []);
  assertEquals(priceIdList(',,'), []);
  assertEquals(resolvePlan('', [''], ['']), null);
});

Deno.test('legacy vars accept a list, because this will not be the last change', () => {
  assertEquals(priceIdList('price_a,price_b'), ['price_a', 'price_b']);
  assertEquals(priceIdList(' price_a , price_b '), ['price_a', 'price_b']);
  assertEquals(resolvePlan('price_b', ['price_now', 'price_a', 'price_b'], []), 'monthly');
});

// Annual is checked before monthly. If an id were ever in both lists by
// mistake, this pins which one wins so the behaviour is not accidental.
Deno.test('annual wins if an id is misconfigured into both lists', () => {
  assertEquals(resolvePlan('price_dup', ['price_dup'], ['price_dup']), 'annual');
});
