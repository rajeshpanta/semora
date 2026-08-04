import Link from 'next/link';
import styles from './Nav.module.css';
import { FeaturesMenu } from './FeaturesMenu';
import { MobileNav } from './MobileNav';
import { SITE_NAME, APP_SIGNIN_URL, APP_STORE_URL } from '@/lib/semora-facts';

export const NAV_LINKS = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/compare', label: 'Compare' },
  { href: '/blog', label: 'Blog' },
  { href: '/support', label: 'Support' },
];

export function Nav() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.logo}>
          {SITE_NAME}
        </Link>

        {/* Desktop: a single pill holds the whole menu, Laxu-style. */}
        <nav className={styles.pill} aria-label="Main">
          <FeaturesMenu />
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={styles.link}>
              {l.label}
            </Link>
          ))}
          <a href={APP_STORE_URL} className={styles.link}>
            Get the app
          </a>
        </nav>

        {/* Sign in is deliberately separate from the signup CTA. "Try it for
            free" reads as "make a new account", so without this a returning
            user has no obvious way back into the app from the marketing site. */}
        <div className={styles.actions}>
          <Link href={APP_SIGNIN_URL} className={styles.ghost}>
            Sign in
          </Link>
          <Link href={APP_SIGNIN_URL} className={styles.cta}>
            Try it for free
          </Link>
        </div>

        <MobileNav links={NAV_LINKS} />
      </div>
    </header>
  );
}
