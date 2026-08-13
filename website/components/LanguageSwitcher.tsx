'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Nav.module.css';
import {
  englishToSpanishPath,
  hasLocalePair,
  spanishToEnglishPath,
  type SiteLocale,
} from '@/lib/i18n';

/**
 * The language switch — two real links, not a <select>.
 *
 * It used to be a <select> whose onChange called router.push. That works for a
 * sighted visitor with JavaScript and for nobody else: a crawler cannot follow
 * an onChange handler, so there was not one crawlable <a> between the English
 * and Spanish trees in either direction. All 31 Spanish pages hung off the
 * sitemap alone, receiving no internal link equity from the English site that
 * every external link points at — and with scripts blocked, or before hydration,
 * the language could not be changed at all.
 *
 * Anchors fix all of that at once and cost nothing: two languages do not need a
 * dropdown. The page you are on renders as plain text rather than a self-link,
 * so each page emits exactly one language link, pointing at its counterpart.
 * `hrefLang` states the target language for crawlers; `lang` makes each label
 * pronounce correctly in a screen reader (otherwise "Español" is read with an
 * English voice).
 */
export function LanguageSwitcher({ locale }: { locale: SiteLocale }) {
  const pathname = usePathname();

  // Nothing to switch to. On a share landing (/join, /invite, /collaborate) or
  // a 404 there is no translated counterpart, and the fallback would strand the
  // visitor on a homepage without the token that brought them here.
  if (!hasLocalePair(locale, pathname)) return null;

  const englishHref = locale === 'es' ? spanishToEnglishPath(pathname) : pathname || '/';
  const spanishHref = locale === 'es' ? pathname || '/es' : englishToSpanishPath(pathname);

  const options = [
    { code: 'en' as const, href: englishHref, short: 'EN', full: 'English' },
    { code: 'es' as const, href: spanishHref, short: 'ES', full: 'Español' },
  ];

  return (
    <div
      className={styles.languageToggle}
      role="group"
      aria-label={locale === 'es' ? 'Idioma' : 'Language'}
    >
      {options.map((option) =>
        option.code === locale ? (
          <span
            key={option.code}
            className={`${styles.languageOption} ${styles.languageOptionActive}`}
            lang={option.code}
            aria-current="true"
          >
            {option.short}
            {/* "EN" alone is a poor thing to hear announced. */}
            <span className={styles.srOnly}> — {option.full}</span>
          </span>
        ) : (
          <Link
            key={option.code}
            href={option.href}
            className={styles.languageOption}
            hrefLang={option.code}
            lang={option.code}
            // The visible label is a two-letter code; the accessible name says
            // what the link actually does, in the language being offered.
            aria-label={
              option.code === 'es' ? 'Ver esta página en español' : 'View this page in English'
            }
          >
            {option.short}
          </Link>
        ),
      )}
    </div>
  );
}
