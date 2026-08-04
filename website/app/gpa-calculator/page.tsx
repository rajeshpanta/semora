import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LongFormPage } from '@/components/LongFormPage';
import { getNewPage } from '@/lib/new-page-content';
import { OG_IMAGE } from '@/lib/og';
import { GpaCalculator } from '@/components/GpaCalculator';
import { pageTitle } from '@/lib/title';

const KEY = 'gpa-calculator' as const;

export function generateMetadata(): Metadata {
  const c = getNewPage(KEY);
  return {
    title: c?.metaTitle ? pageTitle(c.metaTitle) : undefined,
    description: c?.metaDescription,
    alternates: { canonical: '/gpa-calculator' },
    openGraph: { url: '/gpa-calculator', ...OG_IMAGE },
  };
}

export default function Page() {
  const content = getNewPage(KEY);
  if (!content) notFound();
  return (
    <LongFormPage
      path="/gpa-calculator"
      content={content}
      crumb={{ href: '/', label: 'Home' }}
      widget={<GpaCalculator />}
    />
  );
}
