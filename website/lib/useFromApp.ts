'use client';

import { useSyncExternalStore } from 'react';

/**
 * Did this visitor arrive from the app?
 *
 * The site and the app are different origins, so the site cannot see the
 * session — the app flags it on the way out with ?from=app, and the header
 * uses that to stop offering "Sign in" to someone already signed in.
 *
 * It has to be read after hydration: the pages are statically generated, so
 * the server has no query string and rendering the answer during SSR would
 * mismatch. Both call sites did that with `useState(false)` plus an effect
 * that immediately setState — correct behaviour, but it schedules a second
 * render on every page load purely to answer a question the browser could
 * have been asked once.
 *
 * useSyncExternalStore expresses the same thing without the extra render: a
 * server snapshot of false, a client snapshot read straight from the URL, and
 * no subscription, because the value cannot change without a navigation that
 * remounts this anyway.
 */
const NO_SUBSCRIBE = () => () => {};

function readFromApp(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('from') === 'app';
  } catch {
    // A malformed query string is not a reason to break the header.
    return false;
  }
}

export function useFromApp(): boolean {
  return useSyncExternalStore(NO_SUBSCRIBE, readFromApp, () => false);
}
