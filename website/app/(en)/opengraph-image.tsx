import { ImageResponse } from 'next/og';
import { SITE_NAME, TAGLINE } from '@/lib/semora-facts';

/**
 * Root-level OG image. Next.js applies this to every route that doesn't
 * define its own, which covers the whole site — so a link to any page
 * unfurls with real branding instead of the blank card that a bare
 * `twitter:card: summary_large_image` produces on its own.
 */
export const alt = `${SITE_NAME} — ${TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
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
          {TAGLINE}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 30,
            color: 'rgba(255,255,255,0.66)',
            marginTop: 32,
          }}
        >
          AI syllabus scanner for college, on iPhone, iPad and web
        </div>
      </div>
    ),
    size
  );
}
