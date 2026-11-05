import assert from 'node:assert/strict';
import test from 'node:test';
import type { SurveyResponse } from '../../../types/survey';
import { buildSlides } from './presentation';
import {
  buildFocusInsight,
  buildPeriodComparisonInsight,
  buildPortfolioSpreadInsight,
  filterByPeriod,
  previousEqualDurationPeriod,
} from './presentationInsights';

function response(responseId: string, submissionDate: string, rating: number, company = 'Harbor Logistics'): SurveyResponse {
  return {
    responseId, surveyType: 'Courier', respondentType: 'Employee', submissionDate,
    company, companyId: company === 'Harbor Logistics' ? 'harbor-id' : 'other-id',
    questionId: 'Q01', questionNumber: 1, question: 'On-time delivery', questionCategory: 'Reliability/Delivery',
    rating, comment: '',
  };
}

test('equal-duration period and filtering include both date boundaries', () => {
  const current = { from: '2026-02-01', to: '2026-02-03' };
  const previous = previousEqualDurationPeriod(current);
  assert.deepEqual(previous, { from: '2026-01-29', to: '2026-01-31' });
  assert.equal(filterByPeriod([
    response('a', '2026-01-29T00:00:00Z', 8),
    response('b', '2026-02-01T00:00:00Z', 8),
    response('c', '2026-02-04T00:00:00Z', 8),
  ], previous).length, 1);
});

test('period comparison matches like-for-like partner/category, reports response counts, and handles unavailable baselines', () => {
  const oldRows = [
    response('old-1', '2026-01-30T00:00:00Z', 9),
    response('old-2', '2026-01-30T00:00:00Z', 9),
    { ...response('comment-only', '2026-01-30T00:00:00Z', 0), rating: 'N/A' as const, comment: 'Administrative note' },
  ];
  const currentRows = [response('new-1', '2026-02-02T00:00:00Z', 12)];
  const insight = buildPeriodComparisonInsight(currentRows, oldRows, { from: '2026-02-01', to: '2026-02-03' });
  assert.equal(insight.available, true);
  assert.equal(insight.currentResponses, 1);
  assert.equal(insight.previousResponses, 2);
  assert.ok(insight.improvements.length > 0);
  assert.equal(insight.improvements[0].previousResponses, 2);
  assert.equal(insight.improvements[0].currentResponses, 1);
  const partnerChange = insight.matchedChanges.find((change) => change.kind === 'Partner');
  assert.equal(partnerChange?.previousResponses, 2, 'a comment-only form must not inflate the score response count');
  assert.equal(buildPeriodComparisonInsight(currentRows, [], { from: '2026-02-01', to: '2026-02-03' }).available, false);
  const allHistory = buildPeriodComparisonInsight(currentRows, [], null, 'Jan 1 – Feb 2, 2026');
  assert.equal(allHistory.availability, 'full-history');
  assert.equal(allHistory.currentScore, 80);
  assert.equal(allHistory.currentSnapshot.weakestCategories[0].label, 'Reliability/Delivery');
  assert.match(allHistory.contextMessage, /Current results are summarized below/);
  assert.doesNotMatch(allHistory.contextMessage, /Choose|configure|unavailable/i);
});

test('takeaways contain only data-backed findings when no comparison period exists', () => {
  const slides = buildSlides({
    responses: [response('current', '2026-02-02T00:00:00Z', 12)], partnerCompanies: [], categoryIds: [],
    dateRangeLabel: 'Jan 1 – Feb 2, 2026', surveyTypes: ['Courier'],
  });
  const comparison = slides.find((slide) => slide.kind === 'period-change');
  const closing = slides.find((slide) => slide.kind === 'closing');
  assert.ok(comparison?.kind === 'period-change');
  assert.ok(closing?.kind === 'closing');
  assert.equal(comparison.insight.availability, 'full-history');
  assert.ok(comparison.insight.currentSnapshot.weakestCategories.length > 0);
  assert.ok(closing.takeaways.length > 0);
  assert.ok(closing.takeaways.length < 5);
  assert.match(closing.takeaways[0], /evaluated partners/);
  assert.match(closing.takeaways[1], /Lowest current category result/);
  assert.match(closing.takeaways.at(-1) ?? '', /Suggested discussion/);
  assert.doesNotMatch(closing.takeaways.join(' '), /unavailable|no matched|no priority|baseline|configure/i);
});

test('a missing preceding window keeps the current score and count; no-score periods do not invent zero scores', () => {
  const current = [response('current', '2026-02-02T00:00:00Z', 12)];
  const missingPrior = buildPeriodComparisonInsight(current, [], { from: '2026-02-01', to: '2026-02-03' }, 'Feb 1 – Feb 3, 2026');
  assert.equal(missingPrior.availability, 'no-previous-scores');
  assert.equal(missingPrior.currentScore, 80);
  assert.equal(missingPrior.currentResponses, 1);
  assert.equal(missingPrior.previousResponses, 0);
  assert.match(missingPrior.contextMessage, /1 scored evaluations/);

  const noScores = buildPeriodComparisonInsight([{ ...response('na', '2026-02-02T00:00:00Z', 0), rating: 'N/A' }], [], { from: '2026-02-01', to: '2026-02-03' });
  assert.equal(noScores.availability, 'no-current-scores');
  assert.equal(noScores.currentScore, undefined);
});

test('focus and portfolio findings are evidence based and empty input stays explicit', () => {
  const weakRows = [response('weak-1', '2026-02-02T00:00:00Z', 2), response('weak-2', '2026-02-02T00:00:00Z', 3, 'Bay Logistics')];
  const focus = buildFocusInsight(weakRows);
  assert.equal(focus.priorities[0].question, 'On-time delivery');
  assert.equal(focus.priorities[0].responses, 2);
  assert.equal(focus.priorities[0].affectedPartners, 2);
  assert.ok(focus.priorities[0].discussionPoints.length > 0);

  const portfolio = buildPortfolioSpreadInsight(weakRows);
  assert.equal(portfolio.totalPartners, 2);
  assert.equal(portfolio.unsatisfactoryPartners, 2);
  assert.equal(portfolio.unsatisfactoryPercentage, 100);
  assert.equal(buildPortfolioSpreadInsight([]).totalPartners, 0);
  assert.equal(buildFocusInsight([]).priorities.length, 0);
});

test('generated deck contains three populated evidence slides before takeaways with matching contents page numbers', () => {
  const slides = buildSlides({
    responses: [response('now', '2026-02-02T00:00:00Z', 2)], partnerCompanies: [], categoryIds: ['comparison'],
    dateRangeLabel: 'Feb 1 – Feb 3, 2026', currentPeriod: { from: '2026-02-01', to: '2026-02-03' }, previousPeriodResponses: [response('before', '2026-01-30T00:00:00Z', 4)], surveyTypes: ['Courier'],
  });
  const kinds = slides.map((slide) => slide.kind);
  const periodChange = kinds.indexOf('period-change');
  assert.ok(periodChange > kinds.indexOf('comparison'));
  assert.deepEqual(kinds.slice(periodChange, periodChange + 4), ['period-change', 'focus', 'portfolio-spread', 'closing']);
  const agenda = slides.find((slide) => slide.kind === 'agenda');
  assert.ok(agenda?.kind === 'agenda');
  assert.deepEqual(agenda.items.slice(-4).map((item) => [item.number, item.label]), [
    [slides.length - 3, 'What Changed Since the Last Period?'],
    [slides.length - 2, 'Where Should We Focus?'],
    [slides.length - 1, 'Is This Isolated or Widespread?'],
    [slides.length, 'Key Takeaways'],
  ]);
});
