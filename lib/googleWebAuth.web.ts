import { supabase } from '@/lib/supabase';

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const GIS_SCRIPT_ID = 'semora-google-identity-services';
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const OVERLAY_ID = 'semora-google-web-auth';

interface GisCredentialResponse {
  credential?: string;
  select_by?: string;
}

interface GisPromptMomentNotification {
  isSkippedMoment?: () => boolean;
  isDismissedMoment?: () => boolean;
  getDismissedReason?: () => string;
}

interface GisIdApi {
  initialize: (options: {
    client_id: string;
    callback: (response: GisCredentialResponse) => void;
    nonce: string;
    ux_mode: 'popup';
    context: 'signin';
    auto_select: boolean;
    cancel_on_tap_outside: boolean;
    itp_support: boolean;
    use_fedcm_for_prompt: boolean;
    use_fedcm_for_button: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type: 'standard';
      theme: 'outline';
      size: 'large';
      text: 'continue_with';
      shape: 'pill';
      logo_alignment: 'left';
      width: number;
    },
  ) => void;
  prompt: (listener?: (notification: GisPromptMomentNotification) => void) => void;
  cancel: () => void;
}

interface GisNamespace {
  accounts: { id: GisIdApi };
}

interface ActiveAttempt {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
  overlay: HTMLDivElement;
  status: HTMLParagraphElement;
  buttons: HTMLDivElement;
  cancelControls: HTMLButtonElement[];
  gis: GisNamespace | null;
  processingCredential: boolean;
  providerUiObserved: boolean;
  finished: boolean;
  focusTimer: number | null;
  waitingTimer: number | null;
  cleanupListeners: (() => void)[];
}

let gisLoadPromise: Promise<GisNamespace> | null = null;
let activeAttempt: ActiveAttempt | null = null;

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

function createOverlay(): {
  overlay: HTMLDivElement;
  status: HTMLParagraphElement;
  buttons: HTMLDivElement;
  cancelControls: HTMLButtonElement[];
} {
  document.getElementById(OVERLAY_ID)?.remove();

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', `${OVERLAY_ID}-title`);
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147483647',
    'display:flex', 'align-items:center', 'justify-content:center',
    'padding:24px', 'background:rgba(12,11,36,0.58)',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'position:relative', 'box-sizing:border-box', 'width:min(100%,400px)',
    'padding:32px 28px 26px', 'border:1px solid rgba(107,70,193,0.18)',
    'border-radius:24px', 'background:#fff', 'color:#1f1b2d',
    'box-shadow:0 24px 70px rgba(12,11,36,0.28)', 'text-align:center',
  ].join(';');

  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Cancel Google sign-in');
  close.textContent = '×';
  close.style.cssText = [
    'position:absolute', 'top:12px', 'right:14px', 'width:34px', 'height:34px',
    'border:0', 'border-radius:17px', 'background:transparent', 'color:#625c73',
    'font-size:26px', 'line-height:30px', 'cursor:pointer',
  ].join(';');
  close.addEventListener('click', () => cancelGoogleWebSignIn());

  const title = document.createElement('h2');
  title.id = `${OVERLAY_ID}-title`;
  title.textContent = 'Continue with Google';
  title.style.cssText = 'margin:0;font-size:24px;line-height:30px;font-weight:750';

  const status = document.createElement('p');
  status.textContent = 'Loading secure Google sign-in…';
  status.style.cssText = 'margin:10px 0 22px;color:#625c73;font-size:15px;line-height:22px';

  const buttons = document.createElement('div');
  buttons.style.cssText = 'min-height:44px;display:flex;align-items:center;justify-content:center';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  cancel.style.cssText = [
    'margin-top:18px', 'padding:8px 14px', 'border:0', 'background:transparent',
    'color:#6b46c1', 'font-size:14px', 'font-weight:700', 'cursor:pointer',
  ].join(';');
  cancel.addEventListener('click', () => cancelGoogleWebSignIn());

  card.append(close, title, status, buttons, cancel);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  return { overlay, status, buttons, cancelControls: [close, cancel] };
}

function finishAttempt(attempt: ActiveAttempt, error?: Error): void {
  if (attempt.finished) return;
  attempt.finished = true;
  if (attempt.focusTimer != null) window.clearTimeout(attempt.focusTimer);
  if (attempt.waitingTimer != null) window.clearTimeout(attempt.waitingTimer);
  attempt.cleanupListeners.forEach((cleanup) => cleanup());
  attempt.overlay.remove();
  if (activeAttempt === attempt) activeAttempt = null;
  if (error) attempt.reject(error);
  else attempt.resolve();
}

function attachBrowserLifecycle(attempt: ActiveAttempt): void {
  const observeProviderUi = () => {
    if (!attempt.finished && !attempt.processingCredential) attempt.providerUiObserved = true;
  };
  const handleFocus = () => {
    if (!attempt.providerUiObserved || attempt.finished || attempt.processingCredential) return;
    if (attempt.focusTimer != null) window.clearTimeout(attempt.focusTimer);
    // GIS does not expose a dedicated popup-closed callback. Focus returning to
    // the opener after a provider window was observed is the reliable browser
    // signal; leave enough time for the credential callback to win the race.
    attempt.focusTimer = window.setTimeout(() => {
      if (!attempt.finished && !attempt.processingCredential) {
        finishAttempt(attempt, authError('Google sign-in was cancelled.', 'SIGN_IN_CANCELLED'));
      }
    }, 1200);
  };
  const handleVisibility = () => {
    if (document.visibilityState === 'hidden') observeProviderUi();
    else if (document.visibilityState === 'visible') handleFocus();
  };
  const handlePageHide = () => {
    if (!attempt.finished) finishAttempt(attempt, authError('Google sign-in was cancelled.', 'SIGN_IN_CANCELLED'));
  };

  window.addEventListener('blur', observeProviderUi);
  window.addEventListener('focus', handleFocus);
  window.addEventListener('pagehide', handlePageHide);
  document.addEventListener('visibilitychange', handleVisibility);
  attempt.cleanupListeners.push(
    () => window.removeEventListener('blur', observeProviderUi),
    () => window.removeEventListener('focus', handleFocus),
    () => window.removeEventListener('pagehide', handlePageHide),
    () => document.removeEventListener('visibilitychange', handleVisibility),
  );
}

async function startAttempt(attempt: ActiveAttempt): Promise<void> {
  try {
    const [gis, noncePair] = await Promise.all([
      loadGoogleIdentityServices(),
      createNonce(),
    ]);
    if (attempt.finished) return;
    attempt.gis = gis;

    gis.accounts.id.initialize({
      client_id: GOOGLE_WEB_CLIENT_ID,
      callback: (response) => {
        if (attempt.finished || activeAttempt !== attempt) return;
        const idToken = response.credential;
        if (!idToken) {
          finishAttempt(attempt, authError('Google did not return an ID token.', 'GOOGLE_ID_TOKEN_MISSING'));
          return;
        }

        attempt.processingCredential = true;
        attempt.cancelControls.forEach((control) => { control.disabled = true; });
        attempt.status.textContent = 'Finishing sign-in…';
        void supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
          nonce: noncePair.nonce,
        }).then(({ error }) => {
          if (error) throw error;
          finishAttempt(attempt);
        }).catch((cause: unknown) => {
          const error = cause instanceof Error ? cause : new Error('Google sign-in failed.');
          finishAttempt(attempt, error);
        });
      },
      nonce: noncePair.hashedNonce,
      ux_mode: 'popup',
      context: 'signin',
      auto_select: false,
      cancel_on_tap_outside: false,
      itp_support: true,
      use_fedcm_for_prompt: true,
      use_fedcm_for_button: true,
    });

    gis.accounts.id.renderButton(attempt.buttons, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'pill',
      logo_alignment: 'left',
      width: 280,
    });
    attempt.status.textContent = 'Choose your Google account to continue.';

    // One Tap preserves the old /oauth route's immediate-launch experience.
    // The rendered official button remains available when One Tap is blocked,
    // opted out, cooling down, or unsupported by the browser.
    gis.accounts.id.prompt((notification) => {
      if (attempt.finished || attempt.processingCredential) return;
      if (notification.isSkippedMoment?.() || notification.isDismissedMoment?.()) {
        const reason = notification.getDismissedReason?.();
        if (reason !== 'credential_returned') {
          attempt.status.textContent = 'Choose your Google account below to continue.';
        }
      }
    });

    attempt.waitingTimer = window.setTimeout(() => {
      if (!attempt.finished && !attempt.processingCredential) {
        attempt.status.textContent = 'Still waiting? Allow Google popups, or cancel and try again.';
      }
    }, 20_000);
  } catch (cause: unknown) {
    const error = cause instanceof Error ? cause : new Error('Google sign-in could not start.');
    finishAttempt(attempt, error);
  }
}

/**
 * Starts the official Google Identity Services browser flow and resolves only
 * after the returned Google ID token has become a Supabase session.
 *
 * A single in-flight promise prevents duplicate buttons, SDK initialization,
 * and Supabase token exchanges when a user double-clicks or React remounts.
 */
export function signInWithGoogleWeb(): Promise<void> {
  if (activeAttempt) return activeAttempt.promise;
  if (!GOOGLE_WEB_CLIENT_ID) {
    return Promise.reject(authError(
      'Google sign-in is not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.',
      'GOOGLE_WEB_CLIENT_ID_MISSING',
    ));
  }

  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const ui = createOverlay();
  const attempt: ActiveAttempt = {
    promise,
    resolve,
    reject,
    ...ui,
    gis: null,
    processingCredential: false,
    providerUiObserved: false,
    finished: false,
    focusTimer: null,
    waitingTimer: null,
    cleanupListeners: [],
  };
  activeAttempt = attempt;
  attachBrowserLifecycle(attempt);
  void startAttempt(attempt);
  return promise;
}

/** Cancels One Tap/the surrounding modal and rejects the active promise. */
export function cancelGoogleWebSignIn(): void {
  const attempt = activeAttempt;
  if (!attempt || attempt.finished || attempt.processingCredential) return;
  try { attempt.gis?.accounts.id.cancel(); } catch {}
  finishAttempt(attempt, authError('Google sign-in was cancelled.', 'SIGN_IN_CANCELLED'));
}
