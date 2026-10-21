import { getLiveCategoryLabel } from '../../../data/questionCategories';
import {
  questionWeights,
  ScoreBand,
} from '../../../data/questionWeights';
import { CustomForm, PartnerCompany, SurveyResponse, SurveyType } from '../../../types/survey';
import { formatNumber, questionPerformance } from '../../analytics/domain/analytics';
import { CompanyComposite, computeCompanyComposite } from '../../evaluations/domain/scoring';
import { analyticsBands, formatAnalyticsScore, getAnalyticsBand } from '../../analytics/domain/rankings';
import { getReportTemplateConfig, ReportTemplateConfig } from './reportTemplateConfig';

export interface CompanyReportGraphSelection {
  bar: boolean;
  radar: boolean;
  trend: boolean;
  perQuestion: boolean;
}

export interface CompanyReportQuestionRow {
  question: string;
  average: number;
  responses: number;
}

export interface CompanyReportChartImages {
  bar?: string | null;
  radar?: string | null;
  trend?: string | null;
}

export interface CompanyReportComment {
  id: string;
  responseId: string;
  comment: string;
  questionCategory: string;
  respondentType: string;
  department?: string;
  submissionDate: string;
}

export type CompanyReportCommentScope = 'overall' | 'all';

export interface CompanyReportCategoryRow {
  category: string;
  achieved: number;
  maximum: number;
  percentage: number;
  responses: number;
  color: string;
}

export interface CompanyReportRatingBand extends ScoreBand {
  displayMinimum: number;
}

export interface CompanyReportData {
  surveyId: string;
  surveyType: SurveyType;
  companyId: string;
  company: string;
  reportingPeriod: string;
  template: ReportTemplateConfig;
  composite: CompanyComposite | null;
  volumeWeightedScore: number | null;
  volumeWeightedBand: ScoreBand | null;
  generatedOn: string;
  ratingScale: CompanyReportRatingBand[];
  categoryRows: CompanyReportCategoryRow[];
  graphs?: CompanyReportGraphSelection;
  includeComments: boolean;
  questionRows: CompanyReportQuestionRow[];
  chartImages?: CompanyReportChartImages;
  selectedCommentsList: CompanyReportComment[];
  logoDataUrl?: string;
}

export type CompanyReportDataErrorCode =
  | 'COMPANY_REQUIRED'
  | 'COMPANY_NOT_FOUND'
  | 'COMPANY_TYPE_MISMATCH'
  | 'AMBIGUOUS_LEGACY_RESPONSES';

export class CompanyReportDataError extends Error {
  constructor(
    public readonly code: CompanyReportDataErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CompanyReportDataError';
  }
}

export interface CreateCompanyReportDataInput {
  survey: Pick<CustomForm, 'id' | 'title' | 'surveyType'>;
  companyId: string;
  partnerCompanies: PartnerCompany[];
  responses: SurveyResponse[];
  reportingPeriod?: string;
  generatedOn?: string;
  graphs?: CompanyReportGraphSelection;
  includeComments?: boolean;
  commentScope?: CompanyReportCommentScope;
  selectedCommentIds?: ReadonlySet<string>;
  chartImages?: CompanyReportChartImages;
  logoDataUrl?: string;
  // Feedback Hub leaves this enabled. The standalone Company Report Builder
  // can opt out because its inputs already follow the selected reporting scope.
  scopeToSurveyId?: boolean;
  includeArchived?: boolean;
}

export interface GetCompanyReportCommentResponsesInput {
  survey: Pick<CustomForm, 'id' | 'surveyType'>;
  companyId: string;
  partnerCompanies: PartnerCompany[];
  responses: SurveyResponse[];
  scopeToSurveyId?: boolean;
  includeArchived?: boolean;
  commentScope?: CompanyReportCommentScope;
  selectedCommentIds?: ReadonlySet<string>;
}

function normalizeQuestionLabel(question: string): string {
  return question
    .replace('How satisfied are you with ', '')
    .replace('How would you rate ', '');
}

function buildQuestionRows(responses: SurveyResponse[]): CompanyReportQuestionRow[] {
  const orderByQuestion = new Map<string, number>();
  responses.forEach((response) => {
    const label = normalizeQuestionLabel(response.question);
    const current = orderByQuestion.get(label);
    if (current === undefined || response.questionNumber < current) {
      orderByQuestion.set(label, response.questionNumber);
    }
  });

  return questionPerformance(responses).sort((left, right) => {
    const leftOrder = orderByQuestion.get(left.question) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = orderByQuestion.get(right.question) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.question.localeCompare(right.question);
  });
}

function safeFinite(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function calculateCategoryPercentage(
  achieved: number | null | undefined,
  maximum: number | null | undefined,
): number {
  const safeMaximum = safeFinite(maximum);
  if (safeMaximum <= 0) return 0;
  const raw = (safeFinite(achieved) / safeMaximum) * 100;
  return Math.min(100, Math.max(0, raw));
}

export function formatReportNumber(value: number | null | undefined): string {
  return formatNumber(safeFinite(value));
}

export function formatReportPercentage(value: number | null | undefined): string {
  const clamped = Math.min(100, Math.max(0, safeFinite(value)));
  return `${formatReportNumber(clamped)}%`;
}

export function formatCategoryMetricLabel(category: Pick<CompanyReportCategoryRow, 'achieved' | 'maximum' | 'percentage'>): string {
  return `${formatReportNumber(category.achieved)} / ${formatReportNumber(category.maximum)} (${formatReportPercentage(category.percentage)})`;
}

export function getOverallFeedbackQuestionId(surveyType: SurveyType): string {
  switch (surveyType) {
    case 'Courier':
      return 'Q-CON-OVERALL-FEEDBACK';
    case 'Supplier':
      return 'Q-SUP-OVERALL-FEEDBACK';
    case 'Subcontractor':
      return 'Q-SUB-OVERALL-FEEDBACK';
  }
}

export function resolveReportCompany(
  companyId: string,
  surveyType: SurveyType,
  partnerCompanies: PartnerCompany[],
): PartnerCompany {
  if (!companyId) {
    throw new CompanyReportDataError('COMPANY_REQUIRED', 'Select a partner company before generating the report.');
  }

  const company = partnerCompanies.find((candidate) => candidate.id === companyId && !candidate.isArchived);
  if (!company) {
    throw new CompanyReportDataError('COMPANY_NOT_FOUND', 'The selected partner company record could not be found.');
  }
  if (company.type !== surveyType) {
    throw new CompanyReportDataError(
      'COMPANY_TYPE_MISMATCH',
      `The selected company is not assigned to the ${surveyType} survey type.`,
    );
  }
  return company;
}

/**
 * Response rows created by older builds store only the company name. The
 * partner record itself is always selected by ID. A name fallback is allowed
 * only for those legacy rows and only when that name/type pair identifies one
 * active partner record; otherwise generation stops instead of mixing data.
 */
export function filterResponsesForReport(
  survey: Pick<CustomForm, 'id' | 'surveyType'>,
  company: Pick<PartnerCompany, 'id' | 'name'>,
  partnerCompanies: PartnerCompany[],
  responses: SurveyResponse[],
  scopeToSurveyId = true,
  includeArchived = false,
): SurveyResponse[] {
  const legacyMatches = responses.some(
    (response) =>
      (includeArchived || !response.archived) &&
      response.surveyType === survey.surveyType &&
      !response.companyId &&
      response.company === company.name,
  );

  if (legacyMatches) {
    const sameNameRecords = partnerCompanies.filter(
      (candidate) =>
        !candidate.isArchived &&
        candidate.type === survey.surveyType &&
        candidate.name === company.name,
    );
    if (sameNameRecords.length !== 1) {
      throw new CompanyReportDataError(
        'AMBIGUOUS_LEGACY_RESPONSES',
        'Legacy survey responses cannot be matched to one unique partner record. Add company IDs before generating this report.',
      );
    }
  }

  return responses.filter((response) => {
    if ((!includeArchived && response.archived) || response.surveyType !== survey.surveyType) return false;
    if (scopeToSurveyId && response.surveyId && response.surveyId !== survey.id) return false;
    if (response.companyId) return response.companyId === company.id;
    return response.company === company.name;
  });
}

function selectCompanyReportCommentResponses(
  responses: SurveyResponse[],
  surveyType: SurveyType,
  commentScope: CompanyReportCommentScope = 'overall',
  selectedCommentIds?: ReadonlySet<string>,
): SurveyResponse[] {
  const overallQuestionId = getOverallFeedbackQuestionId(surveyType);
  const seenComments = new Set<string>();

  return responses.filter((response) => {
    const comment = typeof response.comment === 'string' ? response.comment.trim() : '';
    if (!comment || comment === 'Submitted successfully.') return false;
    if (commentScope === 'overall' && response.questionId !== overallQuestionId) return false;
    const isSelected = !selectedCommentIds ||
      selectedCommentIds.has(getCompanyReportCommentId(response)) ||
      selectedCommentIds.has(response.responseId);
    if (!isSelected) return false;

    // Subcontractor imports copy one matrix remark to each related subquestion.
    // Keep that shared text once per respondent and section in the report.
    const dedupeKey = JSON.stringify([response.responseId, response.questionCategory, comment]);
    if (seenComments.has(dedupeKey)) return false;
    seenComments.add(dedupeKey);

    return true;
  });
}

export function getCompanyReportCommentId(response: Pick<SurveyResponse, 'responseId' | 'questionId'>): string {
  return JSON.stringify([response.responseId, response.questionId]);
}

/** Uses the same company identity, scope, and selection rules as report exports. */
export function getCompanyReportCommentResponses(
  input: GetCompanyReportCommentResponsesInput,
): SurveyResponse[] {
  const company = resolveReportCompany(input.companyId, input.survey.surveyType, input.partnerCompanies);
  const reportResponses = filterResponsesForReport(
    input.survey,
    company,
    input.partnerCompanies,
    input.responses,
    input.scopeToSurveyId ?? true,
    input.includeArchived ?? false,
  );
  return selectCompanyReportCommentResponses(
    reportResponses,
    input.survey.surveyType,
    input.commentScope,
    input.selectedCommentIds,
  );
}

export function normalizeReportResponsesForCompany(
  companyName: string,
  responses: SurveyResponse[],
): SurveyResponse[] {
  return responses.map((response) =>
    response.company === companyName ? response : { ...response, company: companyName },
  );
}

export function computeReportComposite(
  companyName: string,
  surveyType: SurveyType,
  responses: SurveyResponse[],
): CompanyComposite | null {
  return computeCompanyComposite(
    companyName,
    surveyType,
    normalizeReportResponsesForCompany(companyName, responses),
  );
}

function buildCategoryRows(
  surveyType: SurveyType,
  composite: CompanyComposite | null,
  colors: readonly string[],
): CompanyReportCategoryRow[] {
  const maxima = new Map<string, number>();
  questionWeights[surveyType].forEach((weight) => {
    maxima.set(weight.section, (maxima.get(weight.section) ?? 0) + Math.max(0, safeFinite(weight.maxPoints)));
  });

  return [...maxima.entries()].map(([canonicalCategory, maximum], index) => {
    const category = getLiveCategoryLabel(surveyType, canonicalCategory);
    const section = composite?.sections.find((candidate) => candidate.section === category);
    const sectionPercentage = calculateCategoryPercentage(section?.percent, 100);
    const achieved = (maximum * sectionPercentage) / 100;
    const percentage = sectionPercentage;
    return {
      category,
      achieved,
      maximum,
      percentage,
      responses: section?.responses ?? 0,
      color: colors[index % colors.length] ?? '#4F81BD',
    };
  });
}

function buildRatingScale(surveyType: SurveyType): CompanyReportRatingBand[] {
  return analyticsBands[surveyType].map((band) => ({
    ...band,
    displayMinimum: band.min,
  }));
}

export function createCompanyReportData(input: CreateCompanyReportDataInput): CompanyReportData {
  const {
    survey,
    companyId,
    partnerCompanies,
    responses,
    graphs,
    chartImages,
    logoDataUrl,
  } = input;
  const company = resolveReportCompany(companyId, survey.surveyType, partnerCompanies);
  const scopeToSurveyId = input.scopeToSurveyId ?? true;
  const reportResponses = filterResponsesForReport(
    survey,
    company,
    partnerCompanies,
    responses,
    scopeToSurveyId,
    input.includeArchived ?? false,
  );
  // The stable company ID is authoritative. Normalize a stale historical
  // display name only for this pure scoring call so partner renames do not
  // make otherwise valid ID-scoped responses disappear.
  const composite = computeReportComposite(company.name, survey.surveyType, reportResponses);
  // Analytics ranks the canonical rubric composite, not a peer confidence adjustment.
  const volumeWeightedScore = composite?.hasScore ? composite.compositeScore : null;
  const volumeWeightedBand = composite?.hasScore && volumeWeightedScore !== null
    ? getAnalyticsBand(survey.surveyType, volumeWeightedScore)
    : composite?.band ?? null;
  const template = getReportTemplateConfig(survey.surveyType);
  const includeComments = input.includeComments ?? true;
  const comments = includeComments
    ? selectCompanyReportCommentResponses(
        reportResponses,
        survey.surveyType,
        input.commentScope,
        input.selectedCommentIds,
      )
        .map((response) => ({
          id: getCompanyReportCommentId(response),
          responseId: response.responseId,
          comment: response.comment,
          questionCategory: response.questionCategory,
          respondentType: response.respondentType,
          department: response.department,
          submissionDate: response.submissionDate,
        }))
    : [];

  return {
    surveyId: survey.id,
    surveyType: survey.surveyType,
    companyId: company.id,
    company: company.name,
    reportingPeriod: input.reportingPeriod?.trim() || survey.title,
    template,
    composite,
    volumeWeightedScore,
    volumeWeightedBand,
    generatedOn:
      input.generatedOn ||
      new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    ratingScale: buildRatingScale(survey.surveyType),
    categoryRows: buildCategoryRows(survey.surveyType, composite, template.chartColors),
    graphs,
    includeComments,
    questionRows: buildQuestionRows(reportResponses),
    chartImages,
    selectedCommentsList: comments,
    logoDataUrl,
  };
}

export function getReportAverageText(data: CompanyReportData): string {
  return data.composite?.hasScore && data.volumeWeightedScore !== null
    ? formatAnalyticsScore(data.surveyType, data.volumeWeightedScore)
    : 'N/A';
}
