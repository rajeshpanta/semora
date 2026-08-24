/**
 * Google Analytics 4.
 *
 * The measurement ID lives in NEXT_PUBLIC_GA_ID on the Vercel project rather
 * than in source, matching SITE_URL. It is not a secret — it ships in the page
 * source of every deploy — but keeping it in an env var makes an unset value a
 * working kill switch: no var, no script, no request to Google. That is also
 * what keeps local development and preview deploys out of the property, which
 * is the same reason lib/telemetry.ts drops events outside production. Fifty
 * page views of /compare made from a laptop already polluted one analytics
 * table here; GA would have had no equivalent of the device_id filter to undo
 * it after the fact.
 */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID ?? '';

/**
 * Vercel injects NEXT_PUBLIC_VERCEL_ENV as 'production' | 'preview' |
 * 'development'; it is absent locally, where NODE_ENV answers the same
 * question. Checked in that order so a preview deploy that happens to inherit
 * the ID still stays silent.
 */
export const GA_ENABLED =
  GA_MEASUREMENT_ID !== '' &&
  (process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV) === 'production';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

type GaParams = Record<string, string | number | boolean | null>;

/** GA4 truncates parameter values at 100 characters — do it here so what the
 *  property stores is what we can read back, rather than a silent cut. */
const MAX_GA_VALUE_CHARS = 100;

/**
 * Send one event to GA4. Fire-and-forget, and silent when the script never
 * loaded — a blocked tag must not be able to break a click handler.
 */
export function gaEvent(name: string, params: GaParams = {}): void {
  if (!GA_ENABLED) return;
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  const out: GaParams = {};
  for (const [k, v] of Object.entries(params)) {
    out[k] = typeof v === 'string' ? v.slice(0, MAX_GA_VALUE_CHARS) : v;
  }
  try {
    window.gtag('event', name, out);
  } catch {
    // Tag blocked or half-initialised. Nothing to do and nothing to surface.
  }
}
