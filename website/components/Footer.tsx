import Link from 'next/link';
import styles from './Footer.module.css';
import {
  SITE_NAME,
  TAGLINE,
  SUPPORT_EMAIL,
  APP_SIGNIN_URL,
  APP_STORE_URL,
  FEATURES,
} from '@/lib/semora-facts';
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
            <p className={styles.heading}>Features</p>
            {FEATURES.map((f) => (
              <Link key={f.slug} href={`/features/${f.slug}`}>
                {f.name}
              </Link>
            ))}
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
            <p className={styles.heading}>Free tools</p>
            <Link href="/gpa-calculator">GPA calculator</Link>
            <Link href="/pomodoro-timer">Pomodoro timer</Link>
            <Link href="/myhomework-alternative">myHomework alternative</Link>
            <Link href="/shovel-alternative">Shovel alternative</Link>
            <Link href="/studyfetch-alternative">StudyFetch alternative</Link>
          </div>
          <div>
            <p className={styles.heading}>Get Semora</p>
            <Link href={APP_SIGNIN_URL}>Try it for free</Link>
            <a href={APP_STORE_URL}>Download on the App Store</a>
            <Link href="/pricing">Pricing</Link>
            <Link href="/blog">Blog</Link>
          </div>
          <div>
            {/* Privacy and Terms are linked from inside the shipping iOS app
                (app/settings, app/paywall, app/welcome) and are required to be
                publicly reachable — do not remove these routes. */}
            <p className={styles.heading}>Company</p>
            <Link href="/about">About</Link>
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
