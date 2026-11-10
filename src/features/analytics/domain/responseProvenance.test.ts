import assert from 'node:assert/strict';
import test from 'node:test';
import type { SurveyResponse } from '../../../types/survey';
import { createCompanyRankingUpdater } from './incrementalRankings';
import {
  getResponseDataSource,
  isOfficialAnalyticsResponse,
  parseDeploymentEnvironment,
  submissionSourceForEnvironment,
} from './responseProvenance';

function response(overrides: Partial<SurveyResponse> = {}): SurveyResponse {
  return {
    responseId: 'RESP-1',
    surveyType: 'Courier',
    respondentType: 'Employee',
    submissionDate: '2026-09-01T00:00:00.000Z',
    company: 'Courier Company',
    questionId: 'Q01',
    questionNumber: 1,
    question: 'Reliability',
    questionCategory: 'Reliability/Delivery',
    rating: 15,
    comment: '',
    ...overrides,
  };
}

test('client CSV records are official, including legacy normalized and UI imports', () => {
  const normalized = response({ responseId: '3bb58018-23be-5d02-a709-c9da75576e0d', surveyId: 'default-courier' });
  const uiImport = response({ responseId: 'IMPORT-COURIER-1' });

  assert.equal(getResponseDataSource(normalized), 'client_csv');
  assert.equal(getResponseDataSource(uiImport), 'client_csv');
  assert.equal(isOfficialAnalyticsResponse(normalized), true);
  assert.equal(isOfficialAnalyticsResponse(uiImport), true);
});

test('legacy staging submissions remain stored but do not enter official analytics', () => {
  const stagingResponse = response();
  assert.equal(getResponseDataSource(stagingResponse), 'test_submission');
  assert.equal(isOfficialAnalyticsResponse(stagingResponse), false);
});

test('explicit production submissions enter official analytics', () => {
  assert.equal(isOfficialAnalyticsResponse(response({ dataSource: 'production_submission' })), true);
  assert.equal(isOfficialAnalyticsResponse(response({ dataSource: 'test_submission' })), false);
});

test('completed app evaluations enter official analytics in every deployment environment', () => {
  assert.equal(parseDeploymentEnvironment(undefined), 'staging');
  assert.equal(parseDeploymentEnvironment('unexpected'), 'staging');
  assert.equal(submissionSourceForEnvironment(parseDeploymentEnvironment('production')), 'production_submission');
  for (const environment of [undefined, 'unexpected', 'staging', 'production']) {
    const dataSource = submissionSourceForEnvironment(parseDeploymentEnvironment(environment));
    assert.equal(isOfficialAnalyticsResponse(response({ dataSource })), true);
    assert.notEqual(dataSource, 'test_submission');
  }
  assert.equal(submissionSourceForEnvironment('staging'), 'app_submission');
});

test('a completed staging evaluation immediately adds a company and updates its existing ranking', () => {
  const update = createCompanyRankingUpdater();
  const testRow = response({ dataSource: 'test_submission', company: 'Old test company' });
  const rows = [testRow];
  const rankings = () => update(rows.filter(isOfficialAnalyticsResponse), ['Courier']);
  assert.deepEqual(rankings(), []);
  rows.push(response({ responseId: 'RESP-new', companyId: 'courier-1',
    dataSource: submissionSourceForEnvironment('staging') }));
  assert.deepEqual(rankings().map(({ name, count, rankScore }) => ({ name, count, rankScore })),
    [{ name: 'Courier Company', count: 1, rankScore: 100 }]);
  rows.push(response({ responseId: 'RESP-next', companyId: 'courier-1', rating: 0,
    dataSource: submissionSourceForEnvironment('staging') }));
  assert.deepEqual(rankings().map(({ name, count, rankScore }) => ({ name, count, rankScore })),
    [{ name: 'Courier Company', count: 2, rankScore: 50 }]);
  rows.push(response({ responseId: 'RESP-na', company: 'Unscored company', rating: 'N/A', dataSource: 'app_submission' }));
  assert.equal(rankings().length, 1, 'unscored evaluations cannot acquire a numeric rank');
});
