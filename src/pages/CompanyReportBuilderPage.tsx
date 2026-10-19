import type { ReportParameters } from '../features/reports/domain/reportHistory';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useModalEscape } from '../hooks/useModalEscape';
import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  Download,
  FileText,
  FileType,
  ListChecks,
  MessageSquare,
  RadarIcon,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PartnerCompany, SurveyResponse, SurveyType } from '../types/survey';
import { surveyTypeDisplayLabel, formatCompositeScore, getBand, ratingBands } from '../data/questionWeights';
import { formatNumber, getScoreAxisDomain, questionPerformance } from '../features/analytics/domain/analytics';
import { computeCompanyComposite, getCompanyTrend, getLeaderboard, getSectionPeerAverages } from '../features/evaluations/domain/scoring';
import { captureChartImage, exportCompanyReportAsDocx, exportCompanyReportAsPDF } from '../features/reports/services/companyReportExport';
import { radarPointLabel } from '../features/analytics/components/radarChartLabels';
import {
  createCompanyReportData,
  getCompanyReportCommentId,
  getCompanyReportCommentResponses,
  getOverallFeedbackQuestionId,
} from '../features/feedback-hub/reporting';

interface CompanyReportBuilderPageProps {
  responses: SurveyResponse[];
  partnerCompanies: PartnerCompany[];
  canExport?: boolean;
  initialSettings?: ReportParameters;
  onBack: () => void;
}

const CATEGORIES: SurveyType[] = ['Courier', 'Supplier', 'Subcontractor'];
const PRIMARY_COLOR = '#0063a9';
const PEER_COLOR = '#b91c1c';
const PEER_LABEL = 'Peer average';
const EXTERNAL_BAR_COLORS = ['#0063a9', '#b91c1c', '#15803d', '#7e22ce', '#c2410c'];

type ReportAudience = 'internal' | 'external';
type SectionChartRow = { section: string; [series: string]: string | number | undefined };

function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-');
  if (!m) return month;
  const date = new Date(Number(year), Number(m) - 1, 1);
  if (Number.isNaN(date.getTime())) return month;
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export function CompanyReportBuilderPage({ responses, partnerCompanies, canExport, onBack, initialSettings = {} }: CompanyReportBuilderPageProps) {
  const [reportAudience, setReportAudience] = useState<ReportAudience>(initialSettings.reportAudience ?? 'internal');
  const [category, setCategory] = useState<SurveyType>(initialSettings.category ?? 'Courier');
  const [selectedCompany, setSelectedCompany] = useState<string>(initialSettings.selectedCompany ?? '');
  const [graphs, setGraphs] = useState(initialSettings.graphs ?? ({ bar: true, radar: true, trend: true, perQuestion: true }));
  const [includeComments, setIncludeComments] = useState(initialSettings.includeComments ?? false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState<'pdf' | 'docx' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [selectedComments, setSelectedComments] = useState<Record<string, boolean>>(initialSettings.selectedComments ?? ({}));
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false);
  const [tempSelectedComments, setTempSelectedComments] = useState<Record<string, boolean>>({});
  useModalEscape(isCommentsModalOpen, () => setIsCommentsModalOpen(false));

  const selectedCompanyRecord = useMemo(
    () => partnerCompanies.find(
      (company) => !company.isArchived && company.type === category && company.name === selectedCompany,
    ) ?? null,
    [partnerCompanies, category, selectedCompany],
  );

  const respondentComments = useMemo(() => {
    if (!selectedCompanyRecord) return [];
    return getCompanyReportCommentResponses({
      survey: { id: `company-report-${category.toLowerCase()}`, surveyType: category },
      companyId: selectedCompanyRecord.id,
      partnerCompanies,
      responses,
      scopeToSurveyId: false,
      commentScope: 'all',
    });
  }, [responses, selectedCompanyRecord, partnerCompanies, category]);

  useEffect(() => {
    if (category && selectedCompany) {
      const key = `selected_comments_${category}_${selectedCompany}`;
      const saved = localStorage.getItem(key);
      let savedSelection: Record<string, boolean> = {};
      if (saved) {
        try {
          const parsed: unknown = JSON.parse(saved);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            savedSelection = Object.fromEntries(
              Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'),
            );
          }
        } catch {
          savedSelection = {};
        }
      }

      if (category === initialSettings.category && selectedCompany === initialSettings.selectedCompany && initialSettings.selectedComments) savedSelection = initialSettings.selectedComments;
      const nextSelection: Record<string, boolean> = {};
      respondentComments.forEach((comment) => {
        const commentId = getCompanyReportCommentId(comment);
        const legacyOverallSelection = comment.questionId === getOverallFeedbackQuestionId(category)
          ? savedSelection[comment.responseId]
          : undefined;
        nextSelection[commentId] = savedSelection[commentId] ?? legacyOverallSelection ?? true;
      });
      setSelectedComments(nextSelection);
    }
  }, [category, selectedCompany, respondentComments]);

  const selectedCommentsList = useMemo(() => {
    return respondentComments.filter((comment) => selectedComments[getCompanyReportCommentId(comment)]);
  }, [respondentComments, selectedComments]);

  const handleOpenCommentsModal = () => {
    setTempSelectedComments({ ...selectedComments });
    setIsCommentsModalOpen(true);
  };

  const barRef = useRef<HTMLDivElement>(null);
  const radarRef = useRef<HTMLDivElement>(null);
  const trendRef = useRef<HTMLDivElement>(null);

  const leaderboard = useMemo(() => getLeaderboard(responses, category), [responses, category]);
  const companyOptions = useMemo(() => leaderboard.map((c) => c.company), [leaderboard]);

  // Keep the company selection valid whenever the category changes.
  useEffect(() => {
    if (selectedCompany === initialSettings.selectedCompany && category === initialSettings.category) return;
    if (!companyOptions.includes(selectedCompany)) {
      setSelectedCompany(companyOptions[0] ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, companyOptions.join('|')]);

  const composite = useMemo(
    () => (selectedCompany ? computeCompanyComposite(selectedCompany, category, responses) : null),
    [selectedCompany, category, responses],
  );
  const volumeWeightedSummary = useMemo(() => {
    if (!composite) return null;
    const rankedCompany = leaderboard.find(
      (candidate) => selectedCompanyRecord?.id && candidate.companyId === selectedCompanyRecord.id,
    ) ?? leaderboard.find((candidate) => candidate.company === selectedCompany);
    const score = composite.hasScore
      ? rankedCompany?.rankScore ?? composite.compositeScore
      : null;
    return {
      score,
      band: score === null ? composite.band : getBand(category, score),
    };
  }, [category, composite, leaderboard, selectedCompany, selectedCompanyRecord]);
  const peerAverages = useMemo(() => getSectionPeerAverages(responses, category), [responses, category]);
  const trend = useMemo(
    () => (selectedCompany ? getCompanyTrend(responses, selectedCompany, category) : []),
    [selectedCompany, category, responses],
  );
  const questionRows = useMemo(
    () => (selectedCompany ? questionPerformance(responses.filter((r) => r.company === selectedCompany)) : []),
    [selectedCompany, responses],
  );

  const sectionChartData = useMemo<SectionChartRow[]>(() => {
    if (!composite) return [];
    return composite.sections.map((section) => ({
      section: section.section,
      [composite.company]: section.percent,
      ...(reportAudience === 'internal'
        ? { [PEER_LABEL]: peerAverages.find((p) => p.section === section.section)?.average ?? 0 }
        : {}),
    }));
  }, [composite, peerAverages, reportAudience]);

  const sectionAxisDomain = useMemo(
    () => getScoreAxisDomain(sectionChartData.flatMap((row) => {
      const scores = [row[composite?.company ?? ''] as number];
      if (reportAudience === 'internal') scores.push(row[PEER_LABEL] as number);
      return scores;
    })),
    [sectionChartData, composite, reportAudience],
  );

  const trendChartData = useMemo(
    () => trend.map((t) => ({ month: t.month, label: formatMonthLabel(t.month), score: t.score })),
    [trend],
  );

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportMenuOpen]);

  const toggleGraph = (key: keyof typeof graphs) => setGraphs((prev) => ({ ...prev, [key]: !prev[key] }));

  const anyGraphSelected = graphs.bar || graphs.radar || graphs.trend || graphs.perQuestion || includeComments;
  const canRunExport = Boolean(canExport && composite && anyGraphSelected && !isExporting);

  // The PDF flows bar/radar/trend graphs and the per-question/comments
  // tables through one continuous cursor (see exportCompanyReportAsPDF's
  // ensureSpace), so it normally lands on 2 content pages regardless of how
  // many optional sections are checked - not one dedicated page per section.
  const hasPage3 = graphs.perQuestion || includeComments;
  const contentPageCount = hasPage3 ? 2 : 1;

  const handleExport = async (format: 'pdf' | 'docx') => {
    if (!composite || !selectedCompany) return;
    if (!selectedCompanyRecord) return;
    if (!canExport) return;
    setIsExporting(format);
    setExportMenuOpen(false);
    try {
      const chartImages = {
        bar: graphs.bar ? await captureChartImage(barRef.current) : null,
        radar: graphs.radar ? await captureChartImage(radarRef.current) : null,
        trend: graphs.trend ? await captureChartImage(trendRef.current) : null,
      };
      const data = createCompanyReportData({
        survey: {
          id: `company-report-${category.toLowerCase()}`,
          title: `Current ${category} responses`,
          surveyType: category,
        },
        companyId: selectedCompanyRecord.id,
        partnerCompanies,
        responses,
        scopeToSurveyId: false,
        graphs,
        includeComments,
        commentScope: 'all',
        chartImages,
        selectedCommentIds: new Set(selectedCommentsList.map(getCompanyReportCommentId)),
      });
      if (format === 'pdf') await exportCompanyReportAsPDF(data, undefined, false, false, { kind: 'company' as const, parameters: { reportAudience, category, selectedCompany, graphs, includeComments, selectedComments } });
      else await exportCompanyReportAsDocx(data, { kind: 'company' as const, parameters: { reportAudience, category, selectedCompany, graphs, includeComments, selectedComments } });
    } finally {
      setIsExporting(null);
    }
  };

  const radarTickFormatter = (value: string) => {
    if (!composite) return value;
    const row = sectionChartData.find((r) => r.section === value);
    if (!row) return value;
    const companyVal = row[composite.company];
    const companyStr = typeof companyVal === 'number' ? companyVal.toFixed(1) : '0.0';
    if (reportAudience === 'external') return `${value} (${companyStr})`;
    const peerVal = row[PEER_LABEL];
    const peerStr = typeof peerVal === 'number' ? peerVal.toFixed(1) : '0.0';
    return `${value} (${companyStr} / ${peerStr})`;
  };

  return (
    <div className="space-y-5">
      {initialSettings.selectedCompany === selectedCompany && !companyOptions.includes(selectedCompany) && <p role="alert" className="text-sm text-amber-700">The saved company is unavailable in the current data. Select an available company before exporting.</p>}
      {/* Header / always-visible back option */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="secondary-button">
          <ArrowLeft size={16} />
          <span>Back to Reports</span>
        </button>
        <div className="text-right">
          <h2 className="text-base font-semibold">Partners Report Builder</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Build a per-company PDF or Word report</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* Left: options */}
        <aside className="panel h-fit space-y-6 lg:sticky lg:top-4">
          <div className="flex w-fit items-center rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
            {(['internal', 'external'] as const).map((audience) => (
              <button
                key={audience}
                type="button"
                aria-pressed={reportAudience === audience}
                onClick={() => setReportAudience(audience)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  reportAudience === audience
                    ? 'bg-[#0063a9] text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {audience}
              </button>
            ))}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">1. Category</h3>
            <select
              className="field mt-2"
              value={category}
              onChange={(event) => setCategory(event.target.value as SurveyType)}
            >
              {CATEGORIES.map((type) => (
                <option key={type} value={type}>
                  {surveyTypeDisplayLabel[type]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">2. Company</h3>
            <select
              className="field mt-2"
              value={selectedCompany}
              onChange={(event) => setSelectedCompany(event.target.value)}
            >
              {companyOptions.length === 0 ? (
                <option value="">No companies with data yet</option>
              ) : (
                companyOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">3. Graphs to include</h3>
            <div className="mt-2 space-y-2">
              <GraphOption
                icon={BarChart3}
                label="Bar graph (section scores)"
                checked={graphs.bar}
                onChange={() => toggleGraph('bar')}
              />
              <GraphOption
                icon={RadarIcon}
                label="Radar graph (section scores)"
                checked={graphs.radar}
                onChange={() => toggleGraph('radar')}
              />
              <GraphOption
                icon={TrendingUp}
                label="Score trend"
                checked={graphs.trend}
                onChange={() => toggleGraph('trend')}
              />
              <GraphOption
                icon={ListChecks}
                label="Per-question average rating"
                checked={graphs.perQuestion}
                onChange={() => toggleGraph('perQuestion')}
              />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">4. Comments</h3>
            <div className="mt-2 space-y-2">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800 bg-white dark:bg-slate-900/20">
                <input
                  type="checkbox"
                  checked={includeComments}
                  onChange={() => setIncludeComments((prev) => !prev)}
                  className="mt-0.5"
                />
                <span className="flex-1">
                  <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                    <MessageSquare size={14} /> Include stakeholder comments
                  </span>
                  <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">
                    Show selected respondent remarks at the end of the performance report.
                  </span>
                </span>
              </label>

              {includeComments && (
                <button
                  type="button"
                  onClick={handleOpenCommentsModal}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-[#0063a9]/20 bg-[#0063a9]/5 px-4 py-2 text-xs font-semibold text-[#0063a9] hover:bg-[#0063a9]/10 transition dark:border-blue-900/40 dark:text-blue-300"
                >
                  <MessageSquare size={14} />
                  <span>Review Stakeholder Remarks ({selectedCommentsList.length})</span>
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Right: paginated print preview */}
        <section className="panel flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Preview</h3>
            <span className="text-xs text-slate-400 dark:text-slate-500">Scroll to review each page — shown as it will print</span>
          </div>

          <div className="max-h-[75vh] flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-200/70 p-6 dark:border-slate-800 dark:bg-slate-950/60 sm:p-10">
            {!composite ? (
              <div className="flex h-64 items-center justify-center text-center text-sm text-slate-400 dark:text-slate-500">
                Select a category and company on the left to generate a preview.
              </div>
            ) : (
              <div className="mx-auto flex flex-col items-center gap-10">
                {/* Page 1 — Cover. Header block sits near the top and the
                    confidentiality footer sits near the bottom, matching the
                    PDF's fixed y-coordinates (logo/title around 20-47% down,
                    footer around 88-92% down) - NOT vertically centered as one
                    unit, which would spread the blank space evenly top/bottom
                    instead of concentrating it in the middle like the PDF does. */}
                <PagedSheet pageLabel="Page 1 · Cover">
                  <div className="flex h-full flex-col items-center px-6 text-center">
                    <div className="pt-[16%]">
                      <img src="/microgenesis_logo.png" alt="Microgenesis" className="mx-auto h-14 w-auto" />
                      <div className="mx-auto mt-7 h-px w-20 bg-[#0063a9]" />
                      <h1 className="mt-7 text-3xl font-bold text-slate-800 dark:text-slate-100">Company Performance Report</h1>
                      <p className="mt-2 text-xl font-bold text-[#0063a9]">{composite.company}</p>
                      <p className="mt-1 text-base text-slate-500 dark:text-slate-400">
                        {category} Evaluation · Generated{' '}
                        {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    </div>
                    <div className="mt-auto pb-[7%] text-center">
                      <p className="text-sm text-slate-400 dark:text-slate-500">Prepared for internal review by the</p>
                      <p className="text-sm font-bold text-slate-500 dark:text-slate-300">Microgenesis Supplier Management System</p>
                      <p className="mt-1 text-xs italic text-slate-400 dark:text-slate-500">
                        This document is confidential and intended solely for the named recipient.
                      </p>
                    </div>
                  </div>
                </PagedSheet>

                {/* Page 2 — Executive summary, bar graph, radar graph */}
                <PagedSheet pageLabel="Page 2" footerRight={`Page 1 of ${contentPageCount}`}>
                  <ReportPageHeader company={composite.company} />
                  <h2 className="mt-6 text-xl font-bold text-slate-800 dark:text-slate-100">Executive Summary</h2>
                  <div className="mt-3 grid grid-cols-3 divide-x divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                    <SummaryStat label="Volume-Weighted score" value={volumeWeightedSummary?.score === null || volumeWeightedSummary?.score === undefined ? 'N/A' : formatCompositeScore(composite.surveyType, volumeWeightedSummary.score).text} accent />
                    <SummaryStat label="Rating band" value={volumeWeightedSummary?.band.label ?? composite.band.label} />
                    <SummaryStat label="Evaluations" value={String(composite.evaluationCount)} />
                  </div>

                  {graphs.bar && (
                    <div className="mt-4">
                      <h4 className="mb-1 text-xs font-bold text-slate-700 dark:text-slate-200">Section Scores — Bar Graph</h4>
                      <div ref={barRef} className="bg-white p-5 rounded-lg block dark:bg-slate-900">
                        <ReportRatingScale category={category} />
                        {/* Centered horizontal legend above the chart */}
                        <div className="mb-4 flex w-full flex-wrap justify-center gap-x-4 gap-y-1 text-[11px]">
                          {reportAudience === 'external' ? sectionChartData.map((row, index) => (
                            <div key={row.section} className="flex items-center gap-2">
                              <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: EXTERNAL_BAR_COLORS[index % EXTERNAL_BAR_COLORS.length] }} />
                              <span className="font-semibold text-slate-700 dark:text-slate-200">{row.section}</span>
                            </div>
                          )) : (
                            <>
                              <div className="flex items-center gap-2">
                                <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: PRIMARY_COLOR }} />
                                <span className="font-semibold text-slate-700 dark:text-slate-200">{composite.company}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: PEER_COLOR }} />
                                <span className="font-semibold text-slate-500 dark:text-slate-400">{PEER_LABEL}</span>
                              </div>
                            </>
                          )}
                        </div>
                        {/* Centered Bar Chart */}
                        <div className="h-[210px] w-full block">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={sectionChartData} margin={{ top: 24, right: 10, bottom: 5, left: -8 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="section" tick={{ fontSize: 9.5 }} interval={0} height={24} />
                              <YAxis domain={sectionAxisDomain} tick={{ fontSize: 10 }} />
                              <Tooltip />
                              <Bar dataKey={composite.company} fill={PRIMARY_COLOR} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                                {reportAudience === 'external' && sectionChartData.map((row, index) => (
                                  <Cell key={row.section} fill={EXTERNAL_BAR_COLORS[index % EXTERNAL_BAR_COLORS.length]} />
                                ))}
                                <LabelList dataKey={composite.company} position="top" formatter={(val) => typeof val === 'number' ? val.toFixed(1) : String(val ?? '')} style={{ fontSize: 13, fill: PRIMARY_COLOR, fontWeight: 'bold' }} />
                              </Bar>
                              {reportAudience === 'internal' && (
                                <Bar dataKey={PEER_LABEL} fill={PEER_COLOR} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                                  <LabelList dataKey={PEER_LABEL} position="top" formatter={(val) => typeof val === 'number' ? val.toFixed(1) : String(val ?? '')} style={{ fontSize: 13, fill: PEER_COLOR, fontWeight: 'bold' }} />
                                </Bar>
                              )}
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  )}

                  {graphs.radar && (
                    <div className="mt-4">
                      <h4 className="mb-1 text-xs font-bold text-slate-700 dark:text-slate-200">Section Scores — Radar Graph</h4>
                      <div ref={radarRef} className="h-[265px] w-full bg-white dark:bg-slate-900">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart data={sectionChartData} outerRadius="90%" margin={{ top: 20, right: 10, bottom: 0, left: 10 }}>
                            <PolarGrid />
                            <PolarAngleAxis dataKey="section" tick={{ fontSize: 10 }} tickFormatter={radarTickFormatter} />
                            <PolarRadiusAxis domain={sectionAxisDomain} tick={{ fontSize: 9 }} />
                            <Radar
                              name={composite.company}
                              dataKey={composite.company}
                              stroke={PRIMARY_COLOR}
                              fill={PRIMARY_COLOR}
                              fillOpacity={0.35}
                              isAnimationActive={false}
                            >
                              <LabelList
                                dataKey={composite.company}
                                content={radarPointLabel({ categoryCount: sectionChartData.length, fill: PRIMARY_COLOR, fontSize: 11, lane: -7 })}
                              />
                            </Radar>
                            {reportAudience === 'internal' && (
                              <Radar
                                name={PEER_LABEL}
                                dataKey={PEER_LABEL}
                                stroke={PEER_COLOR}
                                fill={PEER_COLOR}
                                fillOpacity={0.3}
                                isAnimationActive={false}
                              >
                                <LabelList
                                  dataKey={PEER_LABEL}
                                  content={radarPointLabel({ categoryCount: sectionChartData.length, fill: PEER_COLOR, fontSize: 11, lane: 7 })}
                                />
                              </Radar>
                            )}
                            <Legend verticalAlign="top" align="left" layout="vertical" iconSize={10} wrapperStyle={{ fontSize: 10, paddingBottom: 12, left: 0 }} />
                            <Tooltip />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Score Trend shares Page 2 with the bar/radar graphs, mirroring
                      the PDF's continuous cursor flow (ensureSpace only breaks to a
                      new page once content actually overflows). */}
                  {graphs.trend && (
                    <div className="mt-4">
                      <h4 className="mb-1 text-xs font-bold text-slate-700 dark:text-slate-200">Score Trend</h4>
                      <div ref={trendRef} className="h-48 w-full bg-white dark:bg-slate-900">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={trendChartData} margin={{ top: 20, right: 16, bottom: 5, left: -10 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} tickLine={false} width={30} />
                            <Tooltip />
                            <Legend verticalAlign="top" align="left" layout="horizontal" iconSize={10} wrapperStyle={{ fontSize: 10, paddingBottom: 10, left: 0 }} />
                            <Line type="monotone" dataKey="score" name={composite.company} stroke={PRIMARY_COLOR} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false}>
                              <LabelList dataKey="score" position="top" formatter={(val) => typeof val === 'number' ? val.toFixed(1) : String(val ?? '')} style={{ fontSize: 13, fill: PRIMARY_COLOR, fontWeight: 'bold' }} />
                            </Line>
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      {trendChartData.length === 0 && (
                        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Not enough dated submissions yet to plot a trend.</p>
                      )}
                    </div>
                  )}
                </PagedSheet>

                {/* Page 3 — Per-question table and comments share one page,
                    same reasoning as above. */}
                {hasPage3 && (
                  <PagedSheet pageLabel="Page 3" footerRight={`Page 2 of ${contentPageCount}`}>
                    <ReportPageHeader company={composite.company} />

                    {graphs.perQuestion && (
                      <div className="mt-6">
                        <h4 className="mb-2 text-base font-bold text-slate-800 dark:text-slate-100">Per-Question Average Rating</h4>
                        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                          <table className="w-full text-left text-[10px]">
                            <thead className="bg-[#0063a9] text-white">
                              <tr>
                                <th className="px-2.5 py-1.5 font-semibold">Question</th>
                                <th className="px-2.5 py-1.5 font-semibold">Average Rating</th>
                                <th className="px-2.5 py-1.5 font-semibold">Responses</th>
                              </tr>
                            </thead>
                            <tbody>
                              {questionRows.map((row, idx) => (
                                <tr key={row.question} className={idx % 2 === 0 ? 'bg-slate-50 dark:bg-slate-800/40' : ''}>
                                  <td className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300">{row.question}</td>
                                  <td className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300">{formatNumber(row.average)}</td>
                                  <td className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300">{row.responses}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {includeComments && (
                      <div className="mt-6">
                        <h4 className="mb-2 text-base font-bold text-slate-800 dark:text-slate-100">Stakeholder Comments</h4>
                        {respondentComments.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm italic text-slate-400 dark:border-slate-700 dark:text-slate-500">
                            No stakeholder comments have been submitted for this company and category.
                          </p>
                        ) : selectedCommentsList.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm italic text-slate-400 dark:border-slate-700 dark:text-slate-500">
                            No comments are selected for display. Click "Review Stakeholder Remarks" to select comments.
                          </p>
                        ) : (
                          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                            <table className="w-full text-left text-[10px]">
                              <thead className="bg-[#0063a9] text-white">
                              <tr>
                                <th className="px-2.5 py-1.5 font-semibold w-12">#</th>
                                <th className="px-2.5 py-1.5 font-semibold">Section</th>
                                <th className="px-2.5 py-1.5 font-semibold">Feedback / Comments</th>
                              </tr>
                              </thead>
                              <tbody>
                                {selectedCommentsList.map((c, idx) => (
                                  <tr key={getCompanyReportCommentId(c)} className={idx % 2 === 0 ? 'bg-slate-50 dark:bg-slate-800/40' : ''}>
                                    <td className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300 font-medium">{idx + 1}</td>
                                    <td className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300">{c.questionCategory}</td>
                                    <td className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300 italic">"{c.comment}"</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </PagedSheet>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Bottom bar: always-visible cancel + export */}
      <div className="panel sticky bottom-4 flex flex-wrap items-center justify-between gap-3 shadow-[0_10px_40px_rgba(0,0,0,0.15)] border border-slate-200/80 dark:border-slate-800 ring-1 ring-slate-900/5 dark:ring-white/10 z-10">
        <button type="button" onClick={onBack} className="secondary-button">
          Cancel
        </button>

        {canExport ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              disabled={!canRunExport}
              onClick={() => setExportMenuOpen((prev) => !prev)}
              className="primary-button disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={16} />
              {isExporting ? `Exporting ${isExporting.toUpperCase()}…` : 'Export'}
              <ChevronDown size={14} />
            </button>
            {exportMenuOpen && (
              <div className="absolute bottom-full right-0 z-20 mb-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => handleExport('pdf')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <FileText size={14} /> PDF
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('docx')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <FileType size={14} /> Word (.docx)
                </button>
              </div>
            )}
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-600 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-400">
            ⚠️ Exporting restricted to Supervisor and above
          </span>
        )}
      </div>

      {/* Review Comments Modal */}
      {isCommentsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="panel w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-in fade-in duration-200">
            <div className="border-b border-slate-100 pb-4 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Review Respondent Comments</h3>
              <p className="text-xs text-slate-500 mt-1 dark:text-slate-400">
                Select which comments should reflect on the final Company Report for <strong className="text-slate-700 dark:text-slate-300">{selectedCompany}</strong>. Unselected comments will be hidden from the report and exports.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {respondentComments.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm italic">
                  No comments have been submitted for this company and category yet.
                </div>
              ) : (
                <>
                  {/* Select All / Deselect All Bar */}
                  <div className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-lg dark:bg-slate-900/50 text-xs text-slate-500 font-medium">
                    <span>{respondentComments.length} total comments found</span>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          const updated: Record<string, boolean> = {};
                          respondentComments.forEach(c => {
                            updated[getCompanyReportCommentId(c)] = true;
                          });
                          setTempSelectedComments(updated);
                        }}
                        className="text-[#0063a9] hover:underline dark:text-blue-400"
                      >
                        Select All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => {
                          setTempSelectedComments({});
                        }}
                        className="text-rose-600 hover:underline dark:text-rose-400"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                  {respondentComments.map((c) => {
                    const commentId = getCompanyReportCommentId(c);
                    const isChecked = !!tempSelectedComments[commentId];
                    return (
                      <label
                        key={commentId}
                        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition text-sm ${
                          isChecked
                            ? 'border-[#0063a9]/30 bg-[#0063a9]/5 dark:border-blue-900/30 dark:bg-blue-950/20'
                            : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            setTempSelectedComments((prev) => ({
                              ...prev,
                              [commentId]: e.target.checked,
                            }));
                          }}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
                        />
                        <div className="flex-1 space-y-1">
                          <p className="text-slate-700 dark:text-slate-200 italic leading-relaxed">
                            "{c.comment}"
                          </p>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase dark:text-slate-500">
                            {c.questionCategory} · Anonymous Respondent Feedback
                          </p>
                        </div>
                      </label>
                    );
                  })}
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-slate-100 pt-4 flex justify-end gap-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsCommentsModalOpen(false)}
                className="secondary-button"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const key = `selected_comments_${category}_${selectedCompany}`;
                  localStorage.setItem(key, JSON.stringify(tempSelectedComments));
                  setSelectedComments(tempSelectedComments);
                  setIsCommentsModalOpen(false);
                }}
                className="primary-button bg-[#0063a9] hover:bg-[#00528c]"
              >
                Save Selection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportRatingScale({ category }: { category: SurveyType }) {
  const bands = ratingBands[category];
  const scales = bands.map((band, index) => {
    const upper = index === 0 ? 100 : (bands[index - 1]?.min ?? 1) - 1;
    return {
      color: band.hex,
      range: band.min === 0 ? `${upper} and below` : `${upper} - ${band.min}`,
      label: band.label,
    };
  });

  return (
    <>
      <h5 className="mb-1.5 text-[10px] font-bold uppercase tracking-wide">Rating Scale</h5>
      <div className="mb-4 grid grid-cols-1 gap-x-5 gap-y-1 text-slate-700 dark:text-slate-200 sm:grid-cols-2">
        {scales.map((scale) => (
          <div key={scale.range} className="flex items-center gap-1.5 text-[10px] leading-tight">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: scale.color }} />
            <span className="font-semibold">{scale.range}</span>
            <span aria-hidden="true">→</span>
            <span>{scale.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-bold ${accent ? 'text-[#0063a9]' : 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
    </div>
  );
}

/** A single A4-proportioned sheet in the print preview, styled like a Word/PDF print-layout page. */
function PagedSheet({
  children,
  pageLabel,
  footerRight,
}: {
  children: ReactNode;
  pageLabel: string;
  footerRight?: string;
}) {
  const PAGE_WIDTH = 640;
  const PAGE_HEIGHT = Math.round(PAGE_WIDTH * (297 / 210)); // A4 aspect ratio
  return (
    <div className="flex flex-col items-center">
      <div
        className="w-full rounded-sm bg-white shadow-xl ring-1 ring-slate-900/5 dark:bg-slate-900 dark:ring-white/10"
        style={{ width: PAGE_WIDTH, minHeight: PAGE_HEIGHT, maxWidth: '100%' }}
      >
        <div className="flex h-full flex-col px-4 py-6 sm:px-12 sm:py-9">
          <div className="flex-1">{children}</div>
          {footerRight && (
            <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-3 text-[10px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
              <span>Microgenesis Supplier Management System — Confidential</span>
              <span>{footerRight}</span>
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-[11px] font-medium text-slate-400 dark:text-slate-500">{pageLabel}</p>
    </div>
  );
}

/** The small running header (logo + company name) repeated at the top of each content page, mirroring the export. */
function ReportPageHeader({ company }: { company: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
      <img src="/microgenesis_logo.png" alt="Microgenesis" className="h-6 w-auto" />
      <div className="text-right">
        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{company}</p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">Company Performance Report</p>
      </div>
    </div>
  );
}

function GraphOption({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: typeof BarChart3;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <Icon size={14} className="text-slate-400" />
      <span className="text-slate-700 dark:text-slate-200">{label}</span>
    </label>
  );
}
