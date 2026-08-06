import Link from 'next/link';

/**
 * Branded 404 for the English tree. Without this file, a mistyped URL rendered
 * Next's bare default shell — no nav, no site styling, no way back.
 */
export default function NotFound() {
  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
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
