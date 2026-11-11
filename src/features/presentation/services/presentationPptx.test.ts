import assert from 'node:assert/strict';
import test from 'node:test';
import type PptxGenJS from 'pptxgenjs';
import type { SurveyResponse } from '../../../types/survey';
import { buildSlides, type Slide } from '../domain/presentation';
import { expandSlidesForExport } from './presentationCanvasExport';
import { renderPptxSlide } from './presentationPptx';

type ChartCall = { type: unknown; data: Array<{ name: string; labels: string[]; values: number[] }>; options: Record<string, unknown> };
type TextCall = { text: string; options: Record<string, unknown> };

function render(slide: Slide, reportingPeriod = 'Jan 1 – Mar 31, 2026') {
  const text: string[] = [];
  const textCalls: TextCall[] = [];
  const charts: ChartCall[] = [];
  const slideMock = {
    addText: (content: unknown, options: Record<string, unknown> = {}) => {
      if (typeof content === 'string') {
        text.push(content);
        textCalls.push({ text: content, options });
      }
    },
    addShape: () => undefined,
    addChart: (type: unknown, data: ChartCall['data'], options: ChartCall['options']) => { charts.push({ type, data, options }); },
    addImage: () => undefined,
  };
  const presentation = {
    ChartType: { bar: 'bar', line: 'line', pie: 'pie', radar: 'radar', doughnut: 'doughnut' },
    addSlide: () => slideMock,
  } as unknown as PptxGenJS;

  renderPptxSlide(presentation, slide, 100, reportingPeriod);
  return { text, textCalls, charts };
}

function response(responseId: string, questionId: string, submissionDate: string): SurveyResponse {
  return {
    responseId,
    surveyType: 'Courier',
    respondentType: 'Employee',
    submissionDate,
    company: 'Harbor Logistics',
    questionId,
    questionNumber: questionId === 'Q01' ? 1 : 2,
    question: `Question ${questionId}`,
    questionCategory: 'Delivery',
    rating: 12,
    comment: '',
  };
}

test('PPTX expands the leaderboard into Courier, Supplier, and Subcontractor slides in order', () => {
  const overview: Slide = { kind: 'questions', top: [], bottom: [] };
  const leaderboard: Slide = {
    kind: 'leaderboard',
    groups: ['Subcontractor', 'Courier', 'Supplier'].map((surveyType) => ({
      surveyType: surveyType as 'Courier' | 'Supplier' | 'Subcontractor',
      rows: [],
    })),
  };
  const closing: Slide = { kind: 'closing', takeaways: [] };

  const expanded = expandSlidesForExport([overview, leaderboard, closing]);

  assert.deepEqual(expanded.map((slide) => slide.kind), ['questions', 'leaderboard', 'leaderboard', 'leaderboard', 'closing']);
  assert.deepEqual(expanded.filter((slide) => slide.kind === 'leaderboard').map((slide) =>
    slide.kind === 'leaderboard' ? slide.groups[0]?.surveyType : undefined), ['Courier', 'Supplier', 'Subcontractor']);
  assert.deepEqual(leaderboard.groups.map((group) => group.surveyType), ['Subcontractor', 'Courier', 'Supplier']);
});

test('PPTX leaderboard uses full-width rows with shrink-to-fit company labels', () => {
  const slide: Slide = {
    kind: 'leaderboard',
    groups: [{
      surveyType: 'Supplier',
      rows: Array.from({ length: 20 }, (_, index) => ({
        rank: index + 1,
        company: `Supplier Partner ${index + 1} with a deliberately long company name`,
        score: 90 - index,
        band: 'Good',
        hex: '#10b981',
      })),
    }],
  };

  const rendered = render(slide);
  const companies = rendered.textCalls.filter(({ text }) => text.startsWith('Supplier Partner'));
  const rankTen = rendered.textCalls.find(({ text }) => text === '10');

  assert.equal(companies.length, 20);
  assert.ok(companies.every(({ options }) => options.fit === 'shrink' && options.breakLine === false));
  assert.ok(companies.every(({ options }) => Number(options.w) > 7));
  assert.ok(companies.every(({ options }) => Number(options.h) > 0.15));
  assert.ok(rankTen && Number(rankTen.options.w) >= 0.34);
  assert.ok(rendered.text.includes('SUPPLIER'));
});

test('PPTX comparison includes countable submissions beside averages and does not chart zero-response scores', () => {
  const rendered = render({
    kind: 'comparison',
    data: [
      { surveyType: 'Supplier', average: 82.4, responses: 3 },
      { surveyType: 'Courier', average: 0, responses: 0 },
    ],
  });

  assert.deepEqual(rendered.charts[0].data[0].labels, ['Supplier · 3 responses']);
  assert.deepEqual(rendered.charts[0].data[0].values, [82.4]);
  assert.ok(rendered.text.some((value) => value.includes('No responses: Courier')));
  assert.ok(rendered.text.some((value) => value === 'Reporting period: Jan 1 – Mar 31, 2026'));

  const empty = render({ kind: 'comparison', data: [{ surveyType: 'Courier', average: 0, responses: 0 }] });
  assert.equal(empty.charts.length, 0);
  assert.ok(empty.text.some((value) => value.includes('No countable responses')));
});

test('PPTX category labels show countable submissions next to category averages', () => {
  const rendered = render({
    kind: 'sections',
    data: [{ category: 'Delivery', average: 76.5, responses: 18, submissions: 4, naCount: 2 }],
  });

  assert.deepEqual(rendered.charts[0].data[0].labels, ['Delivery · 4 responses']);
  assert.deepEqual(rendered.charts[0].data[0].values, [76.5]);
});

test('PPTX trend includes monthly response volume, including months without a scored average', () => {
  const rendered = render({
    kind: 'trends',
    data: [
      { month: '2026-01', average: 84, responses: 2 },
      { month: '2026-02', average: null, responses: 1 },
      { month: '2026-03', average: 91, responses: 4 },
    ],
  });

  assert.equal(rendered.charts.length, 2);
  assert.equal(rendered.charts[0].type, 'line');
  assert.deepEqual(rendered.charts[0].data[0].labels, ['2026-01', '2026-03']);
  assert.equal(rendered.charts[1].type, 'bar');
  assert.deepEqual(rendered.charts[1].data[0].labels, ['2026-01', '2026-02', '2026-03']);
  assert.deepEqual(rendered.charts[1].data[0].values, [2, 1, 4]);

  const empty = render({ kind: 'trends', data: [] });
  assert.equal(empty.charts.length, 0);
  assert.ok(empty.text.some((value) => value.includes('No monthly response data')));
});

test('slide data carries submission counts per category and reporting period from the selected response window', () => {
  const responses = [response('submission-1', 'Q01', '2026-02-12'), response('submission-1', 'Q02', '2026-02-12')];
  const slides = buildSlides({
    responses,
    partnerCompanies: [],
    categoryIds: ['comparison', 'sections', 'trends'],
    surveyTypes: ['Courier'],
    dateRangeLabel: 'Feb 1 – Feb 28, 2026',
  });
  const cover = slides.find((slide) => slide.kind === 'title');
  const comparison = slides.find((slide) => slide.kind === 'comparison');
  const sections = slides.find((slide) => slide.kind === 'sections');
  const trends = slides.find((slide) => slide.kind === 'trends');

  assert.ok(cover?.kind === 'title' && cover.meta.includes('Feb 1 – Feb 28, 2026'));
  assert.ok(comparison?.kind === 'comparison' && comparison.data[0].responses === 1);
  assert.ok(sections?.kind === 'sections' && sections.data.find((item) => item.category === 'Delivery')?.submissions === 1);
  assert.ok(trends?.kind === 'trends' && trends.data[0].responses === 1);
});

test('PPTX renders populated decision slides and explicit missing comparison data', () => {
  const period = render({ kind: 'period-change', insight: {
    available: true, availability: 'available', contextMessage: '', currentPeriod: 'Feb 1–3, 2026', previousPeriod: 'Jan 29–31, 2026', currentScore: 88, previousScore: 84,
    delta: 4, currentResponses: 5, previousResponses: 3, matchedChanges: [],
    improvements: [{ key: 'Courier:category:Delivery', kind: 'Category', label: 'Delivery', surveyType: 'Courier', previousScore: 70, currentScore: 78, delta: 8, previousResponses: 3, currentResponses: 5 }], declines: [],
    currentSnapshot: { scoredEvaluations: 5, weakestCategories: [], lowestPartners: [] },
  } });
  assert.ok(period.text.some((value) => value.includes('What changed since the last period?')));
  assert.ok(period.text.some((value) => value.includes('Jan 29–31, 2026')));
  assert.ok(period.text.some((value) => value.includes('Delivery')));
  assert.ok(period.text.some((value) => value.includes('3/5 scored responses')));

  const unavailable = render({ kind: 'period-change', insight: { available: false, availability: 'full-history', contextMessage: 'Current results are summarized below; no earlier window is present.', currentPeriod: 'Jan 1–Feb 2, 2026', currentScore: 80, currentResponses: 2, previousResponses: 0, matchedChanges: [], improvements: [], declines: [], currentSnapshot: { scoredEvaluations: 2, strongest: { key: 'Courier:category:Delivery', kind: 'Category', label: 'Delivery', surveyType: 'Courier', score: 80, responses: 2 }, weakestCategories: [{ key: 'Courier:category:Delivery', kind: 'Category', label: 'Delivery', surveyType: 'Courier', score: 80, responses: 2 }], lowestPartners: [] } } });
  assert.ok(unavailable.text.some((value) => value.includes('Current results are summarized below')));
  assert.ok(unavailable.text.some((value) => value.includes('LOWEST CATEGORY RESULTS')));
  assert.ok(unavailable.text.some((value) => value.includes('Delivery')));
  assert.ok(!unavailable.text.some((value) => /Choose a fixed reporting period|comparison is unavailable/i.test(value)));

  const focus = render({ kind: 'focus', insight: { priorities: [{ category: 'Delivery', surveyType: 'Courier', question: 'Was delivery on time?', questionScore: 52, categoryScore: 61, responses: 12, affectedPartners: 3, discussionPoints: ['Review repeated delays.'] }] } });
  assert.ok(focus.text.some((value) => value.includes('Was delivery on time?')));
  assert.ok(focus.text.some((value) => value.includes('12 responses')));
  assert.ok(focus.text.some((value) => value.includes('Review repeated delays.')));

  const portfolio = render({ kind: 'portfolio-spread', insight: { totalPartners: 4, unsatisfactoryPartners: 1, unsatisfactoryPercentage: 25, bands: [{ label: 'Unsatisfactory', count: 1, percentage: 25, color: '#dc2626' }], categories: [{ category: 'Delivery', surveyType: 'Courier', average: 66, evaluatedPartners: 4, unsatisfactoryPartners: 1, affectedPercentage: 25 }] } });
  assert.ok(portfolio.text.some((value) => value.includes('4 evaluated partners')));
  assert.ok(portfolio.text.some((value) => value.includes('1/4')));
});
