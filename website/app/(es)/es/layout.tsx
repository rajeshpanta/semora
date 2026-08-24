import type { Metadata } from 'next';
import { Fraunces } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { PageTelemetry } from '@/components/PageTelemetry';
import { InteractionTelemetry } from '@/components/InteractionTelemetry';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { GoogleAnalytics } from '@/components/GoogleAnalytics';
import '../../globals.css';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { JsonLd } from '@/components/JsonLd';
import { organizationSchema, webSiteSchema } from '@/lib/schema';
import { SITE_NAME } from '@/lib/semora-facts';
import { SITE_DESCRIPTION_ES } from '@/lib/es-facts';
import { SITE_URL } from '@/lib/site';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Escanea tu programa. No pierdas ninguna fecha.`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION_ES,
  openGraph: {
    siteName: SITE_NAME,
    type: 'website',
    locale: 'es_US',
    alternateLocale: ['en_US'],
  },
  twitter: { card: 'summary_large_image' },
};

export default function SpanishRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={fraunces.variable}>
      <body>
        <noscript>
          <style>{'.js-reveal{opacity:1!important;transform:none!important;}'}</style>
        </noscript>
        <JsonLd data={webSiteSchema()} />
        <JsonLd data={organizationSchema()} />
        <Nav locale="es" />
        <main>{children}</main>
        <Footer locale="es" />
        <Analytics />
        <PageTelemetry />
        <InteractionTelemetry />
        <SpeedInsights />
        <GoogleAnalytics />
      </body>
    </html>
  );
}
