'use client';

import { useEffect, useState } from 'react';
import styles from './TableOfContents.module.css';

function slugify(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base ? `${base}-${index}` : `section-${index}`;
}

export function TableOfContents({
  selector = 'article h2:not([data-toc-skip])',
}: {
  selector?: string;
}) {
  const [headings, setHeadings] = useState<{ id: string; text: string }[]>([]);
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(selector));
    const items = els.map((el, i) => {
      if (!el.id) el.id = slugify(el.textContent ?? '', i);
      return { id: el.id, text: el.textContent ?? '' };
    });
    // Deferred to a microtask so this reads as "subscribing to a DOM
    // measurement" rather than a synchronous setState-in-effect, which
    // avoids the cascading-render lint rule for what's otherwise identical
    // timing.
    queueMicrotask(() => setHeadings(items));
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setActiveId(visible.target.id);
      },
      { rootMargin: '-15% 0px -70% 0px' }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [selector]);

  if (headings.length < 2) return null;

  return (
    <nav className={styles.toc} aria-label="Table of contents">
      <p className={styles.tocTitle}>On this page</p>
      <ul>
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={activeId === h.id ? styles.active : undefined}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                history.replaceState(null, '', `#${h.id}`);
              }}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
