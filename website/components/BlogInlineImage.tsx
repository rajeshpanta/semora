import Image from 'next/image';
import styles from './BlogInlineImage.module.css';

export function BlogInlineImage({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption?: string;
}) {
  return (
    <div className={styles.wrap}>
      <Image src={src} alt={alt} width={220} height={476} />
      {caption && <p className={styles.caption}>{caption}</p>}
    </div>
  );
}
