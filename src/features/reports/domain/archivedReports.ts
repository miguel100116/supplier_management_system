import type { ArchiveSeries, CustomForm, PartnerCompany, SurveyResponse, SurveyType } from '../../../types/survey';
import { formatNumber, hasAnsweredItem, questionPerformance, scoredResponses, submissionCount, submissionScores, averageRating } from '../../analytics/domain/analytics';
import { formatAnalyticsScore, getAnalyticsBand, getAnalyticsCompanyRankings } from '../../analytics/domain/rankings';
import { isOfficialAnalyticsResponse } from '../../analytics/domain/responseProvenance';
import { getCompanyComposites } from '../../evaluations/domain/scoring';
import { selectSurveyResponses, answerValue } from '../../evaluations/domain/surveyResponses';
import { describeArchiveResponseGroup } from '../../archives/domain/archiveResponseGroup';
import type { ExportTable } from '../services/exporters';

export const ARCHIVED_REPORT_TITLES = {
  'archived-survey': 'Archived Survey Report',
  'archived-responses': 'Archived Response Report',
  'archived-company': 'Archived Company Report',
};
export type ArchivedReportKind = keyof typeof ARCHIVED_REPORT_TITLES;
export function isArchivedReportKind(kind: string): kind is ArchivedReportKind {
  return kind === 'archived-survey' || kind === 'archived-responses' || kind === 'archived-company';
}
export interface ArchivedReportData {
  responses: SurveyResponse[];
  surveys: CustomForm[];
  knownSurveys: CustomForm[];
  companies: PartnerCompany[];
  series: ArchiveSeries[];
}
export interface ArchivedReportSelection {
  kind: ArchivedReportKind;
  category: SurveyType;
  itemId: string;
  includeComments: boolean;
}

function responseArchives(data: ArchivedReportData, category: SurveyType) {
  const series = new Map(data.series.map(item => [item.id, item]));
  const groups = new Map<string, { id: string; label: string; sortKey: string; responses: SurveyResponse[] }>();
  for (const row of data.responses.filter(response => response.archived && response.surveyType === category)) {
    const archive = describeArchiveResponseGroup(row, series);
    const group = groups.get(archive.id) ?? { ...archive, label: archive.seriesId ? archive.label : `${archive.label} (${archive.sortKey.slice(0, 10)})`, responses: [] };
    group.responses.push(row);
    if (archive.sortKey > group.sortKey) group.sortKey = archive.sortKey;
    groups.set(group.id, group);
  }
  return [...groups.values()].sort((left, right) => right.sortKey.localeCompare(left.sortKey));
}

export function getArchivedReportItems(data: ArchivedReportData, kind: ArchivedReportKind, category: SurveyType): { id: string; label: string }[] {
  if (kind === 'archived-survey') return data.surveys.filter(item => item.status === 'Archived' && item.surveyType === category).map(item => ({ id: item.id, label: item.title }));
  if (kind === 'archived-company') return data.companies.filter(item => item.isArchived && item.type === category).map(item => ({ id: item.id, label: item.name }));
  return responseArchives(data, category).map(({ id, label }) => ({ id, label }));
}

export function buildArchivedReport(data: ArchivedReportData, selection: ArchivedReportSelection) {
  const { kind, category, itemId, includeComments } = selection;
  const item = getArchivedReportItems(data, kind, category).find(candidate => candidate.id === itemId);
  if (!item) throw new Error('Select an available archived item in this category.');
  let rows = data.responses.filter(row => row.surveyType === category);
  const company = kind === 'archived-company' ? data.companies.find(candidate => candidate.id === itemId) : undefined;
  const survey = kind === 'archived-survey' ? data.surveys.find(candidate => candidate.id === itemId) : undefined;
  if (survey) {
    // Original survey IDs take precedence over metadata assigned by older archive actions.
    const linkedRows = rows.map(row => !row.surveyId && row.archivedBySurveyId ? { ...row, surveyId: row.archivedBySurveyId } : row);
    rows = selectSurveyResponses(survey, data.knownSurveys, linkedRows);
  } else if (company) {
    const hasLegacy = rows.some(row => !row.companyId && row.company === company.name);
    if (hasLegacy && data.companies.filter(candidate => candidate.type === category && candidate.name === company.name).length !== 1) {
      throw new Error('Legacy responses match multiple companies. Link company IDs before generating this report.');
    }
    rows = rows.filter(row => row.companyId ? row.companyId === company.id : row.company === company.name);
  } else {
    rows = responseArchives(data, category).find(archive => archive.id === itemId)!.responses;
  }
  const title = ARCHIVED_REPORT_TITLES[kind];
  const count = submissionCount(rows);
  const composites = getCompanyComposites(rows, category).filter(composite => composite.evaluationCount > 0);
  const rankings = getAnalyticsCompanyRankings(rows, [category]);
  const scores = submissionScores(scoredResponses(rows));
  const dates = rows.map(row => row.submissionDate).sort((left, right) => Date.parse(left) - Date.parse(right));
  const officialRows = rows.filter(isOfficialAnalyticsResponse).length;
  const tables: ExportTable[] = [{ title, columns: ['Report scope', 'Value'], rows: [
    ['Selected item', item.label], ['Category', category], ['Stored submissions', new Set(rows.map(row => row.responseId)).size],
    ['Stored answer rows', rows.length], ['Countable evaluations', count], ['Evaluated companies', composites.length],
    ['Submission dates', dates.length ? `${dates[0]} to ${dates[dates.length - 1]}` : 'No evaluation data'],
    ['Mean submission score (%)', scores.length ? formatNumber(averageRating(scoredResponses(rows))) : 'No Score Yet'],
    ['Official answer rows', officialRows], ['Staging/test answer rows', rows.length - officialRows],
    ['Data basis', 'Stored records for this item, including staging/test records; current rubric. Not an immutable archive-time snapshot.'],
  ] }];
  if (survey) tables.push({ title: 'Survey details', columns: ['Field', 'Value'], rows: [
    ['Survey', survey.title], ['Status', 'Archived'], ['Created at', survey.createdAt], ['Archived at', survey.archivedAt ?? 'Not recorded'],
  ] });
  if (company) tables.push({ title: 'Company profile', columns: ['Field', 'Value'], rows: [
    ['Company', company.name], ['Type', company.type], ['Registry status', 'Archived'], ['Archived at', company.archivedAt ?? 'Not recorded'],
  ] });
  if (kind === 'archived-responses') {
    tables.push({ title: 'Response details', columns: ['Submission ID', 'Company', 'Submitted at', 'Question', 'Answer'],
      rows: rows.map(row => [row.responseId, row.company, row.submissionDate, row.question,
        typeof row.rating === 'number' ? row.rating : includeComments ? answerValue(row) : row.rating]),
    });
  } else {
    tables.push({ title: 'Company performance', columns: ['Company', 'Submissions', 'Score', 'Rating'], rows: [
      ...rankings.map(row => [row.name, row.count, formatAnalyticsScore(category, row.rankScore), getAnalyticsBand(category, row.rankScore).label]),
      ...composites.filter(row => !row.hasScore).map(row => [row.company, row.evaluationCount, 'No Score Yet', 'No Score Yet']),
    ] }, { title: 'Category performance', columns: ['Company', 'Category', 'Score (%)'],
      rows: composites.flatMap(row => row.sections.filter(section => section.responses > 0).map(section => [row.company, section.section, formatNumber(section.percent)])),
    }, { title: 'Question results', columns: ['Question', 'Average score (%)', 'Answers (including N/A)'],
      rows: questionPerformance(rows).map(row => [row.question, formatNumber(row.average), row.responses]),
    });
  }
  if (includeComments) tables.push({ title: 'Respondent comments', columns: ['Company', 'Question', 'Comment'],
    rows: rows.filter(row => hasAnsweredItem(row) && row.comment.trim() && row.comment !== 'Submitted successfully.').map(row => [row.company, row.question, row.comment]),
  });
  return { title, itemLabel: item.label, tables, count, rowCount: rows.length, canExport: true };
}
