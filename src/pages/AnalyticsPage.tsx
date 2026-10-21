import { useMemo, useState, type ReactNode } from 'react';
import { BarChart3, ChevronRight, Info, Trophy, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CompanyAnalysisPanel } from '../features/analytics/components/CompanyAnalysisPanel';
import { PageDescription } from '../components/PageDescription';
import { StateMessage } from '../components/StateMessage';
import { ArchiveSeries, FilterState, PartnerCompany, SurveyResponse, SurveyType } from '../types/survey';
import { formatNumber } from '../features/analytics/domain/analytics';
import { formatAnalyticsRatingRange, analyticsBands, getAnalyticsBand, getAnalyticsScore, paginateAnalyticsItems, paginateCompanyRankings } from '../features/analytics/domain/rankings';
import { QuestionPerformanceRow } from '../features/analytics/components/QuestionPerformanceRow';
import { getValueColorBand } from '../features/analytics/domain/valueColorBand';
import { AnalyticsDateRangeControls } from '../features/analytics/components/AnalyticsDateRangeControls';
import type { AnalyticsDateRange } from '../features/analytics/domain/dateRange';
import { useModalEscape } from '../hooks/useModalEscape';
import { Pagination } from '../components/Pagination';
import { buildAnalyticsSnapshot } from '../features/analytics/domain/analyticsSnapshot';

interface AnalyticsPageProps {
  responses: SurveyResponse[];
  activeSurveyTypes: SurveyType[];
  permittedSurveyTypes?: SurveyType[];
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

const panelClass = 'rounded-xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-950';
const typeStyles: Record<SurveyType, { soft: string; bar: string }> = {
  Courier: { soft: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300', bar: 'bg-sky-600' },
  Supplier: { soft: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', bar: 'bg-emerald-600' },
  Subcontractor: { soft: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300', bar: 'bg-amber-500' },
};
const responseVolumeBandColors = {
  green: '#22c55e',
  yellow: '#facc15',
  orange: '#f97316',
  red: '#ef4444',
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

export function AnalyticsPage({ responses, activeSurveyTypes, permittedSurveyTypes = ['Courier', 'Supplier', 'Subcontractor'], filters, setFilters, dataScope = 'current', onChangeDataScope, archiveSeries = [], selectedSeriesIds = [], onChangeSelectedSeriesIds, dateRange = { from: '', to: '' }, onChangeDateRange, partnerCompanies = [], archivedResponses = [] }: AnalyticsPageProps) {
  const [companySelection, setSelectedCompany] = useState<Pick<CompanySummary, 'name' | 'type'> | null>(null);
  const [trendGranularity, setTrendGranularity] = useState<'monthly' | 'yearly' | 'series'>('monthly');
  const [leaderboardPage, setLeaderboardPage] = useState(0);
  const [questionPerformancePage, setQuestionPerformancePage] = useState(0);
  const [leaderboardPageSize, setLeaderboardPageSize] = useState(20);
  const [questionPerformancePageSize, setQuestionPerformancePageSize] = useState(20);
  const closeSelectedCompany = () => setSelectedCompany(null);

  const selectedType = filters.surveyType.length === 1 ? filters.surveyType[0] : 'All';
  const ratingScaleType: SurveyType = selectedType === 'All' ? 'Courier' : selectedType;
  const ratingScale = analyticsBands[ratingScaleType];
  const formatRatingScale = (type: SurveyType) => analyticsBands[type]
    .map((band, index) => `${band.label} ${formatAnalyticsRatingRange(type, index)}`)
    .join(' · ');
  const ratingScaleText = selectedType === 'All'
    ? formatRatingScale('Courier')
    : formatRatingScale(selectedType);
  const summary = useMemo(() => buildAnalyticsSnapshot(responses, activeSurveyTypes, partnerCompanies, archiveSeries), [responses, activeSurveyTypes, partnerCompanies, archiveSeries]);
  const { totalSubmissions, scoredSubmissionCount, averageScore, evaluatedPartnerCount, partnerDenominator } = summary;
  const companySummaries = summary.companies;
  const selectedCompany = companySummaries.find((company) => company.name === companySelection?.name && company.type === companySelection.type) ?? null;
  useModalEscape(Boolean(selectedCompany), closeSelectedCompany);

  const visibleCompanies = useMemo(() => selectedType === 'All' ? companySummaries : companySummaries.filter((company) => company.type === selectedType), [companySummaries, selectedType]);
  const paginatedCompanies = useMemo(
    () => paginateCompanyRankings(visibleCompanies, leaderboardPage, leaderboardPageSize),
    [visibleCompanies, leaderboardPage, leaderboardPageSize],
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
  const volumeData = summary.volume;
  const questionData = summary.questions;
  const paginatedQuestionData = useMemo(
    () => paginateAnalyticsItems(questionData, questionPerformancePage, questionPerformancePageSize),
    [questionData, questionPerformancePage, questionPerformancePageSize],
  );
  const trendData = useMemo<Array<{ key: string; average: number | null; responses: number }>>(() => {
    if (trendGranularity === 'yearly') return summary.yearly.map((item) => ({ key: item.year, ...item }));
    if (trendGranularity === 'series') return summary.series.map((item) => ({ key: item.label, ...item }));
    return summary.monthly.map((item) => ({ key: item.month, ...item }));
  }, [summary, trendGranularity]);
  const selectedComposite = selectedCompany ? summary.analysis.find((a) => a.type === selectedCompany.type)?.companies.find((c) => c.company === selectedCompany.name) : null;
  const selectedLowestQuestions = selectedComposite?.lowestQuestions ?? [];

  const selectType = (type: SurveyType | 'All') => {
    setLeaderboardPage(0);
    setFilters({ ...filters, surveyType: type === 'All' ? [] : [type] });
  };
  const toggleSeries = (id: string) => onChangeSelectedSeriesIds?.(selectedSeriesIds.includes(id) ? selectedSeriesIds.filter((seriesId) => seriesId !== id) : [...selectedSeriesIds, id]);

  const categoryTabs = (
    <div role="group" aria-label="Analytics categories" className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-900 sm:grid-cols-4">
      {(['All', ...permittedSurveyTypes] as const).map((type) => (
        <button type="button" key={type} onClick={() => selectType(type)} aria-pressed={selectedType === type} className={`rounded-md px-3 py-2 text-xs font-semibold transition ${selectedType === type ? 'bg-[#0078a8] text-white shadow-sm' : 'text-slate-500 hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'}`}>{type === 'All' ? 'All categories' : type}</button>
      ))}
    </div>
  );

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

  if (!summary.hasResponses && !archivedResponses.length) {
    return (
      <div className="space-y-5">
        {analyticsHeader}
        {categoryTabs}
        <StateMessage title="No analytics available" message={dataScope === 'custom' ? 'No official evaluation responses match the selected dates and periods.' : 'No official evaluation responses match the current scope.'} />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6 pb-10">
      {analyticsHeader}

      <section aria-label="Analytics summary" className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Overall average score" value={`${formatNumber(averageScore)}/100`} detail={`${scoredSubmissionCount} scored submissions in this view`} tooltip="The simple average of normalized submission scores in the selected reporting scope." />
        <KpiCard label="Evaluations" value={String(totalSubmissions)} detail="Distinct answered evaluation forms" tooltip="A unique response ID counts when at least one item has a nonblank answer other than N/A." />
        <KpiCard label="Partners evaluated" value={`${evaluatedPartnerCount}/${partnerDenominator}`} detail={partnerDenominator ? `${Math.round((evaluatedPartnerCount / partnerDenominator) * 100)}% coverage` : 'No eligible partners'} tooltip="Active eligible partners with at least one visible evaluation, compared with the active eligible partner registry." />
      </section>

      <section className={`${panelClass} overflow-hidden`} aria-labelledby="company-leaderboard-heading">
        <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-6">
          <div>
              <div>
                <div className="flex items-center gap-2"><Trophy size={18} className="text-[#0078a8]" aria-hidden="true" /><h2 id="company-leaderboard-heading" className="text-base font-bold text-slate-900 dark:text-white">Company Leaderboard</h2></div>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Compare evaluated partners and select a company to review its category performance.</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 sm:flex-nowrap">
                  <div role="group" aria-label="Company leaderboard color legend" className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs font-semibold text-slate-500">Legend:</span>
                    {ratingScale.map((band) => (
                      <span key={band.label} className="inline-flex items-center gap-2 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">
                        <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ backgroundColor: band.hex }} />
                        {band.label}
                      </span>
                    ))}
                  </div>
                  <div aria-label="Company leaderboard rating scale" className="flex flex-wrap items-start gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-300 sm:ml-auto sm:max-w-[50%] sm:justify-end sm:text-right">
                    <span className="font-semibold text-slate-500">Rating scale:</span>
                    <span>{ratingScaleText}</span>
                  </div>
                </div>
              </div>
          </div>
          {categoryTabs}
        </div>

        <div className="px-4 py-3 sm:px-6">
          <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_5rem] border-b border-slate-100 px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:border-slate-800 sm:grid-cols-[3rem_minmax(0,1fr)_7rem_4rem]"><span>Rank</span><span>Company</span><span className="text-right">Rank score</span><span className="hidden text-right sm:block">Forms</span></div>
          <div className="grid min-w-0 gap-x-5 xl:grid-cols-2">
            {leaderboardColumns.map((column, columnIndex) => (
              <ol key={columnIndex} start={column.startIndex + 1} className="min-w-0">
                {column.items.map((company, index) => {
                  const style = typeStyles[company.type];
                  const scoreBand = getAnalyticsBand(company.type, company.rankScore);
                  const rank = column.startIndex + index + 1;
                  return (
                    <li key={`${company.type}:${company.name}`} className={`min-w-0 border-b border-slate-100 dark:border-slate-800/70 ${rank % 2 === 1 ? 'bg-slate-50 dark:bg-slate-900/40' : 'bg-white dark:bg-slate-950'}`}>
                      <button type="button" onClick={() => setSelectedCompany(company)} className="grid w-full min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_5rem] items-center px-2 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900/70 sm:grid-cols-[3rem_minmax(0,1fr)_7rem_4rem]">
                        <span className="flex h-7 w-8 items-center justify-center rounded-md bg-slate-200 text-xs font-extrabold text-slate-800 dark:bg-slate-700 dark:text-slate-100">{rank}</span>
                        <span className="min-w-0 pr-3"><span className="flex items-center gap-2"><span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: scoreBand.hex }} /><span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100" title={company.name}>{company.name}</span></span><span className="mt-0.5 block truncate pl-4 text-[10px] text-slate-400">{company.type} · <span style={{ color: scoreBand.hex }}>{scoreBand.label}</span></span></span>
                        <span className="flex items-center justify-end gap-1 text-xs font-bold tabular-nums" style={{ color: scoreBand.hex }}>{formatNumber(getAnalyticsScore(company.type, company.rankScore))}<ChevronRight size={13} /></span>
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
            <div>
              <Pagination page={paginatedCompanies.currentPage + 1} pageSize={leaderboardPageSize} totalItems={visibleCompanies.length}
                onPageChange={(page) => setLeaderboardPage(page - 1)} onPageSizeChange={(size) => { setLeaderboardPageSize(size); setLeaderboardPage(0); }}
                ariaLabel="Company leaderboard pagination" showPageControls={paginatedCompanies.totalPages > 1 || leaderboardPageSize !== 20} />
              <p className="pb-2 text-[10px] text-slate-400">Select a row for details.</p>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="analytics-detail-heading" className="space-y-4">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0078a8]">Detailed analytics</p><h2 id="analytics-detail-heading" className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Trends and response quality</h2><p className="mt-1 text-sm text-slate-500">Existing Analytics data remains available in the updated visual system.</p></div>
        <div className="grid gap-4 xl:grid-cols-2">
          <article className={`${panelClass} p-4 sm:p-5`}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-bold">Rating trend</h3><p className="mt-1 text-xs text-slate-500">Average score and evaluation volume over time</p></div><select value={trendGranularity} onChange={(event) => setTrendGranularity(event.target.value as typeof trendGranularity)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900"><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="series">Survey period</option></select></div>
            <div className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={trendData} margin={{ top: 8, right: 12, left: -20, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="key" tick={{ fontSize: 10 }} /><YAxis yAxisId="score" domain={[0, 100]} tick={{ fontSize: 10 }} /><YAxis yAxisId="forms" orientation="right" allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip formatter={(value, name) => [name === 'Average Score' && typeof value === 'number' ? formatNumber(value) : value, name]} /><Line yAxisId="score" type="monotone" dataKey="average" name="Average Score" stroke="#0078a8" strokeWidth={3} dot={{ r: 3 }} /><Line yAxisId="forms" type="monotone" dataKey="responses" name="Counted Forms" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div>
          </article>
          <article className={`${panelClass} p-4 sm:p-5`}>
            <div className="mb-4">
              <h3 className="text-sm font-bold">Response volume</h3>
              <p className="mt-1 text-xs text-slate-500">Submitted evaluations by stakeholder category</p>
              <div role="group" aria-label="Response volume color legend" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="text-[10px] font-semibold text-slate-500">Response count:</span>
                <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-300"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-green-500" />Green 90+</span>
                <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-300"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-yellow-400" />Yellow 80–89</span>
                <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-300"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-orange-500" />Orange 70–79</span>
                <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-300"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-red-500" />Red under 70</span>
              </div>
            </div>
            <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={volumeData} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="surveyType" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="responses" radius={[6, 6, 0, 0]}>{volumeData.map((item) => <Cell key={item.surveyType} fill={responseVolumeBandColors[getValueColorBand(item.responses)]} />)}</Bar></BarChart></ResponsiveContainer></div>
          </article>
        </div>
        <CompanyAnalysisPanel analysis={summary.analysis} surveyTypes={permittedSurveyTypes} archiveSeries={archiveSeries} />
        <article className={`${panelClass} overflow-hidden`}>
          <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-6">
            <h3 className="text-sm font-bold">Question performance</h3>
            <p className="mt-1 text-xs text-slate-500">All scored criteria ranked from highest to lowest</p>
            <div role="group" aria-label="Question performance score color legend" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-[10px] font-semibold text-slate-500">Score bands:</span>
              <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-300"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-green-500" />Green 90+</span>
              <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-300"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-yellow-400" />Yellow 80–89.9</span>
              <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-300"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-orange-500" />Orange 70–79.9</span>
              <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-300"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-red-500" />Red under 70</span>
            </div>
          </div>
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
            <Pagination page={paginatedQuestionData.currentPage + 1} pageSize={questionPerformancePageSize} totalItems={questionData.length}
              onPageChange={(page) => setQuestionPerformancePage(page - 1)} onPageSizeChange={(size) => { setQuestionPerformancePageSize(size); setQuestionPerformancePage(0); }}
              ariaLabel="Question performance pagination" showPageControls={paginatedQuestionData.totalPages > 1 || questionPerformancePageSize !== 20} className="px-4 sm:px-6" />
          )}
        </article>
      </section>

      {selectedCompany && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/45 backdrop-blur-[1px]" role="presentation">
          <aside role="dialog" aria-modal="true" aria-labelledby="company-detail-title" className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl dark:bg-slate-950">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"><span className="text-xs font-semibold text-slate-400">Company performance</span><button type="button" onClick={closeSelectedCompany} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close company details"><X size={18} /></button></div>
            <div className="space-y-6 p-5 sm:p-7">
              <div><h2 id="company-detail-title" className="text-xl font-bold text-slate-900 dark:text-white">{selectedCompany.name}</h2><div className="mt-3 flex items-end gap-2"><span className="text-4xl font-bold tracking-tight text-[#0078a8]">{formatNumber(getAnalyticsScore(selectedCompany.type, selectedCompany.scorePercentage))}</span><span className="pb-1 text-sm text-slate-400">/ {selectedCompany.type === 'Subcontractor' ? '2.0' : '100'}</span></div><div className="mt-3 flex flex-wrap gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${typeStyles[selectedCompany.type].soft}`}>{selectedCompany.type}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{getAnalyticsBand(selectedCompany.type, selectedCompany.scorePercentage).label}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{selectedCompany.count} forms</span></div></div>
              <div className="border-t border-slate-100 pt-5 dark:border-slate-800"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Category results</h3><div className="mt-4 space-y-3">{selectedComposite?.sections.map((section) => (<div key={section.section}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate text-slate-600 dark:text-slate-300">{section.section}</span><span className="font-semibold tabular-nums">{formatNumber(section.percent)}</span></div><div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-full rounded-full ${typeStyles[selectedCompany.type].bar}`} style={{ width: `${section.percent}%` }} /></div></div>))}</div></div>
              <div className="border-t border-slate-100 pt-5 dark:border-slate-800"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Lowest performance questions</h3><div className="mt-3 space-y-3">{selectedLowestQuestions.length ? selectedLowestQuestions.map((question) => (<div key={question.question} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800"><div className="flex items-start justify-between gap-3"><p className="text-xs leading-5 text-slate-700 dark:text-slate-200">{question.question}</p><span className="shrink-0 text-xs font-bold text-rose-600">{formatNumber(question.average)}</span></div><p className="mt-1 text-[10px] text-slate-400">{question.responses} response{question.responses === 1 ? '' : 's'}</p></div>)) : <p className="text-xs text-slate-400">No scoreable question data is available.</p>}</div></div>
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
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"><div className="grid grid-cols-3 rounded-lg bg-slate-100 p-1 dark:bg-slate-900">{(['current', 'all-time', 'custom'] as const).map((scope) => (<button key={scope} type="button" onClick={() => onChangeDataScope?.(scope)} className={`rounded-md px-4 py-1.5 text-xs font-semibold ${dataScope === scope ? 'bg-[#0078a8] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}>{scope === 'current' ? 'Current' : scope === 'all-time' ? 'All time' : 'Custom'}</button>))}</div><div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><span>Company ranking</span><span className="font-semibold text-slate-700 dark:text-slate-200">Volume-weighted</span></div></div>
    </header>
  );
}

function KpiCard({ label, value, detail, tooltip }: { label: string; value: string; detail: string; tooltip: string }) {
  return <article className={`${panelClass} p-4 sm:p-5`}><div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400"><span>{label}</span><AnalyticsTooltip text={tooltip} /></div><p className="mt-2 text-2xl font-bold tracking-tight text-[#0078a8] sm:text-3xl">{value}</p><p className="mt-1 text-[11px] text-slate-400">{detail}</p></article>;
}
