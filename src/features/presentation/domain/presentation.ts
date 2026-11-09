import { PartnerCompany, SurveyResponse, SurveyType } from '../../../types/survey';
import { surveyTypeDisplayLabel } from '../../../data/questionWeights';
import { isOverallCategory } from '../../../data/questionCategories';
import { computeCompanyComposite, getLeaderboard, getOutliers, getSectionPeerAverages } from '../../evaluations/domain/scoring';
import {
  buildFocusInsight,
  buildPeriodComparisonInsight,
  buildPortfolioSpreadInsight,
  type PeriodComparisonInsight,
  type FocusInsight,
  type PortfolioSpreadInsight,
  type ReportingPeriodBounds,
} from './presentationInsights';
import {
  averageBySurveyType,
  categoryPerformance,
  formatNumber,
  getKpiSummary,
  monthlyTrend,
  questionPerformance,
  responseVolume,
  getMaxRatingForResponses,
  submissionCount,
  submissionScores,
} from '../../analytics/domain/analytics';

/* ------------------------------------------------------------------ */
/* Date range selection                                                */
/* ------------------------------------------------------------------ */

export type DateRangeId = 'all' | '6m' | '1m' | '1w' | 'custom';

export const DATE_RANGE_OPTIONS: { id: DateRangeId; label: string; description: string }[] = [
  { id: 'all', label: 'All Time', description: 'Every response on record' },
  { id: '6m', label: 'Last 6 Months', description: 'Rolling 6-month window' },
  { id: '1m', label: 'Last Month', description: 'Rolling 30-day window' },
  { id: '1w', label: 'Last Week', description: 'Rolling 7-day window' },
  { id: 'custom', label: 'Custom Range', description: 'Pick your own start and end date' },
];

export interface DateRangeSelection {
  id: DateRangeId;
  from?: string;
  to?: string;
}

export function resolveDateRangeBounds(selection: DateRangeSelection, now = new Date()): ReportingPeriodBounds | null {
  const to = now.toISOString().slice(0, 10);
  if (selection.id === 'all') return null;
  if (selection.id === '6m') return { from: monthsAgoISO(6, now), to };
  if (selection.id === '1m') return { from: daysAgoISO(30, now), to };
  if (selection.id === '1w') return { from: daysAgoISO(7, now), to };
  if (selection.from && selection.to && selection.from <= selection.to) return { from: selection.from, to: selection.to };
  return null;
}

function daysAgoISO(days: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function monthsAgoISO(months: number, from = new Date()): string {
  const d = new Date(from);
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

/** Human label describing the resolved window, e.g. "Jan 1, 2026 – Jul 14, 2026". */
export function describeDateRange(selection: DateRangeSelection, responses: SurveyResponse[]): string {
  if (selection.id === 'all') {
    if (!responses.length) return 'All time';
    const dates = responses.map((r) => r.submissionDate.slice(0, 10)).sort();
    return `${formatDisplayDate(dates[0])} – ${formatDisplayDate(dates[dates.length - 1])}`;
  }
  if (selection.id === '6m') return `Last 6 months (since ${formatDisplayDate(monthsAgoISO(6))})`;
  if (selection.id === '1m') return `Last month (since ${formatDisplayDate(daysAgoISO(30))})`;
  if (selection.id === '1w') return `Last 7 days (since ${formatDisplayDate(daysAgoISO(7))})`;
  if (selection.from && selection.to) return `${formatDisplayDate(selection.from)} – ${formatDisplayDate(selection.to)}`;
  return 'Custom range';
}

function formatDisplayDate(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function filterByDateRange(responses: SurveyResponse[], selection: DateRangeSelection): SurveyResponse[] {
  if (selection.id === 'all') return responses;

  let from: string | undefined;
  let to: string | undefined;

  if (selection.id === '6m') from = monthsAgoISO(6);
  else if (selection.id === '1m') from = daysAgoISO(30);
  else if (selection.id === '1w') from = daysAgoISO(7);
  else if (selection.id === 'custom') {
    from = selection.from;
    to = selection.to;
  }

  return responses.filter((response) => {
    const submitted = response.submissionDate.slice(0, 10);
    const matchesFrom = !from || submitted >= from;
    const matchesTo = !to || submitted <= to;
    return matchesFrom && matchesTo;
  });
}

/* ------------------------------------------------------------------ */
/* Selectable content categories                                       */
/* ------------------------------------------------------------------ */

export type PresentationCategoryId =
  | 'comparison'
  | 'sections'
  | 'leaderboard'
  | 'trends'
  | 'questions'
  | 'spotlight'
  | 'distribution';

export interface PresentationCategoryDef {
  id: PresentationCategoryId;
  label: string;
  description: string;
}

// Single source of truth for each slide's small uppercase "kicker" label,
// shared by the live deck (SlideDeck.tsx) and both static exports
// (presentationPdf.ts, presentationPptx.ts) so the three renderers can never
// drift out of sync with each other.
export const SLIDE_EYEBROWS: Record<Slide['kind'], string> = {
  title: 'Cover',
  agenda: "What's inside",
  overview: 'Overview',
  comparison: 'Performance Insight',
  sections: 'By Category',
  leaderboard: 'Rankings',
  trends: 'Historical View',
  questions: 'Question Insights',
  spotlight: 'Featured Partner',
  distribution: 'Needs Attention',
  'period-change': 'Period Comparison',
  focus: 'Discussion Priorities',
  'portfolio-spread': 'Portfolio Distribution',
  closing: 'Closing',
};

export const PRESENTATION_CATEGORIES: PresentationCategoryDef[] = [
  {
    id: 'comparison',
    label: 'Company Performance Rankings',
    description: 'Interactive rankings of the best performing and least rated companies across survey types',
  },
  {
    id: 'sections',
    label: 'Category Breakdown',
    description: 'Performance by evaluation category — Delivery, Commercial, Communication, and more',
  },
  {
    id: 'leaderboard',
    label: 'Company Leaderboard',
    description: 'Top-ranked partner companies within each survey type',
  },
  {
    id: 'trends',
    label: 'Trends Over Time',
    description: 'How average satisfaction has moved month over month',
  },
  {
    id: 'questions',
    label: 'Top & Bottom Questions',
    description: 'The highest and lowest scoring evaluation questions',
  },
  {
    id: 'spotlight',
    label: 'Company Spotlight',
    description: 'A closer look at the top performer plus anyone falling behind their peers',
  },
  {
    id: 'distribution',
    label: 'Needs Attention',
    description: 'Every partner trailing its peer group, and the specific category dragging each one down',
  },
];

/* ------------------------------------------------------------------ */
/* Slide model                                                         */
/* ------------------------------------------------------------------ */

export interface KpiStat {
  label: string;
  value: string;
  sub?: string;
}

export interface TopPerformer {
  type: string;
  name: string;
  score: string;
  count: number;
}

export type Slide =
  | { kind: 'title'; title: string; subtitle: string; meta: string[]; generatedDate: string }
  | { kind: 'agenda'; items: { number: number; label: string; description: string }[] }
  | { kind: 'overview'; kpis: KpiStat[]; topPerformers: TopPerformer[]; highlight: string; standout: { name: string; score: string; type: string }; surveyTypes?: SurveyType[] }
  | { kind: 'comparison'; data: { surveyType: SurveyType; average: number; responses: number }[] }
  | {
      kind: 'sections';
      data: { category: string; average: number; responses: number; submissions: number; naCount: number }[];
    }
  | {
      kind: 'leaderboard';
      groups: {
        surveyType: SurveyType;
        rows: { rank: number; company: string; score: number; band: string; hex: string; isSelected?: boolean }[];
        selectedCompanyOutsideTopTwenty?: { company: string; rank: number; total: number };
      }[];
    }
  | { kind: 'trends'; data: { month: string; average: number | null; responses: number }[] }
  | { kind: 'questions'; top: { question: string; average: number }[]; bottom: { question: string; average: number }[]; maxRating?: number }
  | {
      kind: 'spotlight';
      company: string;
      surveyType: SurveyType;
      radar: { section: string; value: number; peer: number }[];
      score: number;
      band: string;
      hex: string;
      atRisk?: { company: string; surveyType: SurveyType; score: number };
    }
  | {
      kind: 'distribution';
      naPercentage: number;
      atRisk: {
        company: string;
        surveyType: SurveyType;
        score: number;
        band: string;
        hex: string;
        weakestSection?: string;
        weakestPercent?: number;
      }[];
    }
  | { kind: 'period-change'; insight: PeriodComparisonInsight }
  | { kind: 'focus'; insight: FocusInsight }
  | { kind: 'portfolio-spread'; insight: PortfolioSpreadInsight }
  | { kind: 'closing'; takeaways: string[] };

const ALL_SURVEY_TYPES: SurveyType[] = ['Courier', 'Supplier', 'Subcontractor'];

/**
 * Same "who's on top" logic the Dashboard uses, generalized so the deck
 * builder can reuse it standalone.
 *
 * Important: this must rank companies the same way DashboardPage does —
 * by each submission's normalized 0-100 composite score (via
 * `submissionScores`, which accounts for each survey type's own point
 * scale) — NOT by a raw average of individual question ratings. Averaging
 * raw ratings ignores that Courier/Supplier/Subcontractor forms use
 * different scales, so it silently produced the wrong "top performer" and
 * displayed scores like "1.90 / 100.00" that didn't match the Dashboard.
 */
function computeTopPerformers(responses: SurveyResponse[], partnerCompanies: PartnerCompany[]) {
  const typeMap = new Map<string, SurveyType>();
  partnerCompanies.forEach((c) => {
    if (c.type !== 'Uncategorized') typeMap.set(c.name, c.type);
  });

  const companyMap = new Map<string, { name: string; sum: number; scoreCount: number; type: SurveyType }>();
  submissionScores(responses).forEach((submission) => {
    if (!companyMap.has(submission.company)) {
      companyMap.set(submission.company, {
        name: submission.company,
        sum: 0,
        scoreCount: 0,
        type: typeMap.get(submission.company) ?? submission.surveyType,
      });
    }
    const bucket = companyMap.get(submission.company)!;
    bucket.sum += submission.score;
    bucket.scoreCount += 1;
  });

  const companyAverages = [...companyMap.values()]
    .map((c) => ({
      name: c.name,
      type: c.type,
      average: c.scoreCount ? c.sum / c.scoreCount : 0,
      count: submissionCount(responses.filter((response) => response.company === c.name && response.surveyType === c.type)),
    }))
    .sort((a, b) => b.average - a.average);

  const byType = (type: SurveyType) => companyAverages.find((c) => c.type === type);

  return { companyAverages, top: companyAverages[0], byType };
}

function generateTakeaways(
  comparison: PeriodComparisonInsight,
  focus: FocusInsight,
  portfolio: PortfolioSpreadInsight,
): string[] {
  const takeaways: string[] = [];
  const priority = focus.priorities[0];
  const weakestCategory = comparison.currentSnapshot.weakestCategories[0];

  if (portfolio.totalPartners > 0) {
    takeaways.push(portfolio.unsatisfactoryPartners > 0
      ? `${portfolio.unsatisfactoryPartners} of ${portfolio.totalPartners} evaluated partners (${formatNumber(portfolio.unsatisfactoryPercentage, 1)}%) are in the existing Unsatisfactory band.`
      : `None of the ${portfolio.totalPartners} evaluated partners are in the existing Unsatisfactory band.`);
  }

  if (priority) {
    takeaways.push(`${priority.surveyType} ${priority.category}: “${priority.question}” scored ${formatNumber(priority.questionScore, 1)} / 100 from ${priority.responses} scored evaluations; ${priority.affectedPartners} partners are in the Unsatisfactory band for this question.`);
  } else if (weakestCategory) {
    takeaways.push(`Lowest current category result: ${weakestCategory.surveyType} ${weakestCategory.label} at ${formatNumber(weakestCategory.score, 1)} / 100 across ${weakestCategory.responses} scored evaluations.`);
  }

  if (comparison.available && comparison.declines[0]) {
    const decline = comparison.declines[0];
    takeaways.push(`Largest matched decline: ${decline.surveyType} ${decline.kind.toLowerCase()} ${decline.label} fell ${formatNumber(Math.abs(decline.delta), 2)} points (${decline.previousResponses} to ${decline.currentResponses} scored evaluations).`);
  }
  if (comparison.available && comparison.improvements[0]) {
    const improvement = comparison.improvements[0];
    takeaways.push(`Largest matched improvement: ${improvement.surveyType} ${improvement.kind.toLowerCase()} ${improvement.label} rose ${formatNumber(improvement.delta, 2)} points (${improvement.previousResponses} to ${improvement.currentResponses} scored evaluations).`);
  }

  if (priority?.discussionPoints[0]) {
    takeaways.push(`Suggested discussion: ${priority.discussionPoints[0]}`);
  } else if (weakestCategory) {
    takeaways.push(`Suggested discussion: Review the ${weakestCategory.label} result with the ${weakestCategory.responses} scored evaluations before agreeing next steps.`);
  }

  return takeaways.slice(0, 5);
}

function agendaTitle(slide: Slide, categories: PresentationCategoryDef[]): string {
  if (slide.kind === 'closing') return 'Key Takeaways';
  if (slide.kind === 'period-change') return 'What Changed Since the Last Period?';
  if (slide.kind === 'focus') return 'Where Should We Focus?';
  if (slide.kind === 'portfolio-spread') return 'Is This Isolated or Widespread?';
  if (slide.kind === 'overview') return 'Overview';
  const ids: Partial<Record<Slide['kind'], PresentationCategoryId>> = {
    comparison: 'comparison', sections: 'sections', leaderboard: 'leaderboard', trends: 'trends',
    questions: 'questions', spotlight: 'spotlight', distribution: 'distribution',
  };
  return categories.find((category) => category.id === ids[slide.kind])?.label ?? slide.kind;
}

function agendaDescription(slide: Slide, categories: PresentationCategoryDef[]): string {
  if (slide.kind === 'closing') return 'Executive findings and evidence-based discussion points';
  if (slide.kind === 'period-change') return 'Current and preceding equal-duration performance with response counts';
  if (slide.kind === 'focus') return 'Question-level findings and suggested discussion points';
  if (slide.kind === 'portfolio-spread') return 'Distribution across existing performance bands and category reach';
  if (slide.kind === 'overview') return 'Current-period measures and partner leaders';
  const ids: Partial<Record<Slide['kind'], PresentationCategoryId>> = {
    comparison: 'comparison', sections: 'sections', leaderboard: 'leaderboard', trends: 'trends',
    questions: 'questions', spotlight: 'spotlight', distribution: 'distribution',
  };
  return categories.find((category) => category.id === ids[slide.kind])?.description ?? '';
}

export interface BuildSlidesOptions {
  responses: SurveyResponse[];
  partnerCompanies: PartnerCompany[];
  categoryIds: PresentationCategoryId[];
  dateRangeLabel: string;
  currentPeriod?: ReportingPeriodBounds | null;
  previousPeriodResponses?: SurveyResponse[];
  surveyTypes?: SurveyType[];
  selectedCompany?: { company: string; surveyType: SurveyType } | null;
  presentationTitle?: string;
}

export function buildSlides(options: BuildSlidesOptions): Slide[] {
  const {
    responses,
    partnerCompanies,
    categoryIds,
    dateRangeLabel,
    currentPeriod = null,
    previousPeriodResponses = [],
    surveyTypes = ALL_SURVEY_TYPES,
    selectedCompany = null,
    presentationTitle = 'Stakeholder Satisfaction Presentation',
  } = options;

  const slides: Slide[] = [];
  const selectedCategoryDefs = PRESENTATION_CATEGORIES.filter((c) => categoryIds.includes(c.id));
  const topPerformers = computeTopPerformers(responses, partnerCompanies);
  const summary = getKpiSummary(responses);
  const comparisonInsight = buildPeriodComparisonInsight(
    responses,
    previousPeriodResponses,
    currentPeriod,
    dateRangeLabel,
  );
  const focusInsight = buildFocusInsight(responses, comparisonInsight);
  const portfolioInsight = buildPortfolioSpreadInsight(responses);

  // 1. Intro / Title
  slides.push({
    kind: 'title',
    title: presentationTitle,
    subtitle: 'Partner & Stakeholder Analytics',
    meta: [dateRangeLabel, `${summary.totalResponses} responses`, `${surveyTypes.length} survey ${surveyTypes.length === 1 ? 'type' : 'types'}`],
    generatedDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  });

  // 2. Contents / Agenda
  slides.push({
    kind: 'agenda',
    items: [],
  });

  // 3. Overview (always included, highlights top performers)
  const maxVal = summary.maxRating ?? 100;
  const maxValStr = maxVal.toFixed(2);

  const kpis: KpiStat[] = [
    { label: 'Overall Satisfaction', value: `${formatNumber(summary.overallSatisfactionScore, 0)}%` },
    { label: 'Average Rating', value: `${formatNumber(summary.averageRating, 2)} / ${maxValStr}` },
    { label: 'Total Responses', value: String(summary.totalResponses) },
    { label: 'N/A Rate', value: `${formatNumber(summary.naPercentage, 1)}%` },
  ];
  const overviewTopPerformers: TopPerformer[] = surveyTypes.map((type) => {
    const performer = topPerformers.byType(type);
    return {
      type: surveyTypeDisplayLabel[type],
      name: performer?.name ?? 'No data',
      score: performer ? `${formatNumber(performer.average, 2)} / ${maxValStr}` : '—',
      count: performer?.count ?? 0,
    };
  });
  slides.push({
    kind: 'overview',
    kpis,
    topPerformers: overviewTopPerformers,
    highlight: summary.highestRatedQuestion,
    standout: topPerformers.top
      ? { name: topPerformers.top.name, score: `${formatNumber(topPerformers.top.average, 2)} / ${maxValStr}`, type: topPerformers.top.type }
      : { name: 'No data yet', score: '—', type: '—' },
    surveyTypes,
  });

  // 4. Selected category slides, in the fixed canonical order (raw/data ->
  // rankings -> trends -> deep dives) regardless of the order the user
  // happened to click the category cards in, so the deck always reads as a
  // coherent narrative instead of a randomly-shuffled one.
  selectedCategoryDefs.map((c) => c.id).forEach((id) => {
    if (id === 'comparison') {
      slides.push({ kind: 'comparison', data: averageBySurveyType(responses, surveyTypes) });
    }

    if (id === 'sections') {
      // "General" only covers unscored metadata questions (e.g. "Period
      // Covered") - it has no rating data behind it, so it always renders as
      // an empty bar. Excluded here rather than in categoryPerformance()
      // itself since other consumers (Analytics page) may still want it.
      slides.push({
        kind: 'sections',
        data: categoryPerformance(responses)
          .filter((category) => !isOverallCategory(category.category))
          .map((category) => ({
            ...category,
            submissions: submissionCount(responses.filter((response) => response.questionCategory === category.category)),
          })),
      });
    }

    if (id === 'leaderboard') {
      const groups = surveyTypes.map((type) => {
        const allRankedCompanies = getLeaderboard(responses, type);
        const selectedRank = selectedCompany?.surveyType === type
          ? allRankedCompanies.findIndex((company) => company.company === selectedCompany.company) + 1
          : 0;
        const selectedCompanyOutsideTopTwenty = selectedCompany && selectedRank > 20
          ? { company: selectedCompany.company, rank: selectedRank, total: allRankedCompanies.length }
          : undefined;
        const leaderboard = allRankedCompanies.slice(0, 20);
        return {
          surveyType: type,
          selectedCompanyOutsideTopTwenty,
          rows: leaderboard.map((c, index) => ({
            rank: index + 1,
            company: c.company,
            score: c.compositeScore,
            band: c.band.label,
            hex: c.band.hex,
            isSelected: selectedRank === index + 1,
          })),
        };
      });
      slides.push({ kind: 'leaderboard', groups });
    }

    if (id === 'trends') {
      slides.push({ kind: 'trends', data: monthlyTrend(responses) });
    }

    if (id === 'questions') {
      const ranked = questionPerformance(responses);
      slides.push({
        kind: 'questions',
        top: ranked.slice(0, 5).map((q) => ({ question: q.question, average: q.average })),
        bottom: ranked
          .slice(-5)
          .reverse()
          .map((q) => ({ question: q.question, average: q.average })),
        maxRating: summary.maxRating,
      });
    }

    if (id === 'distribution') {
      // "Needs attention" across every selected survey type, not just one -
      // each type's own peer group is used (a Courier is only ever compared
      // to other Couriers), then merged and ranked so the lowest overall
      // composite scores surface first regardless of which form they came from.
      const atRisk = surveyTypes
        .flatMap((type) => {
          const leaderboard = getLeaderboard(responses, type);
          const outliers = getOutliers(leaderboard);
          return outliers
            .filter((o) => o.isLowOutlier)
            .map((o) => leaderboard.find((c) => c.company === o.company))
            .filter((c): c is NonNullable<typeof c> => Boolean(c));
        })
        .sort((a, b) => a.compositeScore - b.compositeScore)
        .slice(0, 6)
        .map((c) => {
          // The specific category dragging this company down - the "why",
          // not just the "who" - is what makes this slide actionable instead
          // of just a scoreboard of names.
          const composite = computeCompanyComposite(c.company, c.surveyType, responses);
          const weakest = composite?.sections
            .filter((s) => s.responses > 0)
            .sort((a, b) => a.percent - b.percent)[0];

          return {
            company: c.company,
            surveyType: c.surveyType,
            score: c.compositeScore,
            band: c.band.label,
            hex: c.band.hex,
            weakestSection: weakest?.section,
            weakestPercent: weakest?.percent,
          };
        });

      slides.push({
        kind: 'distribution',
        naPercentage: summary.naPercentage,
        atRisk,
      });
    }

    if (id === 'spotlight') {
      const primaryType = topPerformers.top?.type ?? surveyTypes[0];
      const leaderboard = getLeaderboard(responses, primaryType);
      const spotlightCompany = leaderboard[0];
      if (spotlightCompany) {
        const peerAverages = getSectionPeerAverages(responses, primaryType);
        const outliers = getOutliers(leaderboard);
        const atRiskFlag = outliers.find((o) => o.isLowOutlier);
        const atRiskCompany = atRiskFlag ? leaderboard.find((c) => c.company === atRiskFlag.company) : undefined;

        slides.push({
          kind: 'spotlight',
          company: spotlightCompany.company,
          surveyType: primaryType,
          score: spotlightCompany.compositeScore,
          band: spotlightCompany.band.label,
          hex: spotlightCompany.band.hex,
          radar: spotlightCompany.sections.map((s) => ({
            section: s.section,
            value: s.percent,
            peer: peerAverages.find((p) => p.section === s.section)?.average ?? 0,
          })),
          atRisk: atRiskCompany
            ? { company: atRiskCompany.company, surveyType: primaryType, score: atRiskCompany.compositeScore }
            : undefined,
        });
      }
    }

  });

  // These evidence slides are always included so the client deck contains the
  // requested decision context even when optional topics are deselected.
  slides.push({ kind: 'period-change', insight: comparisonInsight });
  slides.push({ kind: 'focus', insight: focusInsight });
  slides.push({ kind: 'portfolio-spread', insight: portfolioInsight });

  // Final takeaways always follow the complete analytical section.
  slides.push({
    kind: 'closing',
    takeaways: generateTakeaways(comparisonInsight, focusInsight, portfolioInsight),
  });

  const agenda = slides.find((slide): slide is Extract<Slide, { kind: 'agenda' }> => slide.kind === 'agenda');
  if (agenda) {
    agenda.items = slides.slice(2).map((slide, index) => ({
      number: index + 3,
      label: agendaTitle(slide, selectedCategoryDefs),
      description: agendaDescription(slide, selectedCategoryDefs),
    }));
  }

  return slides;
}

export { responseVolume };
