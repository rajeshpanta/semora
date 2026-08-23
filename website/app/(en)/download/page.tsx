import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { enAlternates } from '@/lib/hreflang';
import { DownloadPageBody } from '@/components/DownloadPageBody';
import { getNewPage } from '@/lib/new-page-content';
import { OG_IMAGE } from '@/lib/og';
import { pageTitle } from '@/lib/title';

const KEY = 'download' as const;

export function generateMetadata(): Metadata {
  const c = getNewPage(KEY);
  return {
    title: c?.metaTitle ? pageTitle(c.metaTitle) : undefined,
    description: c?.metaDescription,
    alternates: enAlternates('/download'),
    openGraph: { url: '/download', ...OG_IMAGE },
  };
}

export default function Page() {
  const content = getNewPage(KEY);
  if (!content) notFound();
  return <DownloadPageBody content={content} locale="en" />;
}
