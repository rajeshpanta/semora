import type { Metadata } from 'next';
import { Fraunces } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { PageTelemetry } from '@/components/PageTelemetry';
import { InteractionTelemetry } from '@/components/InteractionTelemetry';
import { SpeedInsights } from '@vercel/speed-insights/next';
import '../globals.css';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { JsonLd } from '@/components/JsonLd';
import { organizationSchema, webSiteSchema } from '@/lib/schema';
import { SITE_NAME, SITE_DESCRIPTION } from '@/lib/semora-facts';
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
      </body>
    </html>
  );
}
