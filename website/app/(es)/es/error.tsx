'use client';

import { ErrorScreen } from '@/components/ErrorScreen';

/** Error boundary for the Spanish tree — see app/(en)/error.tsx. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorScreen error={error} reset={reset} locale="es" />;
}
