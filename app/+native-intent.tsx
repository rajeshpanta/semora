import { readReloadingAt } from '@/lib/reloadMarker';
import { isSemoraSiteUrl, routeSystemUrl } from '@/lib/shareLinks';

/**
 * Universal Links: https://semoraai.com/{invite,join,collaborate}/<value>.
 *
 * iOS hands the app the full https URL. expo-router strips the origin and
 * would look for a screen at invite/<code>, which does not exist (the screens
 * are app/invite.tsx, app/join.tsx and app/collaborate.tsx, reading ?code= or
 * ?token=), so the student would land on +not-found. This rewrites those three
 * shapes to the query form the screens already handle, signed in or out.
 *
 * The rules live in lib/shareLinks.ts routeSystemUrl (pure, tested):
 *   - every URL that is not on semoraai.com is returned exactly as it came in
 *     (semora://, the Google sign-in scheme, auth email links), so nothing that
 *     works today can change;
 *   - a semoraai.com URL that is not a share link goes to Today, never to
 *     "This screen doesn't exist";
 *   - the launch URL survives the reload that applies an update, so an
 *     `initial` URL right after AppUpdateGate's reload is a replay and goes to
 *     Today — without this the student would be dropped back on an invite
 *     they finished hours ago. Every real tap opens the link.
 *
 * NEVER SHIP app.json's "associatedDomains" WITHOUT THIS FILE. The entitlement
 * is part of the native fingerprint; this file is JS and is not, so an OTA from
 * a tree missing it would reach the same binary and every share link would
 * open on +not-found with no error anywhere. lib/shareLinks.test.ts fails if
 * the two ever drift apart.
 *
 * Synchronous and never throws: expo-router calls this inside getInitialURL,
 * and a throw there would lose the link entirely. app/_layout.tsx's own
 * Linking listener also sees these URLs and ignores them (Linking.parse gives
 * hostname "semoraai.com", which none of its branches match).
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  try {
    // Every ordinary launch and every semora:// / sign-in URL passes through
    // here too. Answer those without a synchronous keychain read.
    if (!isSemoraSiteUrl(path)) return path;
    return routeSystemUrl(path, initial, initial ? readReloadingAt() : null, Date.now());
  } catch {
    // Same rule as routeSystemUrl, without anything that could throw again:
    // our own site goes home, everything else passes through untouched.
    return /^https:\/\/(www\.)?semoraai\.com(\/|$)/i.test(String(path)) ? '/' : path;
  }
}
