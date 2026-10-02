import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * "Canvas or LMS Sync" — now the connect screen itself.
 *
 * This used to be a separate first page: a pitch, the student's connected
 * platforms, and a list of three platforms that only led to the connect
 * screen, which has its own switch for the same choice. 15 of the 25 students
 * who opened the connect screen in the week to 2026-10-01 never passed through
 * here at all. Its one job of its own, showing and managing what is connected,
 * moved to the top of the connect screen (components/LmsConnectedPanel.tsx).
 *
 * The route stays, so Settings, the + menu, the command palette, the web
 * sidebar and every other link keep working; it forwards, carrying `source`
 * on for the funnel events. A replace, so Back skips it.
 */
export default function LmsSettingsScreen() {
  const { source } = useLocalSearchParams<{ source?: string }>();
  return (
    <Redirect href={{ pathname: '/settings/lms-connect', params: source ? { source } : {} } as any} />
  );
}
