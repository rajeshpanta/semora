import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LongFormPage } from '@/components/LongFormPage';
import { getNewPage } from '@/lib/new-page-content';
import { OG_IMAGE } from '@/lib/og';
import { PomodoroTimer } from '@/components/PomodoroTimer';

const KEY = 'pomodoro-timer' as const;

export function generateMetadata(): Metadata {
  const c = getNewPage(KEY);
  return {
    title: c?.metaTitle,
    description: c?.metaDescription,
    alternates: { canonical: '/pomodoro-timer' },
    openGraph: { url: '/pomodoro-timer', ...OG_IMAGE },
  };
}

export default function Page() {
  const content = getNewPage(KEY);
  if (!content) notFound();
  return (
    <LongFormPage
      content={content}
      crumb={{ href: '/', label: 'Home' }}
      widget={<PomodoroTimer />}
    />
  );
}
