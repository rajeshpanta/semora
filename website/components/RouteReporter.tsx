'use client';

import { useEffect } from 'react';
import { report, type TelemetryEvent } from '@/lib/telemetry';

/**
 * Fires one telemetry event on mount.
 *
 * The pages that need reporting — 404s, pricing — are server components, and a
 * server component cannot call a browser API. Dropping this in keeps them
 * server-rendered while still reporting, instead of converting a whole page to
 * a client component for one event.
 */
export function RouteReporter({ event, props }: { event: TelemetryEvent; props?: Record<string, string | number | boolean | null> }) {
  useEffect(() => {
    report(event, props ?? {});
    // Mount-only: a re-render must not double-count. `props` is a literal at
    // every call site, so a dependency on it would fire on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
