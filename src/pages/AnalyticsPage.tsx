import { useMemo, useState, type ReactNode } from 'react';
import { BarChart3, ChevronLeft, ChevronRight, Info, Trophy, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CompanyAnalysisPanel } from '../components/CompanyAnalysisPanel';
import { PageDescription } from '../components/PageDescription';
import { StateMessage } from '../components/StateMessage';
import { formatCompositeScore, getBand } from '../data/questionWeights';
import { ArchiveSeries, FilterState, PartnerCompany, SurveyResponse, SurveyType } from '../types/survey';
import { formatNumber, hasAnsweredItem, monthlyTrend, questionPerformance, responseVolume, seriesTrend, submissionCount, submissionScores, yearlyTrend } from '../utils/analytics';
import { computeCompanyComposite } from '../utils/scoring';
import { getAnalyticsCompanyRankings, paginateAnalyticsItems, paginateCompanyRankings } from '../features/analytics/domain/rankings';
import { QuestionPerformanceRow } from '../features/analytics/components/QuestionPerformanceRow';
import { AnalyticsDateRangeControls } from '../features/analytics/components/AnalyticsDateRangeControls';
import type { AnalyticsDateRange } from '../features/analytics/domain/dateRange';
import { useModalEscape } from '../hooks/useModalEscape';

interface AnalyticsPageProps {
  responses: SurveyResponse[];
  activeSurveyTypes: SurveyType[];
  filters: FilterState;
  setFilters: (filters: FilterState) => void;
  dataScope?: 'current' | 'all-time' | 'custom';
  onChangeDataScope?: (scope: 'current' | 'all-time' | 'custom') => void;
  archiveSeries?: ArchiveSeries[];
  selectedSeriesIds?: string[];
  onChangeSelectedSeriesIds?: (ids: string[]) => void;
  dateRange?: AnalyticsDateRange;
  onChangeDateRange?: (range: AnalyticsDateRange) => void;
  partnerCompanies?: PartnerCompany[];
  archivedResponses?: SurveyResponse[];
}

type CompanySummary = {
  name: string;
  type: SurveyType;
  average: number;
  scorePercentage: number;
  count: number;
  rankScore: number;
};

const surveyTypes: SurveyType[] = ['Courier', 'Supplier', 'Subcontractor'];
const panelClass = 'rounded-xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-950';
const typeStyles: Record<SurveyType, { dot: string; text: string; soft: string; bar: string }> = {
  Courier: { dot: 'bg-sky-600', text: 'text-sky-700 dark:text-sky-400', soft: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300', bar: 'bg-sky-600' },
  Supplier: { dot: 'bg-emerald-600', text: 'text-emerald-700 dark:text-emerald-400', soft: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', bar: 'bg-emerald-600' },
  Subcontractor: { dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', soft: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300', bar: 'bg-amber-500' },
};

function PlaceholderButton({ children, title }: { children: ReactNode; title: string }) {
  return (
    <button type="button" aria-disabled="true" title={`${title} — coming soon`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
      {children}
    </button>
  );
}

function AnalyticsTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex" tabIndex={0}>
      <Info size={13} className="text-slate-400" aria-label={text} />
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-56 -translate-x-1/2 rounded-lg bg-slate-950 px-3 py-2 text-left text-[11px] font-normal leading-4 text-white shadow-xl group-hover:block group-focus:block">{text}</span>
    </span>
  );
}

export function AnalyticsPage({ responses, activeSurveyTypes, filters, setFilters, dataScope = 'current', onChangeDataScope, archiveSeries = [], selectedSeriesIds = [], onChangeSelectedSeriesIds, dateRange = { from: '', to: '' }, onChangeDateRange, partnerCompanies = [], archivedResponses = [] }: AnalyticsPageProps) {
  const [selectedCompany, setSelectedCompany] = useState<CompanySummary | null>(null);
  const [trendGranularity, setTrendGranularity] = useState<'monthly' | 'yearly' | 'series'>('monthly');
  const [leaderboardPage, setLeaderboardPage] = useState(0);
  const [questionPerformancePage, setQuestionPerformancePage] = useState(0);
  useModalEscape(Boolean(selectedCompany), () => setSelectedCompany(null));

  const selectedType = filters.surveyType.length === 1 ? filters.surveyType[0] : 'All';
  const totalSubmissions = useMemo(() => submissionCount(responses), [responses]);
  const scoredSubmissions = useMemo(() => submissionScores(responses), [responses]);
  const averageScore = scoredSubmissions.length ? scoredSubmissions.reduce((sum, submission) => sum + submission.score, 0) / scoredSubmissions.length : 0;

  const companySummaries = useMemo(() => {
    return getAnalyticsCompanyRankings(responses, activeSurveyTypes) as CompanySummary[];
  }, [responses, activeSurveyTypes]);

  const visibleCompanies = useMemo(() => selectedType === 'All' ? companySummaries : companySummaries.filter((company) => company.type === selectedType), [companySummaries, selectedType]);
  const paginatedCompanies = useMemo(
    () => paginateCompanyRankings(visibleCompanies, leaderboardPage),
    [visibleCompanies, leaderboardPage],
  );
  const leaderboardSplitIndex = Math.ceil(paginatedCompanies.items.length / 2);
  const leaderboardColumns = [
    {
      items: paginatedCompanies.items.slice(0, leaderboardSplitIndex),
      startIndex: paginatedCompanies.startIndex,
    },
    {
      items: paginatedCompanies.items.slice(leaderboardSplitIndex),
      startIndex: paginatedCompanies.startIndex + leaderboardSplitIndex,
    },
  ].filter((column) => column.items.length > 0);
  const evaluatedNames = useMemo(() => new Set(responses.filter(hasAnsweredItem).map((response) => response.companyId || `${response.surveyType}:${response.company}`)), [responses]);
  const eligiblePartners = useMemo(() => partnerCompanies.filter((company) => !company.isArchived && company.type !== 'Uncategorized' && activeSurveyTypes.includes(company.type)), [partnerCompanies, activeSurveyTypes]);
  const evaluatedPartnerCount = eligiblePartners.length ? eligiblePartners.filter((company) => evaluatedNames.has(company.id) || evaluatedNames.has(`${company.type}:${company.name}`)).length : visibleCompanies.length;
  const partnerDenominator = eligiblePartners.length || visibleCompanies.length;
  const volumeData = useMemo(() => responseVolume(responses, activeSurveyTypes), [responses, activeSurveyTypes]);
  const questionData = useMemo(() => questionPerformance(responses), [responses]);
  const paginatedQuestionData = useMemo(
    () => paginateAnalyticsItems(questionData, questionPerformancePage),
    [questionData, questionPerformancePage],
  );
  const trendData = useMemo<Array<{ key: string; average: number | null; responses: number }>>(() => {
    if (trendGranularity === 'yearly') return yearlyTrend(responses).map((item) => ({ key: item.year, ...item }));
    if (trendGranularity === 'series') return seriesTrend(responses, archiveSeries).map((item) => ({ key: item.label, ...item }));
    return monthlyTrend(responses).map((item) => ({ key: item.month, ...item }));
  }, [responses, archiveSeries, trendGranularity]);
  const selectedComposite = useMemo(() => selectedCompany ? computeCompanyComposite(selectedCompany.name, selectedCompany.type, responses) : null, [selectedCompany, responses]);
  const selectedLowestQuestions = useMemo(() => selectedCompany ? questionPerformance(responses.filter((response) => response.company === selectedCompany.name && response.surveyType === selectedCompany.type)).sort((left, right) => left.average - right.average).slice(0, 3) : [], [selectedCompany, responses]);

  const selectType = (type: SurveyType | 'All') => {
    setLeaderboardPage(0);
    setFilters({ ...filters, surveyType: type === 'All' ? [] : [type] });
  };
  const toggleSeries = (id: string) => onChangeSelectedSeriesIds?.(selectedSeriesIds.includes(id) ? selectedSeriesIds.filter((seriesId) => seriesId !== id) : [...selectedSeriesIds, id]);

  const analyticsHeader = (
    <>
      <AnalyticsHeader dataScope={dataScope} onChangeDataScope={onChangeDataScope} />
      {dataScope === 'custom' && (
        <AnalyticsDateRangeControls value={dateRange} onChange={(range) => {
          setLeaderboardPage(0);
          setQuestionPerformancePage(0);
          setSelectedCompany(null);
          onChangeDateRange?.(range);
        }} />
      )}
      {dataScope === 'custom' && archiveSeries.length > 0 && (
        <div className={`${panelClass} flex flex-wrap items-center gap-2 p-3`}>
          <span className="mr-1 text-xs font-semibold text-slate-500">Archived periods (optional)</span>
          <button type="button" onClick={() => onChangeSelectedSeriesIds?.([])} aria-pressed={!selectedSeriesIds.length} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${!selectedSeriesIds.length ? 'border-[#0078a8] bg-[#0078a8] text-white' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>All periods</button>
          {archiveSeries.map((series) => (
            <button type="button" key={series.id} onClick={() => toggleSeries(series.id)} aria-pressed={selectedSeriesIds.includes(series.id)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${selectedSeriesIds.includes(series.id) ? 'border-[#0078a8] bg-[#0078a8] text-white' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>{series.label}</button>
          ))}
        </div>
      )}
    </>
  );

  if (!responses.length && !archivedResponses.length) {
    return (
      <div className="space-y-5">
        {analyticsHeader}
        <StateMessage title="No analytics available" message={dataScope === 'custom' ? 'No official evaluation responses match the selected dates and periods.' : 'No official evaluation responses match the current scope.'} />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6 pb-10">
      {analyticsHeader}

      <section aria-label="Analytics summary" className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Overall average score" value={`${formatNumber(averageScore, 0)}/100`} detail={`${scoredSubmissions.length} scored submissions in this view`} tooltip="The simple average of normalized submission scores in the selected reporting scope." />
        <KpiCard label="Evaluations" value={String(totalSubmissions)} detail="Distinct answered evaluation forms" tooltip="A unique response ID counts when at least one item has a nonblank answer other than N/A." />
        <KpiCard label="Partners evaluated" value={`${evaluatedPartnerCount}/${partnerDenominator}`} detail={partnerDenominator ? `${Math.round((evaluatedPartnerCount / partnerDenominator) * 100)}% coverage` : 'No eligible partners'} tooltip="Active eligible partners with at least one visible evaluation, compared with the active eligible partner registry." />
      </section>

      <section className={`${panelClass} overflow-hidden`} aria-labelledby="company-leaderboard-heading">
        <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-6">
          <div>
            <div>
              <div className="flex items-center gap-2"><Trophy size={18} className="text-[#0078a8]" aria-hidden="true" /><h2 id="company-leaderboard-heading" className="text-base font-bold text-slate-900 dark:text-white">Company Leaderboard</h2></div>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Compare evaluated partners and select a company to review its category performance.</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-900 sm:grid-cols-4">
            {(['All', ...surveyTypes] as const).map((type) => (
              <button type="button" key={type} onClick={() => selectType(type)} aria-pressed={selectedType === type} className={`rounded-md px-3 py-2 text-xs font-semibold transition ${selectedType === type ? 'bg-[#0078a8] text-white shadow-sm' : 'text-slate-500 hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'}`}>{type === 'All' ? 'All categories' : type}</button>
            ))}
          </div>
        </div>

        <div className="px-4 py-3 sm:px-6">
          <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_5rem] border-b border-slate-100 px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:border-slate-800 sm:grid-cols-[3rem_minmax(0,1fr)_7rem_4rem]"><span>Rank</span><span>Company</span><span className="text-right">Rank score</span><span className="hidden text-right sm:block">Forms</span></div>
          <div className="grid min-w-0 gap-x-5 xl:grid-cols-2">
            {leaderboardColumns.map((column, columnIndex) => (
              <ol key={columnIndex} start={column.startIndex + 1} className="min-w-0">
                {column.items.map((company, index) => {
                  const style = typeStyles[company.type];
                  const rank = column.startIndex + index + 1;
                  return (
                    <li key={`${company.type}:${company.name}`} className={`min-w-0 border-b border-slate-100 dark:border-slate-800/70 ${rank % 2 === 1 ? 'bg-slate-50 dark:bg-slate-900/40' : 'bg-white dark:bg-slate-950'}`}>
                      <button type="button" onClick={() => setSelectedCompany(company)} className="grid w-full min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_5rem] items-center px-2 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900/70 sm:grid-cols-[3rem_minmax(0,1fr)_7rem_4rem]">
                        <span className="flex h-7 w-8 items-center justify-center rounded-md bg-slate-200 text-xs font-extrabold text-slate-800 dark:bg-slate-700 dark:text-slate-100">{rank}</span>
                        <span className="min-w-0 pr-3"><span className="flex items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} /><span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100" title={company.name}>{company.name}</span></span><span className="mt-0.5 block truncate pl-4 text-[10px] text-slate-400">{company.type} · {getBand(company.type, company.scorePercentage).label}</span></span>
                        <span className={`flex items-center justify-end gap-1 text-xs font-bold tabular-nums ${style.text}`}>{formatCompositeScore(company.type, company.rankScore).valueText}<ChevronRight size={13} /></span>
                        <span className="hidden text-right text-[11px] font-medium tabular-nums text-slate-400 sm:block">{company.count}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            ))}
          </div>
          {!visibleCompanies.length && <p className="py-10 text-center text-sm text-slate-500">No evaluated companies in this category.</p>}
          {visibleCompanies.length > 0 && (
            <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[10px] text-slate-400">
                Showing {paginatedCompanies.startIndex + 1}–{paginatedCompanies.startIndex + paginatedCompanies.items.length} of {visibleCompanies.length} evaluated companies · Select a row for details
              </p>
              {paginatedCompanies.totalPages > 1 && (
                <nav className="flex items-center gap-2" aria-label="Company leaderboard pagination">
                  <button type="button" onClick={() => setLeaderboardPage(paginatedCompanies.currentPage - 1)} disabled={paginatedCompanies.currentPage === 0} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900" aria-label="Previous leaderboard page"><ChevronLeft size={14} /> Previous</button>
                  <span className="text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">Page {paginatedCompanies.currentPage + 1} of {paginatedCompanies.totalPages}</span>
                  <button type="button" onClick={() => setLeaderboardPage(paginatedCompanies.currentPage + 1)} disabled={paginatedCompanies.currentPage === paginatedCompanies.totalPages - 1} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900" aria-label="Next leaderboard page">Next <ChevronRight size={14} /></button>
                </nav>
              )}
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="analytics-detail-heading" className="space-y-4">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0078a8]">Detailed analytics</p><h2 id="analytics-detail-heading" className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Trends and response quality</h2><p className="mt-1 text-sm text-slate-500">Existing Analytics data remains available in the updated visual system.</p></div>
        <div className="grid gap-4 xl:grid-cols-2">
          <article className={`${panelClass} p-4 sm:p-5`}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-bold">Rating trend</h3><p className="mt-1 text-xs text-slate-500">Average score and evaluation volume over time</p></div><select value={trendGranularity} onChange={(event) => setTrendGranularity(event.target.value as typeof trendGranularity)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900"><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="series">Survey period</option></select></div>
            <div className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={trendData} margin={{ top: 8, right: 12, left: -20, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="key" tick={{ fontSize: 10 }} /><YAxis yAxisId="score" domain={[0, 100]} tick={{ fontSize: 10 }} /><YAxis yAxisId="forms" orientation="right" allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Line yAxisId="score" type="monotone" dataKey="average" name="Average Score" stroke="#0078a8" strokeWidth={3} dot={{ r: 3 }} /><Line yAxisId="forms" type="monotone" dataKey="responses" name="Counted Forms" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div>
          </article>
          <article className={`${panelClass} p-4 sm:p-5`}>
            <div className="mb-4"><h3 className="text-sm font-bold">Response volume</h3><p className="mt-1 text-xs text-slate-500">Submitted evaluations by stakeholder category</p></div>
            <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={volumeData} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="surveyType" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="responses" fill="#0078a8" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
          </article>
        </div>
        <CompanyAnalysisPanel responses={responses} archiveSeries={archiveSeries} />
        <article className={`${panelClass} overflow-hidden`}>
          <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-6"><h3 className="text-sm font-bold">Question performance</h3><p className="mt-1 text-xs text-slate-500">All scored criteria ranked from highest to lowest</p></div>
          <ol className="grid gap-x-6 px-4 sm:px-6 lg:grid-cols-2">
            {paginatedQuestionData.items.map((question, index) => (
              <QuestionPerformanceRow
                key={question.question}
                rank={paginatedQuestionData.startIndex + index + 1}
                question={question.question}
                average={question.average}
              />
            ))}
          </ol>
          {questionData.length > 0 && (
            <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-[10px] text-slate-400">Showing {paginatedQuestionData.startIndex + 1}–{paginatedQuestionData.startIndex + paginatedQuestionData.items.length} of {questionData.length} scored questions</p>
              {paginatedQuestionData.totalPages > 1 && (
                <nav className="flex items-center gap-2" aria-label="Question performance pagination">
                  <button type="button" onClick={() => setQuestionPerformancePage(paginatedQuestionData.currentPage - 1)} disabled={paginatedQuestionData.currentPage === 0} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900" aria-label="Previous questions page"><ChevronLeft size={14} /> Previous</button>
                  <span className="text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">Page {paginatedQuestionData.currentPage + 1} of {paginatedQuestionData.totalPages}</span>
                  <button type="button" onClick={() => setQuestionPerformancePage(paginatedQuestionData.currentPage + 1)} disabled={paginatedQuestionData.currentPage === paginatedQuestionData.totalPages - 1} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900" aria-label="Next questions page">Next <ChevronRight size={14} /></button>
                </nav>
              )}
            </div>
          )}
        </article>
      </section>

      {selectedCompany && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/45 backdrop-blur-[1px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedCompany(null); }}>
          <aside role="dialog" aria-modal="true" aria-labelledby="company-detail-title" className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl dark:bg-slate-950">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"><span className="text-xs font-semibold text-slate-400">Company performance</span><button type="button" onClick={() => setSelectedCompany(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close company details"><X size={18} /></button></div>
            <div className="space-y-6 p-5 sm:p-7">
              <div><h2 id="company-detail-title" className="text-xl font-bold text-slate-900 dark:text-white">{selectedCompany.name}</h2><div className="mt-3 flex items-end gap-2"><span className="text-4xl font-bold tracking-tight text-[#0078a8]">{formatCompositeScore(selectedCompany.type, selectedCompany.scorePercentage).valueText}</span><span className="pb-1 text-sm text-slate-400">/ {selectedCompany.type === 'Subcontractor' ? '2.0' : '100'}</span></div><div className="mt-3 flex flex-wrap gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${typeStyles[selectedCompany.type].soft}`}>{selectedCompany.type}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{getBand(selectedCompany.type, selectedCompany.scorePercentage).label}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{selectedCompany.count} forms</span></div></div>
              <div className="border-t border-slate-100 pt-5 dark:border-slate-800"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Category results</h3><div className="mt-4 space-y-3">{selectedComposite?.sections.map((section) => (<div key={section.section}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate text-slate-600 dark:text-slate-300">{section.section}</span><span className="font-semibold tabular-nums">{section.percent.toFixed(0)}</span></div><div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-full rounded-full ${typeStyles[selectedCompany.type].bar}`} style={{ width: `${section.percent}%` }} /></div></div>))}</div></div>
              <div className="border-t border-slate-100 pt-5 dark:border-slate-800"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Lowest performance questions</h3><div className="mt-3 space-y-3">{selectedLowestQuestions.length ? selectedLowestQuestions.map((question) => (<div key={question.question} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800"><div className="flex items-start justify-between gap-3"><p className="text-xs leading-5 text-slate-700 dark:text-slate-200">{question.question}</p><span className="shrink-0 text-xs font-bold text-rose-600">{question.average.toFixed(1)}</span></div><p className="mt-1 text-[10px] text-slate-400">{question.responses} response{question.responses === 1 ? '' : 's'}</p></div>)) : <p className="text-xs text-slate-400">No scoreable question data is available.</p>}</div></div>
              <PlaceholderButton title="Open the full company report"><BarChart3 size={14} /> Open full company report</PlaceholderButton>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function AnalyticsHeader({ dataScope, onChangeDataScope }: { dataScope: 'current' | 'all-time' | 'custom'; onChangeDataScope?: (scope: 'current' | 'all-time' | 'custom') => void }) {
  return (
    <header className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <PageDescription>Review evaluation results, identify performance gaps, and compare partner companies.</PageDescription>
        </div>
      </div>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"><div className="grid grid-cols-3 rounded-lg bg-slate-100 p-1 dark:bg-slate-900">{(['current', 'all-time', 'custom'] as const).map((scope) => (<button key={scope} type="button" onClick={() => onChangeDataScope?.(scope)} className={`rounded-md px-4 py-1.5 text-xs font-semibold ${dataScope === scope ? 'bg-[#0078a8] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}>{scope === 'current' ? 'Current' : scope === 'all-time' ? 'All time' : 'Custom'}</button>))}</div><div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><span>Company ranking</span><span className="font-semibold text-slate-700 dark:text-slate-200">Volume-Weighted Based</span></div></div>
    </header>
  );
}

function KpiCard({ label, value, detail, tooltip }: { label: string; value: string; detail: string; tooltip: string }) {
  return <article className={`${panelClass} p-4 sm:p-5`}><div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400"><span>{label}</span><AnalyticsTooltip text={tooltip} /></div><p className="mt-2 text-2xl font-bold tracking-tight text-[#0078a8] sm:text-3xl">{value}</p><p className="mt-1 text-[11px] text-slate-400">{detail}</p></article>;
}
