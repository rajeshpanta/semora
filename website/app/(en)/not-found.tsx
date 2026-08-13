import type { Metadata } from 'next';
import Link from 'next/link';
import { RouteReporter } from '@/components/RouteReporter';

/**
 * Branded 404 for the English tree. Without this file, a mistyped URL rendered
 * Next's bare default shell — no nav, no site styling, no way back.
 */
/**
 * A page's own `generateMetadata` is discarded once it calls `notFound()`, so
 * without this every 404 in the English tree inherited the root layout's
 * default and announced itself as "Semora — Scan your syllabus. Never miss a
 * deadline." — the homepage's title, on a page that is emphatically not the
 * homepage. Setting it here fixes it for the whole tree at once rather than
 * per dynamic route. (Next emits `noindex` on not-found renders by itself.)
 */
export const metadata: Metadata = {
  title: 'Page not found',
  description: 'This page does not exist.',
};

export default function NotFound() {
  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
      {/* Names the URLs people actually reach that do not exist —
          dead inbound links, stale share URLs, our own typos. */}
      <RouteReporter event="not_found" props={{ locale: 'en' }} />
      <p style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--brand)' }}>
        404
      </p>
      <h1 style={{ margin: '12px 0 14px' }}>That page doesn&apos;t exist</h1>
      <p style={{ color: 'var(--ink2)', lineHeight: 1.6 }}>
        The link may be old, or the address mistyped. Everything Semora offers
        is reachable from the homepage.
      </p>
      <p style={{ marginTop: 28 }}>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            background: 'var(--ink)',
            color: '#fff',
            textDecoration: 'none',
            fontWeight: 600,
            padding: '13px 26px',
            borderRadius: 999,
          }}
        >
          Back to the homepage
        </Link>
      </p>
    </div>
  );
}
