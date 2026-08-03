import styles from './CompareTable.module.css';

export interface CompareRow {
  feature: string;
  semora: string;
  competitor: string;
}

/**
 * Three-column feature comparison.
 *
 * On phones a three-column table cannot be read — it either overflows the
 * viewport or crushes every column to a few characters. Below 720px the CSS
 * re-lays this same markup as one stacked card per row, using `data-label`
 * to reinstate the column heading that `thead` no longer supplies. The table
 * semantics (scope="col"/"row", caption) are untouched, so assistive tech and
 * search engines still see a real table at every width.
 */
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
              <td className={styles.semora} data-label="Semora">
                {row.semora}
              </td>
              <td data-label={competitorName}>{row.competitor}</td>
            </tr>
          ))}
        </tbody>
        {caption && <caption>{caption}</caption>}
      </table>
    </div>
  );
}
