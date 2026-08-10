/**
 * Native guard for the browser-only Google Identity Services adapter.
 * Metro resolves googleWebAuth.web.ts in browser builds, so this function is
 * never called by the native Google sign-in branch in lib/auth.ts.
 */
export async function signInWithGoogleWeb(): Promise<void> {
  throw new Error('Browser Google sign-in is unavailable on this platform.');
}

export interface GoogleWebButtonCallbacks {
  onReady?: () => void;
  onProcessingChange?: (processing: boolean) => void;
  onSuccess: () => void;
  onError: (error: Error) => void;
}

export interface GoogleWebButtonOptions {
  theme?: 'outline' | 'filled_black';
  shape?: 'pill' | 'rectangular';
  text?: 'continue_with' | 'signin_with' | 'signup_with';
}

/** No browser button exists in native builds. */
export function mountGoogleWebSignInButton(
  _parent: HTMLElement,
  _callbacks: GoogleWebButtonCallbacks,
  _options: GoogleWebButtonOptions = {},
): () => void {
  return () => {};
}
