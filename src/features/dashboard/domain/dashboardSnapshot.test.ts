import assert from 'node:assert/strict';
import test from 'node:test';
import type { CustomForm, PartnerCompany, SurveyResponse } from '../../../types/survey';
import type { PersistedProfile } from '../../account-management/domain/accountProfile';
import { getKpiSummary, submissionScores } from '../../analytics/domain/analytics';
import { buildDashboardSnapshot } from './dashboardSnapshot';

const survey: CustomForm = { id: 'form', title: 'Supplier evaluation', surveyType: 'Supplier', description: '', createdAt: '2026-01-01',
  status: 'Running', accessDepartments: ['TASS'], accessRoles: ['Rank & File'], evaluationCompanyIds: ['partner'],
  questions: [{ questionId: 'Q39', questionNumber: 1, question: 'Quality', questionCategory: 'Quality' }] };
const company: PartnerCompany = { id: 'partner', name: 'Partner', type: 'Supplier', createdAt: '2026-01-01' };
const employee: PersistedProfile = { email: 'one@mgenesis.com', role: 'Employee', designation: 'Rank & File', department: 'TASS' };
function row(id: string, overrides: Partial<SurveyResponse> = {}): SurveyResponse {
  return { responseId: id, surveyId: survey.id, companyId: company.id, company: company.name, surveyType: 'Supplier',
    respondentType: 'Employee', respondentEmail: employee.email, submissionDate: '2026-10-01T00:00:00Z',
    questionId: 'Q39', questionNumber: 1, question: 'Quality', questionCategory: 'Quality', rating: 3,
    comment: '', dataSource: 'production_submission', ...overrides };
}
function snapshot(rows: SurveyResponse[], overrides: Partial<Parameters<typeof buildDashboardSnapshot>[0]> = {}) {
  return buildDashboardSnapshot({ reportingResponses: rows, currentResponses: rows, surveys: [survey], companies: [company], accounts: [employee], ...overrides });
}

test('official submission volume, scored volume and completion remain separate and agree with canonical scoring', () => {
  const rows = [row('first', { rating: 0 }), row('repeat'), row('outside', { respondentEmail: 'former@mgenesis.com' }),
    row('remark', { questionId: 'remark', rating: 'N/A', comment: 'Useful feedback' }),
    row('blank', { rating: 'N/A' }), row('test', { dataSource: 'test_submission' })];
  const result = snapshot(rows);
  const supplier = result.results.find(item => item.type === 'Supplier')!;
  assert.equal(supplier.submissions, 4);
  assert.equal(supplier.scoredSubmissions, 3);
  assert.equal(supplier.average, getKpiSummary(rows.filter(item => item.dataSource === 'production_submission')).averageRating);
  assert.deepEqual(supplier.progress, { completed: 1, required: 1, percentage: 100 });
  assert.deepEqual(result.forms[0].progress, supplier.progress);
  assert.equal(result.forms[0].submissions, 4);
  assert.equal(result.recent.length, 4);
  assert.equal(result.recent.find(item => item.responseId === 'first')?.score, 0);
  assert.equal(result.recent.find(item => item.responseId === 'remark')?.score, null);
});

test('recipient eligibility respects form, account and department access and live company selection', () => {
  const accounts: PersistedProfile[] = [employee,
    { ...employee, email: 'two@mgenesis.com' },
    { ...employee, email: 'admin@mgenesis.com', role: 'Admin' },
    { ...employee, email: 'other@mgenesis.com', department: 'Logistics' },
    { ...employee, email: 'rank@mgenesis.com', designation: 'Managerial' },
    { ...employee, email: 'denied@mgenesis.com', permissions: { pages: [], surveyTypes: ['Courier'] } },
  ];
  const result = snapshot([row('one')], { accounts, companies: [company, { ...company, id: 'unassigned' }, { ...company, id: 'archived', isArchived: true }] });
  assert.deepEqual(result.forms[0].progress, { completed: 1, required: 2, percentage: 50 });
  assert.deepEqual(snapshot([row('one')], { accounts, departmentPermissions: { TASS: { surveyTypes: ['Courier'] } } }).forms[0].progress,
    { completed: 0, required: 0, percentage: null });
});

test('answer rows and repeat submissions complete each form assignment once, ambiguous legacy rows never do', () => {
  const second = { ...survey, id: 'second', title: 'Second form' };
  const rows = [row('one'), row('one', { questionId: 'Q40' }), row('repeat'), row('legacy', { surveyId: undefined })];
  const result = snapshot(rows, { surveys: [survey, second] });
  assert.equal(result.results[1].submissions, 3);
  assert.deepEqual(result.results[1].progress, { completed: 1, required: 2, percentage: 50 });
  assert.equal(result.forms.find(item => item.survey.id === 'second')?.progress?.completed, 0);
});

test('reporting scope filters scores and recent submissions while current assignments remain independent', () => {
  const current = [row('now'), row('test', { dataSource: 'test_submission' })];
  const archived = row('past', { archived: true, seriesId: 'old', rating: 0, submissionDate: '2025-01-01' });
  for (const scope of ['all-time', 'custom'] as const) {
    const result = snapshot([archived], { scope, currentResponses: current });
    assert.equal(result.results[1].submissions, 1);
    assert.equal(result.results[1].average, 0);
    assert.deepEqual(result.results[1].progress, { completed: 1, required: 1, percentage: 100 });
    assert.deepEqual(result.forms[0].progress, { completed: 1, required: 1, percentage: 100 });
    assert.deepEqual(result.recent.map(item => item.responseId), ['past']);
  }
  const filtered = snapshot([], { currentResponses: current });
  assert.equal(filtered.results[1].average, null);
  assert.equal(filtered.recent.length, 0);
  assert.equal(filtered.forms[0].progress?.completed, 1);
});

test('recent submissions show five full submissions, deterministic dates, metadata and the same normalized scores', () => {
  const rows = Array.from({ length: 7 }, (_, index) => row(`record-${index}`, { submissionDate: `2026-10-0${index + 1}` }));
  rows.push(row('invalid', { submissionDate: 'invalid' }));
  const result = snapshot(rows);
  assert.deepEqual(result.recent.map(item => item.responseId), ['record-6', 'record-5', 'record-4', 'record-3', 'record-2']);
  assert.ok(result.recent.every(item => item.formTitle === survey.title && item.respondentEmail === employee.email));
  assert.equal(result.recent[0].score, submissionScores([rows[6]])[0].score);
  const legacy = snapshot([row('legacy', { surveyId: undefined, respondentEmail: undefined, submissionDate: 'invalid' })]);
  assert.equal(legacy.recent[0].formTitle, survey.title);
  assert.equal(legacy.forms[0].progress?.completed, 0);
});

test('zero requirements, unknown accounts, archived forms, and category filters do not invent completion', () => {
  assert.deepEqual(snapshot([]).results[0].progress, { completed: 0, required: 0, percentage: null });
  assert.equal(snapshot([], { accounts: undefined }).forms[0].progress, null);
  assert.equal(snapshot([], { surveys: [{ ...survey, status: 'Archived' }] }).forms.length, 0);
  const result = snapshot([row('one')], { surveyTypes: ['Courier'] });
  assert.equal(result.forms.length, 0);
  assert.equal(result.recent.length, 0);
  assert.deepEqual(result.results.map(item => item.type), ['Courier']);
});

test('staging regression excludes the Executive account from required assignments', () => {
  const open = { ...survey, accessDepartments: [], accessRoles: [] };
  const accounts: PersistedProfile[] = [
    { ...employee, designation: 'Director' },
    { ...employee, email: 'executive@mgenesis.com', designation: 'Executive', department: 'Business Solutions Manager' },
  ];
  const result = snapshot([], { surveys: [open], accounts });
  assert.deepEqual(result.forms[0].progress, { completed: 0, required: 1, percentage: 0 });
  assert.deepEqual(result.forms[0].employees?.map(item => item.email), [employee.email]);
  assert.deepEqual(result.forms[0].employees?.[0].companies, [{ id: company.id, name: company.name, completed: false }]);
});

test('employee assignment details reconcile with summary totals and identify pending companies', () => {
  const second = { ...company, id: 'second', name: 'Pending partner' };
  const result = snapshot([row('one'), row('repeat')], { companies: [company, second], surveys: [{ ...survey, evaluationCompanyIds: [] }] });
  const form = result.forms[0];
  assert.deepEqual(form.progress, { completed: 1, required: 2, percentage: 50 });
  assert.equal(form.employees?.reduce((total, person) => total + person.completed, 0), form.progress?.completed);
  assert.deepEqual(form.employees?.[0].companies.map(item => [item.name, item.completed]), [[company.name, true], ['Pending partner', false]]);
  assert.equal(snapshot([], { accounts: undefined }).forms[0].employees, null);
});

test('recent form attribution reuses canonical matching and never guesses between shared forms', () => {
  const legacy = row('legacy', { surveyId: undefined });
  const resolved = snapshot([legacy]);
  assert.equal(resolved.recent[0].surveyId, survey.id);
  assert.equal(resolved.recent[0].formTitle, survey.title);
  const ambiguous = snapshot([legacy], { surveys: [survey, { ...survey, id: 'other' }] });
  assert.equal(ambiguous.recent[0].surveyId, undefined);
  assert.equal(ambiguous.recent[0].formTitle, 'Form unavailable');
});

test('unclassified partner records remain in official counts and scores with a separate data-quality count', () => {
  const result = snapshot([row('one')], { uncategorizedCompanyIds: [company.id] });
  assert.equal(result.results[1].submissions, 1);
  assert.equal(result.results[1].unclassifiedSubmissions, 1);
  assert.equal(result.results[1].average, snapshot([row('one')]).results[1].average);
});

test('recent sorting compares local source and UTC timestamps by their actual instant', () => {
  const result = snapshot([row('legacy-local', { submissionDate: '07/23/2026 19:31:15' }),
    row('utc-later', { submissionDate: '2026-07-23T12:00:00Z' })]);
  assert.deepEqual(result.recent.map(item => item.responseId), ['utc-later', 'legacy-local']);
});
