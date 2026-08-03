import type { MDXComponents } from 'mdx/types';
import Link from 'next/link';
import styles from '@/components/Prose.module.css';

const components: MDXComponents = {
  h1: (props) => <h1 {...props} />,
  h2: (props) => <h2 {...props} />,
  h3: (props) => <h3 {...props} />,
  p: (props) => <p {...props} />,
  a: ({ href, ...props }) =>
    href?.startsWith('/') ? <Link href={href} {...props} /> : <a href={href} {...props} />,
  ul: (props) => <ul {...props} />,
  ol: (props) => <ol {...props} />,
  strong: (props) => <strong {...props} />,
  blockquote: (props) => <blockquote className={styles.lede} {...props} />,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
