import styles from './SoonPreview.module.css';
import type { SiteLocale } from '@/lib/i18n';

/**
 * What an in-development surface will look like.
 *
 * Built UI rather than a photograph or a generated render — the standing rule
 * across this site (FeaturePanel, HeroDemo, ContinuityPanel, WidgetPreview).
 * It shows the real layout with the same CHEM 101 deadlines used everywhere
 * else, so a visitor sees one consistent product rather than four invented
 * ones, and nothing here claims a screen exists that does not.
 *
 * Muted on purpose. These are not things you can have yet, and at full colour
 * they would compete with the four surfaces that ship today.
 */
const COPY = {
  en: { label: 'Next up', title: 'Midterm Exam', date: 'Oct 14', rows: ['Problem Set 5', 'Midterm Exam'], subs: ['Oct 27', 'Oct 14'] },
  es: { label: 'Lo siguiente', title: 'Examen parcial', date: '14 oct', rows: ['Tarea 5', 'Examen parcial'], subs: ['27 oct', '14 oct'] },
} as const;

export function SoonPreview({ id, locale = 'en' }: { id: string; locale?: SiteLocale }) {
  const t = COPY[locale];

  const phone = (
    <div className={styles.phone}>
      <div className={styles.phoneScreen}>
        <div className={styles.phoneBar} />
        {t.rows.map((row, i) => (
          <div key={row} className={styles.miniRow}>
            <span className={styles.miniTitle}>{row}</span>
            <span className={styles.miniSub}>{t.subs[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const face = (
    <div className={styles.watchFace}>
      <span className={styles.watchLabel}>{t.label}</span>
      <span className={styles.watchTitle}>{t.title}</span>
      <span className={styles.watchDate}>{t.date}</span>
    </div>
  );

  const art =
    id === 'android' ? phone
    : id === 'watch' ? <div className={styles.watch}>{face}</div>
    : id === 'wearos' ? <div className={styles.watchRound}>{face}</div>
    : (
      <div className={styles.mac}>
        <div className={styles.macBar}>
          <span className={styles.macDot} />
          <span className={styles.macDot} />
          <span className={styles.macDot} />
        </div>
        <div className={styles.macBody}>
          <div className={styles.macSide}>
            <span className={`${styles.macNav} ${styles.macNavActive}`} />
            <span className={styles.macNav} />
            <span className={styles.macNav} />
            <span className={styles.macNav} />
          </div>
          <div className={styles.macMain}>
            {t.rows.map((row, i) => (
              <div key={row} className={styles.miniRow}>
                <span className={styles.miniTitle}>{row}</span>
                <span className={styles.miniSub}>{t.subs[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );

  // Decorative: the card's own heading and copy say what this is, so a screen
  // reader should not read example deadlines as the visitor's own work.
  return <div className={`${styles.stage} ${styles.pending}`} aria-hidden="true">{art}</div>;
}
