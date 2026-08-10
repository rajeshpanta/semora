import { supabase } from '@/lib/supabase';

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const GIS_SCRIPT_ID = 'semora-google-identity-services';
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

interface GisCredentialResponse {
  credential?: string;
  select_by?: string;
}

interface GisIdApi {
  initialize: (options: {
    client_id: string;
    callback: (response: GisCredentialResponse) => void;
    nonce: string;
    ux_mode: 'popup';
    context: 'signin';
    auto_select: false;
    cancel_on_tap_outside: boolean;
    itp_support: boolean;
    use_fedcm_for_button: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type: 'standard';
      theme: 'outline' | 'filled_black';
      size: 'large';
      text: 'continue_with';
      shape: 'pill' | 'rectangular';
      logo_alignment: 'left';
      width: number;
    },
  ) => void;
  cancel: () => void;
}

interface GisNamespace {
  accounts: { id: GisIdApi };
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
}

let gisLoadPromise: Promise<GisNamespace> | null = null;
let activeExchange: Promise<void> | null = null;

function googleNamespace(): GisNamespace | undefined {
  return (window as unknown as { google?: GisNamespace }).google;
}

function authError(message: string, code: string): Error {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

function loadGoogleIdentityServices(): Promise<GisNamespace> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(authError('Google sign-in requires a browser.', 'GOOGLE_WEB_UNAVAILABLE'));
  }

  const ready = googleNamespace();
  if (ready?.accounts?.id) return Promise.resolve(ready);
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise<GisNamespace>((resolve, reject) => {
    let script = document.getElementById(GIS_SCRIPT_ID) as HTMLScriptElement | null;
    const createdScript = !script;
    if (!script) {
      script = document.createElement('script');
      script.id = GIS_SCRIPT_ID;
      script.src = GIS_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      const namespace = googleNamespace();
      if (!namespace?.accounts?.id) return;
      settled = true;
      cleanup();
      resolve(namespace);
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      if (createdScript) script?.remove();
      reject(authError('Google sign-in could not load. Check your connection and try again.', 'GOOGLE_SDK_LOAD_FAILED'));
    };
    const poll = window.setInterval(finish, 50);
    const timeout = window.setTimeout(fail, 15_000);
    const cleanup = () => {
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      script?.removeEventListener('load', finish);
      script?.removeEventListener('error', fail);
    };

    script.addEventListener('load', finish);
    script.addEventListener('error', fail);
    finish();
  }).catch((error) => {
    gisLoadPromise = null;
    throw error;
  });

  return gisLoadPromise;
}

async function createNonce(): Promise<{ nonce: string; hashedNonce: string }> {
  if (!window.crypto?.getRandomValues || !window.crypto.subtle) {
    throw authError('This browser cannot securely start Google sign-in.', 'GOOGLE_WEB_CRYPTO_UNAVAILABLE');
  }

  const bytes = window.crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  bytes.forEach((value) => { binary += String.fromCharCode(value); });
  const nonce = window.btoa(binary);
  const encoded = new TextEncoder().encode(nonce);
  const digest = await window.crypto.subtle.digest('SHA-256', encoded);
  const hashedNonce = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return { nonce, hashedNonce };
}

/**
 * Renders Google's official GIS button into an existing Semora auth surface.
 * Google owns the single account chooser; Semora does not invoke One Tap or
 * infer popup dismissal from focus/timing events.
 */
export function mountGoogleWebSignInButton(
  parent: HTMLElement,
  callbacks: GoogleWebButtonCallbacks,
  options: GoogleWebButtonOptions = {},
): () => void {
  if (!GOOGLE_WEB_CLIENT_ID) {
    callbacks.onError(authError(
      'Google sign-in is not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.',
      'GOOGLE_WEB_CLIENT_ID_MISSING',
    ));
    return () => {};
  }

  let disposed = false;
  let gis: GisNamespace | null = null;
  let processingCredential = false;
  let completed = false;

  parent.replaceChildren();

  void Promise.all([loadGoogleIdentityServices(), createNonce()])
    .then(([namespace, noncePair]) => {
      if (disposed) return;
      gis = namespace;

      namespace.accounts.id.initialize({
        client_id: GOOGLE_WEB_CLIENT_ID,
        callback: (response) => {
          if (disposed || completed || processingCredential || activeExchange) return;
          const idToken = response.credential;
          if (!idToken) {
            callbacks.onError(authError('Google did not return an ID token.', 'GOOGLE_ID_TOKEN_MISSING'));
            return;
          }

          processingCredential = true;
          parent.style.pointerEvents = 'none';
          parent.style.opacity = '0.6';
          callbacks.onProcessingChange?.(true);

          const exchange = supabase.auth.signInWithIdToken({
            provider: 'google',
            token: idToken,
            nonce: noncePair.nonce,
          }).then(({ error }) => {
            if (error) throw error;
          });
          activeExchange = exchange;

          void exchange.then(() => {
            completed = true;
            if (!disposed) callbacks.onSuccess();
          }).catch((cause: unknown) => {
            if (disposed) return;
            const error = cause instanceof Error ? cause : new Error('Google sign-in failed.');
            callbacks.onError(error);
          }).finally(() => {
            if (activeExchange === exchange) activeExchange = null;
            processingCredential = false;
            if (!disposed && !completed) {
              parent.style.pointerEvents = '';
              parent.style.opacity = '';
              callbacks.onProcessingChange?.(false);
            }
          });
        },
        nonce: noncePair.hashedNonce,
        ux_mode: 'popup',
        context: 'signin',
        auto_select: false,
        cancel_on_tap_outside: false,
        itp_support: true,
        use_fedcm_for_button: true,
      });

      const measuredWidth = Math.floor(parent.getBoundingClientRect().width);
      namespace.accounts.id.renderButton(parent, {
        type: 'standard',
        theme: options.theme ?? 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: options.shape ?? 'rectangular',
        logo_alignment: 'left',
        width: Math.max(240, Math.min(400, measuredWidth || 320)),
      });
      callbacks.onReady?.();
    })
    .catch((cause: unknown) => {
      if (disposed) return;
      const error = cause instanceof Error ? cause : new Error('Google sign-in could not start.');
      callbacks.onError(error);
    });

  return () => {
    disposed = true;
    // Teardown is the only place Semora cancels GIS. No focus/visibility or
    // timeout path can cancel a user who is still choosing an account.
    try { gis?.accounts.id.cancel(); } catch {}
    parent.replaceChildren();
  };
}

/**
 * Browser sign-in must be initiated through the official rendered GIS button.
 * This guard prevents future callers from reintroducing a competing prompt.
 */
export function signInWithGoogleWeb(): Promise<void> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    return Promise.reject(authError(
      'Google sign-in is not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.',
      'GOOGLE_WEB_CLIENT_ID_MISSING',
    ));
  }
  if (activeExchange) return activeExchange;
  return Promise.reject(authError(
    'Use the official Google sign-in button to continue.',
    'GOOGLE_WEB_BUTTON_REQUIRED',
  ));
}
