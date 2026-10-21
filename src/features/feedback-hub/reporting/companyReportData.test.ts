import assert from 'node:assert/strict';
import test from 'node:test';
import { questionWeights } from '../../../data/questionWeights';
import { CustomForm, PartnerCompany, SurveyResponse, SurveyType } from '../../../types/survey';
import {
  calculateCategoryPercentage,
  CompanyReportDataError,
  createCompanyReportData,
  formatCategoryMetricLabel,
  getCompanyReportCommentId,
  getCompanyReportCommentResponses,
  getOverallFeedbackQuestionId,
} from './companyReportData';
import { REPORT_TEMPLATE_BY_SURVEY_TYPE } from './reportTemplateConfig';
import { analyticsBands, formatAnalyticsScore, getAnalyticsBand, getAnalyticsCompanyRankings } from '../../analytics/domain/rankings';
import { getReportAverageText } from './companyReportData';

const surveyTypes: SurveyType[] = ['Courier', 'Supplier', 'Subcontractor'];

test('standalone company report exports retain the archived data supplied by the selected scope', () => {
  const survey = makeSurvey('Courier');
  const company = makeCompany('partner', 'Partner', 'Courier');
  const weight = questionWeights.Courier[0];
  const current = makeResponse({ responseId: 'current', survey, company, questionId: weight.questionId,
    question: 'Criterion', category: weight.section, rating: weight.maxPoints });
  const archived = { ...current, responseId: 'archived', archived: true, seriesId: 'past', rating: 0 };
  const report = createCompanyReportData({ survey, companyId: company.id, partnerCompanies: [company],
    responses: [current, archived], scopeToSurveyId: false, includeArchived: true });
  assert.equal(report.volumeWeightedScore, 50);
  assert.equal(report.composite?.evaluationCount, 2);
  const currentSurveyReport = createCompanyReportData({ survey, companyId: company.id, partnerCompanies: [company], responses: [current, archived] });
  assert.equal(currentSurveyReport.volumeWeightedScore, 100);
});

for (const type of surveyTypes) {
  test(`${type} generated company report uses the Analytics leaderboard score, label and scale`, () => {
    const survey = makeSurvey(type);
    const company = makeCompany('target', 'Target Partner', type);
    const peer = makeCompany('peer', 'Peer Partner', type);
    const weight = questionWeights[type][0];
    const responses = [
      makeResponse({ responseId: 'target-1', survey, company, questionId: weight.questionId, question: 'Scored criterion', category: weight.section, rating: weight.maxPoints * 0.78964 }),
      ...Array.from({ length: 12 }, (_, index) => makeResponse({ responseId: `peer-${index}`, survey, company: peer, questionId: weight.questionId, question: 'Scored criterion', category: weight.section, rating: weight.maxPoints })),
    ];
    const ranking = getAnalyticsCompanyRankings(responses, [type]).find((entry) => entry.name === company.name)!;
    const report = createCompanyReportData({ survey, companyId: company.id, partnerCompanies: [company, peer], responses });
    assert.equal(report.volumeWeightedScore, ranking.rankScore);
    assert.ok(Math.abs(ranking.rankScore - 78.964) < 1e-10);
    assert.notEqual(ranking.rankScore, Number(ranking.rankScore.toFixed(1)));
    for (const category of report.categoryRows.filter((row) => row.responses > 0)) {
      assert.equal(category.percentage, report.composite!.sections.find((section) => section.section === category.category)!.percent);
    }
    assert.deepEqual(report.volumeWeightedBand, getAnalyticsBand(type, ranking.rankScore));
    assert.equal(getReportAverageText(report), formatAnalyticsScore(type, ranking.rankScore));
    assert.deepEqual(report.ratingScale.map(({ displayMinimum, ...band }) => band), analyticsBands[type]);
    if (type === 'Subcontractor') {
      assert.equal(getReportAverageText(report), '1.57 / 2.0');
      assert.equal(report.volumeWeightedBand?.label, 'Top Performer');
    }
  });
}

function makeSurvey(surveyType: SurveyType): CustomForm {
  return {
    id: `survey-${surveyType.toLowerCase()}`,
    title: `${surveyType} Current Evaluation Period`,
    surveyType,
    description: '',
    createdAt: '2026-09-01T00:00:00.000Z',
    status: 'Completed',
    questions: [],
  };
}

function makeCompany(id: string, name: string, type: SurveyType): PartnerCompany {
  return { id, name, type, createdAt: '2026-01-01T00:00:00.000Z' };
}

function makeResponse(input: {
  responseId: string;
  survey: CustomForm;
  company: PartnerCompany;
  questionId: string;
  question: string;
  questionNumber?: number;
  category: string;
  rating: number | 'N/A';
  comment?: string;
}): SurveyResponse {
  return {
    responseId: input.responseId,
    surveyId: input.survey.id,
    companyId: input.company.id,
    surveyType: input.survey.surveyType,
    respondentType: 'Employee',
    submissionDate: '2026-09-08T08:30:00.000Z',
    company: input.company.name,
    questionId: input.questionId,
    questionNumber: input.questionNumber ?? 1,
    question: input.question,
    questionCategory: input.category,
    rating: input.rating,
    comment: input.comment ?? '',
  };
}

test('maps every survey card type to the exact retained Word reference', () => {
  assert.deepEqual(
    surveyTypes.map((type) => ({
      type,
      card: REPORT_TEMPLATE_BY_SURVEY_TYPE[type].surveyCardTitle,
      reference: REPORT_TEMPLATE_BY_SURVEY_TYPE[type].referenceFilename,
      title: REPORT_TEMPLATE_BY_SURVEY_TYPE[type].reportTitle,
    })),
    [
      {
        type: 'Courier',
        card: 'Courier Satisfaction Survey',
        reference: 'Sample Format - Courier Performance Rating.docx',
        title: 'Courier Performance Report',
      },
      {
        type: 'Supplier',
        card: 'Supplier Quality Survey',
        reference: 'Sample Format - Supplier Performance Rating.docx',
        title: 'Supplier Performance Report',
      },
      {
        type: 'Subcontractor',
        card: 'Subcontractor Performance Survey',
        reference: 'Sample Format - Subcon Performance Rating.docx',
        title: 'Subcontractor Performance Report',
      },
    ],
  );
});

test('formats category labels with safe, clamped percentages', () => {
  assert.equal(calculateCategoryPercentage(22, 30), (22 / 30) * 100);
  assert.equal(calculateCategoryPercentage(18, 20), 90);
  assert.equal(calculateCategoryPercentage(10, 0), 0);
  assert.equal(calculateCategoryPercentage(Number.NaN, 20), 0);
  assert.equal(calculateCategoryPercentage(Number.POSITIVE_INFINITY, 20), 0);
  assert.equal(calculateCategoryPercentage(-3, 20), 0);
  assert.equal(calculateCategoryPercentage(25, 20), 100);
  assert.equal(
    formatCategoryMetricLabel({ achieved: 22, maximum: 30, percentage: 73.3 }),
    '22.00 / 30.00 (73.30%)',
  );
});

for (const surveyType of surveyTypes) {
  test(`${surveyType} reports keep multiple companies isolated by ID`, () => {
    const survey = makeSurvey(surveyType);
    const companyA = makeCompany(`${surveyType}-a`, `${surveyType} Orion Services`, surveyType);
    const companyB = makeCompany(`${surveyType}-b`, `${surveyType} Delta Services`, surveyType);
    const weight = questionWeights[surveyType][0];
    const responses = [
      makeResponse({
        responseId: `${surveyType}-response-a`,
        survey,
        company: companyA,
        questionId: weight.questionId,
        question: `${surveyType} service quality`,
        category: weight.section,
        rating: weight.maxPoints,
      }),
      makeResponse({
        responseId: `${surveyType}-response-a`,
        survey,
        company: companyA,
        questionId: getOverallFeedbackQuestionId(surveyType),
        question: 'Overall feedback',
        category: 'Overall',
        rating: 'N/A',
        comment: 'Orion-specific feedback',
      }),
      makeResponse({
        responseId: `${surveyType}-response-b`,
        survey,
        company: companyB,
        questionId: weight.questionId,
        question: `${surveyType} service quality`,
        category: weight.section,
        rating: weight.maxPoints / 2,
      }),
      makeResponse({
        responseId: `${surveyType}-response-b`,
        survey,
        company: companyB,
        questionId: getOverallFeedbackQuestionId(surveyType),
        question: 'Overall feedback',
        category: 'Overall',
        rating: 'N/A',
        comment: 'Delta-specific feedback',
      }),
    ];
    responses[0].company = `${companyA.name} (historical display name)`;

    const reportA = createCompanyReportData({
      survey,
      companyId: companyA.id,
      partnerCompanies: [companyA, companyB],
      responses,
      generatedOn: 'September 11, 2026',
    });
    const reportB = createCompanyReportData({
      survey,
      companyId: companyB.id,
      partnerCompanies: [companyA, companyB],
      responses,
      generatedOn: 'September 11, 2026',
    });

    assert.equal(reportA.companyId, companyA.id);
    assert.equal(reportA.company, companyA.name);
    assert.equal(reportA.template.surveyType, surveyType);
    assert.equal(reportA.composite?.compositeScore, 100);
    assert.equal(reportA.composite?.evaluationCount, 1);
    assert.equal(reportA.questionRows[0]?.average, 100);
    assert.deepEqual(reportA.selectedCommentsList.map((comment) => comment.comment), ['Orion-specific feedback']);

    assert.equal(reportB.companyId, companyB.id);
    assert.equal(reportB.company, companyB.name);
    assert.equal(reportB.composite?.compositeScore, 50);
    assert.equal(reportB.questionRows[0]?.average, 50);
    assert.deepEqual(reportB.selectedCommentsList.map((comment) => comment.comment), ['Delta-specific feedback']);
    assert.notDeepEqual(reportA.categoryRows, reportB.categoryRows);
  });
}

test('creates a truthful no-data report without fake comments or invalid category values', () => {
  const survey = makeSurvey('Supplier');
  const company = makeCompany('supplier-empty', 'Supplier Empty Record', 'Supplier');
  const report = createCompanyReportData({
    survey,
    companyId: company.id,
    partnerCompanies: [company],
    responses: [],
    generatedOn: 'September 11, 2026',
  });

  assert.equal(report.composite, null);
  assert.deepEqual(report.questionRows, []);
  assert.deepEqual(report.selectedCommentsList, []);
  assert.equal(report.categoryRows.length, 5);
  report.categoryRows.forEach((category) => {
    assert.equal(category.achieved, 0);
    assert.equal(category.percentage, 0);
    assert.ok(category.maximum > 0);
    assert.doesNotMatch(formatCategoryMetricLabel(category), /NaN|Infinity|-\d/);
  });
});

test('loads selected overall comments by stable company ID and keeps preview and export selection consistent', () => {
  const survey = makeSurvey('Supplier');
  const company = makeCompany('supplier-current', 'Current Supplier Name', 'Supplier');
  const otherCompany = makeCompany('supplier-other', 'Other Supplier', 'Supplier');
  const commentQuestionId = getOverallFeedbackQuestionId('Supplier');
  const commentOne = makeResponse({
    responseId: 'respondent-one',
    survey,
    company,
    questionId: commentQuestionId,
    question: 'Overall feedback',
    category: 'Overall',
    rating: 'N/A',
    comment: 'Helpful and reliable service.',
  });
  const commentTwo = makeResponse({
    responseId: 'respondent-two',
    survey,
    company,
    questionId: commentQuestionId,
    question: 'Overall feedback',
    category: 'Overall',
    rating: 'N/A',
    comment: 'Please improve delivery updates.',
  });
  const oldNameComment = { ...commentOne, responseId: 'respondent-old-name', company: 'Historical Supplier Name' };
  const otherCompanyComment = { ...commentOne, responseId: 'respondent-other', companyId: otherCompany.id, company: otherCompany.name };
  const placeholderComment = { ...commentOne, responseId: 'respondent-placeholder', comment: ' Submitted successfully. ' };
  const archivedComment = { ...commentOne, responseId: 'respondent-archived', comment: 'Archived feedback', archived: true };
  const responses = [commentOne, commentTwo, oldNameComment, otherCompanyComment, placeholderComment, archivedComment];
  const commentQuery = {
    survey: { id: survey.id, surveyType: survey.surveyType },
    companyId: company.id,
    partnerCompanies: [company, otherCompany],
    responses,
    scopeToSurveyId: false,
  };

  const previewComments = getCompanyReportCommentResponses(commentQuery);
  assert.deepEqual(previewComments.map((response) => response.comment), [
    'Helpful and reliable service.',
    'Please improve delivery updates.',
    'Helpful and reliable service.',
  ]);
  assert.deepEqual(
    getCompanyReportCommentResponses({ ...commentQuery, selectedCommentIds: new Set(['respondent-two', 'respondent-old-name']) })
      .map((response) => response.responseId),
    ['respondent-two', 'respondent-old-name'],
  );

  const exported = createCompanyReportData({
    survey,
    companyId: company.id,
    partnerCompanies: [company, otherCompany],
    responses,
    scopeToSurveyId: false,
    includeComments: true,
    selectedCommentIds: new Set(previewComments.map((response) => response.responseId)),
  });
  assert.deepEqual(exported.selectedCommentsList.map((comment) => comment.comment), previewComments.map((response) => response.comment));
});

test('includes section remarks once per respondent and section in company reports', () => {
  const survey = makeSurvey('Subcontractor');
  const company = makeCompany('subcontractor-current', 'Current Subcontractor', 'Subcontractor');
  const otherCompany = makeCompany('subcontractor-other', 'Other Subcontractor', 'Subcontractor');
  const responses = [
    makeResponse({
      responseId: 'subcontractor-respondent-one',
      survey,
      company,
      questionId: 'Q-SUB-03',
      question: 'Documentation quality',
      category: 'Documentation',
      rating: 4,
      comment: 'Certificates were current.',
    }),
    // The importer repeats matrix section remarks across related subquestions.
    makeResponse({
      responseId: 'subcontractor-respondent-one',
      survey,
      company,
      questionId: 'Q-SUB-04',
      question: 'Documentation completeness',
      category: 'Documentation',
      rating: 4,
      comment: 'Certificates were current.',
    }),
    makeResponse({
      responseId: 'subcontractor-respondent-one',
      survey,
      company,
      questionId: 'Q-SUB-08',
      question: 'Delivery performance',
      category: 'Delivery',
      rating: 4,
      comment: 'Delivery updates could be more frequent.',
    }),
    makeResponse({
      responseId: 'subcontractor-respondent-one',
      survey,
      company,
      questionId: 'Q-SUB-09',
      question: 'Delivery documentation',
      category: 'Delivery',
      rating: 4,
      comment: '  ',
    }),
    makeResponse({
      responseId: 'subcontractor-respondent-other',
      survey,
      company: otherCompany,
      questionId: 'Q-SUB-03',
      question: 'Documentation quality',
      category: 'Documentation',
      rating: 4,
      comment: 'A different company comment.',
    }),
  ];
  const commentQuery = {
    survey: { id: survey.id, surveyType: survey.surveyType },
    companyId: company.id,
    partnerCompanies: [company, otherCompany],
    responses,
    scopeToSurveyId: false,
  };

  assert.deepEqual(getCompanyReportCommentResponses(commentQuery), []);
  const previewComments = getCompanyReportCommentResponses({ ...commentQuery, commentScope: 'all' });
  assert.deepEqual(
    previewComments.map(({ questionCategory, comment }) => [questionCategory, comment]),
    [
      ['Documentation', 'Certificates were current.'],
      ['Delivery', 'Delivery updates could be more frequent.'],
    ],
  );

  const selectedComment = previewComments[1];
  assert.ok(selectedComment);
  assert.deepEqual(
    getCompanyReportCommentResponses({
      ...commentQuery,
      commentScope: 'all',
      selectedCommentIds: new Set([getCompanyReportCommentId(previewComments[1])]),
    }).map((response) => response.comment),
    ['Delivery updates could be more frequent.'],
  );

  const exported = createCompanyReportData({
    survey,
    companyId: company.id,
    partnerCompanies: [company, otherCompany],
    responses,
    scopeToSurveyId: false,
    includeComments: true,
    commentScope: 'all',
    selectedCommentIds: new Set(previewComments.map(getCompanyReportCommentId)),
  });
  assert.deepEqual(
    exported.selectedCommentsList.map(({ questionCategory, comment }) => [questionCategory, comment]),
    previewComments.map(({ questionCategory, comment }) => [questionCategory, comment]),
  );
});

test('keeps report questions in form order instead of ranking them by score', () => {
  const survey = makeSurvey('Supplier');
  const company = makeCompany('supplier-ordered', 'Ordered Supplier', 'Supplier');
  const [firstWeight, secondWeight] = questionWeights.Supplier;
  const responses = [
    makeResponse({
      responseId: 'ordered-response',
      survey,
      company,
      questionId: firstWeight.questionId,
      questionNumber: 1,
      question: 'How would you rate first checkpoint?',
      category: firstWeight.section,
      rating: firstWeight.maxPoints / 2,
    }),
    makeResponse({
      responseId: 'ordered-response',
      survey,
      company,
      questionId: secondWeight.questionId,
      questionNumber: 2,
      question: 'How would you rate second checkpoint?',
      category: secondWeight.section,
      rating: secondWeight.maxPoints,
    }),
  ];

  const report = createCompanyReportData({
    survey,
    companyId: company.id,
    partnerCompanies: [company],
    responses,
  });

  assert.deepEqual(report.questionRows.map((row) => row.question), ['first checkpoint?', 'second checkpoint?']);
});

test('rejects missing, mismatched, and ambiguous company records', () => {
  const survey = makeSurvey('Courier');
  const courier = makeCompany('courier-1', 'Shared Legacy Name', 'Courier');
  const duplicate = makeCompany('courier-2', 'Shared Legacy Name', 'Courier');
  const supplier = makeCompany('supplier-1', 'Supplier Record', 'Supplier');

  assert.throws(
    () => createCompanyReportData({ survey, companyId: '', partnerCompanies: [courier], responses: [] }),
    (error: unknown) => error instanceof CompanyReportDataError && error.code === 'COMPANY_REQUIRED',
  );
  assert.throws(
    () => createCompanyReportData({ survey, companyId: supplier.id, partnerCompanies: [supplier], responses: [] }),
    (error: unknown) => error instanceof CompanyReportDataError && error.code === 'COMPANY_TYPE_MISMATCH',
  );

  const legacyResponse = makeResponse({
    responseId: 'legacy-response',
    survey,
    company: courier,
    questionId: questionWeights.Courier[0].questionId,
    question: 'Legacy question',
    category: questionWeights.Courier[0].section,
    rating: questionWeights.Courier[0].maxPoints,
  });
  delete legacyResponse.companyId;

  assert.throws(
    () => createCompanyReportData({
      survey,
      companyId: courier.id,
      partnerCompanies: [courier, duplicate],
      responses: [legacyResponse],
    }),
    (error: unknown) => error instanceof CompanyReportDataError && error.code === 'AMBIGUOUS_LEGACY_RESPONSES',
  );
});
