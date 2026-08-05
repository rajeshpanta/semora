import Link from 'next/link';
import { SignupButton } from './SignupButton';
import styles from './Nav.module.css';
import { FeaturesMenu } from './FeaturesMenu';
import { MobileNav } from './MobileNav';
import { NavChrome } from './NavChrome';
import { SITE_NAME, APP_STORE_URL } from '@/lib/semora-facts';
import { LanguageSwitcher } from './LanguageSwitcher';
import type { SiteLocale } from '@/lib/i18n';

export const NAV_LINKS = [
  // No '/features' entry: FeaturesMenu already renders a "Features" trigger in
  // this same pill, and adding one here printed the word twice. Its trigger is
  // deliberately a <button> (see the note in FeaturesMenu) so the hub page is
  // linked from the panel body and from the footer heading instead.
  //
  // '/about' was previously footer-only. It is a hub page and the conventional
  // sitelink slot, so it gets a plain crawlable link here.
  // Pricing and About live in the footer, which keeps this bar short enough to
  // read at a glance. Both are still crawlable from every page.
  { href: '/compare', label: 'Compare' },
  { href: '/blog', label: 'Blog' },
  { href: '/support', label: 'Support' },
];

export function Nav({ locale = 'en' }: { locale?: SiteLocale }) {
  const links = locale === 'es'
    ? [
        { href: '/es/comparar', label: 'Comparar' },
        { href: '/es/blog', label: 'Blog' },
        { href: '/es/ayuda', label: 'Ayuda' },
      ]
    : NAV_LINKS;
  const homeHref = locale === 'es' ? '/es' : '/';
  const copy = locale === 'es'
    ? { getApp: 'Descargar la app', signIn: 'Iniciar sesión', tryFree: 'Empezar gratis', aria: 'Navegación principal' }
    : { getApp: 'Get the app', signIn: 'Sign in', tryFree: 'Try it for free', aria: 'Main' };

  return (
    <header className={styles.header} data-nav>
      <NavChrome />
      <div className={styles.inner}>
        <Link href={homeHref} className={styles.logo}>
          {SITE_NAME}
        </Link>

        {/* Desktop: a single pill holds the whole menu, Laxu-style. */}
        <nav className={styles.pill} aria-label={copy.aria}>
          <FeaturesMenu locale={locale} />
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={styles.link}>
              {l.label}
            </Link>
          ))}
          <a href={APP_STORE_URL} className={styles.link}>
            {copy.getApp}
          </a>
        </nav>

        <div className={styles.languageSlot}>
          <LanguageSwitcher locale={locale} />
        </div>

        {/* Sign in is deliberately separate from the signup CTA. "Try it for
            free" reads as "make a new account", so without this a returning
            user has no obvious way back into the app from the marketing site. */}
        <div className={styles.actions}>
          <SignupButton mode="signin" className={styles.ghost}>
            {copy.signIn}
          </SignupButton>
          <SignupButton className={styles.cta}>{copy.tryFree}</SignupButton>
        </div>

        <MobileNav links={links} locale={locale} />
      </div>
    </header>
  );
}
