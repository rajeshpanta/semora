import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import styles from './spanish.module.css';
import { LongFormPage } from '@/components/LongFormPage';
import { BlogIndex } from '@/components/BlogIndex';
import { BlogPostArticle } from '@/components/BlogPostArticle';
import { PageSections } from '@/components/PageSections';
import { JsonLd } from '@/components/JsonLd';
import { RelatedPosts } from '@/components/RelatedPosts';
import { articleSchema, blogIndexSchema, itemListSchema } from '@/lib/schema';
import { PricingCards } from '@/components/PricingCards';
import { FeatureShowcase } from '@/components/FeatureShowcase';
import { GpaCalculator } from '@/components/GpaCalculator';
import { PomodoroTimer } from '@/components/PomodoroTimer';
import { SupportForm } from '@/components/SupportForm';
import { BackToApp } from '@/components/BackToApp';
import { SUPPORT_EMAIL } from '@/lib/semora-facts';
import { FEATURES_ES, SHOWCASE_ES } from '@/lib/es-facts';
import {
  getSpanishPage,
  SPANISH_BLOG_INDEX_SUMMARY,
  SPANISH_BLOG_POSTS,
  SPANISH_COMPARISONS,
  SPANISH_PAGES,
  type SpanishPageConfig,
} from '@/lib/es-content';
import { OG_IMAGE_ES } from '@/lib/og';
import { pageTitle } from '@/lib/title';
import { isSpanishNoindexPath } from '@/lib/i18n';
import { relatedPostSlugs } from '@/lib/blog';

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
  // Unmatched slug → notFound() below, which discards whatever is returned
  // here. The 404's own title lives in app/(es)/es/not-found.tsx.
  if (!config) return {};
  const post = SPANISH_BLOG_POSTS.find((item) => item.path === config.path);
  const noindex = isSpanishNoindexPath(config.path);

  return {
    title: pageTitle(config.content.metaTitle),
    description: config.content.metaDescription,
    alternates: noindex
      ? { canonical: config.path }
      : {
          canonical: config.path,
          languages: {
            'en-US': config.englishPath,
            es: config.path,
            'x-default': config.englishPath,
          },
        },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      url: config.path,
      title: config.content.metaTitle,
      description: config.content.metaDescription,
      locale: 'es_US',
      ...OG_IMAGE_ES,
      ...(post
        ? {
            type: 'article' as const,
            publishedTime: post.isoDate,
            modifiedTime: post.modifiedDate ?? post.isoDate,
          }
        : {}),
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
        <BackToApp locale="es" />
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
      <>
        {/* /features has shown five screenshots since launch while
            /es/funciones showed none — the last asymmetry between the two
            locales. Same component, Spanish assets and Spanish copy. */}
        <FeatureShowcase
          locale="es"
          heading="Cinco formas en que Semora organiza tu semestre"
          sub="El recorrido completo: de la foto de un programa a una calificación en la que puedes confiar."
          items={SHOWCASE_ES}
        />
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
      </>
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

/**
 * The three posts following this one in registry order, wrapping at the end.
 *
 * Mirrors relatedPosts() in lib/blog.ts, and for the same reason: always taking
 * the first three left every post from the fourth onward with a single inbound
 * link no matter how many posts existed.
 */
function spanishRelatedPosts(path: string, limit = 3) {
  const current = SPANISH_BLOG_POSTS.find((post) => post.path === path);
  if (!current) return [];
  const slug = current.englishPath.split('/').at(-1) ?? '';
  return relatedPostSlugs(slug, limit)
    .map((relatedSlug) =>
      SPANISH_BLOG_POSTS.find((post) => post.englishPath === `/blog/${relatedSlug}`),
    )
    .filter((post): post is (typeof SPANISH_BLOG_POSTS)[number] => Boolean(post))
    .map((post) => ({ path: post.path, title: post.title, description: post.description }));
}

/**
 * ItemList for the two hub pages that are only a grid of links.
 *
 * Mirrors what /features and /compare emit in English. The blog index is
 * excluded on purpose — it already describes its contents through
 * blogIndexSchema, and a second list of the same posts is a duplicate rather
 * than an extra signal.
 */
function hubListSchema(config: SpanishPageConfig) {
  if (config.kind === 'features-index') {
    return itemListSchema(
      FEATURES_ES.map((f) => ({
        name: f.name,
        path: `/es/funciones/${f.slug}`,
        description: f.shortDescription,
      })),
      { path: '/es/funciones', name: 'Funciones de Semora' },
    );
  }
  if (config.kind === 'compare-index') {
    return itemListSchema(
      SPANISH_COMPARISONS.map((c) => ({
        name: `Semora vs ${c.name}`,
        path: `/es/comparar/${c.slug}`,
        description: `Semora frente a ${c.name}, centrado en ${c.focus}.`,
      })),
      { path: '/es/comparar', name: 'Semora comparado con otras apps de estudio' },
    );
  }
  return null;
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

  // Blog posts carry the same illustration their card uses on the index. The
  // English posts have had one since launch via BlogPostHero; the Spanish ones
  // rendered no image at all.
  const post = SPANISH_BLOG_POSTS.find((b) => b.path === config.path);

  // The English posts have emitted Article since launch; the Spanish ones
  // emitted only BreadcrumbList and FAQPage, so Google had nothing marking them
  // as articles at all.
  const articleLd = post
    ? articleSchema({
        title: post.title,
        description: post.description,
        path: post.path,
        datePublished: post.isoDate,
        dateModified: post.modifiedDate,
        image: post.image,
        inLanguage: 'es',
      })
    : null;

  // The blog index and the posts render through the same components /blog and
  // its posts use, not through LongFormPage — see BlogIndex.tsx and
  // BlogPostArticle.tsx for why the two locales had drifted apart.
  if (config.kind === 'blog-index') {
    return (
      <>
        <JsonLd
          data={blogIndexSchema(
            SPANISH_BLOG_POSTS.map((b) => ({
              path: b.path, title: b.title, description: b.description, datePublished: b.isoDate,
            })),
            { path: '/es/blog', name: 'El blog de Semora', inLanguage: 'es' },
          )}
        />
        <BlogIndex
          heading={config.content.h1}
          sub={config.content.lede}
          posts={SPANISH_BLOG_POSTS.map((b) => ({
            path: b.path,
            title: b.title,
            description: b.description,
            image: b.image,
            imageAlt: b.imageAlt,
            dateLabel: b.date,
          }))}
        >
          <PageSections locale="es" content={SPANISH_BLOG_INDEX_SUMMARY} withRail />
        </BlogIndex>
      </>
    );
  }

  if (post) {
    return (
      <>
        {articleLd ? <JsonLd data={articleLd} /> : null}
        <BlogPostArticle
          locale="es"
          path={config.path}
          crumbHref="/es/blog"
          content={config.content}
          hero={{ image: post.image, alt: post.imageAlt ?? '', date: post.date }}
        >
          <RelatedPosts locale="es" posts={spanishRelatedPosts(post.path)} />
        </BlogPostArticle>
      </>
    );
  }

  const hubList = hubListSchema(config);

  return (
    <>
      {hubList ? <JsonLd data={hubList} /> : null}
      <LongFormPage
        locale="es"
        path={config.path}
        content={config.content}
        crumb={getCrumb(config)}
        widget={widget}
      />
    </>
  );
}
