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
  assert.equal(report.analytics[0].category, 'Courier');
  assert.equal(report.analytics[0].summary.totalSubmissions, report.count);
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

test('response archive leaderboards rank only the selected batch using canonical scores and ties', () => {
  const selected = [row('a'), row('b', { companyId: 'b', company: 'Beta', rating: 0 }),
    row('c', { companyId: 'c', company: 'Alpha', rating: 0, dataSource: 'test_submission' }),
    row('blank', { companyId: 'blank', company: 'Blank', rating: 'N/A' })];
  const input = data([...selected, row('other-batch', { seriesId: 'half-two', companyId: 'b', company: 'Beta' }),
    row('active', { archived: false, companyId: 'b', company: 'Beta' }), row('other-category', { surveyType: 'Supplier' })]);
  const before = JSON.stringify(input);
  const report = buildArchivedReport(input, { ...selection, kind: 'archived-responses', itemId: 'half-one' });
  const leaderboard = report.tables.find(table => table.title === 'Company leaderboard')!;
  assert.deepEqual(leaderboard.columns, ['Rank', 'Company', 'Submissions', 'Score', 'Rating']);
  const expected = getAnalyticsCompanyRankings(selected, ['Courier']);
  assert.deepEqual(leaderboard.rows.map(cells => cells.slice(0, 4)), expected.map((r, i) => [i + 1, r.name, r.count, formatAnalyticsScore('Courier', r.rankScore)]));
  assert.deepEqual(leaderboard.rows.map(cells => cells[1]), ['Sample Courier', 'Alpha', 'Beta']);
  assert.equal(JSON.stringify(input), before);
});

test('blank-only response batches remain exportable without fabricated leaderboard ranks', () => {
  const report = buildArchivedReport(data([row('blank', { rating: 'N/A' })]), { ...selection, kind: 'archived-responses', itemId: 'half-one' });
  assert.deepEqual(report.tables.find(table => table.title === 'Company leaderboard')?.rows, []);
  assert.equal(report.canExport, true);
  assert.equal(report.rowCount, 1);
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

test('Top 20 limits only ranked companies, retaining the complete selected survey and batch metrics', () => {
  const responses = Array.from({ length: 25 }, (_, index) => row(`form-${index}`, {
    companyId: `company-${index}`, company: `Courier ${String(index).padStart(2, '0')}`, rating: 15 - index / 2,
  }));
  const input = data(responses);
  const before = JSON.stringify(input);
  for (const chosen of [selection, { ...selection, kind: 'archived-responses' as const, itemId: 'half-one' }]) {
    const report = buildArchivedReport(input, chosen);
    const table = report.tables.find(table => table.title === (chosen.kind === 'archived-survey' ? 'Company performance' : 'Company leaderboard'))!;
    assert.equal(table.rows.length, 20);
    assert.equal(report.count, 25);
    assert.equal(report.rowCount, 25);
    assert.equal(report.analytics[0].summary.companies.length, 25);
    assert.equal(report.analytics[0].leaderboardLimit, 20);
    assert.equal(report.layout.metrics.find(metric => metric.label === 'Companies evaluated')?.value, '25');
    assert.equal(report.layout.questionTable.rows[0][3], 25);
    assert.equal(table.rows.some(row => row.includes('Courier 24')), false);
    if (chosen.kind === 'archived-responses') assert.equal(report.tables.find(table => table.title === 'Response details')?.rows.length, 25);
  }
  assert.equal(JSON.stringify(input), before);
});

test('reference layout sorts every question and category and derives findings without sample text', () => {
  const input = data([row('one'), row('one', { questionId: 'Q02', question: 'Second question', rating: 0 })]);
  const report = buildArchivedReport(input, selection);
  assert.deepEqual(report.layout.questionTable.rows.map(row => row[1]), ['Delivery reliability', 'Second question']);
  assert.match(report.layout.findings.join(' '), /Sample Courier/);
  assert.doesNotMatch(report.layout.findings.join(' '), /VSTECS|Wordtext|SoftwareOne/);
  const empty = buildArchivedReport(data([]), selection);
  assert.deepEqual(empty.layout.findings, []);
  assert.equal(empty.layout.metrics[0].value, 'No Score Yet');
});

test('findings use the largest sample even when its company falls outside the Top 20', () => {
  const responses = Array.from({ length: 24 }, (_, index) => row(`ranked-${index}`, { companyId: `ranked-${index}`, company: `Ranked ${index}` }));
  responses.push(row('low-one', { companyId: 'low', company: 'Largest sample outside Top 20', rating: 0 }), row('low-two', { companyId: 'low', company: 'Largest sample outside Top 20', rating: 0 }));
  const report = buildArchivedReport(data(responses), selection);
  assert.equal(report.count, 26);
  assert.ok(report.layout.findings.some(finding => finding.startsWith('Largest sample: Largest sample outside Top 20, 2 submissions')));
  assert.ok(!report.tables.find(table => table.title === 'Company performance')?.rows.some(cells => cells[0] === 'Largest sample outside Top 20'));
  assert.ok(!report.layout.findings.some(finding => /Strongest area|Weakest area/.test(finding)), 'One scored category has no invented category comparison');
});

test('unscored company profiles cannot expand a full Top 20 export table', () => {
  const responses = Array.from({ length: 21 }, (_, index) => row(`ranked-${index}`, { companyId: `ranked-${index}`, company: `Ranked ${index}` }));
  responses.push(row('comment-only', { companyId: 'unscored', company: 'Unscored', questionId: 'remark', question: 'Remarks', rating: 'N/A', comment: 'Evaluation remark' }));
  const report = buildArchivedReport(data(responses), selection);
  assert.equal(report.count, 22);
  assert.equal(report.tables.find(table => table.title === 'Company performance')?.rows.length, 20);
});
