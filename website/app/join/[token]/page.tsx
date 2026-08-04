import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ShareLanding, isPlausibleShareValue } from '@/components/ShareLanding';
import { OG_IMAGE } from '@/lib/og';
import { SITE_NAME } from '@/lib/semora-facts';

/**
 * Landing page for a shared-course link (lib/shareCourse.ts / the share-course
 * edge function). One page per token, so the URL space here is unbounded and
 * every page is private to one recipient — `noindex` is mandatory, or this
 * becomes the same soft-404 farm the app subdomain was.
 *
 * `follow` stays on so the links out to the marketing pages still count.
 */
export const metadata: Metadata = {
  title: `A classmate shared their course with you`,
  description: `Open the shared course in ${SITE_NAME} — every deadline, exam, and grading weight from their syllabus, copied into your own semester.`,
  robots: { index: false, follow: true },
  openGraph: {
    title: `A classmate shared their course with you on ${SITE_NAME}`,
    description: `Every deadline, exam, and grading weight from their syllabus — copied into your own semester.`,
    ...OG_IMAGE,
  },
};

export default async function JoinSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isPlausibleShareValue(token)) notFound();
  return <ShareLanding kind="join" value={token} />;
}
