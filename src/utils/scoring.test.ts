import assert from 'node:assert/strict';
import test from 'node:test';
import type { SurveyResponse, SurveyType } from '../types/survey';
import { hasAnsweredItem, monthlyTrend, responseVolume, seriesTrend, submissionCount, yearlyTrend } from './analytics';
import { commitRawEvaluationImport, type RawEvalPreview } from './rawEvaluationImport';
import { getLeaderboard } from './scoring';

const scoredQuestion: Record<SurveyType, { id: string; max: number; category: string }> = {
  Courier: { id: 'Q01', max: 15, category: 'Reliability/Delivery' },
  Supplier: { id: 'Q39', max: 4, category: 'Documentation' },
  Subcontractor: { id: 'Q03', max: 2, category: 'Delivery / Timeliness' },
};

function response(
  surveyType: SurveyType,
  company: string,
  companyId: string,
  responseId: string,
  fraction: number,
  submissionDate = '2026-09-01T00:00:00.000Z',
): SurveyResponse {
  const question = scoredQuestion[surveyType];
  return {
    responseId,
    companyId,
    surveyType,
    respondentType: 'Employee',
    submissionDate,
    company,
    questionId: question.id,
    questionNumber: 1,
    question: 'Scored criterion',
    questionCategory: question.category,
    rating: question.max * fraction,
    comment: '',
  };
}

function answerItem(
  responseId: string,
  rating: SurveyResponse['rating'] | '' | '   ' | ' n/a ',
  options: {
    company?: string;
    questionId?: string;
    comment?: string;
    submissionDate?: string;
    seriesId?: string;
  } = {},
): SurveyResponse {
  return {
    responseId,
    surveyType: 'Courier',
    respondentType: 'Employee',
    submissionDate: options.submissionDate ?? '2026-06-15T00:00:00.000Z',
    company: options.company ?? 'Count Test Company',
    questionId: options.questionId ?? 'Q01',
    questionNumber: 1,
    question: 'Response item',
    questionCategory: 'Reliability/Delivery',
    rating: rating as unknown as SurveyResponse['rating'],
    comment: options.comment ?? '',
    seriesId: options.seriesId,
  };
}

test('form counts require at least one nonblank answer other than N/A', () => {
  const answeredRating = answerItem('rating', 5);
  const zeroRating = answerItem('zero', 0);
  const notApplicable = answerItem('na', 'N/A', { comment: 'Reason for N/A' });
  const lowercaseNotApplicable = answerItem('lowercase-na', ' n/a ');
  const blank = answerItem('blank', '');
  const whitespace = answerItem('whitespace', '   ');
  const freeText = answerItem('free-text', '', { questionId: 'FREE_TEXT', comment: 'A real text answer' });
  const commentDetailOnly = answerItem('comment-detail', '', {
    questionId: 'FREE_TEXT',
    comment: ' | Comment detail: extra context only',
  });

  assert.equal(hasAnsweredItem(answeredRating), true);
  assert.equal(hasAnsweredItem(zeroRating), true);
  assert.equal(hasAnsweredItem(notApplicable), false);
  assert.equal(hasAnsweredItem(lowercaseNotApplicable), false);
  assert.equal(hasAnsweredItem(blank), false);
  assert.equal(hasAnsweredItem(whitespace), false);
  assert.equal(hasAnsweredItem(freeText), true);
  assert.equal(hasAnsweredItem(commentDetailOnly), false);
});

test('totals and period summaries count mixed/full/text forms once and exclude N/A-only or blank-only forms', () => {
  const responses = [
    answerItem('mixed-form', 5, { company: 'Mixed', seriesId: 'h1' }),
    answerItem('mixed-form', 'N/A', { company: 'Mixed', questionId: 'Q02', seriesId: 'h1' }),
    answerItem('mixed-form', '', { company: 'Mixed', questionId: 'Q03', seriesId: 'h1' }),
    answerItem('empty-form', 'N/A', { company: 'No Answers', seriesId: 'h1' }),
    answerItem('empty-form', '', { company: 'No Answers', questionId: 'Q02', seriesId: 'h1' }),
    answerItem('full-form', 4, { company: 'Fully Answered', seriesId: 'h1' }),
    answerItem('full-form', 3, { company: 'Fully Answered', questionId: 'Q02', seriesId: 'h1' }),
    answerItem('full-form', 5, { company: 'Fully Answered', questionId: 'Q03', seriesId: 'h1' }),
    answerItem('text-form', '', {
      company: 'Text Answer',
      questionId: 'FREE_TEXT',
      comment: 'Answered with free text',
      submissionDate: '2026-07-10T00:00:00.000Z',
      seriesId: 'h2',
    }),
  ];

  assert.equal(submissionCount(responses), 3);
  assert.deepEqual(responseVolume(responses, ['Courier']), [{ surveyType: 'Courier', responses: 3 }]);
  assert.deepEqual(monthlyTrend(responses).map(({ month, responses: count }) => ({ month, count })), [
    { month: '2026-06', count: 2 },
    { month: '2026-07', count: 1 },
  ]);
  assert.deepEqual(yearlyTrend(responses).map(({ year, responses: count }) => ({ year, count })), [
    { year: '2026', count: 3 },
  ]);
  assert.deepEqual(seriesTrend(responses, [
    { id: 'h1', label: 'H1 2026', createdAt: '2026-06-30T00:00:00.000Z' },
    { id: 'h2', label: 'H2 2026', createdAt: '2026-12-31T00:00:00.000Z' },
  ]).map(({ label, responses: count }) => ({ label, count })), [
    { label: 'H1 2026', count: 2 },
    { label: 'H2 2026', count: 1 },
  ]);
});

for (const surveyType of ['Courier', 'Supplier', 'Subcontractor'] as const) {
  test(`${surveyType} leaderboard recalculates and re-sorts after new evaluation data`, () => {
    const initial = [
      response(surveyType, 'Company A', `${surveyType}-a`, `${surveyType}-a-1`, 0.8),
      response(surveyType, 'Company B', `${surveyType}-b`, `${surveyType}-b-1`, 0.6),
    ];

    assert.equal(getLeaderboard(initial, surveyType)[0].company, 'Company A');

    const updated = [
      ...initial,
      ...Array.from({ length: 4 }, (_, index) => response(
        surveyType,
        'Company B',
        `${surveyType}-b`,
        `${surveyType}-b-${index + 2}`,
        1,
      )),
    ];

    const weighted = getLeaderboard(updated, surveyType);
    assert.equal(weighted[0].company, 'Company B');
    assert.equal(weighted[0].evaluationCount, 5);
  });
}

test('stable company IDs keep renamed evaluations in one leaderboard entry', () => {
  const responses = [
    response('Supplier', 'Old Display Name', 'supplier-1', 'old-response', 0.5, '2026-01-01T00:00:00.000Z'),
    response('Supplier', 'Current Display Name', 'supplier-1', 'new-response', 1, '2026-09-01T00:00:00.000Z'),
  ];

  const leaderboard = getLeaderboard(responses, 'Supplier');
  assert.equal(leaderboard.length, 1);
  assert.equal(leaderboard[0].companyId, 'supplier-1');
  assert.equal(leaderboard[0].company, 'Current Display Name');
  assert.equal(leaderboard[0].evaluationCount, 2);
  assert.equal(leaderboard[0].compositeScore, 75);
});

test('an unambiguous legacy name without an ID joins the matching company group', () => {
  const legacy = response('Courier', 'Courier Company', 'unused', 'legacy-response', 0.5);
  delete legacy.companyId;
  const responses = [
    legacy,
    response('Courier', 'Courier Company', 'courier-1', 'current-response', 1),
  ];

  const leaderboard = getLeaderboard(responses, 'Courier');
  assert.equal(leaderboard.length, 1);
  assert.equal(leaderboard[0].companyId, 'courier-1');
  assert.equal(leaderboard[0].evaluationCount, 2);
  assert.equal(leaderboard[0].compositeScore, 75);
});

test('CSV import responses retain the company ID resolved from the partner registry', () => {
  const cells: Array<string | number> = Array.from({ length: 26 }, () => '');
  cells[9] = 15;
  const preview = {
    surveyType: 'Courier',
    fileName: 'courier.csv',
    importBatchId: 'client-csv:courier:test-hash',
    totalRows: 1,
    skippedBlank: 0,
    missingRespondentInfo: 0,
    companyMatches: [{
      rawName: 'Courier Co.',
      normalizedName: 'COURIER',
      status: 'matched',
      companyId: 'courier-1',
      canonicalName: 'Courier Company',
    }],
    rows: [{
      cells,
      rawCompany: 'Courier Co.',
      normalizedCompany: 'COURIER',
      responseId: 'IMPORT-COURIER-1',
      submissionDate: '2026-09-01T00:00:00.000Z',
      respondentType: 'Employee',
      department: 'Operations',
    }],
  } as unknown as RawEvalPreview;

  const result = commitRawEvaluationImport(preview);
  assert.ok(result.responses.length > 0);
  assert.ok(result.responses.every((item) => item.companyId === 'courier-1'));
  assert.ok(result.responses.every((item) => item.company === 'Courier Company'));
  assert.ok(result.responses.every((item) => item.dataSource === 'client_csv'));
  assert.ok(result.responses.every((item) => item.importBatchId === preview.importBatchId));
});
