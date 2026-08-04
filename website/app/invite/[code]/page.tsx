import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ShareLanding, isPlausibleShareValue } from '@/components/ShareLanding';
import { OG_IMAGE } from '@/lib/og';
import { SITE_NAME } from '@/lib/semora-facts';

/**
 * Landing page for a referral link (lib/referral.ts). Private per code and
 * unbounded in count — see the note in app/join/[token]/page.tsx for why
 * `index: false` is not optional on these routes.
 */
export const metadata: Metadata = {
  // Absolute: the root layout's `%s | Semora` template would otherwise render
  // this as "You've been invited to Semora | Semora".
  title: { absolute: `You've been invited to ${SITE_NAME}` },
  description: `Join with a friend's invite link and you both get a free month of ${SITE_NAME} Pro.`,
  robots: { index: false, follow: true },
  openGraph: {
    title: `You've been invited to ${SITE_NAME}`,
    description: `Scan your syllabus, never miss a deadline — and you both get a free month of Pro.`,
    ...OG_IMAGE,
  },
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!isPlausibleShareValue(code)) notFound();
  return <ShareLanding kind="invite" value={code} />;
}
