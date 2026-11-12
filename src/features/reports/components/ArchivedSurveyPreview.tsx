import type { CSSProperties, ReactNode } from 'react';
import type { SurveyType } from '../../../types/survey';
import { formatNumber } from '../../analytics/domain/analytics';
import { analyticsBands, formatAnalyticsRatingRange, formatAnalyticsScore, getAnalyticsBand, getAnalyticsScore } from '../../analytics/domain/rankings';
import { ARCHIVED_SURVEY_STYLE as S, archivedRatingColor, archivedReportDate, archivedScoreFill, buildArchivedSurveyDetails } from '../domain/archivedReportLayout';
import type { buildArchivedReport } from '../domain/archivedReports';
import { paperSizePoints, type PaperSize } from '../domain/paperSize';
import type { ExportTable } from '../services/exporters';

const heading: CSSProperties = { color: S.blue, fontSize: 20, fontWeight: 700, lineHeight: 1.2, margin: '0 0 8px' };
const sectionHeading: CSSProperties = { color: '#111111', fontSize: 13, fontWeight: 700, margin: '0 0 2px' };
const cell: CSSProperties = { padding: '5px 6px 3px', borderBottom: `1px solid ${S.rule}`, color: S.ink, verticalAlign: 'top', overflowWrap: 'anywhere', lineHeight: '10px' };

/** Print-like page composition, with readable single-column ranking on narrow screens. */
export function ArchivedSurveyPreview({ report, category, paperSize }: { report: ReturnType<typeof buildArchivedReport>; category: SurveyType; paperSize: PaperSize }) {
  const summary = report.analytics.find(item => item.category === category)?.summary;
  const companies = summary?.companies.slice(0, 20) ?? [];
  const split = Math.ceil(companies.length / 2);
  const details = buildArchivedSurveyDetails(report.itemLabel, report.tables);
  const questions = { ...report.layout.questionTable, columns: ['#', 'Question', 'Score (%)'], rows: report.layout.questionTable.rows.map(row => row.slice(0, 3)) };
  const pages = (companies.length ? 1 : 0) + 1 + (questions.rows.length || report.layout.categoryTable.rows.length ? 1 : 0) + (report.tables.some(table => table.title === 'Respondent comments' && table.rows.length) ? 1 : 0);
  const summaryPage = companies.length ? 2 : 1;
  const generated = archivedReportDate(new Date().toISOString(), true);
  const Page = ({ children, number }: { children: ReactNode; number: number }) => {
    return <article aria-label={`Report page ${number}`} className="flex min-w-0 flex-col bg-white shadow-lg" style={{ padding: '28px 7.06% 22px', minHeight: `calc(100cqw * ${paperSizePoints(paperSize)[1] / paperSizePoints(paperSize)[0]})`, color: S.ink }}>
      <header className="flex items-start justify-between gap-3" style={{ borderBottom: `1px solid ${S.blue}`, paddingBottom: 5 }}>
        <img src="/microgenesis_logo.png" alt="Microgenesis" style={{ width: '20%', maxWidth: 104.4, height: 'auto' }} />
        <div style={{ textAlign: 'right', color: '#1f2933', fontSize: 9, lineHeight: '11px' }}><strong>{report.title}</strong><p style={{ fontSize: 8, color: S.muted }}>Supplier Management System</p></div>
      </header>
      <div className="min-w-0 flex-1" style={{ padding: '28px 6px 30px' }}>{children}</div>
      <footer className="flex flex-wrap justify-between gap-2" style={{ borderTop: `1px solid ${S.rule}`, paddingTop: 7, color: S.muted, fontSize: 8 }}><span>Microgenesis | Supplier Management System | Confidential</span><span>Page {number} of {pages}</span></footer>
    </article>;
  };
  const Table = ({ table, scoreColumn, centered = false }: { table: ExportTable; scoreColumn?: number; centered?: boolean }) => <section aria-label={table.title} className="min-w-0">
    <table aria-label={table.title} style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: centered ? 'min(100%, 266.4px)' : '100%', margin: centered ? '0 auto' : 0, fontSize: 8 }}>
      {table.title === 'Question results' ? <colgroup><col style={{ width: 25.2 }} /><col /><col style={{ width: 58 }} /></colgroup> : <colgroup><col style={{ width: table.title === 'Report details' ? '27%' : '60%' }} /><col /></colgroup>}
      <thead><tr>{table.columns.map(column => <th key={column} scope="col" style={{ ...cell, background: S.blue, color: '#ffffff', fontWeight: 700, textAlign: column.includes('Score') || column.includes('score') ? 'center' : 'left' }}>{column}</th>)}</tr></thead>
      <tbody>{table.rows.map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column} style={{ ...cell, whiteSpace: column === 0 && table.title === 'Question results' ? 'nowrap' : undefined, textAlign: column === scoreColumn ? 'center' : 'left', background: column === scoreColumn ? archivedScoreFill(Number(value)) : '#ffffff' }}>{value}</td>)}</tr>)}</tbody>
    </table>
  </section>;
  return <div aria-label="Archived report text" className="mx-auto w-full max-w-[640px] space-y-4" style={{ containerType: 'inline-size', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 8 }}>
    {companies.length ? <Page number={1}>
      <h3 style={heading}>{report.title}</h3>
      <p style={{ color: S.muted, marginBottom: 17 }}>Generated {generated} (PHT) | Confidential: for internal distribution only</p>
      <section aria-label={`${category} Company Leaderboard`}>
        <h4 style={{ ...heading, fontSize: 15 }}>{category} Leaderboard</h4>
        <p style={{ color: S.muted, marginBottom: 12 }}>Top 20, ranked by score. Forms = number of submissions.</p>
        <div className="flex flex-wrap justify-around gap-2" style={{ marginBottom: 14 }}>{analyticsBands[category].map((band, index) => <span key={band.label} style={{ color: archivedRatingColor(category, band.min * (category === 'Subcontractor' ? 50 : 1)) }}>{band.label} {formatAnalyticsRatingRange(category, index)}</span>)}</div>
        <div className="grid min-w-0 grid-cols-1 gap-x-3 sm:grid-cols-2">{[companies.slice(0, split), companies.slice(split)].map((column, columnIndex) => <div key={columnIndex} className="min-w-0">
          <div className="grid grid-cols-[25px_minmax(0,1fr)_38px_28px]" style={{ borderBottom: `1px solid ${S.rule}`, color: S.muted, fontSize: 7, paddingBottom: 4 }}><span>RANK</span><span>COMPANY</span><span className="text-center">SCORE</span><span className="text-center">FORMS</span></div>
          <ol start={columnIndex * split + 1}>{column.map((company, index) => {
            const rank = columnIndex * split + index + 1;
            const color = archivedRatingColor(category, company.rankScore);
            return <li key={company.companyId ?? company.name} aria-label={`Rank ${rank}: ${company.name}, ${formatAnalyticsScore(category, company.rankScore)}, ${company.count} forms`} className="grid min-w-0 grid-cols-[25px_minmax(0,1fr)_38px_28px]" style={{ minHeight: 38, borderBottom: `1px solid ${S.rule}` }}>
              <span className="flex items-center justify-center" style={{ background: S.rank, color: '#111111', fontSize: 9, fontWeight: 700 }}>{rank}</span>
              <span style={{ padding: '9px 5px', overflowWrap: 'anywhere', lineHeight: '10px' }}><strong>{company.name}</strong><span style={{ display: 'block', fontSize: 7, color }}>{category} · {getAnalyticsBand(category, company.rankScore).label}</span></span>
              <strong className="flex items-center justify-center" style={{ color, fontSize: 10 }}>{formatNumber(getAnalyticsScore(category, company.rankScore))}</strong><span className="flex items-center justify-center">{company.count}</span>
            </li>;
          })}</ol>
        </div>)}</div>
      </section>
    </Page> : null}
    <Page number={summaryPage}>
      <section aria-label="Report summary"><h3 style={heading}>Report summary</h3><p style={{ color: S.muted, marginBottom: 12, overflowWrap: 'anywhere' }}>{report.itemLabel} | Category: {category} | Generated {generated} (PHT)</p>
        <dl className="grid grid-cols-2 sm:grid-cols-4" style={{ marginBottom: 25 }}>{report.layout.metrics.map(metric => <div key={metric.label} style={{ minWidth: 0, border: `1px solid ${S.rule}`, textAlign: 'center' }}><dd style={{ color: S.blue, fontSize: metric.value === 'No Score Yet' ? 11 : 18, fontWeight: 700, padding: '8px 2px 1px', borderBottom: `1px solid ${S.rule}` }}>{metric.value}</dd><dt style={{ color: S.muted, fontSize: 8, padding: '2px 3px 5px' }}>{metric.label}</dt></div>)}</dl>
      </section>
      <h4 style={sectionHeading}>Report details</h4><Table table={details} />
      {report.layout.findings.length ? <section aria-label="Key findings" style={{ marginTop: 25 }}><h4 style={sectionHeading}>Key findings</h4><ul style={{ paddingLeft: 7, listStyle: 'disc', fontSize: 9, lineHeight: '15px' }}>{report.layout.findings.map(finding => { const colon = finding.indexOf(':'); return <li key={finding}><strong>{finding.slice(0, colon + 1)}</strong>{finding.slice(colon + 1)}</li>; })}</ul><p style={{ color: S.muted, marginTop: 9 }}>Score colors: green 90+, yellow 80-89, orange 70-79, red below 70. Rating labels follow the current category rubric.</p></section> : null}
    </Page>
    {questions.rows.length || report.layout.categoryTable.rows.length ? <Page number={summaryPage + 1}>
      {questions.rows.length ? <><h3 style={heading}>Question results</h3><p style={{ color: S.muted, marginBottom: 5 }}>All {questions.rows.length} scored questions in one list, highest to lowest. Averages use numeric ratings.</p><Table table={questions} scoreColumn={2} /><p style={{ color: S.muted, margin: '10px 0 25px' }}>Question scores use the current rubric. Blank and N/A answers do not contribute to score averages.</p></> : null}
      <h4 style={sectionHeading}>Category averages</h4><Table table={report.layout.categoryTable} scoreColumn={1} centered />
    </Page> : null}
    {report.tables.filter(table => table.title === 'Respondent comments' && table.rows.length).map(table => <Page key={table.title} number={pages}><h3 style={heading}>Respondent comments</h3><div style={{ overflowWrap: 'anywhere' }}>{table.rows.slice(0, 50).map((row, index) => <p key={index} style={{ marginBottom: 10 }}><strong>{row[0]} — {row[1]}: </strong>{row[2]}</p>)}</div>{table.rows.length > 50 ? <p style={{ color: S.muted }}>First 50 of {table.rows.length} comments shown. Downloads include all comments.</p> : null}</Page>)}
  </div>;
}
