import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Slide } from '../domain/presentation';
import type { SurveyResponse } from '../../../types/survey';
import { PresentationSlideCanvas, SlideDeck } from './SlideDeck';

const reportingPeriod = 'Feb 1 – Feb 28, 2026';

test('presentation viewer shell has no light outline around the fullscreen frame', () => {
  const slide: Slide = { kind: 'title', title: 'Deck', subtitle: 'Analytics', meta: [], generatedDate: 'Nov 5, 2026' };
  const markup = renderToStaticMarkup(createElement(SlideDeck, { slides: [slide], title: 'Deck', onExit: () => {} }));

  assert.match(markup, /bg-slate-950 p-3/);
  assert.doesNotMatch(markup, /border-slate-200/);
});

test('preview category slides show countable response context and reporting period', () => {
  const slide: Slide = {
    kind: 'sections',
    data: [{ category: 'Delivery', average: 76.5, responses: 18, submissions: 4, naCount: 2 }],
  };

  const markup = renderToStaticMarkup(createElement(PresentationSlideCanvas, { slide, reportingPeriod }));

  assert.match(markup, /Delivery: average 76\.5 out of 100 from 4 countable responses/);
  assert.match(markup, /Reporting period: Feb 1 – Feb 28, 2026/);
});

test('preview category slides do not show a score when there are no countable submissions', () => {
  const slide: Slide = {
    kind: 'sections',
    data: [{ category: 'Delivery', average: 0, responses: 0, submissions: 0, naCount: 0 }],
  };

  const markup = renderToStaticMarkup(createElement(PresentationSlideCanvas, { slide, reportingPeriod }));

  assert.match(markup, /No category data available/);
  assert.doesNotMatch(markup, /Delivery: average/);
});

test('leaderboard keeps categories within the slide and starts on Courier without a scroll list', () => {
  const slide: Slide = {
    kind: 'leaderboard',
    groups: [
      { surveyType: 'Courier', rows: [{ rank: 1, company: 'Courier Partner', score: 92, band: 'Good', hex: '#16a34a' }] },
      { surveyType: 'Supplier', rows: [{ rank: 1, company: 'Supplier Partner', score: 88, band: 'Good', hex: '#16a34a' }] },
      { surveyType: 'Subcontractor', rows: [{ rank: 1, company: 'Subcontractor Partner', score: 84, band: 'Good', hex: '#16a34a' }] },
    ],
  };

  const markup = renderToStaticMarkup(createElement(PresentationSlideCanvas, { slide }));

  assert.match(markup, /Courier Partner/);
  assert.match(markup, /Category 1 of 3/);
  assert.match(markup, /aria-label="Next leaderboard category"/);
  assert.match(markup, /aria-label="Previous leaderboard category"[^>]*disabled=""/);
  assert.match(markup, /overflow-hidden space-y-0\.5/);
  assert.doesNotMatch(markup, /Supplier Partner|Subcontractor Partner|overflow-y-auto/);
});

test('export leaderboard pages show one category without presentation-only navigation controls', () => {
  const slide: Slide = {
    kind: 'leaderboard',
    groups: [{ surveyType: 'Supplier', rows: [{ rank: 1, company: 'Supplier Partner', score: 88, band: 'Good', hex: '#10b981' }] }],
  };

  const markup = renderToStaticMarkup(createElement(PresentationSlideCanvas, { slide, exportMode: true }));

  assert.match(markup, /Supplier Partner/);
  assert.doesNotMatch(markup, /Previous leaderboard category|Next leaderboard category|Category 1 of 1|Switch categories with the arrows/);
});

test('preview trend slides present average and monthly response volume together', () => {
  const slide: Slide = {
    kind: 'trends',
    data: [
      { month: '2026-01', average: 84, responses: 2 },
      { month: '2026-02', average: null, responses: 1 },
    ],
  };

  const markup = renderToStaticMarkup(createElement(PresentationSlideCanvas, { slide, reportingPeriod }));

  assert.match(markup, /Average rating \(out of 100\)/);
  assert.match(markup, /Countable responses by month/);
  assert.match(markup, /Reporting period: Feb 1 – Feb 28, 2026/);
});

test('preview company comparison shows its countable evaluation total with the score', () => {
  const responses: SurveyResponse[] = ['response-1', 'response-2'].map((responseId, index) => ({
    responseId,
    surveyType: 'Courier',
    respondentType: 'Employee',
    submissionDate: `2026-02-1${index + 1}T00:00:00.000Z`,
    company: 'Harbor Logistics',
    questionId: 'Q01',
    questionNumber: 1,
    question: 'On-time delivery',
    questionCategory: 'Reliability/Delivery',
    rating: 12,
    comment: '',
  }));
  const slide: Slide = { kind: 'comparison', data: [{ surveyType: 'Courier', average: 80, responses: 2 }] };

  const markup = renderToStaticMarkup(createElement(PresentationSlideCanvas, { slide, responses }));

  assert.match(markup, /n=2/);
});

test('preview renders actual period comparison evidence and unavailable state', () => {
  const available: Slide = { kind: 'period-change', insight: {
    available: true, availability: 'available', contextMessage: '', currentPeriod: 'Feb 1–3, 2026', previousPeriod: 'Jan 29–31, 2026', currentScore: 88, previousScore: 84,
    delta: 4, currentResponses: 5, previousResponses: 3,
    improvements: [{ key: 'Courier:category:Delivery', kind: 'Category', label: 'Delivery', surveyType: 'Courier', previousScore: 70, currentScore: 78, delta: 8, previousResponses: 3, currentResponses: 5 }], declines: [], matchedChanges: [],
    currentSnapshot: { scoredEvaluations: 5, strongest: undefined, weakestCategories: [], lowestPartners: [] },
  } };
  const markup = renderToStaticMarkup(createElement(PresentationSlideCanvas, { slide: available, reportingPeriod }));
  assert.match(markup, /88\.00/);
  assert.match(markup, /84\.00/);
  assert.match(markup, /5 scored responses/);
  assert.match(markup, /Delivery/);
  assert.match(markup, /Reporting period:/);

  const unavailable: Slide = { kind: 'period-change', insight: { available: false, availability: 'full-history', contextMessage: 'Current results are summarized below; no earlier window is present in this selection.', currentPeriod: 'Jan 1–Feb 2, 2026', currentScore: 88, currentResponses: 5, previousResponses: 0, improvements: [], declines: [], matchedChanges: [], currentSnapshot: { scoredEvaluations: 5, strongest: { key: 'Courier:category:Delivery', kind: 'Category', label: 'Delivery', surveyType: 'Courier', score: 78, responses: 5 }, weakestCategories: [{ key: 'Courier:category:Delivery', kind: 'Category', label: 'Delivery', surveyType: 'Courier', score: 78, responses: 5 }], lowestPartners: [] } } };
  const fallbackMarkup = renderToStaticMarkup(createElement(PresentationSlideCanvas, { slide: unavailable }));
  assert.doesNotMatch(fallbackMarkup, /border-t-2/);
  assert.match(fallbackMarkup, /Current results are summarized below/);
  assert.match(fallbackMarkup, /Lowest category results/);
  assert.match(fallbackMarkup, /Delivery/);
  assert.doesNotMatch(fallbackMarkup, /Choose a fixed reporting period|comparison is unavailable/i);
});

test('preview renders evidence and empty states for focus and portfolio slides', () => {
  const focus: Slide = { kind: 'focus', insight: { priorities: [{ category: 'Delivery', surveyType: 'Courier', question: 'Was delivery on time?', questionScore: 52, categoryScore: 61, responses: 12, affectedPartners: 3, categoryDelta: -5, discussionPoints: ['Review repeated delays.'] }] } };
  const focusMarkup = renderToStaticMarkup(createElement(PresentationSlideCanvas, { slide: focus }));
  assert.match(focusMarkup, /Was delivery on time/);
  assert.match(focusMarkup, /12 responses/);
  assert.match(focusMarkup, /Suggested discussion points/);
  assert.match(focusMarkup, /Review repeated delays/);

  const portfolio: Slide = { kind: 'portfolio-spread', insight: { totalPartners: 4, unsatisfactoryPartners: 1, unsatisfactoryPercentage: 25, bands: [{ label: 'Good', count: 3, percentage: 75, color: '#16a34a' }, { label: 'Unsatisfactory', count: 1, percentage: 25, color: '#dc2626' }], categories: [{ category: 'Delivery', surveyType: 'Courier', average: 66, evaluatedPartners: 4, unsatisfactoryPartners: 1, affectedPercentage: 25 }] } };
  const portfolioMarkup = renderToStaticMarkup(createElement(PresentationSlideCanvas, { slide: portfolio }));
  assert.match(portfolioMarkup, /4 evaluated partners/);
  assert.match(portfolioMarkup, /1\/4/);

  const emptyPortfolio: Slide = { kind: 'portfolio-spread', insight: { totalPartners: 0, unsatisfactoryPartners: 0, unsatisfactoryPercentage: 0, bands: [], categories: [] } };
  assert.match(renderToStaticMarkup(createElement(PresentationSlideCanvas, { slide: emptyPortfolio })), /No evaluated partners/);
});
