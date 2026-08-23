import styles from './DownloadHero.module.css';
import { DEVICES } from '@/lib/devices';
import { ContinuityPanel } from './ContinuityPanel';
import { APP_STORE_URL, APP_URL } from '@/lib/semora-facts';
import type { SiteLocale } from '@/lib/i18n';

/**
 * The top of the download page, in the site's own voice.
 *
 * The page used to render through LongFormPage — the blog shell: breadcrumb
 * first, sticky contents rail, prose at article measure, device grid demoted
 * to a "widget" inside the essay. Right shape for something you read, wrong
 * one for something you act on.
 *
 * The heading is split so the second clause can take the italic purple the
 * home hero uses. Written as two fields rather than parsed out of the content
 * string, because splitting prose on a full stop breaks the moment someone
 * writes a heading with two of them.
 */
const COPY = {
  en: {
    lead: 'One account.',
    accent: 'Every device you study on.',
    appStore: 'Download on the App Store',
    web: 'Open in your browser',
    ready: (n: number) => `${n} surfaces ready today`,
    free: 'Your first AI action is free',
  },
  es: {
    lead: 'Una cuenta.',
    accent: 'Todos tus dispositivos.',
    appStore: 'Descargar en la App Store',
    web: 'Abrir en el navegador',
    ready: (n: number) => `${n} plataformas ya disponibles`,
    free: 'Tu primera acción con IA es gratis',
  },
} as const;

export function DownloadHero({ lede, locale = 'en' }: { lede: string; locale?: SiteLocale }) {
  const t = COPY[locale];
  // Counted from DEVICES rather than written down, so shipping a surface is
  // one status change and this line cannot drift from the grid beneath it.
  const ready = DEVICES.filter((d) => d.status !== 'soon').length;

  return (
    <section className={styles.hero}>
      <div className={styles.inner}>
        <div className={styles.copy}>

        <h1 className={styles.h1}>
          {t.lead} <span className={styles.accent}>{t.accent}</span>
        </h1>

        <p className={styles.lede}>{lede}</p>

        <div className={styles.actions}>
          <a className={styles.primaryBtn} href={APP_STORE_URL}>{t.appStore}</a>
          <a className={styles.secondaryBtn} href={APP_URL}>{t.web}</a>
        </div>

        <ul className={styles.notes}>
          <li>{t.ready(ready)}</li>
          <li>{t.free}</li>
        </ul>
        </div>

        <ContinuityPanel locale={locale} />
      </div>
    </section>
  );
}
