import assert from 'node:assert/strict';
import test from 'node:test';
import { SurveyResponse } from '../../../types/survey';
import { getLeaderboard } from '../../../utils/scoring';
import { getAnalyticsCompanyRankings, getCompanyPerformanceRanking, paginateAnalyticsItems, paginateCompanyRankings, rankCompanySummaries } from './rankings';

function courierResponse(company: string, responseId: string, rating: number): SurveyResponse {
  return {
    responseId,
    surveyType: 'Courier',
    respondentType: 'Employee',
    submissionDate: '2026-09-01T00:00:00.000Z',
    company,
    questionId: 'Q01',
    questionNumber: 1,
    question: 'Reliability',
    questionCategory: 'Reliability/Delivery',
    rating,
    comment: '',
  };
}

function supplierResponse(company: string, responseId: string, rating: number): SurveyResponse {
  return {
    ...courierResponse(company, responseId, rating),
    surveyType: 'Supplier',
    questionId: 'Q39',
    questionCategory: 'Documentation',
  };
}

function courierAnswerItem(
  company: string,
  responseId: string,
  rating: SurveyResponse['rating'] | '',
  questionId = 'Q01',
  comment = '',
): SurveyResponse {
  return {
    ...courierResponse(company, responseId, 0),
    questionId,
    rating: rating as unknown as SurveyResponse['rating'],
    comment,
  };
}

test('leaderboard evaluation counts include mixed and text-answer forms but exclude N/A-only or blank-only forms', () => {
  const responses = [
    courierAnswerItem('Mixed', 'mixed-form', 5),
    courierAnswerItem('Mixed', 'mixed-form', 'N/A', 'Q02', 'N/A reason'),
    courierAnswerItem('Mixed', 'mixed-form', '', 'Q03'),
    courierAnswerItem('No Answers', 'empty-form', 'N/A'),
    courierAnswerItem('No Answers', 'empty-form', '', 'Q02'),
    courierAnswerItem('Fully Answered', 'full-form', 4),
    courierAnswerItem('Fully Answered', 'full-form', 3, 'Q02'),
    courierAnswerItem('Fully Answered', 'full-form', 5, 'Q03'),
    courierAnswerItem('Text Answer', 'text-form', '', 'FREE_TEXT', 'A real text answer'),
  ];

  const allCompanies = new Map(
    getLeaderboard(responses, 'Courier').map((company) => [company.company, company]),
  );
  assert.equal(allCompanies.get('Mixed')?.evaluationCount, 1);
  assert.equal(allCompanies.get('No Answers')?.evaluationCount, 0);
  assert.equal(allCompanies.get('Fully Answered')?.evaluationCount, 1);
  assert.equal(allCompanies.get('Text Answer')?.evaluationCount, 1);

  const analyticsCompanies = getAnalyticsCompanyRankings(responses, ['Courier']);
  assert.deepEqual(new Set(analyticsCompanies.map((company) => company.name)), new Set(['Mixed', 'Fully Answered']));
  assert.ok(analyticsCompanies.every((company) => company.count === 1));
});

test('company summaries always use volume-weighted ranking values', () => {
  const candidates = [
    { name: 'One Review', scorePercentage: 100, count: 1, type: 'Courier' as const },
    { name: 'Established', scorePercentage: 90, count: 20, type: 'Courier' as const },
    { name: 'Peer', scorePercentage: 70, count: 20, type: 'Courier' as const },
  ];

  assert.equal(rankCompanySummaries(candidates)[0].name, 'Established');

  const weightedByName = new Map(rankCompanySummaries(candidates).map((item) => [item.name, item.rankScore]));
  assert.ok(Math.abs(weightedByName.get('One Review')! - 87.3015873015873) < 1e-10);
  assert.ok(Math.abs(weightedByName.get('Established')! - 88.33333333333333) < 1e-10);
  assert.ok(Math.abs(weightedByName.get('Peer')! - 78.33333333333333) < 1e-10);
});

test('Analytics uses Bayesian peer mean and median response benchmark', () => {
  // Supplier peer mean is (100 + 90 + 70) / 3 = 86.67; the median response
  // count is 9. The unrelated Courier response must not enter this peer group.
  const responses = [
    supplierResponse('One Review', 'one-1', 4),
    ...Array.from({ length: 9 }, (_, index) => supplierResponse('Established', `established-${index}`, 3.6)),
    ...Array.from({ length: 10 }, (_, index) => supplierResponse('Peer', `peer-${index}`, 2.8)),
    courierResponse('Other partner type', 'courier-1', 15),
  ];

  const weighted = getAnalyticsCompanyRankings(responses, ['Supplier']);
  const weightedByName = new Map(weighted.map((item) => [item.name, item]));
  assert.equal(weightedByName.get('One Review')?.count, 1);
  assert.equal(weightedByName.get('Established')?.count, 9);
  assert.equal(weightedByName.get('Peer')?.count, 10);
  assert.ok(Math.abs(weightedByName.get('One Review')!.rankScore - 88) < 1e-10);
  assert.ok(Math.abs(weightedByName.get('Established')!.rankScore - 88.33333333333333) < 1e-10);
  assert.ok(Math.abs(weightedByName.get('Peer')!.rankScore - 77.89473684210526) < 1e-10);

});

test('performance chart ordering and displayed score use volume-weighted ranking', () => {
  const responses = [
    courierResponse('One Review', 'one-1', 15),
    ...Array.from({ length: 20 }, (_, index) => courierResponse('Established', `established-${index}`, 13.5)),
    ...Array.from({ length: 20 }, (_, index) => courierResponse('Peer', `peer-${index}`, 10.5)),
  ];

  const weighted = getCompanyPerformanceRanking(responses, ['Courier'], 'highest', 3);

  assert.equal(weighted[0].company, 'Established');
  assert.notEqual(weighted.find((item) => item.company === 'One Review')?.score, 100);
});

test('performance ranking honors active survey types and least-performing direction', () => {
  const supplier: SurveyResponse = {
    ...courierResponse('Supplier Only', 'supplier-1', 4),
    surveyType: 'Supplier',
    questionId: 'Q39',
    questionCategory: 'Documentation',
  };
  const responses = [
    courierResponse('High Courier', 'high-1', 15),
    courierResponse('Low Courier', 'low-1', 7.5),
    supplier,
  ];

  const result = getCompanyPerformanceRanking(responses, ['Courier'], 'lowest', 1);
  assert.deepEqual(result.map((item) => item.company), ['Low Courier']);
});

test('company leaderboard pagination returns no more than 20 companies and preserves rank offsets', () => {
  const companies = Array.from({ length: 45 }, (_, index) => `Company ${index + 1}`);

  const secondPage = paginateCompanyRankings(companies, 1);
  assert.equal(secondPage.items.length, 20);
  assert.equal(secondPage.items[0], 'Company 21');
  assert.equal(secondPage.startIndex, 20);
  assert.equal(secondPage.totalPages, 3);

  const clampedPage = paginateCompanyRankings(companies.slice(0, 5), 2);
  assert.equal(clampedPage.currentPage, 0);
  assert.deepEqual(clampedPage.items, companies.slice(0, 5));
});

test('question performance pagination returns no more than 20 ranked questions', () => {
  const questions = Array.from({ length: 41 }, (_, index) => `Question ${index + 1}`);

  const secondPage = paginateAnalyticsItems(questions, 1);
  assert.equal(secondPage.items.length, 20);
  assert.equal(secondPage.items[0], 'Question 21');
  assert.equal(secondPage.startIndex, 20);
  assert.equal(secondPage.totalPages, 3);
});
