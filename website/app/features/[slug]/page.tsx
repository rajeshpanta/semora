import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import styles from './feature.module.css';
import { ArticleShell } from '@/components/ArticleShell';
import { Faq } from '@/components/Faq';
import { JsonLd } from '@/components/JsonLd';
import { breadcrumbListSchema, faqPageSchema } from '@/lib/schema';
import { FEATURES, getFeature } from '@/lib/semora-facts';
import { getFeatureContent } from '@/lib/feature-content';
import { OG_IMAGE } from '@/lib/og';
import { RelatedLinks } from '@/components/RelatedLinks';
import { pageTitle } from '@/lib/title';

export function generateStaticParams() {
  return FEATURES.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const feature = getFeature(slug);
  if (!feature) return {};
  const long = getFeatureContent(slug);
  return {
    title: pageTitle(long?.metaTitle ?? feature.name),
    description: long?.metaDescription ?? feature.shortDescription,
    alternates: { canonical: `/features/${feature.slug}` },
    openGraph: { url: `/features/${feature.slug}`, ...OG_IMAGE },
  };
}

export default async function FeaturePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const feature = getFeature(slug);
  if (!feature) notFound();

  const long = getFeatureContent(slug);
  const related = FEATURES.filter((f) => f.slug !== feature.slug);

  // Deep landing pages that cover the same intent from the search side.
  // Without these the landers sit with zero inbound internal links.
  const DEEP_LINKS: Record<string, { href: string; label: string }[]> = {
    'syllabus-scanner': [
      { href: '/ai-syllabus-scanner', label: 'How the AI syllabus scanner works, end to end' },
      { href: '/blog/syllabus-to-semester-calendar', label: 'Turning a syllabus into a semester calendar' },
    ],
    'canvas-sync': [
      { href: '/canvas-deadline-tracker', label: 'Using Semora as a Canvas deadline tracker' },
      { href: '/blog/canvas-deadline-reminders', label: 'Getting useful deadline reminders out of Canvas' },
    ],
    'smart-plan': [
      { href: '/ai-study-planner-for-college', label: 'An AI study planner built from real deadlines' },
      { href: '/blog/finals-week-study-plan', label: 'Planning finals week' },
    ],
    'grade-tracking': [
      { href: '/blog/weighted-gpa-calculator', label: 'How a weighted GPA is actually calculated' },
    ],
    'focus-timer': [
      { href: '/blog/pomodoro-technique-between-classes', label: 'Pomodoro sessions between classes' },
    ],
  };
  const deepLinks = DEEP_LINKS[feature.slug] ?? [];

  return (
    <ArticleShell
      ctaHeading="Try it on your own syllabus"
      ctaSubheading="See how Semora handles your actual courses — free, no credit card."
    >
    <article className={`${styles.wrap} article-body`}>
      <JsonLd
        data={breadcrumbListSchema([
          { name: 'Features', path: '/features' },
          { name: feature.name, path: `/features/${feature.slug}` },
        ])}
      />
      {long?.faq?.length ? <JsonLd data={faqPageSchema(long.faq)} /> : null}

      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link href="/features">Features</Link>
        <span aria-hidden="true">/</span>
        <span>{feature.name}</span>
      </nav>

      <span className={`${styles.tier} ${feature.tier === 'pro' ? styles.pro : styles.free}`}>
        {feature.tier === 'pro' ? 'Pro' : 'Free'}
      </span>

      <h1>{long?.h1 ?? feature.name}</h1>
      <p className={styles.lede}>{long?.lede ?? feature.shortDescription}</p>

      {long ? (
        <>
          {long.intro.map((p, i) => (
            <p key={i} className={styles.body}>
              {p}
            </p>
          ))}

          {long.sections.map((s) => (
            <section key={s.heading} className={styles.section}>
              <h2>{s.heading}</h2>
              {s.paragraphs.map((p, i) => (
                <p key={i} className={styles.body}>
                  {p}
                </p>
              ))}
              {s.bullets?.length ? (
                <ul className={styles.points}>
                  {s.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}

          {long.faq.length ? (
            <section className={styles.section}>
              <h2>Frequently asked questions</h2>
              <Faq items={long.faq} />
            </section>
          ) : null}
        </>
      ) : (
        <p className={styles.body}>{feature.description}</p>
      )}

      <RelatedLinks links={deepLinks} />

      <div className={styles.related}>
        <h2 data-toc-skip>More features</h2>
        <ul>
          {related.map((f) => (
            <li key={f.slug}>
              <Link href={`/features/${f.slug}`}>{f.name}</Link>
            </li>
          ))}
        </ul>
      </div>

    </article>
    </ArticleShell>
  );
}
