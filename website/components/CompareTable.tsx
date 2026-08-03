import styles from './CompareTable.module.css';

export interface CompareRow {
  feature: string;
  semora: string;
  competitor: string;
}

export function CompareTable({
  competitorName,
  rows,
  caption,
}: {
  competitorName: string;
  rows: CompareRow[];
  caption?: string;
}) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col"></th>
            <th scope="col">Semora</th>
            <th scope="col">{competitorName}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.feature}>
              <th scope="row">{row.feature}</th>
              <td className={styles.semora}>{row.semora}</td>
              <td>{row.competitor}</td>
            </tr>
          ))}
        </tbody>
        {caption && <caption>{caption}</caption>}
      </table>
    </div>
  );
}
