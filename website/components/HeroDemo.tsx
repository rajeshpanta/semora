'use client';

import { useEffect, useMemo, useState } from 'react';
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
 *
 * ─── WHY THERE ARE FOUR BEATS ───────────────────────────────────────────────
 *
 * It used to run scan → extract → organized and hold there. That is a truthful
 * account of a syllabus scanner and an untruthful one of Semora: the last thing
 * a visitor saw was a static list, so the product appeared to end at the moment
 * the work was filed. The two beats added here are the two the app actually
 * does next — a connected Canvas moves a date without being asked, and the
 * ranker says what to do about it.
 *
 * `extract` and `organized` were always one continuous build (rows land, then
 * the week chart rises underneath them), so they are merged rather than added
 * to. Four captions, not five.
 *
 * TIMING IS DELIBERATELY UNEVEN. At the old flat 3.2s a fourth beat would not
 * arrive until 9.6 seconds, past the window this exists to win. The setup beats
 * are cut short and the payoff holds longest: the point lands at 6.4s and stays
 * up for 5.0s of an 11.4s loop.
 */

const STAGES = [
  {
    key: 'scan',
    label: 'Drop in your syllabus',
    hint: 'Photo, PDF, or pasted text',
    ms: 1900,
  },
  {
    key: 'organized',
    label: 'Your semester, organized',
    hint: 'Deadlines, class times and grade weights — reviewed before anything is saved',
    ms: 2400,
  },
  {
    // The claim here is narrow and true: a connected Canvas re-checks itself,
    // and a deadline an instructor moves is corrected without the student
    // doing anything. It is NOT a claim that Canvas carries grades — the
    // calendar feed does not, and nothing on this site may imply otherwise.
    key: 'current',
    label: 'Your professor moves a date. Semora already knows.',
    hint: 'Connect Canvas free and your classes stay current on their own',
    ms: 2100,
  },
  {
    key: 'next',
    label: 'So it can tell you what matters next',
    hint: 'Ranked by what is due and what it counts toward',
    ms: 5000,
  },
] as const;

const ROWS = [
  { title: 'Problem Set 7', course: 'Calc II', due: 'Sep 9', tone: 'due' },
  // The one Canvas moves. `dueAfter` is shown from the `current` beat onward.
  { title: 'Midterm Exam', course: 'Calc II', due: 'Oct 14', dueAfter: 'Oct 21', tone: 'exam' },
  { title: 'Lab Report 3', course: 'Biology 101', due: 'Sep 7', tone: 'late' },
  { title: 'Reading: Ch. 5', course: 'History 210', due: 'Sep 9', tone: 'done' },
  { title: 'Essay Outline', course: 'History 210', due: 'Sep 12', tone: 'due' },
] as const;

/**
 * The "Up next" card, as the app actually renders it.
 *
 * Faithful to components/StudySuggestionsCard: the header is "Up next" with an
 * "Open plan" link, the subtitle is `course · due · stake`, and the tier badge
 * is one of Do now / Coming up / Plan ahead.
 *
 * THE STAKE CLAUSE NAMES THE CATEGORY, NEVER THE TASK. lib/taskStake infers a
 * weight by matching a task's KIND against the course's own grade breakdown,
 * and that weight is split across every sibling in the category — so "exams
 * are 30%" is true and "this exam is worth 30%" is false. The app is careful
 * about that distinction in code and in two languages; a marketing mock that
 * quietly upgraded the claim would be the exact overreach the feature was
 * built to avoid.
 *
 * The second row carries no stake on purpose. The real feature declines to
 * guess far more often than it guesses — a task earns a stake only when its
 * course has a matching category — and a mock where every row showed a
 * percentage would promise a hit rate the product does not have.
 *
 * AND THE MIDTERM IS DELIBERATELY NOT THE TOP ITEM, even though it is the row
 * Canvas just moved and would make the tidier story. Every due phrase here has
 * to agree with the dates in ROWS above: the midterm sits in late October and
 * the ranker divides by days remaining, so promoting it over work due this week
 * is precisely the failure lib/taskPriority was written to fix — the old card
 * "was the one recommending finals a hundred days out". A demo that showed the
 * distant exam first would be advertising the bug.
 */
const UP_NEXT = [
  {
    title: 'Problem Set 7',
    sub: 'Calc II · due in 3 days · assignments are 20%',
    badge: 'Do now',
    tone: 'now',
  },
  {
    title: 'Essay Outline',
    sub: 'History 210 · due in 6 days',
    badge: 'Coming up',
    tone: 'soon',
  },
] as const;

const NAV = ['Today', 'Courses', 'Calendar', 'Import syllabus'] as const;
const TOOLS = ['Smart Plan', 'Workload', 'Flashcards'] as const;

export function HeroDemo({ locale = 'en' }: { locale?: SiteLocale }) {
  const [stage, setStage] = useState(0);
  const [paused, setPaused] = useState(false);
  const es = locale === 'es';

  // Memoized because the effect below depends on it. A fresh array literal on
  // every render would re-run the effect on every tick, restarting the timer
  // forever and pinning the demo on its first beat.
  const stages = useMemo(
    () =>
      es
        ? ([
            {
              key: 'scan',
              label: 'Añade el programa de la materia',
              hint: 'Foto, PDF o texto copiado',
              ms: 1900,
            },
            {
              key: 'organized',
              label: 'Tu semestre queda organizado',
              hint: 'Fechas, horarios y ponderaciones: revisas todo antes de guardarlo',
              ms: 2400,
            },
            {
              key: 'current',
              label: 'Tu profe cambia una fecha. Semora ya lo sabe.',
              hint: 'Conecta Canvas gratis y tus materias se mantienen al día solas',
              ms: 2100,
            },
            {
              key: 'next',
              label: 'Y te dice qué es lo siguiente que importa',
              hint: 'Ordenado por lo que vence y por lo que cuenta para tu nota',
              ms: 5000,
            },
          ] as const)
        : STAGES,
    [es],
  );

  const rows = es
    ? ([
        { title: 'Lista de problemas 7', course: 'Cálculo II', due: '9 sep', tone: 'due' },
        {
          title: 'Examen parcial',
          course: 'Cálculo II',
          due: '14 oct',
          dueAfter: '21 oct',
          tone: 'exam',
        },
        { title: 'Informe de laboratorio 3', course: 'Biología 101', due: '7 sep', tone: 'late' },
        { title: 'Lectura: cap. 5', course: 'Historia 210', due: '9 sep', tone: 'done' },
        { title: 'Esquema del ensayo', course: 'Historia 210', due: '12 sep', tone: 'due' },
      ] as const)
    : ROWS;

  // Matches the Spanish the app itself renders: lib/i18n turns "due in 3 days"
  // into "vence en 3 días" and "exams are 30%" into "los exámenes son el 30 %".
  const upNext = es
    ? ([
        {
          title: 'Lista de problemas 7',
          sub: 'Cálculo II · vence en 3 días · las tareas son el 20 %',
          badge: 'Hazlo ya',
          tone: 'now',
        },
        {
          title: 'Esquema del ensayo',
          sub: 'Historia 210 · vence en 6 días',
          badge: 'Pronto',
          tone: 'soon',
        },
      ] as const)
    : UP_NEXT;

  const upNextTitle = es ? 'Lo siguiente' : 'Up next';
  const upNextLink = es ? 'Abrir plan' : 'Open plan';
  const canvasPill = es ? 'Actualizado desde Canvas' : 'Updated from Canvas';
  const nav = es ? ['Hoy', 'Cursos', 'Calendario', 'Añadir programa'] : NAV;
  const tools = es ? ['Plan inteligente', 'Carga académica', 'Tarjetas'] : TOOLS;

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
    // Per-stage durations, so a chained timeout replaces the old fixed
    // interval. Without this the payoff beat would inherit the same 3.2s as
    // "here is a PDF" and arrive too late to do its job.
    let timer: ReturnType<typeof setTimeout>;
    let index = 0;
    const advance = () => {
      timer = setTimeout(() => {
        index = (index + 1) % stages.length;
        setStage(index);
        advance();
      }, stages[index].ms);
    };
    advance();
    return () => clearTimeout(timer);
  }, [stages]);

  const current = stages[stage];
  // From the Canvas beat onward, the moved deadline shows its new date.
  const moved = current.key === 'current' || current.key === 'next';

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

          <div className={styles.main}>
            {/* Beat 1 — the syllabus, being read. */}
            <div className={styles.doc}>
              <div className={styles.docHead}>
                <span className={styles.docTitle}>{es ? 'QUÍM 101 · Programa.pdf' : 'CHEM 101 Syllabus.pdf'}</span>
              </div>
              <div className={styles.scanline} />
              {[92, 76, 88, 61, 83, 70, 90, 58].map((w, i) => (
                <span key={i} className={styles.docLine} style={{ width: `${w}%` }} />
              ))}
            </div>

            {/* Beats 2–4 — the deadlines it found. */}
            <div className={styles.list}>
              {rows.map((row, i) => {
                const updated = moved && 'dueAfter' in row;
                return (
                  <div
                    key={row.title}
                    className={styles.row}
                    data-tone={row.tone}
                    data-updated={updated || undefined}
                    style={{ '--i': i } as React.CSSProperties}
                  >
                    <span className={styles.check} />
                    <div className={styles.rowText}>
                      <span className={styles.rowTitle}>{row.title}</span>
                      <span className={styles.rowCourse}>
                        {row.course}
                        {updated && <span className={styles.rowPill}>{canvasPill}</span>}
                      </span>
                    </div>
                    <span className={styles.rowDue}>
                      {updated && 'dueAfter' in row ? row.dueAfter : row.due}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Beat 2 — the week that adds up. */}
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

            {/* Beat 4 — the payoff. Takes the week chart's place rather than
                stacking under it, so the panel height never changes. */}
            <div className={styles.upnext}>
              <div className={styles.upnextHead}>
                <span className={styles.upnextTitle}>{upNextTitle}</span>
                <span className={styles.upnextLink}>{upNextLink} ›</span>
              </div>
              {upNext.map((item, i) => (
                <div
                  key={item.title}
                  className={styles.upnextRow}
                  data-tone={item.tone}
                  style={{ '--i': i } as React.CSSProperties}
                >
                  <span className={styles.upnextDot} />
                  <div className={styles.upnextText}>
                    <span className={styles.upnextRowTitle}>{item.title}</span>
                    <span className={styles.upnextSub}>{item.sub}</span>
                  </div>
                  <span className={styles.upnextBadge}>{item.badge}</span>
                </div>
              ))}
            </div>
          </div>
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
