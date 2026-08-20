import { Platform, Share } from 'react-native';

/**
 * Share a link on every platform, without dead-ending in a browser.
 *
 * react-native-web's Share is not a polyfill — it rejects outright with
 * "Share is not supported in this browser" whenever `navigator.share` is
 * undefined, which is every desktop Chrome and Firefox. Because Semora
 * monkey-patches a real modal over RNW's no-op Alert (components/WebAlertHost),
 * that developer string was being shown to students verbatim. Worse, the three
 * call sites had all already MINTED something before sharing — a referral code,
 * a course share token, a collaboration invite — so the failure discarded a
 * real, already-persisted link and left no way to recover it.
 *
 * The fallback ladder is: native share sheet → `navigator.share` where the
 * browser has it (Safari, and Chrome on Android) → clipboard, which every
 * browser has. Copying a link is a perfectly good outcome; erroring is not.
 */
export type ShareLinkResult = 'shared' | 'copied' | 'failed';

/**
 * EVERY browser API in this file is bounded, because two of them can hang
 * rather than reject: navigator.share without transient user activation, and
 * clipboard.writeText while the document lacks focus. Neither settles, and an
 * unsettled promise leaves the caller's "sharing" spinner running for the rest
 * of the session — the exact dead-button failure this helper exists to prevent.
 * Every path therefore resolves within a few seconds, and the worst outcome is
 * telling the user to copy by hand.
 */
const bounded = <T,>(work: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    work,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);

export async function shareLink(input: {
  url: string;
  title?: string;
  message?: string;
}): Promise<ShareLinkResult> {
  const { url, title, message } = input;

  if (Platform.OS !== 'web') {
    await Share.share({ url, ...(title ? { title } : {}), ...(message ? { message } : {}) });
    return 'shared';
  }

  const nav: any = typeof navigator !== 'undefined' ? navigator : null;

  if (nav?.share) {
    try {
      await bounded(
        nav.share({ url, ...(title ? { title } : {}), ...(message ? { text: message } : {}) }),
        30_000,
      );
      return 'shared';
    } catch (err: any) {
      // The user dismissing the sheet is not a failure and must not fall
      // through to a surprise clipboard write.
      if (err?.name === 'AbortError') return 'shared';
    }
  }

  try {
    await bounded(nav.clipboard.writeText(url), 2500);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/**
 * Share a block of TEXT — a tutor's answer, not a link.
 *
 * Same ladder as shareLink and for the same reason: react-native-web's Share
 * is not a polyfill, it REJECTS outright wherever `navigator.share` is missing
 * (Firefox everywhere, Chrome and Edge on macOS and Linux). Calling it
 * directly and catching the rejection produces a button that silently does
 * nothing — which is what the tutor's share control did before this existed.
 *
 * Copying is a perfectly good outcome for an answer the student wants to keep;
 * doing nothing is not.
 */
export async function shareText(input: { text: string; title?: string }): Promise<ShareLinkResult> {
  const { text, title } = input;
  if (!text.trim()) return 'failed';

  if (Platform.OS !== 'web') {
    // The native sheet includes Copy, so there is no separate clipboard path.
    await Share.share({ message: text, ...(title ? { title } : {}) });
    return 'shared';
  }

  const nav: any = typeof navigator !== 'undefined' ? navigator : null;

  if (nav?.share) {
    try {
      await bounded(nav.share({ text, ...(title ? { title } : {}) }), 30_000);
      return 'shared';
    } catch (err: any) {
      // Dismissing the sheet is not a failure and must not fall through to a
      // surprise clipboard write.
      if (err?.name === 'AbortError') return 'shared';
    }
  }

  try {
    await bounded(nav.clipboard.writeText(text), 2500);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/**
 * What to tell the user after shareText, or null when the sheet handled it.
 *
 * Unlike a link, an answer is far too long to put in an alert body — so the
 * failure case points at the text itself, which is selectable on screen.
 */
export function shareTextMessage(result: ShareLinkResult): { title: string; body: string } | null {
  if (result === 'shared') return null;
  if (result === 'copied') {
    return { title: 'Copied', body: 'The answer is on your clipboard — paste it anywhere.' };
  }
  return {
    title: "Couldn't copy that",
    body: 'Press and hold the answer to select it, then copy.',
  };
}

/** What to tell the user after shareLink, or null when the OS sheet handled it. */
export function shareLinkMessage(result: ShareLinkResult, url: string): { title: string; body: string } | null {
  if (result === 'shared') return null;
  if (result === 'copied') {
    return { title: 'Link copied', body: 'The link is on your clipboard — paste it anywhere to share it.' };
  }
  // Never swallow the link itself: it already exists server-side, and showing
  // it is the difference between a minor annoyance and losing it.
  return { title: 'Copy this link', body: url };
}
