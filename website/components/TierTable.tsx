import styles from './TierTable.module.css';

export interface TierRow {
  feature: string;
  free: string;
  pro: string;
  proOnly?: boolean;
}

export function TierTable({
  rows,
  caption,
  proLabel = 'Pro',
}: {
  rows: TierRow[];
  caption?: string;
  proLabel?: string;
}) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            <th scope="col">Feature</th>
            <th scope="col">Free</th>
            <th scope="col">{proLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.feature} className={row.proOnly ? styles.proRow : undefined}>
              <th scope="row">{row.feature}</th>
              <td>{row.free}</td>
              <td>{row.pro}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
