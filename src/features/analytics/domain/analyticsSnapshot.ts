import type { ArchiveSeries, PartnerCompany, SurveyResponse, SurveyType } from '../../../types/survey';
import { averageRating, hasAnsweredItem, monthlyTrend, questionPerformance, responseVolume, seriesTrend, submissionCount, submissionScores, yearlyTrend } from './analytics';
import { getAnalyticsCompanyRankings } from './rankings';
import { getCompanyTrend, getCompanyTrendBySeries, getLeaderboard, getPeerAverageTrend, getPeerAverageTrendBySeries, getSectionPeerAverages } from '../../evaluations/domain/scoring';

// Only aggregate fields cross the API boundary; never return a response row.
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

export function buildAnalyticsViews(responses: SurveyResponse[], types: SurveyType[], partners: PartnerCompany[], series: ArchiveSeries[]) {
  const all = buildAnalyticsSnapshot(responses, types, partners, series);
  return {
    all,
    categories: types.map((type) => ({
      type,
      snapshot: {
        ...buildAnalyticsSummary(responses.filter((response) => response.surveyType === type), [type], partners, series),
        analysis: all.analysis.filter((category) => category.type === type),
      },
    })),
  };
}

export type AnalyticsViews = ReturnType<typeof buildAnalyticsViews>;

export function parseAnalyticsViews(value: unknown): AnalyticsViews {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Analytics views.');
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.categories)) throw new Error('Invalid Analytics categories.');
  const all = parseAnalyticsSnapshot(record);
  const categories = record.categories.map((value: unknown): AnalyticsViews['categories'][number] => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Analytics category.');
    const category = value as Record<string, unknown>;
    const type = category.type;
    if (type !== 'Courier' && type !== 'Supplier' && type !== 'Subcontractor') throw new Error('Invalid Analytics category.');
    const snapshot = parseAnalyticsSnapshot(category.snapshot);
    if (snapshot.analysis.length !== 1 || snapshot.analysis[0].type !== type
      || snapshot.companies.some((company) => company.type !== type)
      || snapshot.volume.some((volume) => volume.surveyType !== type)) throw new Error('Invalid Analytics category summary.');
    return { type, snapshot };
  });
  const permittedTypes = all.analysis.map((category) => category.type);
  if (categories.length !== permittedTypes.length || new Set(categories.map((category) => category.type)).size !== categories.length
    || categories.some((category) => !permittedTypes.includes(category.type))) throw new Error('Incomplete Analytics categories.');
  return { all, categories };
}

export function selectAnalyticsView(views: AnalyticsViews, selectedTypes: SurveyType[]): AnalyticsSnapshot | undefined {
  if (selectedTypes.length !== 1) return views.all;
  return views.categories.find((category) => category.type === selectedTypes[0])?.snapshot;
}

// Reconstruct the public contract rather than trusting an API JSON assertion.
export function parseAnalyticsSnapshot(value: unknown): AnalyticsSnapshot {
  const fail = (): never => { throw new Error('The Analytics server returned invalid summary data.'); };
  const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail();
  const num = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) ? v : fail();
  const str = (v: unknown): string => typeof v === 'string' ? v : fail();
  const nullable = (v: unknown) => v === null ? null : num(v);
  const arr = <T>(v: unknown, parse: (item: Record<string, unknown>) => T): T[] => Array.isArray(v) ? v.map((item) => parse(obj(item))) : fail();
  const type = (v: unknown): SurveyType => v === 'Supplier' || v === 'Courier' || v === 'Subcontractor' ? v : fail();
  const questions = (v: unknown) => arr(v, (q) => ({ question: str(q.question), average: num(q.average), responses: num(q.responses) }));
  const seriesPoints = (v: unknown) => arr(v, (p) => ({ seriesId: str(p.seriesId), label: str(p.label), score: nullable(p.score) }));
  const r = obj(value);
  if (typeof r.hasResponses !== 'boolean') fail();
  return {
    hasResponses: r.hasResponses as boolean,
    totalSubmissions: num(r.totalSubmissions), scoredSubmissionCount: num(r.scoredSubmissionCount), averageScore: num(r.averageScore),
    evaluatedPartnerCount: num(r.evaluatedPartnerCount), partnerDenominator: num(r.partnerDenominator),
    companies: arr(r.companies, (c) => ({ name: str(c.name), type: type(c.type), average: num(c.average), scorePercentage: num(c.scorePercentage), count: num(c.count), rankScore: num(c.rankScore) })),
    questions: questions(r.questions),
    volume: arr(r.volume, (v) => ({ surveyType: type(v.surveyType), responses: num(v.responses) })),
    monthly: arr(r.monthly, (p) => ({ month: str(p.month), average: nullable(p.average), responses: num(p.responses) })),
    yearly: arr(r.yearly, (p) => ({ year: str(p.year), average: nullable(p.average), responses: num(p.responses) })),
    series: arr(r.series, (p) => ({ seriesId: str(p.seriesId), label: str(p.label), createdAt: str(p.createdAt), average: nullable(p.average), responses: num(p.responses) })),
    analysis: arr(r.analysis, (a) => ({
      type: type(a.type),
      peerAverages: arr(a.peerAverages, (p) => ({ section: str(p.section), average: num(p.average) })),
      companies: arr(a.companies, (c) => ({
        company: str(c.company), sections: arr(c.sections, (s) => ({ section: str(s.section), percent: num(s.percent) })),
        naRate: num(c.naRate), stdDev: num(c.stdDev), ratedQuestionCount: num(c.ratedQuestionCount), lowestQuestions: questions(c.lowestQuestions),
        monthly: arr(c.monthly, (p) => ({ month: str(p.month), score: nullable(p.score), responses: num(p.responses) })),
        peerMonthly: arr(c.peerMonthly, (p) => ({ month: str(p.month), score: nullable(p.score) })),
        series: arr(c.series, (p) => ({ seriesId: str(p.seriesId), label: str(p.label), score: nullable(p.score), responses: num(p.responses) })),
        peerSeries: seriesPoints(c.peerSeries),
      })),
    })),
  };
}
