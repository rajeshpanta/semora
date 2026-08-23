'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * A nav link that knows whether you are already on it.
 *
 * The bar had no active state at all: every item rendered the same, so the
 * only thing that ever highlighted was whatever the cursor happened to be
 * over. Nothing told a visitor which page they were on.
 *
 * Deliberately a leaf. Nav is a server component and reading the pathname
 * needs a client one — making Nav itself client would pull FeaturesMenu,
 * NavAuthActions, MobileNav and the language switcher across the boundary
 * with it, for the sake of one string.
 *
 * Matching is prefix-based so a section stays lit on its children:
 * /compare/shovel keeps "Compare" marked, /blog/<post> keeps "Blog". The
 * guard against href '/' matters — every path starts with it, so a plain
 * startsWith would light the home link on every page of the site.
 */
export function NavLink({
  href,
  className,
  activeClassName,
  children,
}: {
  href: string;
  className: string;
  activeClassName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? '';
  const isRoot = href === '/' || href === '/es';
  const active = isRoot ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={active ? `${className} ${activeClassName}` : className}
      // Announced, not just coloured — a highlight alone is invisible to a
      // screen reader and to anyone who cannot distinguish the tint.
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}
