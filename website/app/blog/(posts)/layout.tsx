import styles from '@/components/Prose.module.css';
import { Cta } from '@/components/Cta';
import { ArticleShell } from '@/components/ArticleShell';
import { BlogBreadcrumb } from '@/components/BlogBreadcrumb';

export default function PostLayout({ children }: { children: React.ReactNode }) {
  return (
    <ArticleShell
      ctaHeading="Ready to get organized?"
      ctaSubheading="Turn your syllabus into a full semester plan in under a minute."
    >
      <article className={styles.prose}>
        <BlogBreadcrumb />
        {children}
        <Cta
          heading="Ready to get organized?"
          subheading="Scan your first syllabus free — no credit card required."
        />
      </article>
    </ArticleShell>
  );
}
