import type { SurveyType } from '../../../types/survey';
import { formatNumber } from '../../analytics/domain/analytics';
import { analyticsBands, formatAnalyticsScore, getAnalyticsBand } from '../../analytics/domain/rankings';
import { getValueColorBand } from '../../analytics/domain/valueColorBand';
import type { ArchiveAnalyticsData } from './archiveAnalyticsVisuals';
import type { ExportTable } from '../services/exporters';

export const ARCHIVED_LEADERBOARD_LIMIT = 20;
export const ARCHIVED_SURVEY_PAPER = 'letter' as const;
export const ARCHIVED_SURVEY_STYLE = {
  blue: '#0060a8', ink: '#222222', muted: '#5f6b7a', rule: '#d9dee5', rank: '#e8ecf2',
  headerMargin: 43.2, margin: 49.2, tableMargin: 46.8, top: 105.2,
  titleSize: 20, sectionSize: 13, bodySize: 8,
};

export function archivedScoreFill(score: number): string {
  return { green: '#ddf3e4', yellow: '#fff6cc', orange: '#ffe3cc', red: '#f9dddd' }[getValueColorBand(score)];
}

export function archivedRatingColor(category: SurveyType, score: number): string {
  const index = analyticsBands[category].indexOf(getAnalyticsBand(category, score));
  return ['#1e9e4a', '#f08a24', '#2f7de1', '#d93636'][index] ?? '#222222';
}

export function archivedReportDate(value: unknown, withTime = false): string {
  if (typeof value !== 'string' || !value || !Number.isFinite(Date.parse(value))) return 'Not recorded';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit', hour12: true } as const : {}), timeZone: 'Asia/Manila',
  }).format(new Date(value)).replace('am', 'AM').replace('pm', 'PM');
}

/** The six compact detail rows used by the reference; data-export tables remain complete. */
export function buildArchivedSurveyDetails(itemLabel: string, tables: ExportTable[]) {
  const scope = new Map(tables[0]?.rows.map(row => [String(row[0]), row[1]]) ?? []);
  const survey = new Map(tables.find(table => table.title === 'Survey details')?.rows.map(row => [String(row[0]), row[1]]) ?? []);
  const [start, end] = String(scope.get('Submission dates') ?? '').split(' to ');
  const stored = Number(scope.get('Stored submissions') ?? 0);
  const count = Number(scope.get('Countable responses') ?? 0);
  return { title: 'Report details', columns: ['Item', 'Value'], rows: [
    ['Survey', `${itemLabel} (Archived)`],
    ['Submission period', start && end ? `${archivedReportDate(start)} - ${archivedReportDate(end)}` : 'No response data'],
    ['Created / Archived', `${archivedReportDate(survey.get('Created at'))} / ${archivedReportDate(survey.get('Archived at'), true)}`],
    ['Stored submissions', stored === count ? String(stored) : `${stored} (${count} countable)`],
    ['Stored answer rows', `${scope.get('Stored answer rows') ?? 0} (${scope.get('Official answer rows') ?? 0} official; ${scope.get('Staging/test answer rows') ?? 0} staging/test)`],
    ['Scoring basis', 'Current rubric - not an archive-time snapshot'],
  ] } satisfies ExportTable;
}

/** All metrics use the complete selected cohort; only the displayed ranking is limited. */
export function buildArchivedReportLayout(category: SurveyType, tables: ExportTable[], analytics: ArchiveAnalyticsData[]) {
  const summary = analytics.find(item => item.category === category)?.summary;
  const sections = [...(summary?.analysis.find(item => item.type === category)?.peerAverages ?? [])].sort((a, b) => b.average - a.average);
  const strongest = sections[0];
  const weakest = sections.at(-1);
  const distinctSections = strongest && weakest && strongest.average - weakest.average > 1e-9;
  const companies = summary?.companies ?? [];
  const top = companies[0];
  const largest = [...companies].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0];
  const findings: string[] = [];
  if (strongest) findings.push(distinctSections ? `Strongest area: ${strongest.section} (${formatNumber(strongest.average)} / 100).` : `Category scores: ${sections.length === 1 ? strongest.section : 'All scored categories'} average ${formatNumber(strongest.average)} / 100.`);
  if (distinctSections) findings.push(`Weakest area: ${weakest.section} (${formatNumber(weakest.average)} / 100).`);
  if (top) findings.push(`Top performer: ${top.name}, ${formatAnalyticsScore(category, top.rankScore)} from ${top.count} ${top.count === 1 ? 'submission' : 'submissions'}.${top.count === 1 ? ' Based on one submission only.' : ''}`);
  if (largest) findings.push(`Largest sample: ${largest.name}, ${largest.count} ${largest.count === 1 ? 'submission' : 'submissions'}, ${formatAnalyticsScore(category, largest.rankScore)}.`);
  const metrics = [
    { label: 'Overall score', value: summary?.scoredSubmissionCount ? `${formatNumber(summary.averageScore)} / 100` : 'No Score Yet' },
    { label: 'Countable responses', value: String(summary?.totalSubmissions ?? 0) },
    { label: 'Companies evaluated', value: String(tables[0]?.rows.find(row => row[0] === 'Evaluated companies')?.[1] ?? 0) },
    { label: distinctSections ? `Weakest category (${weakest.section})` : 'Category average', value: weakest ? formatNumber(weakest.average) : 'No Score Yet' },
  ];
  const questions = [...(summary?.questions ?? [])].sort((a, b) => b.average - a.average || a.question.localeCompare(b.question));
  const questionTable: ExportTable = { title: 'Question results', columns: ['#', 'Question', 'Score (%)', 'Answers (including N/A)'], rows: questions.map((question, index) => [index + 1, question.question, formatNumber(question.average), question.responses]) };
  const categoryTable: ExportTable = { title: 'Category averages', columns: ['Category', 'Average score (%)'], rows: sections.map(section => [section.section, formatNumber(section.average)]) };
  return { metrics, findings, questionTable, categoryTable };
}
