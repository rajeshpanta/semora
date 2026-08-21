'use client';

import { report, TELEMETRY_EVENTS } from '@/lib/telemetry';

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

  // ?setlang= marks this as a DECISION rather than a navigation.
  //
  // proxy.ts records the language of whatever page you are on, which is right
  // for reading but cannot tell "I clicked English" from "I happened to open an
  // English page". Without that distinction one of the two has to break: either
  // clicking EN gets undone by the next Spanish page, or a Spanish reader who
  // opens the bare domain silently loses Spanish — and takes an English app
  // with them, because the app reads the same cookie. The marker is stripped
  // from the URL by the redirect in proxy.ts, so nothing shareable carries it.
  const englishBase = locale === 'es' ? spanishToEnglishPath(pathname) : pathname || '/';
  const spanishBase = locale === 'es' ? pathname || '/es' : englishToSpanishPath(pathname);
  const withChoice = (href: string, code: 'en' | 'es') =>
    `${href}${href.includes('?') ? '&' : '?'}setlang=${code}`;
  const englishHref = withChoice(englishBase, 'en');
  const spanishHref = withChoice(spanishBase, 'es');

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
            // Never prefetched: these carry ?setlang=, and a prefetch would cast
            // the vote before the visitor did. proxy.ts also refuses to act on a
            // prefetch — this is the second lock on the same door.
            prefetch={false}
            key={option.code}
            href={option.href}
            className={styles.languageOption}
            hrefLang={option.code}
            lang={option.code}
            // Switching language means the page failed this reader in theirs.
            // Worth knowing which pages cause it, and in which direction.
            onClick={() => report(TELEMETRY_EVENTS.languageSwitch, { to: option.code, from: locale })}
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
