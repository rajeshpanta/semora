import { TAGLINE_ES } from '@/lib/es-facts';
import { ogCard } from '@/lib/og-card';

/** Spanish share card at a stable URL — see the English /og.png route. */
export const dynamic = 'force-static';

export function GET() {
  return ogCard(TAGLINE_ES, 'Tu semestre organizado en iPhone, iPad y web');
}
