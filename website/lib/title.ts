import { SITE_NAME } from './semora-facts';

/**
 * Decides whether a page title should keep the root layout's `%s | Semora`
 * template or suppress it.
 *
 * Every page inherits that template, so a title that already names the brand
 * renders it twice: "Semora vs Shovel: … | Semora", "About Semora: … | Semora",
 * "Compare Semora | Semora". Fourteen live pages were doing this. Duplicated
 * boilerplate is a well-known trigger for Google rewriting the title itself,
 * and a rewritten title is a poor sitelink label — so the pages most likely to
 * become sitelinks were the ones most likely to lose control of their label.
 *
 * Returning `{ absolute }` suppresses the template; returning a plain string
 * lets it apply as normal.
 */
export function pageTitle(title: string): string | { absolute: string } {
  return title.includes(SITE_NAME) ? { absolute: title } : title;
}
