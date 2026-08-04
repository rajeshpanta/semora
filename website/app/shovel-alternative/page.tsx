import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LongFormPage } from '@/components/LongFormPage';
import { getNewPage } from '@/lib/new-page-content';
import { OG_IMAGE } from '@/lib/og';

const KEY = 'shovel-alternative' as const;

export function generateMetadata(): Metadata {
  const c = getNewPage(KEY);
  return {
    title: c?.metaTitle,
    description: c?.metaDescription,
    alternates: { canonical: '/shovel-alternative' },
    openGraph: { url: '/shovel-alternative', ...OG_IMAGE },
  };
}

export default function Page() {
  const content = getNewPage(KEY);
  if (!content) notFound();
  return (
    <LongFormPage
      path="/shovel-alternative"
      content={content}
      crumb={{ href: '/compare', label: 'Compare' }}
      widget={undefined}
    />
  );
}
