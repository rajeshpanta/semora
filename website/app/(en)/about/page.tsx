import type { Metadata } from 'next';
import { enAlternates } from '@/lib/hreflang';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { LongFormPage } from '@/components/LongFormPage';
import { getNewPage } from '@/lib/new-page-content';
import { OG_IMAGE } from '@/lib/og';
import { pageTitle } from '@/lib/title';

const KEY = 'about' as const;

export function generateMetadata(): Metadata {
  const c = getNewPage(KEY);
  return {
    title: c?.metaTitle ? pageTitle(c.metaTitle) : undefined,
    description: c?.metaDescription,
    alternates: enAlternates('/about'),
    openGraph: { url: '/about', ...OG_IMAGE },
  };
}

export default function Page() {
  const content = getNewPage(KEY);
  if (!content) notFound();
  return (
    <LongFormPage
      path="/about"
      content={content}
      crumb={{ href: '/', label: 'Home' }}
      widget={<p><Link href="/support">Contact support</Link> · <Link href="/privacy">Privacy policy</Link> · <Link href="/pricing">Free and Pro plans</Link></p>}
    />
  );
}
