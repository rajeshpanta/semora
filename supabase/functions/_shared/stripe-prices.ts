/**
 * Mapping a Stripe price id to a plan name. Deliberately dependency-free.
 *
 * This lives apart from stripe.ts because stripe.ts imports the Stripe SDK,
 * and the SDK drags in npm:@types/node during type-checking. That is fine at
 * runtime in the edge function, where the import map is resolved, and fatal
 * in CI, where a bare checkout has no node_modules — the test for this logic
 * failed on exactly that and nothing else. Pure logic should not need a
 * payment SDK present in order to be checked.
 *
 * stripe.ts re-exports both of these, so callers are unaffected.
 */

/** Split a comma-separated env var into ids, dropping blanks and whitespace. */
export function priceIdList(value: string): string[] {
  return value
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * Resolve a price id against the ids we sell at now AND every id we have ever
 * sold at.
 *
 * WHY THE LEGACY IDS MATTER. Raising a price on Stripe creates a NEW price
 * object; existing subscriptions stay on the old one, which is how a
 * grandfathered subscriber keeps their rate. Comparing against only the two
 * current ids means a grandfathered renewal resolves to null — and a null
 * plan makes hasPaidPlan false in app/settings/index.tsx, so a paying
 * customer gets shown the upgrade rows at the price they were promised they
 * would not pay. Access is never lost: is_pro() reads the boolean and the
 * expiry, never the plan. It just fails quietly, up to a year later.
 */
export function resolvePlan(
  priceId: string | null | undefined,
  monthlyIds: string[],
  annualIds: string[],
): 'monthly' | 'annual' | null {
  if (!priceId) return null;
  if (annualIds.includes(priceId)) return 'annual';
  if (monthlyIds.includes(priceId)) return 'monthly';
  return null;
}
