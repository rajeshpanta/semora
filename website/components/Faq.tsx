import styles from './Faq.module.css';

export interface FaqItem {
  question: string;
  answer: string;
}

export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className={styles.faq}>
      {items.map((item) => (
        <details key={item.question} className={styles.item}>
          <summary className={styles.question}>{item.question}</summary>
          <p className={styles.answer}>{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
