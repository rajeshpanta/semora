'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Nav.module.css';
import { englishToSpanishPath, spanishToEnglishPath, type SiteLocale } from '@/lib/i18n';

export function LanguageSwitcher({ locale, mobile = false }: { locale: SiteLocale; mobile?: boolean }) {
  const pathname = usePathname();
  const englishHref = locale === 'es' ? spanishToEnglishPath(pathname) : pathname || '/';
  const spanishHref = locale === 'es' ? pathname || '/es' : englishToSpanishPath(pathname);
  const label = locale === 'es' ? 'Cambiar idioma' : 'Switch language';

  return (
    <div
      className={mobile ? styles.languageSwitchMobile : styles.languageSwitch}
      role="group"
      aria-label={label}
    >
      <Link
        href={englishHref}
        hrefLang="en"
        lang="en"
        className={styles.languageOption}
        data-active={locale === 'en'}
        aria-current={locale === 'en' ? 'page' : undefined}
      >
        {mobile ? 'English' : 'EN'}
      </Link>
      <span className={styles.languageDivider} aria-hidden="true" />
      <Link
        href={spanishHref}
        hrefLang="es"
        lang="es"
        className={styles.languageOption}
        data-active={locale === 'es'}
        aria-current={locale === 'es' ? 'page' : undefined}
      >
        {mobile ? 'Español' : 'ES'}
      </Link>
    </div>
  );
}
