import Link from 'next/link';
import { SignupButton } from './SignupButton';
import styles from './Footer.module.css';
import {
  SITE_NAME,
  TAGLINE,
  SUPPORT_EMAIL,
  APP_STORE_URL,
  FEATURES,
} from '@/lib/semora-facts';
import { COMPETITORS } from '@/lib/competitors';
import { ALTERNATIVE_SLUGS } from '@/lib/new-page-content';
import { FEATURES_ES, TAGLINE_ES } from '@/lib/es-facts';
import { englishToSpanishPath, type SiteLocale } from '@/lib/i18n';

export function Footer({ locale = 'en' }: { locale?: SiteLocale }) {
  const features = locale === 'es' ? FEATURES_ES : FEATURES;
  const copy = locale === 'es'
    ? {
        tagline: TAGLINE_ES, features: 'Funciones', compare: 'Comparar', tools: 'Herramientas gratis',
        gpa: 'Calculadora de GPA', pomodoro: 'Temporizador Pomodoro', get: 'Empieza con Semora',
        tryFree: 'Empezar gratis', download: 'Descargar en App Store', pricing: 'Precios', blog: 'Blog',
        company: 'Empresa', about: 'Acerca de', support: 'Ayuda', privacy: 'Privacidad', terms: 'Términos',
        alternative: 'alternativa', featureBase: '/es/funciones', compareBase: '/es/comparar',
      }
    : {
        tagline: TAGLINE, features: 'Features', compare: 'Compare', tools: 'Free tools',
        gpa: 'GPA calculator', pomodoro: 'Pomodoro timer', get: 'Get Semora',
        tryFree: 'Try it for free', download: 'Download on the App Store', pricing: 'Pricing', blog: 'Blog',
        company: 'Company', about: 'About', support: 'Support', privacy: 'Privacy', terms: 'Terms',
        alternative: 'alternative', featureBase: '/features', compareBase: '/compare',
      };
  const path = (englishPath: string) => locale === 'es' ? englishToSpanishPath(englishPath) : englishPath;

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div>
          <p className={styles.brand}>{SITE_NAME}</p>
          <p className={styles.tagline}>{copy.tagline}</p>
        </div>
        <div className={styles.cols}>
          <div>
            <p className={styles.heading}>
              <Link href={copy.featureBase}>{copy.features}</Link>
            </p>
            {features.map((f) => (
              <Link key={f.slug} href={`${copy.featureBase}/${f.slug}`}>
                {f.name}
              </Link>
            ))}
          </div>
          <div>
            <p className={styles.heading}>{copy.compare}</p>
            {COMPETITORS.map((c) => (
              <Link key={c.slug} href={`${copy.compareBase}/${c.slug}`}>
                vs {c.name}
              </Link>
            ))}
          </div>
          <div>
            <p className={styles.heading}>{copy.tools}</p>
            <Link href={path('/gpa-calculator')}>{copy.gpa}</Link>
            <Link href={path('/pomodoro-timer')}>{copy.pomodoro}</Link>
            {/* Driven off the slug list, not hardcoded: dormway- and
                mindgrasp-alternative were declared, sitemapped and reachable
                only by typing the URL, because this column was written by hand
                and never updated when they were added. */}
            {ALTERNATIVE_SLUGS.map((slug) => (
              <Link key={slug} href={path(`/${slug}`)}>
                {locale === 'es'
                  ? `${copy.alternative} a ${ALTERNATIVE_BRANDS[slug] ?? slug.replace('-alternative', '')}`
                  : alternativeLinkLabel(slug)}
              </Link>
            ))}
          </div>
          <div>
            <p className={styles.heading}>{copy.get}</p>
            <SignupButton>{copy.tryFree}</SignupButton>
            <a href={APP_STORE_URL}>{copy.download}</a>
            <Link href={path('/pricing')}>{copy.pricing}</Link>
            <Link href={path('/blog')}>{copy.blog}</Link>
          </div>
          <div>
            {/* Privacy and Terms are linked from inside the shipping iOS app
                (app/settings, app/paywall, app/welcome) and are required to be
                publicly reachable — do not remove these routes. */}
            <p className={styles.heading}>{copy.company}</p>
            <Link href={path('/about')}>{copy.about}</Link>
            <Link href={path('/support')}>{copy.support}</Link>
            <Link href={path('/privacy')}>{copy.privacy}</Link>
            <Link href={path('/terms')}>{copy.terms}</Link>
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
