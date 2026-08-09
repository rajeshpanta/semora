import styles from './BlogTable.module.css';

export interface BlogTableProps {
  /** Column headings, left to right. The first labels the row-header column. */
  columns: string[];
  /** One array per row, same length and order as `columns`. */
  rows: string[][];
  /** Rendered as <caption>. Use it to date the figures and name the source. */
  caption?: string;
  /**
   * Index of the column to tint as ours, if any. Kept explicit rather than
   * matching on the string "Semora" so a table can compare two competitors
   * with no highlight at all.
   */
  highlightColumn?: number;
}

/**
 * A comparison table for blog posts.
 *
 * CompareTable.tsx is fixed at three columns (feature / Semora / one rival),
 * which is right for the /compare pages and wrong for a post weighing five
 * apps at once. This takes arbitrary columns.
 *
 * Real <table> markup with scope="col"/"row" and a caption, because the point
 * of these tables is to be extracted: a language model reading the page gets
 * an unambiguous row-to-column mapping, and so does a screen reader. Below
 * 720px the same markup re-lays as one card per row via data-label, so nothing
 * is lost on a phone and nothing scrolls sideways.
 */
export function BlogTable({ columns, rows, caption, highlightColumn }: BlogTableProps) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              <th scope="row">{row[0]}</th>
              {row.slice(1).map((cell, i) => (
                <td
                  key={columns[i + 1]}
                  data-label={columns[i + 1]}
                  className={highlightColumn === i + 1 ? styles.highlight : undefined}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
