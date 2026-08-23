import { DEVICES, DEVICE_COPY_EN, DEVICE_COPY_ES, type DeviceCard } from '@/lib/devices';
import { qrSvg } from '@/lib/qr';
import { CopyLinkButton } from './CopyLinkButton';
import { WidgetPreview } from './WidgetPreview';
import { SoonPreview } from './SoonPreview';
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
    soonHead: 'En camino',
    soonNote: 'Tu misma cuenta los cubre en cuanto estén listos, sin pagar nada más.',
  },
} as const;

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

      {/* Nothing to link to, so it shows itself instead — see WidgetPreview. */}
      {device.preview === 'widget' && <WidgetPreview locale={locale} />}

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

  // Every ready surface is a full card now. iPad and the widget used to be
  // half-height "Included" tiles, which made them look like footnotes to the
  // iPhone rather than places the product runs — and left the widget as the
  // one card with a blank space where its neighbours have a code.
  const ready = DEVICES.filter((d) => d.status !== 'soon');
  const soon = DEVICES.filter((d) => d.status === 'soon');

  return (
    <div className={styles.wrap}>
      <div className={styles.bento}>
        {ready.map((device) => (
          <PrimaryCard
            key={device.id}
            device={device}
            locale={locale}
            featured={device.id === 'iphone'}
          />
        ))}
      </div>

      {soon.length > 0 && (
        <section className={styles.soonBlock}>
          <div className={styles.soonHeadRow}>
            <h3 className={styles.soonHead}>{t.soonHead}</h3>
            <p className={styles.soonNote}>{t.soonNote}</p>
          </div>
          {/* Cards with artwork rather than a text strip. A list of names
              reads as a wish; showing the screen reads as work in progress —
              which is what it is. */}
          <ul className={styles.soonList}>
            {soon.map((d) => (
              <li key={d.id} className={styles.soonItem}>
                {/* Badge over the artwork, not beside the name. On the same
                    line it squeezed "Apple Watch" and "Wear OS" into two words
                    each at common card widths. */}
                <div className={styles.soonStage}>
                  <SoonPreview id={d.id} locale={locale} />
                  <span className={styles.chipSoon}>{t.soon}</span>
                </div>
                <div className={styles.soonHeadLine}>
                  <span className={styles.soonIcon} aria-hidden="true">{ICONS[d.id]}</span>
                  <span className={styles.soonName}>{copyFor[d.id].name}</span>
                </div>
                <span className={styles.soonBody}>{copyFor[d.id].body}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
