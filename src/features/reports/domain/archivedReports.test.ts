import assert from 'node:assert/strict';
import test from 'node:test';
import type { CustomForm, SurveyResponse } from '../../../types/survey';
import { buildArchivedReport, getArchivedReportItems, type ArchivedReportData, type ArchivedReportSelection } from './archivedReports';
import { describeReportParameters, validateReportRecipe } from './reportHistory';
import { formatAnalyticsScore, getAnalyticsCompanyRankings } from '../../analytics/domain/rankings';

const survey: CustomForm = { id: 'survey-a', title: 'Archived courier survey', description: '', createdAt: '2026-01-01', status: 'Archived', surveyType: 'Courier',
  questions: [{ questionId: 'Q01', questionNumber: 1, question: 'Delivery reliability', questionCategory: 'Delivery' }] };
const otherSurvey = { ...survey, id: 'survey-b', title: 'Other archived survey' };
const row = (responseId: string, overrides: Partial<SurveyResponse> = {}): SurveyResponse => ({ responseId, surveyId: survey.id,
  companyId: 'company-a', company: 'Sample Courier', surveyType: 'Courier', respondentType: 'Employee', submissionDate: '2026-06-01T00:00:00Z',
  questionId: 'Q01', questionNumber: 1, question: 'Delivery reliability', questionCategory: 'Delivery', rating: 15, comment: '',
  archived: true, archivedAt: '2026-07-01T00:00:00Z', seriesId: 'half-one', dataSource: 'client_csv', ...overrides });
const data = (responses: SurveyResponse[]): ArchivedReportData => ({ responses, surveys: [survey, otherSurvey], knownSurveys: [survey, otherSurvey],
  companies: [{ id: 'company-a', name: 'Sample Courier', type: 'Courier', createdAt: '2026-01-01', isArchived: true }],
  series: [{ id: 'half-one', label: 'First half', createdAt: '2026-07-01' }, { id: 'half-two', label: 'Second half', createdAt: '2026-10-01' }],
});
const selection: ArchivedReportSelection = { kind: 'archived-survey', category: 'Courier', itemId: survey.id, includeComments: false };

test('archived item lists contain only the selected category and actual archived records', () => {
  const input = data([row('one')]);
  input.surveys.push({ ...survey, id: 'active', status: 'Running' }, { ...survey, id: 'supplier', surveyType: 'Supplier' });
  input.companies.push({ ...input.companies[0], id: 'active-company', isArchived: false });
  assert.deepEqual(getArchivedReportItems(input, 'archived-survey', 'Courier').map(item => item.id), [survey.id, otherSurvey.id]);
  assert.deepEqual(getArchivedReportItems(input, 'archived-company', 'Courier').map(item => item.id), ['company-a']);
  assert.deepEqual(getArchivedReportItems(input, 'archived-company', 'Supplier'), []);
});

test('one whole survey includes its stored evaluations and identifies staging data without mixing other surveys', () => {
  const responses = [row('one'), row('one', { questionId: 'Q02', question: 'Support', rating: 0 }),
    row('second-company', { companyId: 'company-b', company: 'Second Courier' }),
    row('wrong-survey', { surveyId: otherSurvey.id, archivedBySurveyId: survey.id }), row('test', { dataSource: 'test_submission' })];
  const input = data(responses);
  const before = JSON.stringify(input);
  const report = buildArchivedReport(input, selection);
  assert.equal(report.count, 3);
  assert.ok(report.tables[0].rows.some(cells => cells[0] === 'Staging/test answer rows' && cells[1] === 1));
  const ranks = getAnalyticsCompanyRankings([...responses.slice(0, 3), responses[4]], ['Courier']);
  assert.deepEqual(report.tables.find(table => table.title === 'Company performance')?.rows.map(cells => cells[2]), ranks.map(item => formatAnalyticsScore('Courier', item.rankScore)));
  assert.equal(JSON.stringify(input), before, 'Reporting must not restore or change records');
});

test('one response archive uses the same entry identities as Archive Center and cannot combine periods', () => {
  const input = data([row('first'), row('second', { seriesId: 'half-two' }), row('supplier', { surveyType: 'Supplier' }),
    row('active', { archived: false }), row('test', { dataSource: 'test_submission' }), row('legacy', { seriesId: 'missing' })]);
  const items = getArchivedReportItems(input, 'archived-responses', 'Courier');
  assert.equal(items.length, 3);
  const report = buildArchivedReport(input, { ...selection, kind: 'archived-responses', itemId: 'half-one' });
  assert.equal(report.count, 2);
  assert.equal(report.tables.find(table => table.title === 'Response details')?.rows[0][0], 'first');
  const legacy = items.find(item => item.id.startsWith('legacy_'))!;
  assert.equal(buildArchivedReport(input, { ...selection, kind: 'archived-responses', itemId: legacy.id }).count, 1);
});

test('empty, missing, restored or wrong-category selections fail closed without an all-items fallback', () => {
  const input = data([]);
  for (const kind of ['archived-survey', 'archived-responses', 'archived-company'] as const) {
    assert.throws(() => buildArchivedReport(input, { ...selection, kind, itemId: '' }), /Select an available/);
    assert.throws(() => buildArchivedReport(input, { ...selection, kind, itemId: 'removed' }), /Select an available/);
  }
  assert.throws(() => buildArchivedReport(input, { ...selection, category: 'Supplier' }), /Select an available/);
  input.surveys[0] = { ...survey, status: 'Running' };
  assert.throws(() => buildArchivedReport(input, selection), /Select an available/);
});

test('legacy attribution uses original IDs, archive IDs and all known forms to prevent ambiguity', () => {
  const input = data([row('archive-link', { surveyId: undefined, archivedBySurveyId: survey.id }), row('ambiguous', { surveyId: undefined })]);
  input.surveys = [survey];
  assert.equal(buildArchivedReport(input, selection).count, 1, 'A hidden form must still prevent ambiguous attribution');
  input.knownSurveys = [survey];
  assert.equal(buildArchivedReport(input, selection).count, 2);
});

test('one archived company uses stable IDs and rejects ambiguous legacy names', () => {
  const input = data([row('renamed', { company: 'Old company name' }), row('other', { companyId: 'company-b' })]);
  const chosen: ArchivedReportSelection = { ...selection, kind: 'archived-company', itemId: 'company-a' };
  assert.equal(buildArchivedReport(input, chosen).count, 1);
  input.responses.push(row('legacy', { companyId: undefined }));
  input.companies.push({ ...input.companies[0], id: 'company-b' });
  assert.throws(() => buildArchivedReport(input, chosen), /multiple companies/);
});

test('empty company profiles remain exportable without inventing scores', () => {
  const input = data([]);
  assert.equal(buildArchivedReport(input, selection).canExport, true);
  const profile = buildArchivedReport(input, { ...selection, kind: 'archived-company', itemId: 'company-a' });
  assert.equal(profile.count, 0);
  assert.equal(profile.canExport, true);
  assert.equal(profile.tables.find(table => table.title === 'Company performance')?.rows.length, 0);
  assert.ok(profile.tables.some(table => table.title === 'Company profile'));
});

test('staging-only and legacy archives remain visible and downloadable just as in Archive Center', () => {
  const input = data([row('RESP-staging', { dataSource: 'test_submission', rating: 'N/A' }),
    row('RESP-legacy', { dataSource: undefined, seriesId: undefined, archivedBySurveyId: survey.id })]);
  assert.equal(getArchivedReportItems(input, 'archived-responses', 'Courier').length, 2);
  const report = buildArchivedReport(input, { ...selection, kind: 'archived-responses', itemId: 'half-one' });
  assert.equal(report.count, 0);
  assert.equal(report.rowCount, 1);
  assert.equal(report.canExport, true);
  assert.ok(report.tables[0].rows.some(cells => cells[0] === 'Stored submissions' && cells[1] === 1));
  assert.ok(report.tables[0].rows.some(cells => cells[0] === 'Countable responses' && cells[1] === 0));
  assert.equal(report.tables.find(table => table.title === 'Response details')?.rows[0][0], 'RESP-staging');
});

test('response reports preserve zero and keep identities and comments out unless comments are selected', () => {
  const input = data([row('zero', { rating: 0, comment: 'Private note', respondentEmail: 'private@example.test' })]);
  const chosen: ArchivedReportSelection = { ...selection, kind: 'archived-responses', itemId: 'half-one' };
  const report = buildArchivedReport(input, chosen);
  assert.equal(report.count, 1);
  assert.equal(report.tables.find(table => table.title === 'Response details')?.rows[0][4], 0);
  assert.ok(!JSON.stringify(report).includes('Private note'));
  assert.ok(!JSON.stringify(report).includes('private@example.test'));
  assert.ok(buildArchivedReport(input, { ...chosen, includeComments: true }).tables.some(table => table.title === 'Respondent comments'));
});

test('saved recipes require one item and category and display its human-readable label', () => {
  const recipe = { kind: 'archived-survey', parameters: { category: 'Courier', archivedItemId: survey.id, archivedItemLabel: survey.title } };
  assert.doesNotThrow(() => validateReportRecipe(recipe));
  for (const parameters of [{}, { category: 'Courier' }, { ...recipe.parameters, archivedItemId: '' }, { ...recipe.parameters, category: 'Other' }, { ...recipe.parameters, archivedItemId: 3 }]) {
    assert.throws(() => validateReportRecipe({ ...recipe, parameters }));
  }
  assert.match(describeReportParameters({ kind: 'archived-survey', parameters: { category: 'Courier', archivedItemId: survey.id, archivedItemLabel: survey.title } }), /Courier \| Archived courier survey/);
});
