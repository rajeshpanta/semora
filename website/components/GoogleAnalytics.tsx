import Script from 'next/script';
import { GA_ENABLED, GA_MEASUREMENT_ID } from '@/lib/ga';

/**
 * The gtag.js snippet, mounted once per root layout.
 *
 * `afterInteractive` rather than `beforeInteractive`: the tag has no bearing on
 * what renders, and this site's whole visible pitch is above the fold, so
 * loading Google's script ahead of hydration would buy nothing and cost LCP.
 *
 * There is deliberately no manual page_view on route change. GA4's enhanced
 * measurement counts "page changes based on browser history events" by default,
 * which is exactly what a Next client-side navigation is — sending our own
 * would double every view on the site. If that setting is ever turned off in
 * the property, this is the file that has to grow a pathname effect.
 */
export function GoogleAnalytics() {
  if (!GA_ENABLED) return null;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`}
      </Script>
    </>
  );
}
