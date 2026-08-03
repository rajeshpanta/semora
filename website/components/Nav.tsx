import Link from 'next/link';
import styles from './Nav.module.css';
import { MobileNavToggle } from './MobileNavToggle';
import { SITE_NAME, APP_URL } from '@/lib/semora-facts';

const LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/compare', label: 'Compare' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/blog', label: 'Blog' },
];

export function Nav() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.logo}>
          {SITE_NAME}
        </Link>
        <nav className={styles.links}>
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={styles.link}>
              {link.label}
            </Link>
          ))}
        </nav>
        <Link href={APP_URL} className={styles.cta}>
          Get started
        </Link>
        <MobileNavToggle links={LINKS} ctaHref={APP_URL} ctaLabel="Get started" />
      </div>
    </header>
  );
}
