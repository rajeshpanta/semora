import { SPANISH_PAGES } from '@/lib/es-content';
import { isSpanishNoindexPath } from '@/lib/i18n';

/**
 * Reciprocal hreflang for the English pages.
 *
 * Every Spanish page already declares its English counterpart — the catch-all
 * at app/(es)/es/[...slug]/page.tsx emits en-US, es and x-default from the
 * `englishPath` on each SpanishPageConfig. The English side did not declare
 * anything back except on the homepage, and Google discards hreflang that is
 * not reciprocal: a page must name the alternate that names it. So 38 of the
 * 39 pairs were being ignored, and English pages told search engines nothing
 * about a Spanish version existing at all.
 *
 * The map is derived from SPANISH_PAGES rather than written out, so adding a
 * Spanish page wires up both directions and there is no second list to forget.
 * The homepage is the one pair that lives outside that array, since /es has its
 * own page.tsx rather than coming from the catch-all.
 */
const EN_TO_ES = new Map<string, string>([['/', '/es']]);
for (const page of SPANISH_PAGES) {
  // A noindex URL must not be advertised as an alternate of an indexable URL.
  // It remains in the navigation map in lib/i18n.ts so readers can switch
  // languages while the Spanish page is being rewritten.
  if (!isSpanishNoindexPath(page.path)) EN_TO_ES.set(page.englishPath, page.path);
}

/** English paths that have a Spanish counterpart — useful for tests/audits. */
export function englishPathsWithSpanish(): string[] {
  return [...EN_TO_ES.keys()].sort();
}

/**
 * `alternates` for an English page's metadata. Pass the page's own path.
 * Falls back to canonical-only when a page has no Spanish counterpart yet,
 * so a new English page never emits a broken alternate.
 */
export function enAlternates(englishPath: string) {
  const spanish = EN_TO_ES.get(englishPath);
  if (!spanish) return { canonical: englishPath };
  return {
    canonical: englishPath,
    languages: {
      'en-US': englishPath,
      es: spanish,
      'x-default': englishPath,
    },
  };
}
