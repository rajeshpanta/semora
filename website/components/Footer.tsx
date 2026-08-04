import Link from 'next/link';
import styles from './Footer.module.css';
import {
  SITE_NAME,
  TAGLINE,
  SUPPORT_EMAIL,
  APP_SIGNUP_URL,
  APP_STORE_URL,
  FEATURES,
} from '@/lib/semora-facts';
import { COMPETITORS } from '@/lib/competitors';
import { ALTERNATIVE_SLUGS } from '@/lib/new-page-content';

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
            <p className={styles.heading}>
              <Link href="/features">Features</Link>
            </p>
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
            {/* Driven off the slug list, not hardcoded: dormway- and
                mindgrasp-alternative were declared, sitemapped and reachable
                only by typing the URL, because this column was written by hand
                and never updated when they were added. */}
            {ALTERNATIVE_SLUGS.map((slug) => (
              <Link key={slug} href={`/${slug}`}>
                {alternativeLinkLabel(slug)}
              </Link>
            ))}
          </div>
          <div>
            <p className={styles.heading}>Get Semora</p>
            <Link href={APP_SIGNUP_URL}>Try it for free</Link>
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

/**
 * "studyfetch-alternative" -> "StudyFetch alternative". The brand casing has to
 * be looked up rather than derived; title-casing the slug would print
 * "Myhomework" and "Studyfetch".
 */
const ALTERNATIVE_BRANDS: Record<string, string> = {
  'myhomework-alternative': 'myHomework',
  'shovel-alternative': 'Shovel',
  'studyfetch-alternative': 'StudyFetch',
  'dormway-alternative': 'DormWay',
  'mindgrasp-alternative': 'Mindgrasp',
};

function alternativeLinkLabel(slug: string): string {
  return `${ALTERNATIVE_BRANDS[slug] ?? slug.replace('-alternative', '')} alternative`;
}
