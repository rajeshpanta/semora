import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import styles from './spanish.module.css';
import { LongFormPage } from '@/components/LongFormPage';
import { PricingCards } from '@/components/PricingCards';
import { GpaCalculator } from '@/components/GpaCalculator';
import { PomodoroTimer } from '@/components/PomodoroTimer';
import { SupportForm } from '@/components/SupportForm';
import { SUPPORT_EMAIL } from '@/lib/semora-facts';
import { FEATURES_ES } from '@/lib/es-facts';
import {
  getSpanishPage,
  SPANISH_BLOG_POSTS,
  SPANISH_COMPARISONS,
  SPANISH_PAGES,
  type SpanishPageConfig,
} from '@/lib/es-content';
import { OG_IMAGE_ES } from '@/lib/og';

type Params = Promise<{ slug: string[] }>;

function pathFromSlug(slug: string[]): string {
  return `/es/${slug.join('/')}`;
}

export function generateStaticParams() {
  return SPANISH_PAGES.map((item) => ({ slug: item.path.replace(/^\/es\//, '').split('/') }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const config = getSpanishPage(pathFromSlug(slug));
  if (!config) return {};

  return {
    title: config.content.metaTitle,
    description: config.content.metaDescription,
    alternates: {
      canonical: config.path,
      languages: {
        'en-US': config.englishPath,
        es: config.path,
        'x-default': config.englishPath,
      },
    },
    openGraph: {
      url: config.path,
      title: config.content.metaTitle,
      description: config.content.metaDescription,
      locale: 'es_US',
      ...OG_IMAGE_ES,
    },
  };
}

function DirectoryWidget({ config }: { config: SpanishPageConfig }) {
  if (config.kind === 'pricing') return <PricingCards locale="es" />;
  if (config.kind === 'gpa') return <GpaCalculator locale="es" />;
  if (config.kind === 'pomodoro') return <PomodoroTimer locale="es" />;
  if (config.kind === 'support') {
    return (
      <div className={styles.supportWidget}>
        <SupportForm supportEmail={SUPPORT_EMAIL} locale="es" />
        <p>
          También puedes escribir directamente a{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </div>
    );
  }
  if (config.kind === 'features-index') {
    return (
      <div className={styles.cardGrid}>
        {FEATURES_ES.map((feature) => (
          <Link key={feature.slug} href={`/es/funciones/${feature.slug}`} className={styles.card}>
            <span className={styles.cardMeta}>{feature.tier === 'pro' ? 'Pro' : 'Gratis'}</span>
            <strong>{feature.name}</strong>
            <p>{feature.shortDescription}</p>
            <span className={styles.cardLink}>Conocer la función →</span>
          </Link>
        ))}
      </div>
    );
  }
  if (config.kind === 'feature') {
    return (
      <div className={styles.featureStrip}>
        <span>{config.feature?.tier === 'pro' ? 'Incluido con Semora Pro' : 'Disponible en el plan Gratis'}</span>
        <Link href="/es/precios">Comparar planes →</Link>
      </div>
    );
  }
  if (config.kind === 'blog-index') {
    return (
      <div className={styles.cardGrid}>
        {SPANISH_BLOG_POSTS.map((post) => (
          <Link key={post.path} href={post.path} className={`${styles.card} ${styles.articleCard}`}>
            <Image src={post.image} alt="" width={120} height={90} className={styles.cardImage} />
            <span className={styles.cardMeta}>{post.date}</span>
            <strong>{post.title}</strong>
            <p>{post.description}</p>
            <span className={styles.cardLink}>Leer la guía →</span>
          </Link>
        ))}
      </div>
    );
  }
  if (config.kind === 'compare-index') {
    return (
      <div className={styles.cardGrid}>
        {SPANISH_COMPARISONS.map((item) => (
          <Link key={item.slug} href={`/es/comparar/${item.slug}`} className={styles.card}>
            <span className={styles.cardMeta}>Comparación</span>
            <strong>Semora vs {item.name}</strong>
            <p>Programas y organización conectada frente a {item.focus}.</p>
            <span className={styles.cardLink}>Ver comparación →</span>
          </Link>
        ))}
      </div>
    );
  }
  return undefined;
}

function getCrumb(config: SpanishPageConfig) {
  if (config.path.startsWith('/es/blog/')) return { href: '/es/blog', label: 'Blog' };
  if (config.path.startsWith('/es/funciones/')) return { href: '/es/funciones', label: 'Funciones' };
  if (config.path.startsWith('/es/comparar/')) return { href: '/es/comparar', label: 'Comparar' };
  return { href: '/es', label: 'Inicio' };
}

export default async function SpanishPage({ params }: { params: Params }) {
  const { slug } = await params;
  const config = getSpanishPage(pathFromSlug(slug));
  if (!config) notFound();
  const widget = config.kind === 'standard' ? undefined : <DirectoryWidget config={config} />;

  return (
    <LongFormPage
      locale="es"
      path={config.path}
      content={config.content}
      crumb={getCrumb(config)}
      widget={widget}
    />
  );
}
