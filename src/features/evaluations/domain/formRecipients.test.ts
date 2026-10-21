import assert from 'node:assert/strict';
import test from 'node:test';
import type { CustomForm, SurveyType, PartnerCompany, SurveyResponse } from '../../../types/survey';
import type { PersistedProfile } from '../../account-management/domain/accountProfile';
import { getEligibleFormRecipients } from './formRecipients';
import { getEvaluationLeaderboardTopTwenty } from './leaderboardSelection';
import { applyDistributionCompanySelection } from './formDistribution';
import { getSurveyEvaluationCompanies } from '../../analytics/domain/analytics';
import { questionWeights } from '../../../data/questionWeights';

const form: CustomForm = {
  id: 'supplier-form', title: 'Supplier evaluation', surveyType: 'Supplier', description: '', createdAt: '2026-10-01',
  questions: [], accessDepartments: ['Procurement Group'], accessRoles: ['Managerial', 'Rank & File'],
};

const suppliers: PartnerCompany[] = Array.from({ length: 25 }, (_, index) => ({
  id: `supplier-${index}`, name: `Supplier ${String(index).padStart(2, '0')}`, type: 'Supplier', createdAt: '2026-01-01',
}));

test('Send Form uses the existing top-20 Supplier preset and saves an explicit evaluation scope', () => {
  const weight = questionWeights.Supplier[0];
  const scored: SurveyResponse = { responseId: 'official', companyId: suppliers[24].id, company: suppliers[24].name,
    surveyType: 'Supplier', respondentType: 'Employee', submissionDate: '2026-10-01', dataSource: 'client_csv',
    questionId: weight.questionId, questionNumber: 1, question: 'Criterion', questionCategory: weight.section, rating: weight.maxPoints, comment: '' };
  const pool: PartnerCompany[] = [...suppliers,
    { ...suppliers[0], id: 'archived', name: 'Archived', isArchived: true },
    { ...suppliers[0], id: 'courier', name: 'Courier', type: 'Courier' }];
  const selected = getEvaluationLeaderboardTopTwenty(pool, [scored], 'Supplier');
  assert.equal(selected.length, 20);
  assert.equal(selected[0].id, suppliers[24].id);
  assert.ok(selected.every((company) => company.type === 'Supplier' && !company.isArchived));
  const updated = applyDistributionCompanySelection({ ...form, status: 'Running' }, selected.map((company) => company.id), pool);
  assert.equal(updated.status, 'Running');
  assert.deepEqual(updated.accessDepartments, form.accessDepartments);
  assert.deepEqual(updated.accessRoles, form.accessRoles);
  assert.equal(updated.evaluationCompanyIds?.length, 20);
  assert.equal(getSurveyEvaluationCompanies(updated, [...pool, { ...suppliers[0], id: 'new-client-supplier' }]).length, 20);
  assert.equal(form.evaluationCompanyIds, undefined);
});

test('small Supplier lists stay explicit and Supplier forms require a selection', () => {
  const available = suppliers.slice(0, 3);
  const selected = getEvaluationLeaderboardTopTwenty(available, [], 'Supplier').map((company) => company.id);
  const updated = applyDistributionCompanySelection(form, selected, available);
  assert.deepEqual(updated.evaluationCompanyIds, selected);
  assert.throws(() => applyDistributionCompanySelection(updated, null, available), /Select at least one company/);
  const subcontractor = { ...form, surveyType: 'Subcontractor' as const };
  assert.equal(applyDistributionCompanySelection(subcontractor, null, available), subcontractor);
});

test('Courier company selection uses only active Couriers and saves the checked subset', () => {
  const couriers: PartnerCompany[] = suppliers.map((company, index) => ({ ...company, id: `courier-${index}`, name: `Courier ${index}`, type: 'Courier' }));
  const pool = [...suppliers, ...couriers, { ...couriers[0], id: 'archived-courier', isArchived: true }];
  const courierForm = { ...form, surveyType: 'Courier' as const, deadlineDate: '31/12/2026' };
  const candidates = getEvaluationLeaderboardTopTwenty(pool, [], 'Courier');
  assert.equal(candidates.length, 20);
  assert.ok(candidates.every((company) => company.type === 'Courier' && !company.isArchived));
  const checked = candidates.slice(0, 2).map((company) => company.id);
  const updated = applyDistributionCompanySelection(courierForm, checked, pool);
  assert.deepEqual(getSurveyEvaluationCompanies(updated, pool).map((company) => company.id).sort(), [...checked].sort());
  assert.equal(updated.deadlineDate, courierForm.deadlineDate);
  assert.throws(() => applyDistributionCompanySelection(courierForm, null, pool), /Select at least one company/);
  assert.throws(() => applyDistributionCompanySelection(courierForm, ['supplier-0'], pool), /no longer valid/);
  assert.throws(() => applyDistributionCompanySelection(form, ['courier-0'], pool), /no longer valid/);
});

test('specific Supplier selections limit employees to exactly those companies', () => {
  const ids = ['supplier-3', 'supplier-9'];
  const selected = applyDistributionCompanySelection(form, ids, suppliers);
  assert.deepEqual(selected.evaluationCompanyIds, ids);
  assert.deepEqual(getSurveyEvaluationCompanies(selected, suppliers).map((company) => company.id), ids);
  assert.equal(form.evaluationCompanyIds, undefined);
});

test('invalid Supplier selections cannot accidentally expand to every company', () => {
  for (const selected of [[], ['missing'], suppliers.slice(0, 21).map((company) => company.id)]) {
    assert.throws(() => applyDistributionCompanySelection(form, selected, suppliers), /no longer valid/);
  }
  assert.throws(() => applyDistributionCompanySelection(form, ['supplier-0'], [{ ...suppliers[0], isArchived: true }]), /no longer valid/);
  assert.throws(() => applyDistributionCompanySelection(form, ['supplier-0'], [{ ...suppliers[0], type: 'Courier' }]), /no longer valid/);
  assert.throws(() => applyDistributionCompanySelection({ ...form, surveyType: 'Courier' }, ['supplier-0'], suppliers), /no longer valid/);
});
const profile = (email: string, department: PersistedProfile['department'], designation: PersistedProfile['designation'], surveyTypes?: SurveyType[]): PersistedProfile => ({
  email, role: 'Employee', department, designation,
  ...(surveyTypes ? { permissions: { pages: [], surveyTypes } } : {}),
});

test('recipients must pass account, department, designation, and survey access rules', () => {
  const profiles = [
    profile('eligible@mgenesis.com', 'Procurement Group', 'Managerial'),
    profile('category-denied@mgenesis.com', 'Procurement Group', 'Managerial', ['Courier']),
    profile('department-denied@mgenesis.com', 'Logistics', 'Managerial'),
    profile('role-denied@mgenesis.com', 'Procurement Group', 'Supervisory'),
    { ...profile('admin@mgenesis.com', 'Procurement Group', 'Managerial'), role: 'Admin' as const },
  ];
  assert.deepEqual(getEligibleFormRecipients(form, profiles, {}).map(({ email }) => email), ['eligible@mgenesis.com']);
  assert.deepEqual(getEligibleFormRecipients(form, [profiles[0]], { 'Procurement Group': { surveyTypes: ['Courier'] } }), []);
});
