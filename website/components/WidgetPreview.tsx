import styles from './WidgetPreview.module.css';
import type { SiteLocale } from '@/lib/i18n';

/**
 * What the Home Screen widget actually looks like.
 *
 * Sits where the other ready cards put their scan panel, so the row reads as
 * four finished cards rather than three plus a gap. Same deadlines as the
 * hero's continuity panel and the syllabus-scanner feature panel — one
 * consistent example across the site instead of three unrelated fictions.
 */
const COPY = {
  en: {
    day: 'Tue',
    count: '3 due',
    label: 'On your Home Screen',
    note: 'Added from the widget gallery after you install the app. Nothing to download separately.',
    rows: [
      { title: 'Problem Set 5', sub: 'CHEM 101 · today' },
      { title: 'Midterm Exam', sub: 'CHEM 101 · Oct 14', exam: true },
    ],
  },
  es: {
    day: 'Mar',
    count: '3 pendientes',
    label: 'En tu pantalla de inicio',
    note: 'Se añade desde la galería de widgets al instalar la app. No hay nada que descargar aparte.',
    rows: [
      { title: 'Tarea 5', sub: 'QUÍM 101 · hoy' },
      { title: 'Examen parcial', sub: 'QUÍM 101 · 14 oct', exam: true },
    ],
  },
} as const;

export function WidgetPreview({ locale = 'en' }: { locale?: SiteLocale }) {
  const t = COPY[locale];
  return (
    <div className={styles.wrap}>
      {/* Decorative: the label beside it says everything this conveys, so a
          screen reader should not read out example deadlines as though they
          were the visitor's own. */}
      <div className={styles.stage} aria-hidden="true">
        <div className={styles.widget}>
          <div className={styles.widgetHead}>
            <span className={styles.widgetDay}>{t.day}</span>
            <span className={styles.widgetCount}>{t.count}</span>
          </div>
          <div className={styles.widgetRows}>
            {t.rows.map((row) => (
              <div key={row.title} className={styles.widgetRow}>
                <span className={`${styles.widgetDot} ${'exam' in row && row.exam ? styles.widgetDotExam : ''}`} />
                <span className={styles.widgetText}>
                  <span className={styles.widgetTitle}>{row.title}</span>
                  <span className={styles.widgetSub}>{row.sub}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.copy}>
        <p className={styles.label}>{t.label}</p>
        <p className={styles.note}>{t.note}</p>
      </div>
    </div>
  );
}
