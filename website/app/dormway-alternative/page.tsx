import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LongFormPage } from '@/components/LongFormPage';
import { getNewPage } from '@/lib/new-page-content';
import { OG_IMAGE } from '@/lib/og';

const KEY = 'dormway-alternative' as const;

export function generateMetadata(): Metadata {
  const c = getNewPage(KEY);
  return {
    title: c?.metaTitle,
    description: c?.metaDescription,
    alternates: { canonical: '/dormway-alternative' },
    openGraph: { url: '/dormway-alternative', ...OG_IMAGE },
  };
}

export default function Page() {
  const content = getNewPage(KEY);
  if (!content) notFound();
  return (
    <LongFormPage
      path="/dormway-alternative"
      content={content}
      crumb={{ href: '/compare', label: 'Compare' }}
      widget={undefined}
    />
  );
}
