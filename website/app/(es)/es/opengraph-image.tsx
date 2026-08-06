import { SITE_NAME } from '@/lib/semora-facts';
import { TAGLINE_ES } from '@/lib/es-facts';
import { ogCard, OG_SIZE } from '@/lib/og-card';

export const alt = `${SITE_NAME} — ${TAGLINE_ES}`;
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function SpanishOpengraphImage() {
  return ogCard(TAGLINE_ES, 'Tu semestre organizado en iPhone, iPad y web');
}
