import { ImageResponse } from 'next/og';
import { SITE_NAME } from './semora-facts';

/**
 * The one branded share card, parameterized by locale copy.
 *
 * Rendered from two places that MUST stay in sync, which is why the JSX lives
 * here rather than being duplicated:
 *
 *  - the file-convention app/(en)/opengraph-image.tsx and
 *    app/(es)/es/opengraph-image.tsx, which Next serves at content-hashed URLs
 *    and injects automatically for pages that do not define their own
 *    `openGraph`;
 *  - the stable /og.png and /es/og.png route handlers, which exist because a
 *    page-level `openGraph` REPLACES the inherited file-convention image in
 *    this Next version, and the hashed URL cannot be referenced statically —
 *    so lib/og.ts points the ~17 pages that spread OG_DEFAULTS/OG_IMAGE_ES at
 *    these fixed paths instead. (The previous bare '/opengraph-image' literal
 *    404'd in production: no share preview on any of those pages.)
 */
export const OG_SIZE = { width: 1200, height: 630 };

export function ogCard(tagline: string, subline: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#0F0B1A',
          backgroundImage:
            'radial-gradient(circle at 85% 15%, rgba(155,122,232,0.5) 0%, rgba(155,122,232,0) 55%), radial-gradient(circle at 5% 95%, rgba(201,184,255,0.28) 0%, rgba(201,184,255,0) 50%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: '#C9B8FF',
            marginBottom: 32,
          }}
        >
          {SITE_NAME}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 68,
            fontWeight: 700,
            color: '#FFFFFF',
            lineHeight: 1.15,
            maxWidth: 980,
          }}
        >
          {tagline}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 30,
            color: 'rgba(255,255,255,0.66)',
            marginTop: 32,
          }}
        >
          {subline}
        </div>
      </div>
    ),
    OG_SIZE
  );
}
