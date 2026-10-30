import { PaperSizeSelect } from '../features/reports/components/PaperSizeSelect';
import type { PaperSize } from '../features/reports/domain/paperSize';
import { ExportHistoryPage } from './ExportHistoryPage';
import type { ReportRecipe } from '../features/reports/domain/reportHistory';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Database, Download, FileType, FileBarChart, FileSpreadsheet, FileText, Table2, Handshake, Search } from 'lucide-react';
import { PartnerCompany, SurveyResponse, SurveyType } from '../types/survey';
import { formatNumber, getKpiSummary, questionPerformance, averageBySurveyType } from '../features/analytics/domain/analytics';
import { formatAnalyticsScore, getAnalyticsCompanyRankings } from '../features/analytics/domain/rankings';
import { ExportTable, exportTablesAsCSV, exportTablesAsExcel, exportTablesAsPDF, exportTablesAsWord } from '../features/reports/services/exporters';
import { CompanyReportBuilderPage } from './CompanyReportBuilderPage';
import { QuestionReportBuilderPage } from './QuestionReportBuilderPage';
import { SummaryReportBuilderPage } from './SummaryReportBuilderPage';
import { ExecutiveSummaryReportBuilderPage } from './ExecutiveSummaryReportBuilderPage';
import { RawDataExportPage } from './RawDataExportPage';
import { PageDescription } from '../components/PageDescription';
import { ArchivedReportBuilder } from '../features/reports/components/ArchivedReportBuilder';
import { ARCHIVED_REPORT_TITLES, isArchivedReportKind, type ArchivedReportData, type ArchivedReportKind } from '../features/reports/domain/archivedReports';

interface ReportsPageProps {
  archivedData?: ArchivedReportData;
  responses: SurveyResponse[];
  rankingResponses?: SurveyResponse[];
  companyReportResponses?: SurveyResponse[];
  partnerCompanies?: PartnerCompany[];
  canExport?: boolean;
  initialRecipe?: ReportRecipe;
}

type ExportFormat = 'pdf' | 'csv' | 'excel' | 'docx';

async function runExport(format: ExportFormat, reportTitle: string, tables: ExportTable[], filenameBase: string, paperSize: PaperSize = 'a4') {
  if (format === 'docx') return exportTablesAsWord(reportTitle, tables, filenameBase, undefined, paperSize);
  if (format === 'csv') return exportTablesAsCSV(tables, filenameBase);
  else if (format === 'excel') return exportTablesAsExcel(tables, filenameBase);
  else return exportTablesAsPDF(reportTitle, tables, filenameBase, undefined, undefined, paperSize);
}

export function ReportsPage(props: ReportsPageProps) {
  const [archivedKind, setArchivedKind] = useState<ArchivedReportKind | null>(props.initialRecipe && isArchivedReportKind(props.initialRecipe.kind) ? props.initialRecipe.kind : null);
  const [tab, setTab] = useState(() => window.location.pathname.endsWith('/export-history') || new URLSearchParams(window.location.search).get('tab') === 'history' ? 'history' : 'generate');
  const [recipe, setRecipe] = useState<ReportRecipe | undefined>(props.initialRecipe);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const sync = () => setTab(window.location.pathname.endsWith('/export-history') || new URLSearchParams(window.location.search).get('tab') === 'history' ? 'history' : 'generate');
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const chooseTab = (next: string) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === 'history') url.searchParams.set('tab', 'history');
    else url.searchParams.delete('tab');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  };
  return <div className="admin-reports-page space-y-5">
    <div role="tablist" aria-label="Reports" className="flex gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
      {['generate', 'history'].map(value => <button key={value} type="button" role="tab" tabIndex={tab === value ? 0 : -1} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 'generate' : event.key === 'End' ? 'history' : value === 'generate' ? 'history' : 'generate';
        chooseTab(next);
        event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#reports-${next}`)?.focus();
      }} aria-selected={tab === value} aria-controls="reports-panel" id={`reports-${value}`} className={tab === value ? 'primary-button' : 'secondary-button'} onClick={() => chooseTab(value)}>{value === 'generate' ? 'Generate' : 'History'}</button>)}
    </div>
    <div role="tabpanel" id="reports-panel" aria-labelledby={`reports-${tab}`} className="min-w-0">
      {tab === 'history' ? <ExportHistoryPage canExport={props.canExport} onRegenerate={saved => { setRecipe(saved); setArchivedKind(isArchivedReportKind(saved.kind) ? saved.kind : null); setRevision(value => value + 1); chooseTab('generate'); }} /> : archivedKind ? <>
        <PageDescription>Generate a report for one archived survey, response archive, or company.</PageDescription>
        <ArchivedReportBuilder key={revision} kind={archivedKind} data={props.archivedData ?? { responses: [], surveys: [], knownSurveys: [], companies: [], series: [] }} canExport={props.canExport ?? false} initialSettings={recipe?.kind === archivedKind ? recipe.parameters : undefined} onBack={() => { setArchivedKind(null); setRecipe(undefined); }} />
      </> : <ReportGenerator key={revision} {...props} initialRecipe={recipe} onOpenArchivedReport={kind => { setArchivedKind(kind); setRecipe(undefined); setRevision(value => value + 1); }} />}
    </div>
  </div>;
}

function ReportGenerator({ initialRecipe, responses: rawResponses, rankingResponses = rawResponses, companyReportResponses, partnerCompanies = [], canExport = false, onOpenArchivedReport }: ReportsPageProps & { onOpenArchivedReport: (kind: ArchivedReportKind) => void }) {
  const responses = rankingResponses;
  const [showSummaryBuilder, setShowSummaryBuilder] = useState(initialRecipe?.kind === 'summary');
  const [showCompanyBuilder, setShowCompanyBuilder] = useState(initialRecipe?.kind === 'company');
  const [showQuestionBuilder, setShowQuestionBuilder] = useState(initialRecipe?.kind === 'question');
  const [showExecutiveBuilder, setShowExecutiveBuilder] = useState(initialRecipe?.kind === 'executive');
  const [showRawDataExport, setShowRawDataExport] = useState(initialRecipe?.kind === 'raw');
  const summary = getKpiSummary(responses);
  const allQuestionRows = questionPerformance(responses);
  const questionRows = allQuestionRows.slice(0, 5);
  const rankingTypes = (['Courier', 'Supplier', 'Subcontractor'] as SurveyType[]).filter((type) =>
    rankingResponses.some((response) => response.surveyType === type),
  );
  const companyPerformance = getAnalyticsCompanyRankings(rankingResponses, rankingTypes).map((ranking) => ({
    company: ranking.name,
    surveyType: ranking.type,
    score: ranking.rankScore,
    evaluations: ranking.count,
  }));
  
  const topCompanies = companyPerformance;

  // --- Table builders: same underlying data the page renders, reshaped
  // into the generic { title, columns, rows } shape the export utils need.
  const summaryTable: ExportTable = {
    title: 'Summary Report',
    columns: ['Metric', 'Value'],
    rows: [
      ['Total Responses', summary.totalResponses],
      ['Average Rating', formatNumber(summary.averageRating)],
      ['Overall Satisfaction', `${formatNumber(summary.overallSatisfactionScore)}%`],
      ['N/A Rate', `${formatNumber(summary.naPercentage)}%`],
      ['Highest Rated Question', summary.highestRatedQuestion],
      ['Lowest Rated Question', summary.lowestRatedQuestion],
    ],
  };

  const surveyReportTable: ExportTable = {
    title: 'Survey Performance Summary',
    columns: ['Survey Type', 'Average Rating (%)', 'Responses'],
    rows: averageBySurveyType(responses).map((row) => [row.surveyType, `${formatNumber(row.average)}%`, row.responses]),
  };

  const topCompaniesTable: ExportTable = {
    title: 'Company Rankings (Highest to Lowest)',
    columns: ['Company', 'Survey Type', 'Leaderboard Score', 'Responses'],
    rows: topCompanies.map((row) => [row.company, row.surveyType, formatAnalyticsScore(row.surveyType, row.score), row.evaluations]),
  };

  const questionHighlightsTable: ExportTable = {
    title: 'Question Highlights (Top 5)',
    columns: ['Question', 'Average Rating', 'Responses'],
    rows: questionRows.map((row) => [row.question, formatNumber(row.average), row.responses]),
  };

  const questionReportTable: ExportTable = {
    title: 'Question Report (All Questions)',
    columns: ['Question', 'Average Rating', 'Responses'],
    rows: allQuestionRows.map((row) => [row.question, formatNumber(row.average), row.responses]),
  };

  const handleExecutiveExport = (format: ExportFormat, paperSize: PaperSize = 'a4') => {
    const tables = [summaryTable, topCompaniesTable, questionHighlightsTable];
    return runExport(format, 'Executive Summary', tables, 'executive_summary', paperSize);
  };

  const handleCardExport = (format: ExportFormat, card: 'summary' | 'question' | 'survey' | 'companies', paperSize: PaperSize = 'a4') => {
    if (card === 'summary') return runExport(format, 'Summary Report', [summaryTable, surveyReportTable], 'summary_report', paperSize);
    else if (card === 'question') return runExport(format, 'Question Report', [questionReportTable], 'question_report', paperSize);
    else if (card === 'companies') return runExport(format, 'Companies Performance Report', [topCompaniesTable], 'companies_report', paperSize);
  };

  if (showSummaryBuilder) {
    return (
      <SummaryReportBuilderPage
        initialSettings={initialRecipe?.kind === 'summary' ? initialRecipe.parameters : undefined}
        responses={responses}
        rankingResponses={rankingResponses}
        partnerCompanies={partnerCompanies}
        canExport={canExport}
        onBack={() => setShowSummaryBuilder(false)}
      />
    );
  }

  if (showExecutiveBuilder) {
    return (
      <ExecutiveSummaryReportBuilderPage
        initialSettings={initialRecipe?.kind === 'executive' ? initialRecipe.parameters : undefined}
        responses={responses}
        rankingResponses={rankingResponses}
        partnerCompanies={partnerCompanies}
        canExport={canExport}
        onBack={() => setShowExecutiveBuilder(false)}
      />
    );
  }

  if (showCompanyBuilder) {
    return (
      <CompanyReportBuilderPage
        initialSettings={initialRecipe?.kind === 'company' ? initialRecipe.parameters : undefined}
        responses={companyReportResponses ?? responses}
        partnerCompanies={partnerCompanies}
        canExport={canExport}
        onBack={() => setShowCompanyBuilder(false)}
      />
    );
  }

  if (showQuestionBuilder) {
    return (
      <QuestionReportBuilderPage
        initialSettings={initialRecipe?.kind === 'question' ? initialRecipe.parameters : undefined}
        responses={responses}
        partnerCompanies={partnerCompanies}
        canExport={canExport}
        onBack={() => setShowQuestionBuilder(false)}
      />
    );
  }

  if (showRawDataExport) {
    return (
      <RawDataExportPage
        initialCategory={initialRecipe?.parameters.category}
        initialPaperSize={initialRecipe?.parameters.paperSize}
        responses={rawResponses}
        canExport={canExport}
        onBack={() => setShowRawDataExport(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageDescription>Create response and partner reports and export them in your preferred format.</PageDescription>
      <section aria-label="Available reports" className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-1 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Report library</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Choose a report to configure, preview, and download.</p></div>
          <span className="text-[11px] text-slate-400">{canExport ? 'Exports available' : 'Export access restricted'}</span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
        <ReportCard
          title="Summary Report"
          description="Evaluation totals, satisfaction, and rating highlights"
          icon={FileBarChart}
          canExport={canExport}
          onExport={(format, paperSize) => handleCardExport(format, 'summary', paperSize)}
          onOpenBuilder={() => setShowSummaryBuilder(true)}
        />
        <ReportCard
          title="Companies Report"
          description="Compare company performance and response volume"
          icon={Handshake}
          canExport={canExport}
          onExport={(format, paperSize) => handleCardExport(format, 'companies', paperSize)}
          onOpenBuilder={() => setShowCompanyBuilder(true)}
        />
        <ReportCard
          title="Question Report"
          description="Review scores and response counts by question"
          icon={Search}
          canExport={canExport}
          onExport={(format, paperSize) => handleCardExport(format, 'question', paperSize)}
          onOpenBuilder={() => setShowQuestionBuilder(true)}
        />
        <ReportCard
          title="Raw Data Export"
          description="Select response records and fields for export"
          icon={Database}
          canExport={canExport}
          showExport={false}
          onExport={() => {}}
          onOpenBuilder={() => setShowRawDataExport(true)}
        />
        </div>
      </section>

      <section aria-labelledby="archived-report-library" className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800"><h2 id="archived-report-library" className="text-sm font-bold text-slate-800 dark:text-slate-100">Archived reports</h2><p className="mt-1 text-xs text-slate-500">Choose a report, then select one archived item to configure and preview.</p></div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <ReportCard title={ARCHIVED_REPORT_TITLES['archived-survey']} description="One survey with its related companies and evaluation results" icon={FileBarChart} showExport={false} onExport={() => {}} onOpenBuilder={() => onOpenArchivedReport('archived-survey')} />
          <ReportCard title={ARCHIVED_REPORT_TITLES['archived-responses']} description="One response archive from Archive Center" icon={Database} showExport={false} onExport={() => {}} onOpenBuilder={() => onOpenArchivedReport('archived-responses')} />
          <ReportCard title={ARCHIVED_REPORT_TITLES['archived-company']} description="One archived company and its evaluation history" icon={Handshake} showExport={false} onExport={() => {}} onOpenBuilder={() => onOpenArchivedReport('archived-company')} />
        </div>
      </section>

      <section aria-labelledby="executive-summary-heading" className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#2187CD]">Integrated performance briefing</p>
            <h2 id="executive-summary-heading" className="mt-1 text-base font-bold text-slate-800 dark:text-white">Executive Summary Dossier</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Complete, integrated performance briefing combining summary KPIs and critical question diagnostics.</p>
          </div>
          <button className="primary-button inline-flex shrink-0 items-center gap-1.5 self-start" type="button" onClick={() => setShowExecutiveBuilder(true)}><span>Build Executive Report</span><ChevronRight size={14} /></button>
        </div>
        <dl aria-label="Current report snapshot" className="grid grid-cols-2 divide-x divide-y divide-slate-100 border-b border-slate-100 dark:divide-slate-800 dark:border-slate-800 md:grid-cols-4 md:divide-y-0">
          <div className="px-5 py-3"><dt className="text-[10px] font-semibold text-slate-400">Total responses</dt><dd className="mt-1 text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100">{summary.totalResponses}</dd></div>
          <div className="px-5 py-3"><dt className="text-[10px] font-semibold text-slate-400">Average rating</dt><dd className="mt-1 text-lg font-bold tabular-nums text-[#2187CD]">{formatNumber(summary.averageRating)}</dd></div>
          <div className="px-5 py-3"><dt className="text-[10px] font-semibold text-slate-400">Overall satisfaction</dt><dd className="mt-1 text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100">{formatNumber(summary.overallSatisfactionScore)}%</dd></div>
          <div className="px-5 py-3"><dt className="text-[10px] font-semibold text-slate-400">N/A rate</dt><dd className="mt-1 text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100">{formatNumber(summary.naPercentage)}%</dd></div>
        </dl>
        <div className="grid md:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]">
          <div className="px-5 py-4 md:border-r md:border-slate-100 dark:md:border-slate-800">
            <h3 className="text-xs font-bold text-slate-500">Question Rating Highlights</h3>
            <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {questionRows.length ? questionRows.map((row) => (
                <div key={row.question} className="flex items-center justify-between gap-4 py-2.5 text-xs">
                  <span className="min-w-0 truncate text-slate-600 dark:text-slate-300" title={row.question}>{row.question}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-[#2187CD]">{formatNumber(row.average)}%</span>
                </div>
              )) : <p className="py-3 text-xs text-slate-400">Question ratings will appear when scored responses are available.</p>}
            </div>
          </div>
          <div className="flex flex-col justify-between border-t border-slate-100 px-5 py-4 dark:border-slate-800 md:border-t-0">
            <div>
              <h3 className="text-xs font-bold text-slate-500">Interactive Briefing Benefits</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Unlock strategic compliance highlights. Filter down evaluating questions below an adjustable critical percentage threshold, review automatically calculated strategic alerts, and add custom executive notes to compile a polished, presentation-ready briefing deck.
              </p>
            </div>
            <button className="mt-3 inline-flex items-center gap-1 self-start text-xs font-semibold text-[#2187CD] hover:underline" onClick={() => setShowExecutiveBuilder(true)}>
              Configure custom executive comments & threshold
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ReportCard({
  title,
  description,
  icon: Icon,
  canExport,
  showExport,
  onExport,
  onOpenBuilder,
}: {
  title: string;
  description: string;
  icon: typeof FileBarChart;
  canExport?: boolean;
  showExport?: boolean;
  onExport: (format: ExportFormat, paperSize: PaperSize) => void | Promise<void>;
  onOpenBuilder?: () => void;
}) {
  return (
    <article className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eef7fc] text-[#2187CD] dark:bg-slate-900 dark:text-sky-300"><Icon size={17} strokeWidth={1.8} /></span>
        <div className="min-w-0"><h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p></div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-12 sm:pl-0">
        {onOpenBuilder && <button type="button" onClick={onOpenBuilder} className="ghost-button inline-flex items-center gap-1.5">Build report <ChevronRight size={14} /></button>}
        {showExport !== false && canExport && <ExportMenu onExport={onExport} />}
        {showExport !== false && !canExport && <span className="text-[11px] font-medium text-slate-400">Export restricted</span>}
      </div>
    </article>
  );
}

/** Compact "Export ▾" trigger that reveals PDF / CSV / Excel choices, used on each report card. */
function ExportMenu({ onExport }: { onExport: (format: ExportFormat, paperSize: PaperSize) => void | Promise<void> }) {
  const [paperSize, setPaperSize] = useState<PaperSize>('a4');
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const choose = async (format: ExportFormat) => {
    setOpen(false); setExporting(true); setError('');
    try { await onExport(format, paperSize); }
    catch { setError('Unable to export this report. Please retry.'); }
    finally { setExporting(false); }
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button className="ghost-button" type="button" disabled={exporting} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Download size={15} />
        Export
        <ChevronDown size={14} />
      </button>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="p-3 border-b border-slate-100 dark:border-slate-700"><PaperSizeSelect value={paperSize} onChange={setPaperSize} disabled={exporting} /></div>
          <button
            type="button"
            onClick={() => choose('pdf')}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <FileText size={14} /> PDF
          </button>
          <button
            type="button"
            onClick={() => choose('csv')}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Table2 size={14} /> CSV
          </button>
          <button
            type="button"
            onClick={() => choose('excel')}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <FileSpreadsheet size={14} /> Excel
          </button>
          <button
            type="button"
            onClick={() => choose('docx')}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <FileType size={14} /> Word (.docx)
          </button>
        </div>
      ) : null}
    </div>
  );
}
