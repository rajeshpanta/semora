import { NextResponse, type NextRequest } from 'next/server';

const CANONICAL_HOST = 'semoraai.com';

// Shared parent domain so app.semoraai.com can read it. Carries no identity
// and no session — a language, and whether the visitor picked it on purpose.
const LOCALE_COOKIE = {
  domain: '.semoraai.com',
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax' as const,
  secure: true,
};

/**
 * Does this browser rank Spanish above English?
 *
 * Compares the two by q-value rather than reading only the first tag: a laptop
 * set to `en-GB,es;q=0.9` is an English reader who also speaks Spanish, and
 * `es-ES,en;q=0.8` is the reverse. Taking languages[0] alone gets one of those
 * two wrong, and being sent to the wrong language is worse than being left in
 * the default one.
 */
function prefersSpanish(header: string | null): boolean {
  if (!header) return false;
  let es = -1;
  let en = -1;
  for (const part of header.split(',')) {
    const [tagRaw, ...params] = part.trim().split(';');
    const tag = tagRaw.trim().toLowerCase();
    if (!tag) continue;
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
    const quality = Number.isFinite(q) ? q : 0;
    if (tag === 'es' || tag.startsWith('es-')) es = Math.max(es, quality);
    else if (tag === 'en' || tag.startsWith('en-')) en = Math.max(en, quality);
    else if (tag === '*') { es = Math.max(es, 0); en = Math.max(en, 0); }
  }
  return es > 0 && es > en;
}

/**
 * Force every request onto the canonical apex host.
 *
 * This lives in middleware rather than `vercel.json` redirects because the
 * homepage is statically prerendered: the edge serves the cached `/` response
 * before config-level redirects are evaluated, so `www.semoraai.com/` kept
 * returning 200 while subpaths correctly redirected. Middleware runs ahead of
 * that cache lookup, so it catches the root too.
 */
export function proxy(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0];

  if (host && host !== CANONICAL_HOST && host.endsWith(CANONICAL_HOST)) {
    const url = new URL(request.url);
    url.protocol = 'https:';
    url.host = CANONICAL_HOST;
    url.port = '';
    return NextResponse.redirect(url, 308);
  }

  // A prefetch is not a visit, and must never be mistaken for a decision.
  //
  // next/link prefetches what it renders. The language switcher on /es links to
  // /?setlang=en, so Next fetched that URL on its own — and the branch below
  // dutifully recorded "the visitor chose English" for someone who had only
  // just been sent to the Spanish site and had clicked nothing. The cookie then
  // said en, the app read en, and a Spanish reader signed in to an English app:
  // exactly the bug this whole mechanism exists to fix, reintroduced by the
  // fix. Only a real browser surfaced it; curl never prefetches.
  const isPrefetch =
    request.headers.get('next-router-prefetch') === '1' ||
    request.headers.get('purpose') === 'prefetch' ||
    request.headers.get('x-purpose') === 'prefetch' ||
    request.headers.get('x-middleware-prefetch') === '1';
  if (isPrefetch) return NextResponse.next();

  // An explicit choice from the language switcher. Recorded, then removed from
  // the URL so it never ends up in a share, a bookmark or a search result.
  const setLang = request.nextUrl.searchParams.get('setlang');
  if (setLang === 'en' || setLang === 'es') {
    const url = new URL(request.url);
    url.searchParams.delete('setlang');
    const redirect = NextResponse.redirect(url, 307);
    redirect.cookies.set('semora_locale', setLang, LOCALE_COOKIE);
    // Stated choices are sticky; the reading-language write below is not
    // allowed to walk over them on the very next page.
    redirect.cookies.set('semora_locale_set', '1', LOCALE_COOKIE);
    return redirect;
  }

  // Send a Spanish browser to the Spanish site, on its FIRST visit only.
  //
  // Until now semoraai.com served English to everyone and the Spanish half was
  // reachable only by finding the switcher — so a student whose laptop is in
  // Spanish read the pitch in a second language while the product they were
  // being sold speaks theirs.
  //
  // ONLY WHEN THERE IS NO COOKIE, which is what stops this becoming a trap.
  // Once semora_locale exists, the visitor has been somewhere and the redirect
  // stays out of it — otherwise someone who deliberately clicked EN would be
  // thrown back to /es on their next click, forever, by a preference they had
  // just overruled. The cookie is refreshed on every page below, so "what they
  // last read" always wins over "what their OS says".
  //
  // Root only. A Spanish reader deep-linked to an English blog post wanted
  // that post, and there is not a Spanish twin for every URL.
  //
  // Crawlers are excluded so the homepage keeps indexing as English, and the
  // hreflang tags on the page stay the authority on where the Spanish version
  // lives. Vary tells shared caches the response depends on the header.
  if (request.nextUrl.pathname === '/' && !request.cookies.has('semora_locale')) {
    const ua = request.headers.get('user-agent') ?? '';
    const isCrawler = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|whatsapp|telegram/i.test(ua);
    if (!isCrawler && prefersSpanish(request.headers.get('accept-language'))) {
      const url = new URL(request.url);
      url.pathname = '/es';
      // 307, never 308: this response depends on a request header, and a
      // permanent redirect would be cached by the browser and pin an English
      // reader on /es for good.
      const redirect = NextResponse.redirect(url, 307);
      redirect.headers.set('Vary', 'Accept-Language');
      return redirect;
    }
  }

  // Hand the language across to the app.
  //
  // The marketing site and the app are different origins (semoraai.com vs
  // app.semoraai.com), so a visitor reading in Spanish who taps "Get started"
  // arrived at an app that knew nothing about it and fell back to the device
  // language — landing an English-laptop reader of the Spanish site in an
  // English app, with Settings the only way out. Choosing a language once and
  // having it forgotten one click later is the kind of small betrayal that
  // makes a product feel like two products.
  //
  // A cookie on the shared parent domain rather than a query string on the
  // CTA: it survives every route into the app, including links we did not
  // decorate and ones the visitor typed or bookmarked. Exactly the mechanism
  // semora_device_id already uses to stitch a journey across the same
  // boundary — see siteDeviceId() in lib/analytics.ts.
  //
  // Not httpOnly, deliberately: the app is a client bundle and has to read it.
  // It carries no identity and no session, only 'en' or 'es'.
  const response = NextResponse.next();
  const path = request.nextUrl.pathname;
  // Skipped once the visitor has stated a language: after that the switcher is
  // the only thing that may change it, so opening one English page cannot strip
  // the Spanish they asked for — nor hand the app the wrong one.
  if (!path.startsWith('/_next') && !path.startsWith('/api') && !request.cookies.has('semora_locale_set')) {
    response.cookies.set(
      'semora_locale',
      path === '/es' || path.startsWith('/es/') ? 'es' : 'en',
      LOCALE_COOKIE,
    );
  }
  return response;
}

export const config = {
  // Skip Next's own static output and the generated OG image — those are
  // fetched by crawlers on whatever host the page was served from and never
  // need redirecting.
  matcher: ['/((?!_next/static|_next/image|opengraph-image|favicon.ico).*)'],
};
