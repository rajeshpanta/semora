import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import styles from './feature.module.css';
import { Cta } from '@/components/Cta';
import { JsonLd } from '@/components/JsonLd';
import { breadcrumbListSchema } from '@/lib/schema';
import { FEATURES, getFeature } from '@/lib/semora-facts';

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
  return {
    title: feature.name,
    description: feature.shortDescription,
    alternates: { canonical: `/features/${feature.slug}` },
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

  const related = FEATURES.filter((f) => f.slug !== feature.slug).slice(0, 4);

  return (
    <article className={styles.wrap}>
      <JsonLd
        data={breadcrumbListSchema([
          { name: 'Features', path: '/features' },
          { name: feature.name, path: `/features/${feature.slug}` },
        ])}
      />
      <span className={`${styles.tier} ${feature.tier === 'pro' ? styles.pro : styles.free}`}>
        {feature.tier === 'pro' ? 'Pro' : 'Free'}
      </span>
      <h1>{feature.name}</h1>
      <p className={styles.lede}>{feature.shortDescription}</p>
      <p className={styles.body}>{feature.description}</p>

      <div className={styles.related}>
        <h2>More features</h2>
        <ul>
          {related.map((f) => (
            <li key={f.slug}>
              <Link href={`/features/${f.slug}`}>{f.name}</Link>
            </li>
          ))}
        </ul>
      </div>

      <Cta
        heading={`Get started with ${feature.name}`}
        subheading={
          feature.tier === 'pro'
            ? "Start on Semora's free tier, then upgrade to Pro for this feature."
            : "Free on Semora's free tier — no credit card required."
        }
      />
    </article>
  );
}
