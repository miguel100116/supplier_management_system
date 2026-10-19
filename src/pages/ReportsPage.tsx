import { ExportHistoryPage } from './ExportHistoryPage';
import type { ReportRecipe } from '../features/reports/domain/reportHistory';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Database, Download, FileBarChart, FileSpreadsheet, FileText, Table2, Handshake, Search } from 'lucide-react';
import { PartnerCompany, SurveyResponse, SurveyType } from '../types/survey';
import { formatNumber, getKpiSummary, questionPerformance, averageBySurveyType } from '../features/analytics/domain/analytics';
import { formatCompositeScore } from '../data/questionWeights';
import { getAnalyticsCompanyRankings } from '../features/analytics/domain/rankings';
import { ExportTable, exportTablesAsCSV, exportTablesAsExcel, exportTablesAsPDF } from '../features/reports/services/exporters';
import { CompanyReportBuilderPage } from './CompanyReportBuilderPage';
import { QuestionReportBuilderPage } from './QuestionReportBuilderPage';
import { SummaryReportBuilderPage } from './SummaryReportBuilderPage';
import { ExecutiveSummaryReportBuilderPage } from './ExecutiveSummaryReportBuilderPage';
import { RawDataExportPage } from './RawDataExportPage';
import { PageDescription } from '../components/PageDescription';

interface ReportsPageProps {
  responses: SurveyResponse[];
  rankingResponses?: SurveyResponse[];
  companyReportResponses?: SurveyResponse[];
  partnerCompanies?: PartnerCompany[];
  canExport?: boolean;
  initialRecipe?: ReportRecipe;
}

type ExportFormat = 'pdf' | 'csv' | 'excel';

function runExport(format: ExportFormat, reportTitle: string, tables: ExportTable[], filenameBase: string) {
  if (format === 'csv') exportTablesAsCSV(tables, filenameBase);
  else if (format === 'excel') exportTablesAsExcel(tables, filenameBase);
  else exportTablesAsPDF(reportTitle, tables, filenameBase);
}

export function ReportsPage(props: ReportsPageProps) {
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
  return <div className="space-y-5">
    <div role="tablist" aria-label="Reports" className="flex gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
      {['generate', 'history'].map(value => <button key={value} type="button" role="tab" tabIndex={tab === value ? 0 : -1} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 'generate' : event.key === 'End' ? 'history' : value === 'generate' ? 'history' : 'generate';
        chooseTab(next);
        event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#reports-${next}`)?.focus();
      }} aria-selected={tab === value} aria-controls="reports-panel" id={`reports-${value}`} className={tab === value ? 'primary-button' : 'secondary-button'} onClick={() => chooseTab(value)}>{value === 'generate' ? 'Generate' : 'History'}</button>)}
    </div>
    <div role="tabpanel" id="reports-panel" aria-labelledby={`reports-${tab}`}>
      {tab === 'history' ? <ExportHistoryPage canExport={props.canExport} onRegenerate={saved => { setRecipe(saved); setRevision(value => value + 1); chooseTab('generate'); }} /> : <ReportGenerator key={revision} {...props} initialRecipe={recipe} />}
    </div>
  </div>;
}

function ReportGenerator({ initialRecipe, responses, rankingResponses = responses, companyReportResponses, partnerCompanies = [], canExport = false }: ReportsPageProps) {
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
  
  const splitCount = Math.min(10, Math.floor(companyPerformance.length / 2));
  const topCompanies = companyPerformance.slice(0, splitCount);
  const leastRatedCompanies = companyPerformance.slice().reverse().slice(0, splitCount);

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
    title: `Top Performing Companies (Top ${splitCount})`,
    columns: ['Company', 'Survey Type', 'Volume-Weighted Score', 'Evaluations'],
    rows: topCompanies.map((row) => [row.company, row.surveyType, formatCompositeScore(row.surveyType, row.score).text, row.evaluations]),
  };

  const leastRatedCompaniesTable: ExportTable = {
    title: `Least Rated Companies (Bottom ${splitCount})`,
    columns: ['Company', 'Survey Type', 'Volume-Weighted Score', 'Evaluations'],
    rows: leastRatedCompanies.map((row) => [row.company, row.surveyType, formatCompositeScore(row.surveyType, row.score).text, row.evaluations]),
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

  const handleExecutiveExport = (format: ExportFormat) => {
    const tables = [summaryTable, topCompaniesTable, leastRatedCompaniesTable, questionHighlightsTable];
    runExport(format, 'Executive Summary', tables, 'executive_summary');
  };

  const handleCardExport = (format: ExportFormat, card: 'summary' | 'question' | 'survey' | 'companies') => {
    if (card === 'summary') runExport(format, 'Summary Report', [summaryTable, surveyReportTable], 'summary_report');
    else if (card === 'question') runExport(format, 'Question Report', [questionReportTable], 'question_report');
    else if (card === 'companies') runExport(format, 'Companies Performance Report', [topCompaniesTable, leastRatedCompaniesTable], 'companies_report');
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
        responses={responses}
        canExport={canExport}
        onBack={() => setShowRawDataExport(false)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageDescription>Create evaluation and partner reports and export them in your preferred format.</PageDescription>
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <ReportCard
          title="Summary Report"
          icon={FileBarChart}
          canExport={canExport}
          onExport={(format) => handleCardExport(format, 'summary')}
          onOpenBuilder={() => setShowSummaryBuilder(true)}
        />
        <ReportCard
          title="Companies Report"
          icon={Handshake}
          canExport={canExport}
          onExport={(format) => handleCardExport(format, 'companies')}
          onOpenBuilder={() => setShowCompanyBuilder(true)}
        />
        <ReportCard
          title="Question Report"
          icon={Search}
          canExport={canExport}
          onExport={(format) => handleCardExport(format, 'question')}
          onOpenBuilder={() => setShowQuestionBuilder(true)}
        />
        <ReportCard
          title="Raw Data Export"
          icon={Database}
          canExport={canExport}
          onExport={() => {}}
          onOpenBuilder={() => setShowRawDataExport(true)}
        />
      </section>

      <section className="panel border-t-4 border-[#0063a9] bg-gradient-to-br from-white to-blue-50/20 dark:from-slate-950 dark:to-slate-950">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-[#0063a9] animate-pulse" />
              <h3 className="text-base font-bold text-slate-800 dark:text-white">Executive Summary Dossier</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Complete, integrated performance briefing combining summary KPIs and critical question diagnostics.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="primary-button inline-flex items-center gap-1.5" type="button" onClick={() => setShowExecutiveBuilder(true)}>
              <span>Build Executive Report</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200/60 bg-white/50 p-4 dark:border-slate-800/60 dark:bg-slate-900/40">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Question Rating Highlights</h4>
            <div className="space-y-2.5">
              {questionRows.map((row) => (
                <div key={row.question} className="flex items-center justify-between gap-4 text-xs">
                  <span className="text-slate-600 dark:text-slate-300 truncate max-w-[280px]" title={row.question}>{row.question}</span>
                  <span className="font-mono font-bold text-[#0063a9] bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded text-[10px]">{formatNumber(row.average)}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200/60 bg-white/50 p-4 dark:border-slate-800/60 dark:bg-slate-900/40 flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Interactive Briefing Benefits</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Unlock strategic compliance highlights. Filter down evaluating questions below an adjustable critical percentage threshold, review automatically calculated strategic alerts, and add custom executive notes to compile a polished, presentation-ready briefing deck.
              </p>
            </div>
            <button className="text-xs font-semibold text-[#0063a9] hover:underline inline-flex items-center gap-1 mt-3 self-start" onClick={() => setShowExecutiveBuilder(true)}>
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
  icon: Icon,
  canExport,
  onExport,
  onOpenBuilder,
}: {
  title: string;
  icon: typeof FileBarChart;
  canExport?: boolean;
  onExport: (format: ExportFormat) => void;
  onOpenBuilder?: () => void;
}) {
  // The Companies Report card is clickable end-to-end: it opens the report
  // builder sub-tab (category → company → graphs → preview → export)
  // instead of the plain "pick a format and download" menu the other cards use.
  if (onOpenBuilder) {
    return (
      <article
        role="button"
        tabIndex={0}
        onClick={onOpenBuilder}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onOpenBuilder();
        }}
        className="panel cursor-pointer transition-colors hover:border-[#0063a9]/40 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 flex flex-col items-center text-center"
      >
        <div className="mb-6 flex h-28 w-28 items-center justify-center rounded-2xl bg-blue-50/80 dark:bg-blue-950/40">
          <Icon size={64} strokeWidth={1.5} className="text-blue-500 dark:text-blue-400" />
        </div>
        <h3 className="font-semibold">{title}</h3>
        <span className="ghost-button mt-4 inline-flex">
          Build report
          <ChevronRight size={14} />
        </span>
      </article>
    );
  }

  return (
    <article className="panel flex flex-col items-center text-center">
      <div className="mb-6 flex h-28 w-28 items-center justify-center rounded-2xl bg-blue-50/80 dark:bg-blue-950/40">
        <Icon size={64} strokeWidth={1.5} className="text-blue-500 dark:text-blue-400" />
      </div>
      <h3 className="font-semibold">{title}</h3>
      {canExport ? (
        <ExportMenu onExport={onExport} />
      ) : (
        <p className="mt-4 text-[11px] font-bold text-slate-400 select-none">⚠️ Export restricted</p>
      )}
    </article>
  );
}

/** Compact "Export ▾" trigger that reveals PDF / CSV / Excel choices, used on each report card. */
function ExportMenu({ onExport }: { onExport: (format: ExportFormat) => void }) {
  const [open, setOpen] = useState(false);
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

  const choose = (format: ExportFormat) => {
    onExport(format);
    setOpen(false);
  };

  return (
    <div className="relative mt-4 inline-block" ref={containerRef}>
      <button className="ghost-button" type="button" onClick={() => setOpen((v) => !v)}>
        <Download size={15} />
        Export
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div className="absolute left-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
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
        </div>
      ) : null}
    </div>
  );
}
