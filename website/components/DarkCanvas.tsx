/**
 * Marks a page as using the dark canvas.
 *
 * The palette cannot be chosen in the root layout, because that is the only
 * place `<html>` exists and it has no idea which route is rendering. Nested
 * layouts can't reach `<html>` either, and reading the pathname from headers()
 * would opt the entire site out of static generation.
 *
 * So the page states its intent by rendering this marker, and globals.css
 * re-points the design tokens with `:root:has([data-canvas='dark'])`. That is
 * plain CSS in the server-rendered HTML: no effect, no attribute toggling
 * after hydration, and therefore no frame of the wrong palette. Nav and footer
 * follow even though they are siblings of <main>, because the tokens are
 * re-pointed at the document root.
 *
 * Where `:has()` is unsupported the rule is skipped and the page renders in the
 * light palette, which is the site's base design and complete on its own.
 */
export function DarkCanvas() {
  return <div data-canvas="dark" hidden />;
}
