import './globals.css';
import Link from 'next/link';
import type { Metadata } from 'next';

/**
 * 404 for URLs that match NO route in either language tree. This file bypasses
 * both root layouts entirely (that is the point of the convention — with two
 * root layouts there is no single layout to compose from), so it imports the
 * global styles itself and carries both languages: with no matched route there
 * is no reliable locale signal.
 *
 * notFound() thrown INSIDE a tree (bad feature slug, unknown /es page) is
 * handled by the per-group not-found.tsx files instead, which do render with
 * that language's full nav.
 */
export const metadata: Metadata = {
  title: '404 — Semora',
  description: 'This page does not exist.',
};

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--brand)' }}>
            404
          </p>
          <h1 style={{ margin: '12px 0 14px' }}>That page doesn&apos;t exist</h1>
          <p style={{ color: 'var(--ink2)', lineHeight: 1.6 }}>
            The link may be old, or the address mistyped.
            <br />
            Puede que el enlace sea antiguo o esté mal escrito.
          </p>
          <p style={{ marginTop: 28, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
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
              Semora homepage
            </Link>
            <Link
              href="/es"
              style={{
                display: 'inline-block',
                border: '1px solid var(--border)',
                color: 'var(--ink)',
                textDecoration: 'none',
                fontWeight: 600,
                padding: '13px 26px',
                borderRadius: 999,
              }}
            >
              Página principal
            </Link>
          </p>
        </div>
      </body>
    </html>
  );
}
