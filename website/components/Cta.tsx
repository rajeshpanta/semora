import { SignupButton } from './SignupButton';
import styles from './Cta.module.css';
import { APP_STORE_URL } from '@/lib/semora-facts';
import type { SiteLocale } from '@/lib/i18n';

/**
 * The site's single conversion band. Two destinations, deliberately:
 * "Try it for free" goes straight to sign-in (works on any device, no install),
 * "Get the app" goes to the App Store listing for people who want it on their
 * phone. Every CTA on the site routes to one of these two places.
 */
export function Cta({
  heading,
  subheading,
  locale = 'en',
}: {
  heading: string;
  subheading?: string;
  locale?: SiteLocale;
}) {
  return (
    <section className={styles.band}>
      <h2 className={styles.heading} data-toc-skip>
        {heading}
      </h2>
      {subheading && <p className={styles.subheading}>{subheading}</p>}
      <div className={styles.actions}>
        <SignupButton className={styles.button}>
          {locale === 'es' ? 'Probar gratis' : 'Try it for free'}
        </SignupButton>
        <a href={APP_STORE_URL} className={styles.buttonGhost}>
          {locale === 'es' ? 'Descargar app' : 'Get the app'}
        </a>
      </div>
    </section>
  );
}
