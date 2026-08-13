'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { reportError } from '@/lib/telemetry';

/**
 * Shared body for the route-level error boundaries.
 *
 * The site had none, so a runtime error in any client component rendered Next's
 * unstyled default screen and reported nothing — the failure existed only on
 * the visitor's machine. Two things are wrong with that: the reader is stranded
 * with no way back, and we never learn it happened.
 *
 * Styling is inline for the same reason the 404 pages use inline styles: an
 * error boundary has to survive the case where the failure is in the styling
 * layer itself, so it must not depend on a CSS module resolving.
 */
export function ErrorScreen({
  error,
  reset,
  locale = 'en',
  boundary = 'route',
}: {
  error: Error & { digest?: string };
  reset: () => void;
  locale?: 'en' | 'es';
  boundary?: 'route' | 'global';
}) {
  useEffect(() => {
    reportError(error, boundary);
  }, [error, boundary]);

  const es = locale === 'es';

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
      <p
        style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--brand)',
        }}
      >
        {es ? 'Error' : 'Something went wrong'}
      </p>
      <h1 style={{ margin: '12px 0 14px' }}>
        {es ? 'Esta página no se pudo cargar' : "This page didn't load"}
      </h1>
      <p style={{ color: 'var(--ink2)', lineHeight: 1.6 }}>
        {es
          ? 'El fallo es nuestro, no tuyo. Puedes reintentar; si vuelve a ocurrir, todo lo que ofrece Semora sigue disponible desde la página principal.'
          : 'This one is on us, not you. Try again — and if it keeps happening, everything Semora offers is still reachable from the homepage.'}
      </p>

      <p style={{ marginTop: 28, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={reset}
          style={{
            background: 'var(--ink)',
            color: '#fff',
            border: 'none',
            font: 'inherit',
            fontWeight: 600,
            padding: '13px 26px',
            borderRadius: 999,
            cursor: 'pointer',
          }}
        >
          {es ? 'Reintentar' : 'Try again'}
        </button>
        <Link
          href={es ? '/es' : '/'}
          style={{
            display: 'inline-block',
            border: '1px solid var(--ink)',
            color: 'var(--ink)',
            textDecoration: 'none',
            fontWeight: 600,
            padding: '13px 26px',
            borderRadius: 999,
          }}
        >
          {es ? 'Ir a la página principal' : 'Go to the homepage'}
        </Link>
      </p>

      {/* The digest is the only handle that ties what the visitor saw to the
          real stack trace in the server log, so it is shown rather than hidden
          — it is what makes a support message actionable. */}
      {error.digest ? (
        <p style={{ marginTop: 32, color: 'var(--ink-muted)', fontSize: 13 }}>
          {es ? 'Código de referencia: ' : 'Reference code: '}
          <code>{error.digest}</code>
        </p>
      ) : null}
    </div>
  );
}
