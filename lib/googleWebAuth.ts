/**
 * Native guard for the browser-only Google Identity Services adapter.
 * Metro resolves googleWebAuth.web.ts in browser builds, so this function is
 * never called by the native Google sign-in branch in lib/auth.ts.
 */
export async function signInWithGoogleWeb(): Promise<void> {
  throw new Error('Browser Google sign-in is unavailable on this platform.');
}

/** No browser prompt exists in native builds. */
export function cancelGoogleWebSignIn(): void {}
