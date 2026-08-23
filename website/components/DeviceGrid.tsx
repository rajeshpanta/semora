import { DEVICES, DEVICE_COPY_EN, DEVICE_COPY_ES, type DeviceCard } from '@/lib/devices';
import { qrSvg } from '@/lib/qr';
import { CopyLinkButton } from './CopyLinkButton';
import { AppleIcon, AndroidIcon, BrowserIcon, TabletIcon, WatchIcon, LaptopIcon, WidgetIcon } from './DeviceIcons';
import styles from './DeviceGrid.module.css';
import type { SiteLocale } from '@/lib/i18n';
import type { ReactNode } from 'react';

/**
 * How you actually get Semora.
 *
 * The first version was eight identical cards in one auto-fit grid. Two things
 * were wrong with that, and looking at how Linear and Notion do it named both.
 *
 * Neither uses a flat grid. Linear groups into Desktop / Mobile / Web with a
 * heading per group; Notion gives each product its own section with a
 * headline, a description and an image. A uniform grid says every entry is
 * equally important, and here they are not: iPhone is the product, the widget
 * arrives with it, and Wear OS is a plan.
 *
 * And an equal-sized card for something you cannot download leaves a hole
 * where the button should be. iPad and the widget had exactly that hole —
 * they are not separate downloads, they come with the iPhone app, so they
 * belong INSIDE it as lines rather than beside it as peers. Linear never
 * gives an unavailable platform a card at all; the in-development row here
 * stays because "one account covers it the day it lands" is the promise this
 * page is making, but it is a strip, not four more cards.
 */
const ICONS: Record<string, ReactNode> = {
  iphone: <AppleIcon />,
  ipad: <TabletIcon />,
  web: <BrowserIcon />,
  widget: <WidgetIcon />,
  android: <AndroidIcon />,
  watch: <WatchIcon />,
  wearos: <WatchIcon />,
  mac: <LaptopIcon />,
};

const COPY = {
  en: {
    ready: 'Ready now',
    soon: 'In development',
    scan: 'Scan to open on your phone',
    copied: 'Link copied',
    copy: 'Copy link',
    included: 'Included',
    alsoHead: 'Comes with it',
    soonHead: 'On the way',
    soonNote: 'One account covers each of these the day it lands — nothing extra to buy.',
  },
  es: {
    ready: 'Ya disponible',
    soon: 'En desarrollo',
    scan: 'Escanea para abrirlo en tu teléfono',
    copied: 'Enlace copiado',
    copy: 'Copiar enlace',
    included: 'Incluido',
    alsoHead: 'Viene incluido',
    soonHead: 'En camino',
    soonNote: 'Tu misma cuenta cubrirá cada uno el día que llegue, sin pagar nada más.',
  },
} as const;

/** Arrives with the iPhone download rather than separately. Half-height, no
 *  button — the hole where a button would go is what made these look broken
 *  as full-size cards, and a tile that says "you already have this" does not
 *  need one. Still shown rather than folded away: the range is the argument
 *  this page is making. */
function IncludedCard({ device, locale }: { device: DeviceCard; locale: SiteLocale }) {
  const copy = (locale === 'es' ? DEVICE_COPY_ES : DEVICE_COPY_EN)[device.id];
  const t = COPY[locale];
  return (
    <section className={`${styles.card} ${styles.cardIncluded}`}>
      <div className={styles.cardHead}>
        <span className={styles.icon} aria-hidden="true">{ICONS[device.id]}</span>
        <span className={styles.chipIncluded}>{t.included}</span>
      </div>
      <h3 className={styles.name}>{copy.name}</h3>
      <p className={styles.body}>{copy.body}</p>
      <p className={styles.includedNote}>{copy.action}</p>
    </section>
  );
}

/** A platform you can actually get right now. */
async function PrimaryCard({
  device,
  locale,
  featured,
}: {
  device: DeviceCard;
  locale: SiteLocale;
  featured?: boolean;
}) {
  const copyFor = locale === 'es' ? DEVICE_COPY_ES : DEVICE_COPY_EN;
  const copy = copyFor[device.id];
  const t = COPY[locale];
  const qr = device.qr ? await qrSvg(device.qr) : null;

  return (
    <section className={`${styles.card} ${featured ? styles.cardFeatured : ''}`}>
      <div className={styles.cardHead}>
        <span className={styles.icon} aria-hidden="true">{ICONS[device.id]}</span>
        <span className={styles.chipReady}>{t.ready}</span>
      </div>

      <h3 className={styles.name}>{copy.name}</h3>
      <p className={styles.body}>{copy.body}</p>

      {device.href && (
        <a className={styles.action} href={device.href}>{copy.action}</a>
      )}

      {qr && device.href && (
        <div className={styles.qrRow}>
          {/* Built at request time from a URL we control — no user input goes
              anywhere near this string. */}
          <div className={styles.qr} aria-hidden="true" dangerouslySetInnerHTML={{ __html: qr }} />
          <span className={styles.qrLabel}>{t.scan}</span>
          <CopyLinkButton url={device.href} label={t.copy} copiedLabel={t.copied} />
        </div>
      )}

    </section>
  );
}

export async function DeviceGrid({ locale = 'en' }: { locale?: SiteLocale }) {
  const copyFor = locale === 'es' ? DEVICE_COPY_ES : DEVICE_COPY_EN;
  const t = COPY[locale];
  const byId = (id: string) => DEVICES.find((d) => d.id === id)!;

  const iphone = byId('iphone');
  const web = byId('web');
  // Included with the iPhone download rather than obtained separately.
  const bundled = DEVICES.filter((d) => d.included);
  const soon = DEVICES.filter((d) => d.status === 'soon');

  return (
    <div className={styles.wrap}>
      <div className={styles.bento}>
        <PrimaryCard device={iphone} locale={locale} featured />
        <PrimaryCard device={web} locale={locale} />
        {bundled.map((d) => (
          <IncludedCard key={d.id} device={d} locale={locale} />
        ))}
      </div>

      {soon.length > 0 && (
        <section className={styles.soonBlock}>
          <div className={styles.soonHeadRow}>
            <h3 className={styles.soonHead}>{t.soonHead}</h3>
            <p className={styles.soonNote}>{t.soonNote}</p>
          </div>
          <ul className={styles.soonList}>
            {soon.map((d) => (
              <li key={d.id} className={styles.soonItem}>
                <span className={styles.soonIcon} aria-hidden="true">{ICONS[d.id]}</span>
                <span className={styles.soonName}>{copyFor[d.id].name}</span>
                <span className={styles.soonBody}>{copyFor[d.id].body}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
