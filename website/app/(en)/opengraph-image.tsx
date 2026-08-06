import { SITE_NAME, TAGLINE } from '@/lib/semora-facts';
import { ogCard, OG_SIZE } from '@/lib/og-card';

/**
 * Root-level OG image. Next.js applies this to every route that doesn't
 * define its own `openGraph`, at a content-hashed URL. Pages that DO define
 * `openGraph` lose this inherited image, which is why lib/og.ts also points
 * them at the stable /og.png route — both render the same card from
 * lib/og-card.tsx.
 */
export const alt = `${SITE_NAME} — ${TAGLINE}`;
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function OpengraphImage() {
  return ogCard(TAGLINE, 'AI syllabus scanner for college, on iPhone, iPad and web');
}
