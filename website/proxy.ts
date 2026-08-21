import { NextResponse, type NextRequest } from 'next/server';

const CANONICAL_HOST = 'semoraai.com';

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
  if (!path.startsWith('/_next') && !path.startsWith('/api')) {
    response.cookies.set('semora_locale', path === '/es' || path.startsWith('/es/') ? 'es' : 'en', {
      domain: '.semoraai.com',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      secure: true,
    });
  }
  return response;
}

export const config = {
  // Skip Next's own static output and the generated OG image — those are
  // fetched by crawlers on whatever host the page was served from and never
  // need redirecting.
  matcher: ['/((?!_next/static|_next/image|opengraph-image|favicon.ico).*)'],
};
