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
export function middleware(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0];

  if (host && host !== CANONICAL_HOST && host.endsWith(CANONICAL_HOST)) {
    const url = new URL(request.url);
    url.protocol = 'https:';
    url.host = CANONICAL_HOST;
    url.port = '';
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next's own static output and the generated OG image — those are
  // fetched by crawlers on whatever host the page was served from and never
  // need redirecting.
  matcher: ['/((?!_next/static|_next/image|opengraph-image|favicon.ico).*)'],
};
