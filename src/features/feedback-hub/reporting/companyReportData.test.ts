import assert from 'node:assert/strict';
import test from 'node:test';
import { questionWeights } from '../../../data/questionWeights';
import { CustomForm, PartnerCompany, SurveyResponse, SurveyType } from '../../../types/survey';
import {
  calculateCategoryPercentage,
  CompanyReportDataError,
  createCompanyReportData,
  formatCategoryMetricLabel,
  getOverallFeedbackQuestionId,
} from './companyReportData';
import { REPORT_TEMPLATE_BY_SURVEY_TYPE } from './reportTemplateConfig';

const surveyTypes: SurveyType[] = ['Courier', 'Supplier', 'Subcontractor'];

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
        card: 'Courier Satisfaction Evaluation',
        reference: 'Sample Format - Courier Performance Rating.docx',
        title: 'Courier Performance Report',
      },
      {
        type: 'Supplier',
        card: 'Supplier Quality Evaluation',
        reference: 'Sample Format - Supplier Performance Rating.docx',
        title: 'Supplier Performance Report',
      },
      {
        type: 'Subcontractor',
        card: 'Subcontractor Performance Evaluation',
        reference: 'Sample Format - Subcon Performance Rating.docx',
        title: 'Subcontractor Performance Report',
      },
    ],
  );
});

test('formats category labels with safe, clamped percentages', () => {
  assert.equal(calculateCategoryPercentage(22, 30), 73.3);
  assert.equal(calculateCategoryPercentage(18, 20), 90);
  assert.equal(calculateCategoryPercentage(10, 0), 0);
  assert.equal(calculateCategoryPercentage(Number.NaN, 20), 0);
  assert.equal(calculateCategoryPercentage(Number.POSITIVE_INFINITY, 20), 0);
  assert.equal(calculateCategoryPercentage(-3, 20), 0);
  assert.equal(calculateCategoryPercentage(25, 20), 100);
  assert.equal(
    formatCategoryMetricLabel({ achieved: 22, maximum: 30, percentage: 73.3 }),
    '22 / 30 (73.3%)',
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
