import { getBand, getQuestionMaxPoints, isScoredQuestion, ratingBands } from '../../../data/questionWeights';
import type { SurveyResponse, SurveyType } from '../../../types/survey';
import {
  averageRating,
  categoryPerformance,
  numericRating,
} from '../../analytics/domain/analytics';
import { getLeaderboard, groupCompanyResponses } from '../../evaluations/domain/scoring';

export interface ReportingPeriodBounds {
  from: string;
  to: string;
}

export interface PeriodChangeMetric {
  key: string;
  kind: 'Category' | 'Partner';
  label: string;
  surveyType: SurveyType;
  previousScore: number;
  currentScore: number;
  delta: number;
  previousResponses: number;
  currentResponses: number;
}

export type PeriodSnapshotMetric = Pick<PeriodChangeMetric, 'key' | 'kind' | 'label' | 'surveyType'> & {
  score: number;
  responses: number;
};

export type PeriodComparisonAvailability = 'available' | 'full-history' | 'no-current-scores' | 'no-previous-scores';

export interface PeriodComparisonInsight {
  available: boolean;
  availability: PeriodComparisonAvailability;
  contextMessage: string;
  currentPeriod: string;
  previousPeriod?: string;
  currentScore?: number;
  previousScore?: number;
  delta?: number;
  currentResponses: number;
  previousResponses: number;
  matchedChanges: PeriodChangeMetric[];
  improvements: PeriodChangeMetric[];
  declines: PeriodChangeMetric[];
  currentSnapshot: {
    scoredEvaluations: number;
    strongest?: PeriodSnapshotMetric;
    weakestCategories: PeriodSnapshotMetric[];
    lowestPartners: PeriodSnapshotMetric[];
  };
}

export interface FocusPriority {
  category: string;
  surveyType: SurveyType;
  question: string;
  questionScore: number;
  categoryScore: number;
  responses: number;
  affectedPartners: number;
  categoryDelta?: number;
  discussionPoints: string[];
}

export interface FocusInsight {
  priorities: FocusPriority[];
  reason?: string;
}

export interface PortfolioSpreadInsight {
  totalPartners: number;
  unsatisfactoryPartners: number;
  unsatisfactoryPercentage: number;
  bands: { label: string; count: number; percentage: number; color: string }[];
  categories: {
    category: string;
    surveyType: SurveyType;
    average: number;
    evaluatedPartners: number;
    unsatisfactoryPartners: number;
    affectedPercentage: number;
  }[];
}

function dateFromIso(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function previousEqualDurationPeriod(current: ReportingPeriodBounds): ReportingPeriodBounds {
  const currentStart = dateFromIso(current.from).getTime();
  const currentEnd = dateFromIso(current.to).getTime();
  const durationDays = Math.floor((currentEnd - currentStart) / 86_400_000) + 1;
  const previousEnd = new Date(currentStart - 86_400_000);
  const previousStart = new Date(previousEnd.getTime() - (durationDays - 1) * 86_400_000);
  return { from: isoDate(previousStart), to: isoDate(previousEnd) };
}

export function filterByPeriod(responses: SurveyResponse[], period: ReportingPeriodBounds): SurveyResponse[] {
  return responses.filter((response) => {
    const submitted = response.submissionDate.slice(0, 10);
    return submitted >= period.from && submitted <= period.to;
  });
}

function displayPeriod(period: ReportingPeriodBounds): string {
  const format = (value: string) => dateFromIso(value).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
  return `${format(period.from)} – ${format(period.to)}`;
}

function normalizedCompanyKey(companyId: string | undefined, company: string, surveyType: SurveyType): string {
  return `${surveyType}:${companyId ? `id:${companyId}` : `name:${company.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')}`}`;
}

function scoredSubmissionCount(responses: SurveyResponse[]): number {
  return new Set(scoredResponsesOnly(responses).map((response) => response.responseId)).size;
}

function scoredResponsesOnly(responses: SurveyResponse[]): SurveyResponse[] {
  return responses.filter((response) => isScoredQuestion(response.surveyType, response.questionId) && numericRating(response.rating) !== null);
}

function categoryMetrics(responses: SurveyResponse[]) {
  return [...new Set(responses.map((response) => response.surveyType))].flatMap((surveyType) => {
    const scoped = responses.filter((response) => response.surveyType === surveyType);
    return categoryPerformance(scoped)
      .filter((item) => item.responses > 0)
      .map((item) => ({
        key: `${surveyType}:category:${item.category}`,
        kind: 'Category' as const,
        label: item.category,
        surveyType,
        score: item.average,
        responses: scoredSubmissionCount(scoped.filter((response) => response.questionCategory === item.category)),
      }))
      .filter((item) => item.responses > 0);
  });
}

function partnerMetrics(responses: SurveyResponse[]) {
  return [...new Set(responses.map((response) => response.surveyType))].flatMap((surveyType) => {
    const responseCounts = new Map(
      [...groupCompanyResponses(responses, surveyType).values()].map((group) => {
        const representative = group.responses[0];
        return [normalizedCompanyKey(group.companyId, representative.company, surveyType), scoredSubmissionCount(group.responses)] as const;
      }),
    );
    return getLeaderboard(responses, surveyType)
      .filter((company) => company.hasScore)
      .map((company) => ({
        key: normalizedCompanyKey(company.companyId, company.company, surveyType),
        kind: 'Partner' as const,
        label: company.company,
        surveyType,
        score: company.compositeScore,
        responses: responseCounts.get(normalizedCompanyKey(company.companyId, company.company, surveyType)) ?? 0,
      }));
  });
}

export function buildPeriodComparisonInsight(
  currentResponses: SurveyResponse[],
  previousResponses: SurveyResponse[],
  currentPeriod: ReportingPeriodBounds | null,
  currentPeriodLabel = 'Selected period',
): PeriodComparisonInsight {
  const currentCount = scoredSubmissionCount(currentResponses);
  const previousCount = scoredSubmissionCount(previousResponses);
  const currentMetrics = [...categoryMetrics(currentResponses), ...partnerMetrics(currentResponses)]
    .filter((metric) => Number.isFinite(metric.score))
    .map((metric) => ({ key: metric.key, kind: metric.kind, label: metric.label, surveyType: metric.surveyType, score: Number(metric.score.toFixed(2)), responses: metric.responses }));
  const snapshotCategories = currentMetrics.filter((metric) => metric.kind === 'Category').sort((a, b) => a.score - b.score);
  const snapshotPartners = currentMetrics.filter((metric) => metric.kind === 'Partner').sort((a, b) => a.score - b.score);
  const snapshot = {
    scoredEvaluations: currentCount,
    strongest: [...currentMetrics].sort((a, b) => b.score - a.score)[0],
    weakestCategories: snapshotCategories.slice(0, 3),
    lowestPartners: snapshotPartners.slice(0, 3),
  };
  const currentAverage = currentCount ? averageRating(scoredResponsesOnly(currentResponses)) : undefined;
  const empty = {
    currentPeriod: currentPeriod ? displayPeriod(currentPeriod) : currentPeriodLabel,
    currentResponses: currentCount,
    previousResponses: previousCount,
    currentScore: currentAverage === undefined ? undefined : Number(currentAverage.toFixed(2)),
    currentSnapshot: snapshot,
    matchedChanges: [] as PeriodChangeMetric[],
    improvements: [] as PeriodChangeMetric[],
    declines: [] as PeriodChangeMetric[],
  };

  if (!currentPeriod) {
    return {
      ...empty,
      available: false,
      availability: 'full-history',
      contextMessage: 'This view covers the full response set selected for the presentation. Current results are summarized below; no earlier, non-overlapping window is present in this selection.',
    };
  }
  if (!currentCount) {
    return {
      ...empty,
      available: false,
      availability: 'no-current-scores',
      contextMessage: 'No numeric scored evaluations were recorded in this reporting window. Score comparisons and score-based findings are omitted.',
      previousPeriod: displayPeriod(previousEqualDurationPeriod(currentPeriod)),
    };
  }
  if (!previousCount) {
    return {
      ...empty,
      available: false,
      availability: 'no-previous-scores',
      contextMessage: `This reporting window contains ${currentCount} scored evaluations. No scored evaluations were recorded in the preceding equal-length window; current results are summarized below.`,
      previousPeriod: displayPeriod(previousEqualDurationPeriod(currentPeriod)),
    };
  }

  const currentScore = currentAverage ?? 0;
  const previousScore = averageRating(scoredResponsesOnly(previousResponses));
  const currentByKey = new Map(currentMetrics.map((item) => [item.key, item]));
  const previousByKey = new Map([...categoryMetrics(previousResponses), ...partnerMetrics(previousResponses)].map((item) => [item.key, item]));
  const matched: PeriodChangeMetric[] = [];

  currentByKey.forEach((current, key) => {
    const previous = previousByKey.get(key);
    if (!previous) return;
    const delta = Number((current.score - previous.score).toFixed(2));
    matched.push({
      key,
      kind: current.kind,
      label: current.label,
      surveyType: current.surveyType,
      previousScore: Number(previous.score.toFixed(2)),
      currentScore: Number(current.score.toFixed(2)),
      delta,
      previousResponses: previous.responses,
      currentResponses: current.responses,
    });
  });

  return {
    ...empty,
    available: true,
    availability: 'available',
    contextMessage: '',
    currentPeriod: displayPeriod(currentPeriod),
    previousPeriod: displayPeriod(previousEqualDurationPeriod(currentPeriod)),
    currentScore: Number(currentScore.toFixed(2)),
    previousScore: Number(previousScore.toFixed(2)),
    delta: Number((currentScore - previousScore).toFixed(2)),
    matchedChanges: matched,
    improvements: matched.filter((item) => item.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3),
    declines: matched.filter((item) => item.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3),
  };
}

interface QuestionMetric {
  category: string;
  surveyType: SurveyType;
  question: string;
  score: number;
  responses: number;
  affectedPartners: number;
}

function questionMetrics(responses: SurveyResponse[]): QuestionMetric[] {
  const questions = new Map<string, SurveyResponse[]>();
  responses.forEach((response) => {
    if (!response.questionCategory || !response.question.trim()) return;
    const key = `${response.surveyType}:${response.questionId}:${response.question}`;
    questions.set(key, [...(questions.get(key) ?? []), response]);
  });

  return [...questions.values()].flatMap((rows) => {
    const first = rows[0];
    const maxPoints = first ? getQuestionMaxPoints(first.surveyType, first.questionId) : 0;
    const scoredRows = rows.filter((row) => numericRating(row.rating) !== null);
    if (!first || maxPoints <= 0 || !scoredRows.length) return [];
    const average = scoredRows.reduce((sum, row) => sum + (numericRating(row.rating) ?? 0) / maxPoints * 100, 0) / scoredRows.length;
    const byPartner = new Map<string, SurveyResponse[]>();
    scoredRows.forEach((row) => {
      const key = normalizedCompanyKey(row.companyId, row.company, row.surveyType);
      byPartner.set(key, [...(byPartner.get(key) ?? []), row]);
    });
    const affectedPartners = [...byPartner.values()].filter((partnerRows) => {
      const companyAverage = partnerRows.reduce((sum, row) => sum + (numericRating(row.rating) ?? 0) / maxPoints * 100, 0) / partnerRows.length;
      return getBand(first.surveyType, companyAverage).label === 'Unsatisfactory';
    }).length;
    return [{
      category: first.questionCategory,
      surveyType: first.surveyType,
      question: first.question,
      score: average,
      responses: scoredSubmissionCount(scoredRows),
      affectedPartners,
    }];
  });
}

export function buildFocusInsight(
  responses: SurveyResponse[],
  comparison?: PeriodComparisonInsight,
): FocusInsight {
  const categoryChanges = new Map(
    (comparison?.available ? comparison.matchedChanges : [])
      .filter((change) => change.kind === 'Category')
      .map((change) => [`${change.surveyType}:${change.label}`, change.delta]),
  );
  const categoryRows = categoryMetrics(responses);
  const questions = questionMetrics(responses);
  const candidates = questions.flatMap((question) => {
    const category = categoryRows.find((item) => item.surveyType === question.surveyType && item.label === question.category);
    const categoryDelta = categoryChanges.get(`${question.surveyType}:${question.category}`);
    const isBelowSatisfactory = getBand(question.surveyType, question.score).label === 'Unsatisfactory'
      || Boolean(category && getBand(category.surveyType, category.score).label === 'Unsatisfactory');
    if (!isBelowSatisfactory && !(categoryDelta !== undefined && categoryDelta < 0)) return [];
    return [{
      category: question.category,
      surveyType: question.surveyType,
      question: question.question,
      questionScore: question.score,
      categoryScore: category?.score ?? question.score,
      responses: question.responses,
      affectedPartners: question.affectedPartners,
      categoryDelta,
      discussionPoints: question.affectedPartners > 0
        ? [
          `Review the responses behind “${question.question}” with the ${question.affectedPartners} affected partner${question.affectedPartners === 1 ? '' : 's'}.`,
          `Ask what specific change would improve ${question.category} in the next evaluation period.`,
        ]
        : [
          `Review the responses behind “${question.question}” to understand the low rating.`,
          `Check whether the ${question.category} result is shared across partners or limited to individual submissions.`,
        ],
    }];
  });
  const priorities = candidates
    .sort((a, b) => a.questionScore - b.questionScore || b.affectedPartners - a.affectedPartners || a.category.localeCompare(b.category))
    .slice(0, 3);
  return {
    priorities,
    reason: priorities.length
      ? undefined
      : questions.length
        ? 'Current scored results do not identify a question or category in the existing Unsatisfactory band.'
        : 'No scored question results were recorded for this reporting window.',
  };
}

export function buildPortfolioSpreadInsight(responses: SurveyResponse[]): PortfolioSpreadInsight {
  const surveyTypes = [...new Set(responses.map((response) => response.surveyType))];
  const partners = surveyTypes.flatMap((surveyType) => getLeaderboard(responses, surveyType).filter((company) => company.hasScore));
  const totalPartners = partners.length;
  const unsatisfactoryPartners = partners.filter((company) => company.band.label === 'Unsatisfactory').length;
  const bands = [...new Map(surveyTypes.flatMap((surveyType) => ratingBands[surveyType]).map((band) => [band.label, band])).values()]
    .map((band) => {
      const count = partners.filter((company) => company.band.label === band.label).length;
      return { label: band.label, count, percentage: totalPartners ? count / totalPartners * 100 : 0, color: band.hex };
    });
  const categoryGroups = new Map<string, { category: string; surveyType: SurveyType; scores: number[]; below: number }>();
  partners.forEach((company) => {
    company.sections.filter((section) => section.responses > 0).forEach((section) => {
      const key = `${company.surveyType}:${section.section}`;
      const group = categoryGroups.get(key) ?? { category: section.section, surveyType: company.surveyType, scores: [], below: 0 };
      group.scores.push(section.percent);
      if (getBand(company.surveyType, section.percent).label === 'Unsatisfactory') group.below += 1;
      categoryGroups.set(key, group);
    });
  });
  const categories = [...categoryGroups.values()].map((group) => ({
    category: group.category,
    surveyType: group.surveyType,
    average: group.scores.reduce((sum, score) => sum + score, 0) / group.scores.length,
    evaluatedPartners: group.scores.length,
    unsatisfactoryPartners: group.below,
    affectedPercentage: group.scores.length ? group.below / group.scores.length * 100 : 0,
  })).sort((a, b) => b.unsatisfactoryPartners - a.unsatisfactoryPartners || a.average - b.average);
  return {
    totalPartners,
    unsatisfactoryPartners,
    unsatisfactoryPercentage: totalPartners ? unsatisfactoryPartners / totalPartners * 100 : 0,
    bands,
    categories,
  };
}
