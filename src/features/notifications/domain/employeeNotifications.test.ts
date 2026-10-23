import assert from 'node:assert/strict';
import test from 'node:test';
import type { CustomForm, PartnerCompany, SurveyResponse } from '../../../types/survey';
import { getEmployeePendingSurveys } from './employeeNotifications';
import { getSurveyCompletionSummary } from '../../evaluations/domain/surveyCompletion';

const email = 'synthetic.employee@mgenesis.com';
const profile = { email, role: 'Employee', department: 'Logistics', designation: 'Rank & File' };
const company: PartnerCompany = { id: 'company-1', name: 'Synthetic Supplier', type: 'Supplier', createdAt: '2026-01-01' };
const survey: CustomForm = { id: 'form-1', title: 'Evaluation', surveyType: 'Supplier', description: '', createdAt: '2026-10-01', deadlineDate: '31/12/2099', status: 'Running', questions: [{ questionId: 'Q39', questionNumber: 1, question: 'Quality', questionCategory: 'Quality' }] };
const row: SurveyResponse = { responseId: 'response-1', surveyId: survey.id, companyId: company.id, company: company.name, surveyType: 'Supplier', respondentType: 'Rank & File', respondentEmail: email, submissionDate: '2026-10-23T00:00:00Z', questionId: 'Q39', questionNumber: 1, question: 'Quality', questionCategory: 'Quality', rating: 2, comment: '' };
const pending = (rows: SurveyResponse[] = [], companies = [company], form = survey, forms = [form]) => getEmployeePendingSurveys(email, profile, forms, companies, rows);

test('unfinished forms notify only eligible employees and selected active companies', () => {
  assert.equal(pending()[0].pendingCompanies[0].id, company.id);
  for (const form of [{ ...survey, status: 'Paused' as const }, { ...survey, status: 'Archived' as const }, { ...survey, deadlineDate: '01/01/2000' }, { ...survey, accessDepartments: ['TASS'] }]) assert.equal(pending([], [company], form).length, 0);
  assert.equal(getEmployeePendingSurveys(email, { ...profile, permissions: { surveyTypes: ['Courier'] } }, [survey], [company], []).length, 0);
  assert.equal(pending([], [{ ...company, isArchived: true }]).length, 0);
});

test('nonanswers never complete a company; numeric zero does, consistently with progress', () => {
  for (const answer of [{ ...row, rating: 'N/A' as const }, { ...row, rating: 'N/A' as const, comment: '   ' }, { ...row, archived: true }]) {
    assert.equal(pending([answer]).length, 1);
    assert.equal(getSurveyCompletionSummary(survey, [profile], [company], [answer]).eligibleEmployees[0].completed, 0);
  }
  assert.equal(pending([{ ...row, rating: 0 }]).length, 0);
});

test('completion belongs to the current form and stable company identity', () => {
  assert.equal(pending([{ ...row, surveyId: 'other-form' }]).length, 1);
  assert.equal(pending([row], [{ ...company, name: 'Renamed Supplier' }]).length, 0);
  assert.equal(pending([{ ...row, companyId: 'different-company' }]).length, 1);
});

test('legacy responses count only with unambiguous form and company mappings', () => {
  const legacy = { ...row, surveyId: undefined, companyId: undefined };
  assert.equal(pending([legacy]).length, 0);
  const other = { ...survey, id: 'other-form' };
  assert.equal(pending([legacy], [company], survey, [survey, other]).length, 2);
  assert.equal(getEmployeePendingSurveys(email, profile, [survey], [company], [legacy], [survey, other]).length, 1);
  assert.equal(pending([legacy], [company, { ...company, id: 'same-name' }]).length, 1);
});

test('successful distribution revisions renew unread identity without reopening completed work', () => {
  assert.equal(pending()[0].id, `reminder-${survey.id}`);
  const first = { ...survey, distributionId: 'send-1', lastDistributedAt: '2026-10-23T01:00:00Z' };
  const second = { ...first, distributionId: 'send-2', lastDistributedAt: '2026-10-23T02:00:00Z' };
  assert.notEqual(pending([], [company], first)[0].id, pending([], [company], second)[0].id);
  assert.equal(pending([], [company], second)[0].createdAt, second.lastDistributedAt);
  assert.equal(pending([row], [company], second).length, 0);
});
