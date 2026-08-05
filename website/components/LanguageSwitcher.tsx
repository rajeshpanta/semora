'use client';

import { usePathname, useRouter } from 'next/navigation';
import styles from './Nav.module.css';
import { englishToSpanishPath, spanishToEnglishPath, type SiteLocale } from '@/lib/i18n';

export function LanguageSwitcher({ locale }: { locale: SiteLocale }) {
  const pathname = usePathname();
  const router = useRouter();
  const englishHref = locale === 'es' ? spanishToEnglishPath(pathname) : pathname || '/';
  const spanishHref = locale === 'es' ? pathname || '/es' : englishToSpanishPath(pathname);
  const label = locale === 'es' ? 'Seleccionar idioma' : 'Select language';

  return (
    <div className={styles.languageDropdown}>
      <select
        className={styles.languageSelect}
        value={locale}
        aria-label={label}
        onChange={(event) => {
          const href = event.target.value === 'es' ? spanishHref : englishHref;
          router.push(href);
        }}
      >
        <option value="en" lang="en">English</option>
        <option value="es" lang="es">Español</option>
      </select>
      <span className={styles.languageCaret} aria-hidden="true">⌄</span>
    </div>
  );
}
