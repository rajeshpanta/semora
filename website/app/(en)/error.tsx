'use client';

import { ErrorScreen } from '@/components/ErrorScreen';

/**
 * Error boundary for the English tree. Next requires this to be a client
 * component; the shared body lives in ErrorScreen so both locales and the
 * global boundary stay identical.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorScreen error={error} reset={reset} locale="en" />;
}
