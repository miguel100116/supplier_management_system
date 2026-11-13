import type { buildArchivedReport } from '../domain/archivedReports';
import { ArchivedLeaderboard } from './ArchivedLeaderboard';

/** Semantic text alternative for the rendered paper preview. */
export function ArchivedRecordPreview({ report }: { report: ReturnType<typeof buildArchivedReport> }) {
  return <div aria-label="Archived report text">
    <h3>{report.title}</h3><p>{report.itemLabel}</p>
    <ArchivedLeaderboard analytics={report.analytics} />
    {report.tables.filter(table => table.rows.length && table.title !== 'Company leaderboard').map((table, index) => {
      const label = index === 0 ? 'Report scope' : table.title;
      return <section key={table.title} aria-label={label}>
        <h4>{label}</h4><table aria-label={label}><thead><tr>{table.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{table.rows.slice(0, 50).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>
        {table.rows.length > 50 ? <p>First 50 of {table.rows.length} rows shown. Downloads include all rows.</p> : null}
      </section>;
    })}
  </div>;
}
