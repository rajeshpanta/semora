import Link from 'next/link';
import styles from './Footer.module.css';
import { SITE_NAME, TAGLINE, SUPPORT_EMAIL } from '@/lib/semora-facts';
import { COMPETITORS } from '@/lib/competitors';

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div>
          <p className={styles.brand}>{SITE_NAME}</p>
          <p className={styles.tagline}>{TAGLINE}</p>
        </div>
        <div className={styles.cols}>
          <div>
            <p className={styles.heading}>Product</p>
            <Link href="/features">Features</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/blog">Blog</Link>
          </div>
          <div>
            <p className={styles.heading}>Compare</p>
            {COMPETITORS.map((c) => (
              <Link key={c.slug} href={`/compare/${c.slug}`}>
                vs {c.name}
              </Link>
            ))}
          </div>
          <div>
            <p className={styles.heading}>Company</p>
            <Link href="/support">Support</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </div>
        </div>
      </div>
      <p className={styles.copyright}>
        © {new Date().getFullYear()} {SITE_NAME}
      </p>
    </footer>
  );
}
