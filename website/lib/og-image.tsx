import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 };

export function generateBlogOgImage(title: string) {
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
            marginBottom: 36,
          }}
        >
          SEMORA BLOG
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 58,
            fontWeight: 700,
            color: '#FFFFFF',
            lineHeight: 1.18,
            maxWidth: 980,
          }}
        >
          {title}
        </div>
      </div>
    ),
    OG_SIZE
  );
}
