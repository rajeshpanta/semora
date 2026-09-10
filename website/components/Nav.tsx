import Link from 'next/link';
import { NavLink } from './NavLink';
import { NavAuthActions } from './NavAuthActions';
import styles from './Nav.module.css';
import { FeaturesMenu } from './FeaturesMenu';
import { MobileNav } from './MobileNav';
import { SITE_NAME, downloadPath } from '@/lib/semora-facts';
import { LanguageSwitcher } from './LanguageSwitcher';
import type { SiteLocale } from '@/lib/i18n';

export const NAV_LINKS = [
  // No '/features' entry: FeaturesMenu already renders a "Features" trigger in
  // this same pill, and adding one here printed the word twice. Its trigger is
  // deliberately a <button> (see the note in FeaturesMenu) so the hub page is
  // linked from the panel body and from the footer heading instead.
  //
  // PRICING TOOK BLOG'S SLOT (2026-09-10), and the numbers made the call.
  // Over 90 days, Blog had a nav slot AND a footer link and drew 5 internal
  // arrivals; Pricing had only the footer link and drew 6. A bar this short
  // cannot carry a page that loses to one it outranks without a slot — and
  // pricing is the last page somebody reads before they decide.
  //
  // Blog keeps its footer link, and individual posts keep the contextual links
  // from the feature pages, so nothing became unreachable. About stays in the
  // footer for the same reason this bar stays short: it has to be readable at
  // a glance. Everything here is still crawlable from every page.
  { href: '/pricing', label: 'Pricing' },
  { href: '/compare', label: 'Compare' },
  { href: '/support', label: 'Support' },
];

export function Nav({ locale = 'en' }: { locale?: SiteLocale }) {
  const links = locale === 'es'
    ? [
        { href: '/es/precios', label: 'Precios' },
        { href: '/es/comparar', label: 'Comparar' },
        { href: '/es/ayuda', label: 'Ayuda' },
      ]
    : NAV_LINKS;
  const homeHref = locale === 'es' ? '/es' : '/';
  const copy = locale === 'es'
    ? { getApp: 'Descargar la app', signIn: 'Iniciar sesión', tryFree: 'Empezar gratis', dashboard: 'Panel', aria: 'Navegación principal' }
    : { getApp: 'Get the app', signIn: 'Sign in', tryFree: 'Try it for free', dashboard: 'Dashboard', aria: 'Main' };

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href={homeHref} className={styles.logo}>
          {SITE_NAME}
        </Link>

        {/* Desktop: a single pill holds the whole menu, Laxu-style. */}
        <nav className={styles.pill} aria-label={copy.aria}>
          <FeaturesMenu locale={locale} />
          {links.map((l) => (
            <NavLink
              key={l.href}
              href={l.href}
              className={styles.link}
              activeClassName={styles.linkActive}
            >
              {l.label}
            </NavLink>
          ))}
          <NavLink
            href={downloadPath(locale)}
            className={styles.link}
            activeClassName={styles.linkActive}
          >
            {copy.getApp}
          </NavLink>
        </nav>

        <div className={styles.languageSlot}>
          <LanguageSwitcher locale={locale} />
        </div>

        {/* Sign in is deliberately separate from the signup CTA. "Try it for
            free" reads as "make a new account", so without this a returning
            user has no obvious way back into the app from the marketing site. */}
        <div className={styles.actions}>
          <NavAuthActions
            signIn={copy.signIn}
            tryFree={copy.tryFree}
            dashboard={copy.dashboard}
            ghostClassName={styles.ghost}
            ctaClassName={styles.cta}
          />
        </div>

        <MobileNav links={links} locale={locale} />
      </div>
    </header>
  );
}
