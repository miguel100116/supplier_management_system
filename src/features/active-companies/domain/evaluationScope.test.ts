import assert from 'node:assert/strict';
import test from 'node:test';
import type { CustomForm, PartnerCompany } from '../../../types/survey';
import { scopeSurveysToActiveLists } from './evaluationScope';
import { getSurveyEvaluationCompanies } from '../../analytics/domain/analytics';
import { getPendingEmployeeEvaluations } from '../../employee-experience/domain/pendingEvaluations';
import { applyDistributionCompanySelection } from '../../evaluations/domain/formDistribution';
import { parseApplicationRecordPayload } from '../../../services/applicationRecordSchemas';

const registry: PartnerCompany[] = Array.from({ length: 273 }, (_, i) => ({ id: `supplier-${i}`, name: `Supplier ${i}`, type: 'Supplier', createdAt: '2026-01-01' }));
const form: CustomForm = { id: 'supplier', surveyType: 'Supplier', title: 'Supplier evaluation', description: '', status: 'Running', deadlineDate: '31/12/2026', createdAt: '2026-01-01', questions: [] };
const active = { surveyType: 'Supplier' as const, companies: registry.slice(0, 20).map(company => company.name) };
const now = new Date(2026, 9, 30);

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

test('per-form selections can only narrow uploaded scope and runtime scope is never persisted or trusted from stored surveys', () => {
  const scoped = scopeSurveysToActiveLists([{ ...form, evaluationCompanyIds: ['supplier-0', 'supplier-99'] }], registry, [active]);
  assert.deepEqual(getSurveyEvaluationCompanies(scoped[0], registry).map(item => item.id), ['supplier-0']);
  const parsed = parseApplicationRecordPayload('survey', scoped[0], form.id) as Record<string, unknown>;
  assert.equal(parsed.activeEvaluationCompanyIds, undefined);
  assert.equal(parsed.activeEvaluationListIssue, undefined);
  assert.deepEqual(parsed.evaluationCompanyIds, ['supplier-0', 'supplier-99']);
});
