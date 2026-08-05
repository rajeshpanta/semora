'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './Reveal.module.css';

/**
 * Fade-and-rise a block into view once it is scrolled to.
 *
 * Deliberately fail-open: the element starts at opacity 0, so if the
 * IntersectionObserver never fires the content would be permanently invisible
 * — which would hide most of the page from crawlers, link-preview renderers
 * and screenshot tools that read the DOM without ever scrolling. A timeout
 * reveals everything regardless after a short delay, and
 * `prefers-reduced-motion` skips the animation entirely.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion || typeof IntersectionObserver === 'undefined') {
      queueMicrotask(() => setVisible(true));
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // Fire slightly before the block reaches the viewport so the motion has
      // settled by the time it is actually being read.
      { threshold: 0.05, rootMargin: '0px 0px -8% 0px' }
    );
    observer.observe(node);

    // Fail-open backstop — nothing stays hidden longer than this.
    const failsafe = window.setTimeout(() => {
      setVisible(true);
      observer.disconnect();
    }, 1600);

    return () => {
      observer.disconnect();
      window.clearTimeout(failsafe);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`js-reveal ${styles.reveal}${className ? ` ${className}` : ''}`}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'translateY(18px)',
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}
