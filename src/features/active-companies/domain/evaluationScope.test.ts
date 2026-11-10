import assert from 'node:assert/strict';
import test from 'node:test';
import type { CustomForm, PartnerCompany } from '../../../types/survey';
import { scopeSurveysToActiveLists } from './evaluationScope';
import { reactivateEvaluationCompany } from './companyEligibility';
import { getSurveyEvaluationCompanies } from '../../analytics/domain/analytics';
import { getPendingEmployeeEvaluations } from '../../employee-experience/domain/pendingEvaluations';
import { applyDistributionCompanySelection } from '../../evaluations/domain/formDistribution';
import { parseApplicationRecordPayload } from '../../../services/applicationRecordSchemas';

const registry: PartnerCompany[] = Array.from({ length: 273 }, (_, i) => ({ id: `supplier-${i}`, name: `Supplier ${i}`, type: 'Supplier', createdAt: '2026-01-01' }));
const form: CustomForm = { id: 'supplier', surveyType: 'Supplier', title: 'Supplier evaluation', description: '', status: 'Running', deadlineDate: '31/12/2026', createdAt: '2026-01-01', questions: [] };
const active = { surveyType: 'Supplier' as const, companies: registry.slice(0, 20).map(company => company.name) };
const now = new Date(2026, 9, 30);

test('all vendor categories retain their complete uploaded scope and saved subsets for employees', () => {
  for (const [surveyType, count] of [['Courier', 7], ['Supplier', 20], ['Subcontractor', 13]] as const) {
    const companies = Array.from({ length: count }, (_, i) => ({ ...registry[0], id: `${surveyType}-${i}`, name: `${surveyType} ${i}`, type: surveyType }));
    const lists = [{ surveyType, companies: companies.map(company => company.name) }];
    const [scoped] = scopeSurveysToActiveLists([{ ...form, surveyType }], companies, lists);
    assert.equal(getSurveyEvaluationCompanies(scoped, companies).length, count);
    assert.equal(getPendingEmployeeEvaluations([scoped], companies, [], 'employee@example.com', now).length, count);
    const saved = parseApplicationRecordPayload('survey', { ...scoped, evaluationCompanyIds: [companies[0].id] }, scoped.id) as CustomForm;
    const [reloaded] = scopeSurveysToActiveLists([saved], companies, lists);
    assert.deepEqual(getSurveyEvaluationCompanies(reloaded, companies).map(company => company.id), [companies[0].id]);
    assert.equal(getPendingEmployeeEvaluations([reloaded], companies, [], 'employee@example.com', now).length, 1);
  }
});

test('misclassified, inactive-only and archived uploads are explained and excluded on both sides', () => {
  const companies: PartnerCompany[] = [
    { ...registry[0], name: 'Wrong category', type: 'Uncategorized' },
    { ...registry[1], name: 'Inactive partner', branches: [{ id: 'i', bpCode: '', status: 'Inactive' }] },
    { ...registry[2], name: 'Archived partner', isArchived: true },
    { ...registry[3], name: 'Mixed partner', branches: [{ id: 'i', bpCode: '', status: 'Inactive' }, { id: 'a', bpCode: '' }] },
  ];
  const [scoped] = scopeSurveysToActiveLists([form], companies, [{ ...active, companies: companies.map(company => company.name) }]);
  assert.deepEqual(getSurveyEvaluationCompanies(scoped, companies).map(company => company.name), ['Mixed partner']);
  assert.equal(getPendingEmployeeEvaluations([scoped], companies, [], 'employee@example.com', now).length, 1);
  assert.match(scoped.activeEvaluationListIssue!, /Wrong category \(different or unclassified category\)/);
  assert.match(scoped.activeEvaluationListIssue!, /Inactive partner \(archived or inactive\)/);
  const fixed = companies.map(company => company.name === 'Wrong category' ? { ...company, type: 'Supplier' as const } : company);
  const [refreshed] = scopeSurveysToActiveLists([form], fixed, [{ ...active, companies: companies.map(company => company.name) }]);
  assert.equal(getSurveyEvaluationCompanies(refreshed, fixed).length, 2);
});

test('273 registered suppliers produce exactly the 20 uploaded assignments, not 273', () => {
  const scoped = scopeSurveysToActiveLists([form], registry, [active]);
  assert.equal(getSurveyEvaluationCompanies(scoped[0], registry).length, 20);
  const pending = getPendingEmployeeEvaluations(scoped, registry, [], 'employee@example.com', now);
  assert.equal(pending.length, 20);
  assert.deepEqual(new Set(pending.map(item => item.companyId)), new Set(registry.slice(0, 20).map(item => item.id)));
  assert.equal(form.activeEvaluationCompanyIds, undefined, 'Stored survey is not mutated');
});

test('missing and empty uploaded lists never expand into all registered companies', () => {
  for (const lists of [[], [{ ...active, companies: [] }]]) {
    const scoped = scopeSurveysToActiveLists([form], registry, lists);
    assert.deepEqual(getSurveyEvaluationCompanies(scoped[0], registry), []);
    assert.equal(getPendingEmployeeEvaluations(scoped, registry, [], 'employee@example.com', now).length, 0);
  }
});

test('replacement uploads replace scope; archived, other-category, unmatched and ambiguous names cannot add assignments', () => {
  const companies = [...registry, { ...registry[0], id: 'archived', name: 'Archived Supplier', isArchived: true },
    { ...registry[0], id: 'courier', name: 'Courier Name', type: 'Courier' as const },
    { ...registry[0], id: 'duplicate-a', name: 'Duplicate Inc' }, { ...registry[0], id: 'duplicate-b', name: 'Duplicate Corporation' }];
  const scoped = scopeSurveysToActiveLists([form], companies, [{ ...active, companies: ['Supplier 26', 'Archived Supplier', 'Courier Name', 'No registry match', 'Duplicate Ltd'] }]);
  assert.deepEqual(getSurveyEvaluationCompanies(scoped[0], companies).map(item => item.id), ['supplier-26']);
  assert.match(scoped[0].activeEvaluationListIssue!, /^4 uploaded company names/);
  assert.throws(() => applyDistributionCompanySelection(scoped[0], ['supplier-0'], companies), /no longer valid/);
});

test('uses the existing exact normalized import identity, does not use fuzzy matching, and deduplicates names', () => {
  const companies = [{ ...registry[0], name: 'Example Networks Incorporated' }];
  const scoped = scopeSurveysToActiveLists([form], companies, [{ ...active, companies: ['Example Networks Inc.', 'Example Networks Corporation', 'Example Networkz'] }]);
  assert.deepEqual(scoped[0].activeEvaluationCompanyIds, ['supplier-0']);
  assert.match(scoped[0].activeEvaluationListIssue!, /^1 uploaded company name/);
});

test('full Master List membership shows inactive companies but status alone gates assignment', () => {
  const companies: PartnerCompany[] = [
    { ...registry[0], id: 'active-member', name: 'Active Member' },
    { ...registry[1], id: 'inactive-member', name: 'Inactive Member', branches: [{ id: 'inactive-branch', bpCode: 'I', status: 'Inactive' }] },
    { ...registry[2], id: 'completed-inactive-member', name: 'Completed Inactive Member', branches: [{ id: 'completed-branch', bpCode: 'C', status: 'Completed', manualStatus: 'Inactive' }] },
  ];
  const lists = [{ surveyType: 'Supplier' as const, companies: companies.map(company => company.name), membershipComplete: true }];
  const [scoped] = scopeSurveysToActiveLists([form], companies, lists);
  assert.deepEqual(new Set(scoped.uploadedEvaluationCompanyIds), new Set(companies.map(company => company.id)));
  assert.deepEqual(scoped.activeEvaluationCompanyIds, ['active-member']);
  assert.equal(scoped.evaluationCompanyMembershipComplete, true);
  assert.deepEqual(getSurveyEvaluationCompanies(scoped, companies).map(company => company.id), ['active-member']);

  const reactivated = reactivateEvaluationCompany(companies[2]);
  assert.equal(reactivated.branches?.[0].status, 'Pending');
  assert.equal(reactivated.branches?.[0].manualStatus, undefined);
  const nextCompanies = companies.map(company => company.id === reactivated.id ? reactivated : company);
  const [updatedScope] = scopeSurveysToActiveLists([form], nextCompanies, lists);
  assert.deepEqual(new Set(updatedScope.activeEvaluationCompanyIds), new Set(['active-member', 'completed-inactive-member']));
  assert.deepEqual(new Set(getSurveyEvaluationCompanies(updatedScope, nextCompanies).map(company => company.id)), new Set(['active-member', 'completed-inactive-member']));
});

test('per-form selections can only narrow uploaded scope and runtime scope is never persisted or trusted from stored surveys', () => {
  const scoped = scopeSurveysToActiveLists([{ ...form, evaluationCompanyIds: ['supplier-0', 'supplier-99'] }], registry, [active]);
  assert.deepEqual(getSurveyEvaluationCompanies(scoped[0], registry).map(item => item.id), ['supplier-0']);
  const parsed = parseApplicationRecordPayload('survey', scoped[0], form.id) as Record<string, unknown>;
  assert.equal(parsed.activeEvaluationCompanyIds, undefined);
  assert.equal(parsed.uploadedEvaluationCompanyIds, undefined);
  assert.equal(parsed.evaluationCompanyMembershipComplete, undefined);
  assert.equal(parsed.activeEvaluationListIssue, undefined);
  assert.deepEqual(parsed.evaluationCompanyIds, ['supplier-0', 'supplier-99']);
});
