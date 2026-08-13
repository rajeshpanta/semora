import type { Metadata } from 'next';
import { enAlternates } from '@/lib/hreflang';
import { notFound } from 'next/navigation';
import { LongFormPage } from '@/components/LongFormPage';
import { getNewPage } from '@/lib/new-page-content';
import { OG_IMAGE } from '@/lib/og';
import { pageTitle } from '@/lib/title';

const KEY = 'ai-flashcard-generator' as const;

export function generateMetadata(): Metadata {
  const c = getNewPage(KEY);
  return {
    title: c?.metaTitle ? pageTitle(c.metaTitle) : undefined,
    description: c?.metaDescription,
    alternates: enAlternates('/ai-flashcard-generator'),
    openGraph: { url: '/ai-flashcard-generator', ...OG_IMAGE },
  };
}

export default function Page() {
  const content = getNewPage(KEY);
  if (!content) notFound();
  return (
    <LongFormPage
      path="/ai-flashcard-generator"
      content={content}
      crumb={{ href: '/', label: 'Home' }}
      widget={undefined}
    />
  );
}
