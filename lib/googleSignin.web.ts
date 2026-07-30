import type * as GoogleSigninModule from '@react-native-google-signin/google-signin';

// Web shim for lib/googleSignin.ts — see that file for why the real package
// cannot be imported in a browser bundle. Metro resolves `.web.ts` first, so
// iOS never loads this.
//
// The native SDK is meaningless on web: browser Google auth goes through
// supabase.auth.signInWithOAuth() instead (Phase 3), which needs no native
// module. Methods that a shared code path may still call during sign-out or
// setup are harmless no-ops; the interactive ones throw a clear error rather
// than failing silently, so a missed call site surfaces immediately in dev
// instead of hanging a button forever.

const WEB_UNSUPPORTED =
  'Native Google Sign-In is unavailable on web. Use supabase.auth.signInWithOAuth({ provider: "google" }) instead.';

// Cast because a hand-written stub can't structurally satisfy the SDK's full
// generated types, and pretending otherwise would only add noise — the seam
// exists so callers keep their native typings.
export const GoogleSignin = {
  /** No-op: there is no native module to hand client ids to. */
  configure: (_options?: unknown): void => {},
  /** Play Services is an Android concept; harmless true keeps guards passing. */
  hasPlayServices: async (_options?: unknown): Promise<boolean> => true,
  signIn: async (): Promise<never> => {
    throw new Error(WEB_UNSUPPORTED);
  },
  addScopes: async (_options?: unknown): Promise<never> => {
    throw new Error(WEB_UNSUPPORTED);
  },
  getTokens: async (): Promise<never> => {
    throw new Error(WEB_UNSUPPORTED);
  },
  /** Nobody is ever signed in via the native SDK on web. */
  getCurrentUser: () => null,
  /**
   * Deliberately a no-op rather than a throw: signOut() runs a long cleanup
   * chain (cancel reminders, unregister push, clear caches) and must never be
   * derailed by a provider that was never signed in on this platform.
   */
  signOut: async (): Promise<void> => {},
} as unknown as typeof GoogleSigninModule.GoogleSignin;
