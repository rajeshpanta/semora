import type { Metadata } from 'next';
import { Fraunces } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { PageTelemetry } from '@/components/PageTelemetry';
import { InteractionTelemetry } from '@/components/InteractionTelemetry';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { GoogleAnalytics } from '@/components/GoogleAnalytics';
import '../globals.css';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { JsonLd } from '@/components/JsonLd';
import { organizationSchema, webSiteSchema } from '@/lib/schema';
import { SITE_NAME, SITE_DESCRIPTION, APP_STORE_ID } from '@/lib/semora-facts';
import { SITE_URL } from '@/lib/site';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  // Italic is the accent voice in the hero headline — Fraunces' italic has real
  // character (a true cut, not a slant), which is most of what makes the type
  // feel designed rather than defaulted.
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Scan your syllabus. Never miss a deadline.`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    siteName: SITE_NAME,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
  // Safari's Smart App Banner, on every page of the marketing site.
  //
  // WHY IT EARNS ITS PLACE HERE. Mobile is where this audience is and where
  // the site already ranks best — position 8.2 on mobile against 26.0 on
  // desktop — but mobile click-through is HALF the desktop rate, because a
  // phone SERP for a study-app query is mostly App Store cards. The visitors
  // who do arrive on a phone are one tap from an install and were being handed
  // six ordinary links instead. This is the tap.
  //
  // Renders `<meta name="apple-itunes-app" content="app-id=...">`, which iOS
  // Safari turns into a native banner above the page. Every other browser
  // ignores the tag entirely, so there is nothing to hide or feature-detect.
  //
  // No `appArgument`: it is handed to the app on open, and Semora has no
  // handler that expects one. Adding a value nothing reads is a deep link
  // waiting to behave oddly later.
  itunes: {
    appId: APP_STORE_ID,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={fraunces.variable}>
      <body>
        {/* If JS never runs, Reveal's scroll-triggered content must not stay
            invisible forever — force it visible for the no-JS case. */}
        <noscript>
          <style>{'.js-reveal{opacity:1!important;transform:none!important;}'}</style>
        </noscript>
        {/* WebSite carries the site name Google prints above a result; without
            it the fallback is the bare domain ("semoraai.com"). Organization
            covers the publisher entity. Both are site-wide, so they belong
            here rather than being repeated per page. */}
        <JsonLd data={webSiteSchema()} />
        <JsonLd data={organizationSchema()} />
        <Nav locale="en" />
        <main>{children}</main>
        <Footer locale="en" />
        <Analytics />
        <PageTelemetry />
        <InteractionTelemetry />
        <SpeedInsights />
        <GoogleAnalytics />
      </body>
    </html>
  );
}
