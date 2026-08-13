'use client';

import { ErrorScreen } from '@/components/ErrorScreen';

/**
 * Last-resort boundary: catches errors thrown by a ROOT LAYOUT, which the
 * per-tree error.tsx files cannot — they render inside the layout that failed.
 *
 * This replaces the entire document, so it must supply its own <html> and
 * <body>. That also means none of the root layout's fonts, globals or theme
 * tokens are available, which is why ErrorScreen styles itself inline and
 * falls back to plain values below.
 *
 * Untranslated on purpose: the layout that would tell us which locale the
 * visitor is in is the thing that just failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          // The theme tokens live in globals.css, which is not loaded here.
          // These fallbacks keep the page legible in both colour schemes.
          background: '#fff',
          color: '#111',
        }}
      >
        <ErrorScreen error={error} reset={reset} locale="en" boundary="global" />
      </body>
    </html>
  );
}
