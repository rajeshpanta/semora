import Link from 'next/link';
import styles from './Nav.module.css';
import { SITE_NAME, APP_SIGNIN_URL, APP_STORE_URL } from '@/lib/semora-facts';

/**
 * Single-page site: there are no sections to navigate to, so the nav is just
 * the wordmark plus the two things we actually want people to do. "Get the
 * app" collapses on small screens (where the App Store link is one tap away
 * in the hero anyway); "Try it for free" always stays visible.
 */
export function Nav() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.logo}>
          {SITE_NAME}
        </Link>
        <nav className={styles.links}>
          <a href={APP_STORE_URL} className={styles.link}>
            Get the app
          </a>
        </nav>
        <Link href={APP_SIGNIN_URL} className={styles.cta}>
          Try it for free
        </Link>
      </div>
    </header>
  );
}
