import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ShareLanding, isPlausibleShareValue } from '@/components/ShareLanding';
import { OG_IMAGE } from '@/lib/og';
import { SITE_NAME } from '@/lib/semora-facts';

/**
 * Landing page for a Course Space invite (lib/collaboration.ts). Private per
 * token and unbounded in count — see the note in app/join/[token]/page.tsx for
 * why `index: false` is not optional on these routes.
 */
export const metadata: Metadata = {
  title: `Join your classmates in a course space`,
  description: `A ${SITE_NAME} course space keeps one shared set of deadlines and group assignments in sync for everyone in the class.`,
  robots: { index: false, follow: true },
  openGraph: {
    title: `Join your classmates in a ${SITE_NAME} course space`,
    description: `One shared set of deadlines and group assignments, in sync for the whole class.`,
    ...OG_IMAGE,
  },
};

export default async function CollaboratePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isPlausibleShareValue(token)) notFound();
  return <ShareLanding kind="collaborate" value={token} />;
}
