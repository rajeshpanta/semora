import styles from './ContinuityPanel.module.css';
import type { SiteLocale } from '@/lib/i18n';

/**
 * The download page's product visual: one semester, on two screens.
 *
 * Illustrative UI built from real product behaviour — the same standing rule
 * FeaturePanel and HeroDemo follow. No ratings, no user counts, no claim the
 * product does not make elsewhere on the site. The deadlines shown are the
 * same CHEM 101 items the syllabus-scanner panel uses, so a visitor moving
 * between those two pages sees one consistent example rather than two
 * unrelated fictions.
 */
const COPY = {
  en: {
    window: 'CHEM 101 — This week',
    phone: 'Today',
    sync: 'Same account, both screens',
    rows: [
      { title: 'Problem Set 5', sub: 'Homework · 5%', date: 'Oct 27' },
      { title: 'Midterm Exam', sub: 'Exam · 25%', date: 'Oct 14', exam: true },
      { title: 'Lab Report 3', sub: 'Lab · 10%', date: 'Nov 3' },
    ],
  },
  es: {
    window: 'QUÍM 101 — Esta semana',
    phone: 'Hoy',
    sync: 'La misma cuenta, en ambas pantallas',
    rows: [
      { title: 'Serie de problemas 5', sub: 'Tarea · 5%', date: '27 oct' },
      { title: 'Examen parcial', sub: 'Examen · 25%', date: '14 oct', exam: true },
      { title: 'Informe de lab 3', sub: 'Laboratorio · 10%', date: '3 nov' },
    ],
  },
} as const;

export function ContinuityPanel({ locale = 'en' }: { locale?: SiteLocale }) {
  const t = COPY[locale];

  return (
    // Decorative: everything it says is said in the copy beside it, so a
    // screen reader announcing "Problem Set 5, Oct 27" would be reading out
    // an example as though it were the visitor's own work.
    <div className={styles.wrap} aria-hidden="true">
      <div className={styles.window}>
        <div className={styles.chrome}>
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.title}>{t.window}</span>
        </div>
        <div className={styles.body}>
          <div className={styles.rows}>
            {t.rows.map((row) => (
              <div key={row.title} className={styles.row}>
                <span className={styles.check} />
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{row.title}</span>
                  <span className={styles.rowSub}>{row.sub}</span>
                </span>
                <span className={`${styles.rowDate} ${'exam' in row && row.exam ? styles.rowDateExam : ''}`}>
                  {row.date}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* The same two deadlines, smaller. Repetition is the argument. */}
      <div className={styles.phone}>
        <div className={styles.phoneScreen}>
          <div className={styles.phoneTop}>
            <span className={styles.phoneLabel}>{t.phone}</span>
          </div>
          <div className={styles.phoneRows}>
            {t.rows.slice(0, 2).map((row) => (
              <div key={row.title} className={styles.phoneRow}>
                <span className={styles.phoneTitle}>{row.title}</span>
                <span className={styles.phoneDate}>{row.date}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <span className={styles.syncTag}>
        <span className={styles.syncDot} />
        {t.sync}
      </span>
    </div>
  );
}
