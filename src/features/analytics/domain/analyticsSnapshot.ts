import type { ArchiveSeries, PartnerCompany, SurveyResponse, SurveyType } from '../../../types/survey';
import { averageRating, hasAnsweredItem, monthlyTrend, questionPerformance, responseVolume, seriesTrend, submissionCount, submissionScores, yearlyTrend } from './analytics';
import { getAnalyticsCompanyRankings } from './rankings';
import { getCompanyTrend, getCompanyTrendBySeries, getLeaderboard, getPeerAverageTrend, getPeerAverageTrendBySeries, getSectionPeerAverages } from '../../evaluations/domain/scoring';

// Prepare the local Analytics view from the caller's authorized response scope.
function buildAnalyticsSummary(responses: SurveyResponse[], types: SurveyType[], partners: PartnerCompany[], series: ArchiveSeries[]) {
  const companies = getAnalyticsCompanyRankings(responses, types);
  const evaluated = new Set(responses.filter(hasAnsweredItem).map((r) => r.companyId || `${r.surveyType}:${r.company}`));
  const eligible = partners.filter((p) => !p.isArchived && p.type !== 'Uncategorized' && types.includes(p.type));
  return {
    hasResponses: responses.length > 0,
    totalSubmissions: submissionCount(responses),
    scoredSubmissionCount: submissionScores(responses).length,
    averageScore: averageRating(responses),
    evaluatedPartnerCount: eligible.length ? eligible.filter((p) => evaluated.has(p.id) || evaluated.has(`${p.type}:${p.name}`)).length : companies.length,
    partnerDenominator: eligible.length || companies.length,
    companies,
    questions: questionPerformance(responses),
    volume: responseVolume(responses, types),
    monthly: monthlyTrend(responses),
    yearly: yearlyTrend(responses),
    series: seriesTrend(responses, series),
  };
}

function buildCompanyAnalysis(responses: SurveyResponse[], types: SurveyType[], series: ArchiveSeries[]) {
  return types.map((type) => ({
    type,
    peerAverages: getSectionPeerAverages(responses, type),
    companies: getLeaderboard(responses, type).map((composite) => ({
      company: composite.company,
      sections: composite.sections.map(({ section, percent }) => ({ section, percent })),
      naRate: composite.naRate,
      stdDev: composite.stdDev,
      ratedQuestionCount: composite.ratedQuestionCount,
      lowestQuestions: questionPerformance(responses.filter((r) => r.company === composite.company && r.surveyType === type)).sort((a, b) => a.average - b.average).slice(0, 3),
      monthly: getCompanyTrend(responses, composite.company, type),
      peerMonthly: getPeerAverageTrend(responses, type, composite.company),
      series: getCompanyTrendBySeries(responses, composite.company, type, series),
      peerSeries: getPeerAverageTrendBySeries(responses, type, series, composite.company),
    })),
  }));
}

// Category views reuse the same company calculations; no scoring rules change.
export function buildAnalyticsSnapshot(responses: SurveyResponse[], types: SurveyType[], partners: PartnerCompany[], series: ArchiveSeries[]) {
  return { ...buildAnalyticsSummary(responses, types, partners, series), analysis: buildCompanyAnalysis(responses, types, series) };
}

export type AnalyticsSnapshot = ReturnType<typeof buildAnalyticsSnapshot>;
export type CompanyAnalysisData = AnalyticsSnapshot['analysis'];
