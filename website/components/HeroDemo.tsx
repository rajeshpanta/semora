'use client';

import { useEffect, useState } from 'react';
import styles from './HeroDemo.module.css';
import type { SiteLocale } from '@/lib/i18n';

/**
 * The hero's product demo: the actual web app, animating through what it does.
 *
 * Replaces a static phone screenshot. A still image of a phone asks the visitor
 * to imagine the product working; this shows it working, which is the whole job
 * of a hero on a page nobody has heard of yet.
 *
 * Built in CSS rather than shipped as a video: it stays crisp at any width,
 * costs a few kB instead of a few MB, needs no poster frame, and can be paused
 * for reduced-motion without a separate code path.
 *
 * Everything depicted is real — the sidebar mirrors WebAppFrame's actual
 * navigation, and the extracted rows are the shape a scanned syllabus really
 * produces. No invented numbers, no fake ratings.
 */

const STAGES = [
  { key: 'scan', label: 'Drop in your syllabus', hint: 'Photo, PDF, or pasted text' },
  { key: 'extract', label: 'Every deadline, pulled out', hint: 'Dates, weights, class times' },
  { key: 'organized', label: 'Your semester, organized', hint: 'Nothing saved until you say so' },
] as const;

const ROWS = [
  { title: 'Problem Set 7', course: 'Calc II', due: 'Sep 9', tone: 'due' },
  { title: 'Midterm Exam', course: 'Calc II', due: 'Oct 14', tone: 'exam' },
  { title: 'Lab Report 3', course: 'Biology 101', due: 'Sep 7', tone: 'late' },
  { title: 'Reading: Ch. 5', course: 'History 210', due: 'Sep 9', tone: 'done' },
  { title: 'Essay Outline', course: 'History 210', due: 'Sep 12', tone: 'due' },
] as const;

const NAV = ['Today', 'Courses', 'Calendar', 'Import syllabus'] as const;
const TOOLS = ['Smart Plan', 'Workload', 'Flashcards'] as const;

export function HeroDemo({ locale = 'en' }: { locale?: SiteLocale }) {
  const [stage, setStage] = useState(0);
  const [paused, setPaused] = useState(false);
  const es = locale === 'es';
  const stages = es
    ? [
        { key: 'scan', label: 'Añade el programa de la materia', hint: 'Foto, PDF o texto copiado' },
        { key: 'extract', label: 'Semora encuentra cada fecha', hint: 'Entregas, criterios de evaluación y horarios' },
        { key: 'organized', label: 'Tu semestre queda organizado', hint: 'Tú decides qué información guardar' },
      ] as const
    : STAGES;
  const rows = es
    ? [
        { title: 'Lista de problemas 7', course: 'Cálculo II', due: '9 sep', tone: 'due' },
        { title: 'Examen parcial', course: 'Cálculo II', due: '14 oct', tone: 'exam' },
        { title: 'Informe de laboratorio 3', course: 'Biología 101', due: '7 sep', tone: 'late' },
        { title: 'Lectura: cap. 5', course: 'Historia 210', due: '9 sep', tone: 'done' },
        { title: 'Esquema del ensayo', course: 'Historia 210', due: '12 sep', tone: 'due' },
      ] as const
    : ROWS;
  const nav = es ? ['Hoy', 'Cursos', 'Calendario', 'Añadir programa'] : NAV;
  const tools = es ? ['Plan Inteligente', 'Carga académica', 'Tarjetas'] : TOOLS;

  useEffect(() => {
    // Honour the OS setting: hold on the finished state rather than looping.
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduce.matches) {
      queueMicrotask(() => {
        setStage(stages.length - 1);
        setPaused(true);
      });
      return;
    }
    const t = setInterval(() => setStage((s) => (s + 1) % stages.length), 3200);
    return () => clearInterval(t);
  }, [stages.length]);

  const current = stages[stage];

  return (
    <div className={styles.wrap} aria-hidden="true">
      <div className={styles.glow} />

      <div className={styles.window} data-stage={current.key}>
        {/* Browser chrome — this is the web app, not a phone. */}
        <div className={styles.chrome}>
          <span className={styles.dot} data-c="r" />
          <span className={styles.dot} data-c="y" />
          <span className={styles.dot} data-c="g" />
          <div className={styles.url}>app.semoraai.com</div>
        </div>

        <div className={styles.body}>
          <aside className={styles.sidebar}>
            <div className={styles.brand}>Semora</div>
            {nav.map((item, i) => (
              <div key={item} className={styles.navItem} data-active={i === 0}>
                <span className={styles.navDot} />
                {item}
              </div>
            ))}
            <div className={styles.navLabel}>{es ? 'Herramientas de estudio' : 'Study tools'}</div>
            {tools.map((item) => (
              <div key={item} className={styles.navItem}>
                <span className={styles.navDot} />
                {item}
              </div>
            ))}
          </aside>

          <main className={styles.main}>
            {/* Stage 1 — the syllabus, being read. */}
            <div className={styles.doc}>
              <div className={styles.docHead}>
                <span className={styles.docTitle}>{es ? 'QUÍM 101 · Programa.pdf' : 'CHEM 101 Syllabus.pdf'}</span>
              </div>
              <div className={styles.scanline} />
              {[92, 76, 88, 61, 83, 70, 90, 58].map((w, i) => (
                <span key={i} className={styles.docLine} style={{ width: `${w}%` }} />
              ))}
            </div>

            {/* Stages 2 and 3 — the deadlines it found. */}
            <div className={styles.list}>
              {rows.map((row, i) => (
                <div
                  key={row.title}
                  className={styles.row}
                  data-tone={row.tone}
                  style={{ '--i': i } as React.CSSProperties}
                >
                  <span className={styles.check} />
                  <div className={styles.rowText}>
                    <span className={styles.rowTitle}>{row.title}</span>
                    <span className={styles.rowCourse}>{row.course}</span>
                  </div>
                  <span className={styles.rowDue}>{row.due}</span>
                </div>
              ))}
            </div>

            {/* Stage 3 — the payoff, a week that adds up. */}
            <div className={styles.week}>
              {/* Every other string in this component is localized — the stage
                  captions, the rows, the sidebar, "QUÍM 101 · Programa.pdf" —
                  so these English initials were the one untranslated element in
                  the Spanish hero, and M/T/W/T/F/S/S means nothing in Spanish. */}
              {(es ? ['L', 'M', 'X', 'J', 'V', 'S', 'D'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']).map((d, i) => (
                <div key={i} className={styles.day}>
                  <span
                    className={styles.bar}
                    style={{ '--h': [38, 62, 30, 88, 46, 18, 24][i], '--i': i } as React.CSSProperties}
                  />
                  <span className={styles.dayLabel}>{d}</span>
                </div>
              ))}
            </div>
          </main>
        </div>
      </div>

      {/* Benefit caption, not a feature name. */}
      <div className={styles.caption} key={current.key}>
        <div className={styles.captionLabel}>{current.label}</div>
        <div className={styles.captionHint}>{current.hint}</div>
        {!paused && (
          <div className={styles.progress}>
            {stages.map((s, i) => (
              <span key={s.key} className={styles.tick} data-on={i === stage} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
