import assert from 'node:assert/strict';
import test from 'node:test';
import type { CustomForm, PartnerCompany, SurveyResponse } from '../../../types/survey';
import { filterPendingEvaluations, getPendingEmployeeEvaluations } from './pendingEvaluations';

const now = new Date(2026, 9, 15, 12);
const companies: PartnerCompany[] = [
  { id: 'supplier-a', name: 'Supplier A', type: 'Supplier', createdAt: '2026-01-01' },
  { id: 'supplier-b', name: 'Supplier B', type: 'Supplier', createdAt: '2026-01-01' },
  { id: 'courier-a', name: 'Courier A', type: 'Courier', createdAt: '2026-01-01' },
];

function survey(id: string, overrides: Partial<CustomForm> = {}): CustomForm {
  return {
    id,
    title: `${id} evaluation`,
    description: '',
    surveyType: 'Supplier',
    createdAt: '2026-01-01',
    status: 'Running',
    questions: [],
    ...overrides,
  };
}

function response(company: string, respondentEmail = 'employee@example.com'): SurveyResponse {
  return {
    responseId: `response-${company}`,
    surveyId: 'supplier',
    surveyType: 'Supplier',
    respondentType: 'Managerial',
    submissionDate: '2026-10-01T00:00:00.000Z',
    company,
    questionId: 'question-1',
    questionNumber: 1,
    question: 'Question',
    questionCategory: 'Quality',
    rating: 4,
    comment: '',
    respondentEmail,
  };
}

test('pending evaluations count only unfinished companies in running, accessible surveys', () => {
  const evaluations = getPendingEmployeeEvaluations(
    [
      survey('supplier', { evaluationCompanyIds: ['supplier-a', 'supplier-b'] }),
      survey('paused', { status: 'Paused' }),
      survey('completed', { status: 'Completed' }),
      survey('courier', { surveyType: 'Courier' }),
    ],
    companies,
    [response('Supplier A'), response('Courier A', 'someone-else@example.com')],
    'EMPLOYEE@example.com',
    now,
  );

  assert.deepEqual(evaluations.map(({ id }) => id), ['courier:courier-a', 'supplier:supplier-b']);
  assert.equal(filterPendingEvaluations(evaluations, 'Supplier').length, 1);
  assert.equal(filterPendingEvaluations(evaluations, 'All evaluations').length, 2);
});

test('pending evaluations prioritize the nearest valid deadlines and put undated work last', () => {
  const evaluations = getPendingEmployeeEvaluations(
    [
      survey('no-deadline', { evaluationCompanyIds: ['supplier-b'] }),
      survey('later', { title: 'Later deadline', evaluationCompanyIds: ['supplier-a'], deadlineDate: '30/10/2026' }),
      survey('soon', { title: 'Soon deadline', evaluationCompanyIds: ['supplier-a'], deadlineDate: '20/10/2026' }),
    ],
    companies,
    [],
    'employee@example.com',
    now,
  );

  assert.deepEqual(evaluations.map(({ surveyId }) => surveyId), ['soon', 'later', 'no-deadline']);
  assert.equal(evaluations[0].deadline?.getDate(), 20);
  assert.equal(filterPendingEvaluations(evaluations, 'All evaluations', 'supplier b').length, 1);
});
