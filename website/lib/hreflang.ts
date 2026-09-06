import { INDEXABLE_LOCALE_ROUTE_PAIRS } from '@/lib/i18n';

/** Reciprocal HTML alternates use the same indexable routes as the sitemap. */
// Share the sitemap's active route pairs. Retained content for redirected
// pages must never overwrite a current translation (as the old GPA post did).
const EN_TO_ES = new Map<string, string>(
  INDEXABLE_LOCALE_ROUTE_PAIRS.map(({ en, es }) => [en, es]),
);

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
