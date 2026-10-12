import { ArchiveSeries, SurveyResponse, SurveyType } from '../types/survey';
import { hasAnsweredItem, numericRating, submissionScores, submissionCount, computeRankScore } from './analytics';
import { ScoreBand, getBand, questionWeights, getCanonicalQuestionId, formatCompositeScore } from '../data/questionWeights';
import { getLiveCategoryLabel } from '../data/questionCategories';

// Returned instead of a real band when a company has no numeric ratings -
// e.g. every response is N/A or contains only free-text answers. Without
// this, compositeScore's 0-fallback (see
// computeCompanyComposite) would otherwise get classified "Critical" by
// getBand, and flagged "below peer average" by getOutliers, as if it were a
// real measured score instead of an absence of data.
const NO_SCORE_BAND: ScoreBand = { label: 'No Score Yet', min: -1, hex: '#94a3b8' };

export interface SectionScore {
  section: string;
  earned: number;
  possible: number;
  percent: number; // 0-100, this is what charts should plot
  responses: number;
}

export interface CompanyComposite {
  companyId?: string;
  company: string;
  surveyType: SurveyType;
  compositeScore: number; // 0-100, normalized so every survey type shares one axis
  band: ScoreBand;
  sections: SectionScore[];
  ratedQuestionCount: number; // individual question ratings counted (excludes N/A)
  evaluationCount: number; // submissions with at least one nonblank answer other than N/A
  hasScore: boolean; // false when submissions have no numeric ratings, even if they contain free-text answers
  stdDev: number; // population std dev of per-question percent scores - consistency signal
  naRate: number; // % of applicable questions marked N/A
  // Volume-weighted variant of compositeScore, pulled toward the peer mean
  // when evaluationCount is low. Use this for ranking and report fields
  // explicitly labeled Volume-Weighted Score; compositeScore remains the
  // company's rubric-based rating - see computeRankScore in analytics.ts.
  rankScore: number;
}

export interface OutlierFlag {
  company: string;
  zScore: number;
  isLowOutlier: boolean;
}

function weightMap(surveyType: SurveyType) {
  const map = new Map<string, { section: string; maxPoints: number }>();
  questionWeights[surveyType].forEach((w) => map.set(w.questionId, w));
  return map;
}

function getMaxRatingForResponse(questionId: string): number {
  try {
    const saved = localStorage.getItem('survey_analytics_surveys_v6');
    if (saved) {
      const parsed = JSON.parse(saved);
      const baseId = questionId.split('-')[0];
      const found = parsed.find((s: any) =>
        s.questions?.some((q: any) => q.questionId === baseId || q.questionId === questionId)
      );
      if (found && found.maxRating !== undefined) {
        return found.maxRating;
      }
    }
  } catch (e) {}
  return 100; // fallback
}

/**
 * Rolls every response for one company + survey type into a single
 * composite score, matching the total score one respondent gave on the
 * form. Courier and Supplier are already 100-point forms; Subcontractor
 * is converted from 32 points to the same 100-point scale.
 */
function computeCompanyCompositeFromResponses(
  company: string,
  surveyType: SurveyType,
  companyResponses: SurveyResponse[],
  companyId?: string,
): CompanyComposite | null {
  const weights = weightMap(surveyType);
  if (!companyResponses.length) return null;

  const sectionMap = new Map<string, { earned: number; possible: number; responses: number }>();
  const percentScores: number[] = [];
  let naCount = 0;
  let applicableCount = 0;

  companyResponses.forEach((response) => {
    const canonicalId = getCanonicalQuestionId(response.questionId);
    const weight = weights.get(canonicalId);
    if (!weight) return; // question isn't part of this form's scored rubric (e.g. free-text fields)
    applicableCount += 1;

    const value = numericRating(response.rating);
    if (value === null) {
      naCount += 1;
      return;
    }

    const earned = value;
    const maxPoints = weight.maxPoints;

    const bucket = sectionMap.get(weight.section) ?? { earned: 0, possible: 0, responses: 0 };
    bucket.earned += earned;
    bucket.possible += maxPoints;
    bucket.responses += 1;
    sectionMap.set(weight.section, bucket);

    const fraction = maxPoints > 0 ? earned / maxPoints : 0;
    percentScores.push(fraction * 100);
  });

  // Build the section list from the form's full rubric (questionWeights), not
  // just the sections that happen to have a rated answer in this slice of
  // responses. This guarantees every chart that reads `sections` (the radar
  // chart in particular) always has one entry per canonical section - so it
  // renders as a complete pentagon/shape instead of collapsing to a single
  // point when a company only has partial data (e.g. a single evaluation,
  // or a month-filtered trend slice that only touched one section).
  const canonicalSections: string[] = [];
  weights.forEach((w) => {
    if (!canonicalSections.includes(w.section)) canonicalSections.push(w.section);
  });

  const sections: SectionScore[] = canonicalSections.map((section) => {
    // Grouping/math above stays keyed by questionWeights.ts's own section
    // label (validated against the paper rubric) - only the label shown to
    // the user is translated to whatever the Categories Manager currently
    // calls it, so a rename can't affect scoring, only display.
    const liveSection = getLiveCategoryLabel(surveyType, section);
    const v = sectionMap.get(section);
    if (!v) {
      return { section: liveSection, earned: 0, possible: 0, percent: 0, responses: 0 };
    }
    return {
      section: liveSection,
      earned: Number(v.earned.toFixed(1)),
      possible: v.possible,
      percent: v.possible ? Number(Math.min(100, Math.max(0, (v.earned / v.possible) * 100)).toFixed(1)) : 0,
      responses: v.responses,
    };
  });

  const normalizedSubmissionScores = submissionScores(companyResponses);
  const hasScore = normalizedSubmissionScores.length > 0;
  const rawComposite = hasScore
    ? normalizedSubmissionScores.reduce((sum, item) => sum + item.score, 0) / normalizedSubmissionScores.length
    : 0;
  const compositeScore = Number(Math.min(100, Math.max(0, rawComposite)).toFixed(1));

  const mean = percentScores.length ? percentScores.reduce((a, b) => a + b, 0) / percentScores.length : 0;
  const variance = percentScores.length
    ? percentScores.reduce((sum, v) => sum + (v - mean) ** 2, 0) / percentScores.length
    : 0;

  return {
    companyId,
    company,
    surveyType,
    compositeScore,
    band: hasScore ? getBand(surveyType, compositeScore) : NO_SCORE_BAND,
    sections,
    ratedQuestionCount: percentScores.length,
    // Count forms with any real answer, including free-text answers on
    // unscored questions. All-N/A and blank-only forms are excluded.
    evaluationCount: submissionCount(companyResponses),
    hasScore,
    stdDev: Number(Math.sqrt(variance).toFixed(1)),
    naRate: applicableCount ? Number(((naCount / applicableCount) * 100).toFixed(1)) : 0,
    // No peer group available in isolation - getLeaderboard recomputes this
    // against the full peer set once every company's composite is known.
    rankScore: compositeScore,
  };
}

export function computeCompanyComposite(
  company: string,
  surveyType: SurveyType,
  responses: SurveyResponse[],
): CompanyComposite | null {
  return computeCompanyCompositeFromResponses(
    company,
    surveyType,
    responses.filter((response) => response.company === company && response.surveyType === surveyType),
  );
}

function legacyCompanyKey(company: string): string {
  return company.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

/**
 * Builds one current metric per company. Stable registry IDs are preferred so
 * evaluations remain together after a display-name change. Older rows without
 * an ID fall back to a conservative trim/case comparison; legal suffixes and
 * punctuation are intentionally preserved to avoid merging distinct partners.
 */
export function getCompanyComposites(responses: SurveyResponse[], surveyType: SurveyType): CompanyComposite[] {
  const groups = new Map<string, { companyId?: string; responses: SurveyResponse[] }>();
  const idKeysByLegacyName = new Map<string, Set<string>>();
  const relevantResponses = responses.filter((response) => response.surveyType === surveyType);

  relevantResponses.forEach((response) => {
    if (!response.companyId) return;
    const key = `id:${response.companyId}`;
    const group = groups.get(key) ?? { companyId: response.companyId, responses: [] };
    group.responses.push(response);
    groups.set(key, group);

    const nameKey = legacyCompanyKey(response.company);
    const matchingIds = idKeysByLegacyName.get(nameKey) ?? new Set<string>();
    matchingIds.add(key);
    idKeysByLegacyName.set(nameKey, matchingIds);
  });

  relevantResponses.forEach((response) => {
    if (response.companyId) return;
    const nameKey = legacyCompanyKey(response.company);
    const matchingIds = idKeysByLegacyName.get(nameKey);
    const key = matchingIds?.size === 1
      ? [...matchingIds][0]
      : `name:${nameKey}`;
    const group = groups.get(key) ?? { responses: [] };
    group.responses.push(response);
    groups.set(key, group);
  });

  return [...groups.values()].flatMap((group) => {
    const latest = [...group.responses].sort((left, right) =>
      right.submissionDate.localeCompare(left.submissionDate),
    )[0];
    const composite = computeCompanyCompositeFromResponses(
      latest.company.trim(),
      surveyType,
      group.responses,
      group.companyId,
    );
    return composite ? [composite] : [];
  });
}

/**
 * Every company of a given survey type, ranked by volume-weighted rankScore
 * (highest first) so a company with one or two evaluations can't outrank one
 * with dozens purely on a small, possibly-lucky sample. compositeScore stays
 * the actual rubric rating; rankScore is used for leaderboard and report
 * ranking displays.
 */
export function getLeaderboard(responses: SurveyResponse[], surveyType: SurveyType): CompanyComposite[] {
  const composites = getCompanyComposites(responses, surveyType);

  // Companies with no scoreable data (every submission was all-N/A) have
  // nothing to rank - keep them out of the peer mean and the score sort
  // entirely, and list them after every scored company instead.
  const scored = composites.filter((c) => c.hasScore);
  const unscored = composites.filter((c) => !c.hasScore);

  const peers = scored.map((c) => ({ score: c.compositeScore, count: c.evaluationCount }));

  const rankedScored = scored
    .map((c) => ({ ...c, rankScore: computeRankScore(c.compositeScore, c.evaluationCount, peers) }))
    .sort((a, b) => {
      // Sort by the rounded value actually shown on screen first, so two
      // companies that display identically (e.g. both "1.74") are ordered
      // by evaluation count next instead of an invisible fractional
      // difference in the underlying rankScore.
      const dispA = formatCompositeScore(surveyType, a.rankScore).value;
      const dispB = formatCompositeScore(surveyType, b.rankScore).value;
      if (dispB !== dispA) return dispB - dispA;
      if (b.evaluationCount !== a.evaluationCount) return b.evaluationCount - a.evaluationCount;
      return b.rankScore - a.rankScore;
    });

  const sortedUnscored = [...unscored].sort((a, b) => a.company.localeCompare(b.company));

  return [...rankedScored, ...sortedUnscored];
}

/**
 * Flags companies sitting meaningfully below their own peer group (same
 * survey type only - couriers are only compared against couriers, etc.)
 * rather than a single global threshold, since the three forms don't share
 * a baseline difficulty.
 */
export function getOutliers(leaderboard: CompanyComposite[], threshold = 1.5): OutlierFlag[] {
  // Companies with no scoreable data would otherwise pin the peer mean/sd
  // toward their fallback 0 and get flagged as outliers themselves - exclude
  // them from the comparison entirely rather than let an absence of data
  // read as "below peer average".
  const scoredCompanies = leaderboard.filter((c) => c.hasScore);
  if (scoredCompanies.length < 3) return [];
  const scores = scoredCompanies.map((c) => c.compositeScore);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, v) => sum + (v - mean) ** 2, 0) / scores.length;
  const sd = Math.sqrt(variance);
  if (sd === 0) return scoredCompanies.map((c) => ({ company: c.company, zScore: 0, isLowOutlier: false }));

  return scoredCompanies.map((c) => {
    const zScore = Number(((c.compositeScore - mean) / sd).toFixed(2));
    return { company: c.company, zScore, isLowOutlier: zScore <= -threshold };
  });
}

/** Section-by-section average across every company of a survey type, for radar peer comparison. */
export function getSectionPeerAverages(responses: SurveyResponse[], surveyType: SurveyType) {
  const leaderboard = getLeaderboard(responses, surveyType);
  const sectionTotals = new Map<string, { sum: number; count: number }>();

  leaderboard.forEach((composite) => {
    composite.sections.forEach((s) => {
      if (s.responses === 0) return; // no rated data for this section yet - don't let it skew the peer average
      const bucket = sectionTotals.get(s.section) ?? { sum: 0, count: 0 };
      bucket.sum += s.percent;
      bucket.count += 1;
      sectionTotals.set(s.section, bucket);
    });
  });

  return [...sectionTotals.entries()].map(([section, v]) => ({
    section,
    average: Number((v.sum / v.count).toFixed(1)),
  }));
}

/** One company's composite score by month, so a partner's trajectory can be read over time. */
export function getCompanyTrend(responses: SurveyResponse[], company: string, surveyType: SurveyType) {
  const filtered = responses.filter((r) => r.company === company && r.surveyType === surveyType && hasAnsweredItem(r));
  const months = [...new Set(filtered.map((r) => r.submissionDate.slice(0, 7)))].sort();

  return months
    .map((month) => {
      const monthResponses = filtered.filter((r) => r.submissionDate.slice(0, 7) === month);
      const composite = computeCompanyComposite(company, surveyType, monthResponses);
      return {
        month,
        score: composite?.hasScore ? composite.compositeScore : null,
        responses: submissionCount(monthResponses),
      };
    })
    .filter((point) => point.responses > 0);
}

/**
 * Average composite score by month across every company of a survey type
 * (optionally excluding one), so a company's trend line can be read
 * against a peer baseline over the same timeline.
 */
export function getPeerAverageTrend(responses: SurveyResponse[], surveyType: SurveyType, excludeCompany?: string) {
  const filtered = responses.filter((r) => r.surveyType === surveyType && r.company !== excludeCompany && hasAnsweredItem(r));
  const months = [...new Set(filtered.map((r) => r.submissionDate.slice(0, 7)))].sort();

  return months.map((month) => {
    const monthResponses = filtered.filter((r) => r.submissionDate.slice(0, 7) === month);
    const companies = [...new Set(monthResponses.map((r) => r.company))];
    const scores = companies
      .map((company) => computeCompanyComposite(company, surveyType, monthResponses))
      .filter((c): c is CompanyComposite => c !== null && c.hasScore)
      .map((c) => c.compositeScore);
    const average = scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)) : null;
    return { month, score: average };
  });
}

/** One company's composite score by named archive period, ordered chronologically by the series' createdAt. */
export function getCompanyTrendBySeries(responses: SurveyResponse[], company: string, surveyType: SurveyType, seriesList: ArchiveSeries[]) {
  const seriesById = new Map(seriesList.map((s) => [s.id, s]));
  const filtered = responses.filter((r) => r.company === company && r.surveyType === surveyType && hasAnsweredItem(r) && r.seriesId && seriesById.has(r.seriesId));
  const seriesIds = [...new Set(filtered.map((r) => r.seriesId as string))]
    .sort((a, b) => (seriesById.get(a)?.createdAt ?? '').localeCompare(seriesById.get(b)?.createdAt ?? ''));

  return seriesIds
    .map((seriesId) => {
      const seriesResponses = filtered.filter((r) => r.seriesId === seriesId);
      const composite = computeCompanyComposite(company, surveyType, seriesResponses);
      return {
        seriesId,
        label: seriesById.get(seriesId)?.label ?? 'Unknown',
        score: composite?.hasScore ? composite.compositeScore : null,
        responses: submissionCount(seriesResponses),
      };
    })
    .filter((point) => point.responses > 0);
}

/** Average composite score by named archive period across every company of a survey type (optionally excluding one). */
export function getPeerAverageTrendBySeries(responses: SurveyResponse[], surveyType: SurveyType, seriesList: ArchiveSeries[], excludeCompany?: string) {
  const seriesById = new Map(seriesList.map((s) => [s.id, s]));
  const filtered = responses.filter((r) => r.surveyType === surveyType && r.company !== excludeCompany && hasAnsweredItem(r) && r.seriesId && seriesById.has(r.seriesId));
  const seriesIds = [...new Set(filtered.map((r) => r.seriesId as string))]
    .sort((a, b) => (seriesById.get(a)?.createdAt ?? '').localeCompare(seriesById.get(b)?.createdAt ?? ''));

  return seriesIds.map((seriesId) => {
    const seriesResponses = filtered.filter((r) => r.seriesId === seriesId);
    const companies = [...new Set(seriesResponses.map((r) => r.company))];
    const scores = companies
      .map((company) => computeCompanyComposite(company, surveyType, seriesResponses))
      .filter((c): c is CompanyComposite => c !== null && c.hasScore)
      .map((c) => c.compositeScore);
    const average = scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)) : null;
    return { seriesId, label: seriesById.get(seriesId)?.label ?? 'Unknown', score: average };
  });
}
