import { formatCompositeScore, getBand, ratingBands, type ScoreBand } from '../../../data/questionWeights';
import { SurveyResponse, SurveyType } from '../../../types/survey';
import { computeRankScore } from './analytics';
import { computeCompanyComposite, getLeaderboard } from '../../evaluations/domain/scoring';

export interface CompanyRankingCandidate {
  name: string;
  scorePercentage: number;
  count: number;
  type: SurveyType;
}

export type RankedCompany<T extends CompanyRankingCandidate> = T & { rankScore: number };

export interface AnalyticsCompanySummary extends CompanyRankingCandidate {
  average: number;
  rankScore: number;
}

const subcontractorBands: ScoreBand[] = [
  { label: 'Top Performer', min: 1.5, hex: '#22c55e' },
  { label: 'Good Performer', min: 1.0, hex: '#fb923c' },
  { label: 'Marginal Performer', min: 0.5, hex: '#3b82f6' },
  { label: 'Poor Performer', min: 0, hex: '#dc2626' },
];

export const analyticsBands: Record<SurveyType, ScoreBand[]> = {
  ...ratingBands,
  Subcontractor: subcontractorBands,
};

export function getAnalyticsScore(surveyType: SurveyType, percentScore: number): number {
  return surveyType === 'Subcontractor'
    ? Math.round(percentScore / 5 + Number.EPSILON) / 10
    : formatCompositeScore(surveyType, percentScore).value;
}

export function getAnalyticsBand(surveyType: SurveyType, percentScore: number): ScoreBand {
  if (surveyType !== 'Subcontractor') return getBand(surveyType, percentScore);
  const score = getAnalyticsScore(surveyType, percentScore);
  return subcontractorBands.find((band) => score >= band.min) ?? subcontractorBands[3];
}

/**
 * Uses the canonical company aggregation and ranking rules for Analytics.
 * Scores are the normalized rubric composites returned by the canonical
 * scoring boundary. All categories therefore share one 0-100 ranking axis.
 */
export function getAnalyticsCompanyRankings(
  responses: SurveyResponse[],
  surveyTypes: SurveyType[],
): AnalyticsCompanySummary[] {
  const summaries = surveyTypes.flatMap((type) => {
    const companies = getLeaderboard(responses, type);

    return companies
      .filter((company) => company.hasScore)
      .map((company) => ({
        name: company.company,
        type: company.surveyType,
        average: company.compositeScore,
        scorePercentage: company.compositeScore,
        count: company.evaluationCount,
        rankScore: company.compositeScore,
      }));
  });

  return summaries.sort((left, right) => {
    if (right.rankScore !== left.rankScore) return right.rankScore - left.rankScore;
    if (right.count !== left.count) return right.count - left.count;
    return left.name.localeCompare(right.name);
  });
}

export const ANALYTICS_PAGE_SIZE = 20;

export interface PaginatedAnalyticsItems<T> {
  items: T[];
  currentPage: number;
  totalPages: number;
  startIndex: number;
}

export function paginateAnalyticsItems<T>(
  items: T[],
  requestedPage: number,
  pageSize = ANALYTICS_PAGE_SIZE,
): PaginatedAnalyticsItems<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(0, requestedPage), totalPages - 1);
  const startIndex = currentPage * pageSize;

  return {
    items: items.slice(startIndex, startIndex + pageSize),
    currentPage,
    totalPages,
    startIndex,
  };
}

export function paginateCompanyRankings<T>(
  companies: T[],
  requestedPage: number,
  pageSize = ANALYTICS_PAGE_SIZE,
): PaginatedAnalyticsItems<T> {
  return paginateAnalyticsItems(companies, requestedPage, pageSize);
}

/**
 * Applies the volume-weighted ranking contract to company summaries.
 * A single-type list compares the rounded, user-visible score before using
 * evaluation volume as a tiebreaker; mixed-type lists stay on the shared
 * 0-100 scale because Subcontractors display in native 0-2 units.
 */
export function rankCompanySummaries<T extends CompanyRankingCandidate>(
  candidates: T[],
): RankedCompany<T>[] {
  const uniformType = candidates.length > 0 && candidates.every((candidate) => candidate.type === candidates[0].type)
    ? candidates[0].type
    : null;
  const visibleScore = (score: number) => uniformType ? formatCompositeScore(uniformType, score).value : score;

  const peers = candidates.map((candidate) => ({ score: candidate.scorePercentage, count: candidate.count }));
  return candidates
    .map((candidate) => ({
      ...candidate,
      rankScore: computeRankScore(candidate.scorePercentage, candidate.count, peers),
    }))
    .sort((left, right) => {
      const scoreDifference = visibleScore(right.rankScore) - visibleScore(left.rankScore);
      if (scoreDifference !== 0) return scoreDifference;
      if (right.count !== left.count) return right.count - left.count;
      if (right.rankScore !== left.rankScore) return right.rankScore - left.rankScore;
      return left.name.localeCompare(right.name);
    });
}

export interface CompanyPerformanceDatum {
  company: string;
  /** The value plotted and used for ordering in the selected ranking mode. */
  score: number;
  rawScore: number;
  evaluationCount: number;
  surveyType: SurveyType;
}

/**
 * Builds volume-weighted best/least-performing chart data once from the
 * filtered response slice. Grouping first avoids repeatedly scanning every
 * response for every company and survey type.
 */
export function getCompanyPerformanceRanking(
  responses: SurveyResponse[],
  activeSurveyTypes: SurveyType[],
  direction: 'highest' | 'lowest',
  limit: number,
): CompanyPerformanceDatum[] {
  const allowedTypes = new Set(activeSurveyTypes);
  const grouped = new Map<string, Map<SurveyType, SurveyResponse[]>>();

  responses.forEach((response) => {
    if (!allowedTypes.has(response.surveyType)) return;
    const byType = grouped.get(response.company) ?? new Map<SurveyType, SurveyResponse[]>();
    const companyResponses = byType.get(response.surveyType) ?? [];
    companyResponses.push(response);
    byType.set(response.surveyType, companyResponses);
    grouped.set(response.company, byType);
  });

  const rawStats = [...grouped.entries()].flatMap(([company, byType]) => {
    const composites = activeSurveyTypes
      .map((surveyType) => {
        const companyResponses = byType.get(surveyType);
        return companyResponses
          ? computeCompanyComposite(company, surveyType, companyResponses)
          : null;
      })
      .filter((composite): composite is NonNullable<typeof composite> => composite !== null && composite.hasScore);

    if (composites.length === 0) return [];

    const rawScore = Number((composites.reduce((sum, composite) => sum + composite.compositeScore, 0) / composites.length).toFixed(1));
    return [{
      company,
      rawScore,
      evaluationCount: composites.reduce((sum, composite) => sum + composite.evaluationCount, 0),
      surveyType: composites[0].surveyType,
    }];
  });

  const peers = rawStats.map((item) => ({ score: item.rawScore, count: item.evaluationCount }));
  return rawStats
    .map((item) => ({
      ...item,
      score: computeRankScore(item.rawScore, item.evaluationCount, peers),
    }))
    .sort((left, right) => {
      const scoreDifference = direction === 'highest'
        ? right.score - left.score
        : left.score - right.score;
      if (scoreDifference !== 0) return scoreDifference;
      if (right.evaluationCount !== left.evaluationCount) return right.evaluationCount - left.evaluationCount;
      return left.company.localeCompare(right.company);
    })
    .slice(0, limit);
}
