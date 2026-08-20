'use client';

import { useEffect, useState } from 'react';
import { APP_URL } from '@/lib/semora-facts';
import styles from './BackToApp.module.css';

/**
 * "Back to dashboard", shown only to someone who arrived from the web app.
 *
 * The marketing site cannot tell whether a visitor is signed in: it is a
 * different origin from app.semoraai.com and the session lives in that origin's
 * storage. So the app appends `?from=app` on the way out and this reads it.
 *
 * ─── Why the flag is read on the CLIENT ───
 * Reading `searchParams` in the page would opt it out of static generation.
 * Doing that to /support costs little, but the Spanish support page is served
 * by the /es/[...slug] catch-all, so the same change turned EVERY Spanish
 * marketing page — every SEO landing page and blog post — from prerendered into
 * server-rendered on demand. One button is not worth that.
 *
 * Reading it here keeps both pages static: the HTML ships prerendered without
 * the link, and the link appears once the component mounts. `window.location`
 * rather than useSearchParams() so no Suspense boundary is needed.
 */
export function BackToApp({ locale = 'en' }: { locale?: 'en' | 'es' }) {
  const [fromApp, setFromApp] = useState(false);

  useEffect(() => {
    try {
      setFromApp(new URLSearchParams(window.location.search).get('from') === 'app');
    } catch {
      // A malformed query string is not a reason to break the page.
    }
  }, []);

  if (!fromApp) return null;

  return (
    <a className={styles.backToApp} href={APP_URL}>
      &larr; {locale === 'es' ? 'Volver al panel' : 'Back to dashboard'}
    </a>
  );
}
