import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin } from '@/lib/googleSignin';

/**
 * Why a provider sign-in failed — enough to tell four different causes apart.
 *
 * Three devices on 1.8 tapped Apple and Google 61 times between them and every
 * single attempt failed in 4–14ms with the providers' *generic* codes
 * (Apple ERR_REQUEST_UNKNOWN = ASAuthorizationError 1000, Google -1 =
 * kGIDSignInErrorCodeUnknown). Ten milliseconds is far too fast for a sheet to
 * present, reach Apple or Google, and come back — so the request was rejected
 * before any UI existed. "Unknown" from both SDKs is the shape of an
 * environment problem, not a provider problem, and the recorded `code` alone
 * could not say which environment problem.
 *
 * What made that expensive to diagnose: a fourth device on the SAME build the
 * same evening tapped Google seven times and got six ERR_REQUEST_CANCELED —
 * the sheet presented perfectly. So the build is not categorically broken, and
 * every hypothesis that blamed the binary had to be discarded one at a time
 * against artifacts rather than against a log line. These fields are the log
 * line that would have answered it in one read.
 *
 * The four causes, and the field that identifies each:
 *
 *   missing presentation anchor  app_state — a request issued while the app is
 *                                not `active` has no key window to attach to,
 *                                and both SDKs answer that with "unknown".
 *   native module unavailable    mod_apple / mod_google / apple_avail — whether
 *                                the module object exists at all, and whether
 *                                iOS reports Apple sign-in usable on this device.
 *   OTA / native bundle mismatch native_build vs manifest_build. The first comes
 *                                from the binary's Info.plist and can never
 *                                change; the second travels with the JS. Equal
 *                                means the running JS is the JS that shipped.
 *   provider SDK failure         code + msg + domain, the provider's own words,
 *                                which were previously thrown away.
 *
 * `model` is the fifth answer and the cheapest one: the Simulator reports
 * `arm64` or `x86_64` where hardware reports `iPhone17,1`. A Release build run
 * on a Simulator still writes to production analytics (the dev guard keys off
 * __DEV__, not the device), and neither Apple nor Google sign-in works there —
 * so a Simulator would produce exactly the failures observed, from a build that
 * is perfectly fine on a phone.
 *
 * Everything is bounded and non-identifying: a device model family, a build
 * number, an error code. No tokens, no account, no personal data.
 */
export type AuthFailureDiagnostics = Record<string, string | number | boolean | null>;

/** Provider error text is attacker-uncontrolled but unbounded — keep it short. */
const MAX_MSG = 120;
const MAX_FIELD = 60;

function short(value: unknown, max = MAX_FIELD): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'string' ? value : String(value);
  const trimmed = text.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * Never throws. A diagnostic that can break the error path it is reporting on
 * is worse than no diagnostic — the catch block that calls this is already the
 * user's failure, and it must still show them the message and reset the button.
 */
export async function collectAuthFailureDiagnostics(
  provider: 'apple' | 'google',
  err: any,
): Promise<AuthFailureDiagnostics> {
  // Hard ceiling on the whole collection. The only await below is a native
  // probe, and a diagnostic that can hang is a diagnostic that can hold up the
  // very failure path it exists to explain. Losing a field beats stalling.
  return await Promise.race([
    collect(provider, err),
    new Promise<AuthFailureDiagnostics>((resolve) =>
      setTimeout(() => resolve({ diag_timeout: true }), 1_500),
    ),
  ]);
}

async function collect(
  provider: 'apple' | 'google',
  err: any,
): Promise<AuthFailureDiagnostics> {
  const out: AuthFailureDiagnostics = {};

  // The provider's own account of what went wrong. Recorded first so a throw
  // anywhere below still leaves the most important fields behind.
  try {
    out.msg = short(err?.message, MAX_MSG);
    out.domain = short(err?.domain ?? err?.nativeStackIOS?.[0] ?? null);
    out.err_name = short(err?.name);
  } catch {}

  try {
    out.app_state = short(AppState.currentState) ?? 'unknown';
  } catch {}

  try {
    // The CALLABLE, not the namespace. `import * as X` always yields an object,
    // so Boolean(X) is true even when the native side is missing — a field that
    // reads `true` in the one situation it exists to detect is worse than no
    // field. Note these still only prove the JS binding is present; the
    // authoritative native-availability answer is apple_avail / apple_probe_err
    // for Apple, and the provider's own `msg` for Google.
    out.mod_apple = typeof AppleAuthentication?.signInAsync === 'function';
    out.mod_google = typeof GoogleSignin?.signIn === 'function';
  } catch {}

  // Only meaningful for the Apple path, and only on iOS — isAvailableAsync
  // resolves false on every other platform by design, which would read as a
  // fault rather than as "not applicable".
  if (Platform.OS === 'ios' && provider === 'apple') {
    try {
      out.apple_avail = await AppleAuthentication.isAvailableAsync();
    } catch (probeError: any) {
      // The probe failing is itself the answer: the module is not usable.
      out.apple_avail = false;
      out.apple_probe_err = short(probeError?.message);
    }
  }

  try {
    const nativeBuild = short(Constants.platform?.ios?.buildNumber);
    const manifestBuild = short((Constants.expoConfig as any)?.ios?.buildNumber);
    out.native_build = nativeBuild;
    out.manifest_build = manifestBuild;
    // Unequal means the JS running now did not ship inside this binary.
    out.build_match = nativeBuild !== null && manifestBuild !== null
      ? nativeBuild === manifestBuild
      : null;
    // `arm64` / `x86_64` here means Simulator; hardware reports iPhoneN,N.
    out.model = short(Constants.platform?.ios?.model);
    out.exec_env = short(Constants.executionEnvironment);
    out.debug_mode = Boolean(Constants.debugMode);
  } catch {}

  return out;
}
