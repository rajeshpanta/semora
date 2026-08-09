import Image from 'next/image';
import styles from './BlogPostHero.module.css';
import type { SiteLocale } from '@/lib/i18n';

export function BlogPostHero({
  title,
  date,
  image,
  imageAlt,
  locale = 'en',
}: {
  title: string;
  date: string;
  image?: string;
  imageAlt?: string;
  /** The eyebrow was a hardcoded English string. That was invisible while only
   *  the English posts used this component; wiring it into the Spanish posts
   *  put "Semora Blog" at the top of every one of them. */
  locale?: SiteLocale;
}) {
  return (
    <div className={styles.band}>
      <div className={styles.text}>
        <span className={styles.eyebrow}>{locale === 'es' ? 'El blog de Semora' : 'Semora Blog'}</span>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.date}>{date}</p>
      </div>
      {image && (
        <div className={styles.imageWrap}>
          <Image src={image} alt={imageAlt ?? ''} width={168} height={168} />
        </div>
      )}
    </div>
  );
}
