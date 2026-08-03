import Image from 'next/image';
import styles from './BlogPostHero.module.css';

export function BlogPostHero({
  title,
  date,
  image,
  imageAlt,
}: {
  title: string;
  date: string;
  image?: string;
  imageAlt?: string;
}) {
  return (
    <div className={styles.band}>
      <div className={styles.text}>
        <span className={styles.eyebrow}>Semora Blog</span>
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
