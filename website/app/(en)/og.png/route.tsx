import { TAGLINE } from '@/lib/semora-facts';
import { ogCard } from '@/lib/og-card';

/**
 * The share card at a STABLE URL, for the pages that define their own
 * `openGraph` and therefore lose the file-convention image (see lib/og.ts).
 * force-static: rendered once at build, served as a static asset.
 */
export const dynamic = 'force-static';

export function GET() {
  return ogCard(TAGLINE, 'AI syllabus scanner for college, on iPhone, iPad and web');
}
