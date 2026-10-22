import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, ChevronLeft, Download, Search, SlidersHorizontal } from 'lucide-react';
import type { CustomForm, SurveyResponse } from '../types/survey';
import { getSurveyStatus } from '../features/evaluations/domain/surveyStatus';
import { logExport } from '../features/reports/services/exportHistory';
import {
  answerValue,
  buildSurveyResponseExport,
  filterSurveySubmissions,
  groupSurveySubmissions,
  selectSurveyResponses,
  surveyResponseFilename,
} from '../features/evaluations/domain/surveyResponses';
import { Pagination } from '../components/Pagination';

interface SurveyExplorerPageProps {
  responses: SurveyResponse[];
  surveys?: CustomForm[];
}

const PAGE_SIZE = 10;

export function SurveyExplorerPage({ responses, surveys = [] }: SurveyExplorerPageProps) {
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('surveyId'));
  const [selectedResponseId, setSelectedResponseId] = useState<string | null>(null);
  const [emailSearch, setEmailSearch] = useState('');
  const [exportScope, setExportScope] = useState<'all' | 'filtered'>('filtered');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [departments, setDepartments] = useState<string[]>([]);
  const [designations, setDesignations] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [formFilters, setFormFilters] = useState<string[]>([]);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const orderedSurveys = useMemo(() => surveys.filter((survey) =>
    (!categoryFilters.length || categoryFilters.includes(survey.surveyType))
    && (!formFilters.length || formFilters.includes(survey.id))
  ).sort((left, right) => {
    const order = { Courier: 0, Subcontractor: 1, Supplier: 2 };
    return order[left.surveyType] - order[right.surveyType] || left.title.localeCompare(right.title);
  }), [surveys, categoryFilters, formFilters]);
  const selectedSurvey = useMemo(() => orderedSurveys.find((survey) => survey.id === selectedSurveyId)
    ?? orderedSurveys.find((survey) => getSurveyStatus(survey) === 'Running')
    ?? orderedSurveys[0], [selectedSurveyId, surveys, orderedSurveys]);
  const submissions = useMemo(() => selectedSurvey
    ? groupSurveySubmissions(selectSurveyResponses(selectedSurvey, surveys, responses))
    : [], [selectedSurvey, surveys, responses]);
  const departmentOptions = useMemo(() => [...new Set(submissions.map((item) => item.first.department).filter((value): value is string => Boolean(value)))].sort(), [submissions]);
  const designationOptions = useMemo(() => [...new Set(submissions.map((item) => item.first.respondentType).filter(Boolean))].sort(), [submissions]);
  const filteredSubmissions = useMemo(() => filterSurveySubmissions(submissions, emailSearch).filter((item) => {
    const date = new Date(item.first.submissionDate);
    const day = Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    return (!departments.length || departments.includes(item.first.department ?? ''))
      && (!designations.length || designations.includes(item.first.respondentType))
      && (!dateFrom || (day && day >= dateFrom)) && (!dateTo || (day && day <= dateTo));
  }), [submissions, emailSearch, departments, designations, dateFrom, dateTo]);
  const selectedSubmission = submissions.find((submission) => submission.id === selectedResponseId);
  const totalPages = Math.max(1, Math.ceil(filteredSubmissions.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const firstVisibleIndex = (currentPage - 1) * pageSize;
  const visibleSubmissions = filteredSubmissions.slice(firstVisibleIndex, firstVisibleIndex + pageSize);
  const exportSubmissions = exportScope === 'all' ? submissions : filteredSubmissions;

  function openSurvey(id: string) {
    setSelectedSurveyId(id);
    setSelectedResponseId(null);
    setEmailSearch('');
    setDepartments([]); setDesignations([]); setDateFrom(''); setDateTo('');
    setExportScope('filtered');
    setPage(1);
    setExportError('');
  }

  function exportExcel() {
    if (!selectedSurvey || !exportSubmissions.length || isExporting) return;
    setExportError('');
    setIsExporting(true);
    const filename = surveyResponseFilename(selectedSurvey.title, new Date());
    const worker = new Worker(new URL('../features/evaluations/workers/surveyResponsesExport.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<{ bytes?: ArrayBuffer; error?: string }>) => {
      worker.terminate();
      workerRef.current = null;
      setIsExporting(false);
      if (!event.data.bytes) {
        setExportError(event.data.error || 'Could not create the Excel file.');
        return;
      }
      const url = URL.createObjectURL(new Blob([event.data.bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      logExport({ title: selectedSurvey.title + ' Responses', format: 'excel', filename });
    };
    worker.onerror = () => {
      worker.terminate();
      workerRef.current = null;
      setIsExporting(false);
      setExportError('Could not create the Excel file.');
    };
    worker.postMessage(buildSurveyResponseExport(selectedSurvey, exportSubmissions));
  }

  return (
    <div className="admin-response-explorer-page space-y-5">
      <section aria-label="Available evaluation forms" className="panel overflow-hidden p-0">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div><h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Choose an evaluation form</h2><p className="mt-1 text-xs text-slate-400">Select a form to review its submissions and answers.</p></div>
          <span className="shrink-0 text-xs text-slate-400">{orderedSurveys.length} forms</span>
        </header>
        {orderedSurveys.map((survey) => {
          const status = getSurveyStatus(survey);
          const selected = survey.id === selectedSurvey?.id;
          const dotColor = status === 'Paused' ? 'bg-amber-500' : status === 'Completed' || status === 'Archived' ? 'bg-slate-400' : 'bg-emerald-500';
          const typeColor = survey.surveyType === 'Courier' ? 'border-sky-200 bg-sky-50 text-sky-700' : survey.surveyType === 'Supplier' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-orange-200 bg-orange-50 text-orange-700';
          return <button key={survey.id} type="button" aria-pressed={selected} onClick={() => openSurvey(survey.id)} className={`grid w-full gap-1 border-b border-l-2 px-4 py-3 text-left transition last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2187CD] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4 ${selected ? 'border-l-[#2187CD] bg-sky-50/70 dark:bg-sky-950/20' : 'border-l-transparent hover:bg-slate-50/70 dark:hover:bg-slate-900/50'}`}>
            <span className="min-w-0">
              <span className={`block truncate text-[13px] font-semibold ${selected ? 'text-[#2187CD] dark:text-sky-300' : 'text-slate-800 dark:text-slate-100'}`}>{survey.title}</span>
              <span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400" title={survey.description}>{survey.description || 'No description provided.'}</span>
            </span>
            <span className="flex flex-wrap items-center gap-2 pl-0.5 text-[11px] text-slate-500 dark:text-slate-400 sm:justify-end">
              <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${typeColor}`}>{survey.surveyType}</span>
              <span className="inline-flex items-center gap-1.5"><i className={`h-1.5 w-1.5 rounded-full ${dotColor}`}/>{status}</span>
              {survey.deadlineDate && <span className="inline-flex items-center gap-1"><CalendarClock size={12}/>{survey.deadlineDate}</span>}
            </span>
          </button>;
        })}
      </section>
      {!selectedSurvey && <section className="panel py-10 text-center text-sm text-slate-500">No evaluation forms are available yet.</section>}
      {selectedSurvey && <>
      <section className="panel space-y-4" aria-label={`Responses for ${selectedSurvey.title}`}>
        <header className="-mx-6 -mt-6 flex flex-col gap-1 border-b border-slate-100 px-6 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Response explorer · {selectedSurvey.surveyType}</p><h2 className="mt-1 text-[15px] font-semibold text-slate-900 dark:text-slate-100">{selectedSurvey.title}</h2></div><p className="text-xs text-slate-500 dark:text-slate-400">{submissions.length} submissions</p></header>
        {selectedSubmission ? (
          <>
            <button className="secondary-button inline-flex items-center gap-2" type="button" onClick={() => setSelectedResponseId(null)}>
              <ChevronLeft size={16} /> Back to Responses
            </button>
            <div className="grid gap-3 rounded-lg bg-slate-50/70 p-3 sm:grid-cols-2 xl:grid-cols-4 dark:bg-slate-900/50">
              <div><p className="text-xs font-medium text-slate-500">Respondent Email</p><p className="font-semibold">{selectedSubmission.first.respondentEmail || 'N/A'}</p></div>
              <div><p className="text-xs font-medium text-slate-500">Submission Date</p><p className="font-semibold">{new Date(selectedSubmission.first.submissionDate).toLocaleString()}{selectedSubmission.first.submissionDateInferredFrom && ' (inferred)'}</p></div>
              <div><p className="text-xs font-medium text-slate-500">Company</p><p className="font-semibold">{selectedSubmission.first.company}</p></div>
              <div><p className="text-xs font-medium text-slate-500">Department</p><p className="font-semibold">{selectedSubmission.first.department || 'N/A'}</p></div>
            </div>
            <div className="space-y-6">
              {selectedSubmission.answers.map((answer) => (
                <div key={answer.questionId} className="grid gap-3 border-b border-slate-100 pb-4 last:border-0 dark:border-slate-800 sm:grid-cols-[minmax(0,1fr)_minmax(220px,.45fr)]">
                  <div><p className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">{answer.questionCategory} · Q{answer.questionNumber}</p>
                    <p className="text-[13px] font-medium leading-5 text-slate-900 dark:text-slate-100">{answer.question}</p></div>
                  <div className="flex items-start gap-2 rounded-md bg-slate-50 p-3 dark:bg-slate-900/50">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Answer</span>
                    <span className="text-[13px] font-semibold text-[#2187CD] dark:text-sky-300">{answerValue(answer)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-end">
              <div className="min-w-0">
                <label htmlFor="response-email-search" className="mb-1.5 block text-xs font-semibold">Search respondent email</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input id="response-email-search" type="search" placeholder="Filter by email..." className="h-9 w-full min-w-0 rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#2187CD] dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-blue-600" value={emailSearch} onChange={(event) => { setEmailSearch(event.target.value); setPage(1); }} />
                </div>
              </div>
              <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"><SlidersHorizontal size={14}/> Filters</button>
              <div>
                <label htmlFor="response-export-scope" className="mb-1.5 block text-xs font-semibold">Export rows</label>
                <select id="response-export-scope" className="h-9 w-full min-w-[150px] rounded-lg border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-900" value={exportScope} onChange={(event) => setExportScope(event.target.value as 'all' | 'filtered')}>
                  <option value="all">All responses</option>
                  <option value="filtered">Filtered responses</option>
                </select>
              </div>
              <button type="button" onClick={exportExcel} disabled={!exportSubmissions.length || isExporting} className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#2187CD] px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600">
                <Download size={14} /> {isExporting ? 'Preparing Excel...' : 'Export to Excel'}
              </button>
            </div>
            {filtersOpen && <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/50 sm:grid-cols-2 lg:grid-cols-4">
              <fieldset className="space-y-2"><legend className="mb-1 text-xs font-bold uppercase text-slate-500">Evaluation category</legend>{(['Courier','Supplier','Subcontractor'] as const).map((value) => <label key={value} className="flex gap-2 text-sm"><input type="checkbox" checked={categoryFilters.includes(value)} onChange={() => setCategoryFilters((items) => items.includes(value) ? items.filter((item) => item !== value) : [...items, value])}/>{value}</label>)}</fieldset>
              <fieldset className="max-h-36 space-y-2 overflow-y-auto"><legend className="mb-1 text-xs font-bold uppercase text-slate-500">Form</legend>{surveys.map((survey) => <label key={survey.id} className="flex gap-2 text-sm"><input type="checkbox" checked={formFilters.includes(survey.id)} onChange={() => setFormFilters((items) => items.includes(survey.id) ? items.filter((item) => item !== survey.id) : [...items, survey.id])}/><span>{survey.title}</span></label>)}</fieldset>
              <fieldset className="space-y-1"><legend className="mb-1 text-xs font-bold uppercase text-slate-500">Department</legend>{departmentOptions.map((value) => <label key={value} className="flex gap-2 text-sm"><input type="checkbox" checked={departments.includes(value)} onChange={() => setDepartments((items) => items.includes(value) ? items.filter((item) => item !== value) : [...items, value])}/>{value}</label>)}</fieldset>
              <div><fieldset className="space-y-1"><legend className="mb-1 text-xs font-bold uppercase text-slate-500">Designation</legend>{designationOptions.map((value) => <label key={value} className="flex gap-2 text-sm"><input type="checkbox" checked={designations.includes(value)} onChange={() => setDesignations((items) => items.includes(value) ? items.filter((item) => item !== value) : [...items, value])}/>{value}</label>)}</fieldset><fieldset className="mt-3 grid grid-cols-2 gap-2"><legend className="mb-1 text-xs font-bold uppercase text-slate-500">Submission date</legend><label className="text-xs">From<input aria-label="Submission date from" type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className="field !mt-1 w-full"/></label><label className="text-xs">To<input aria-label="Submission date to" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="field !mt-1 w-full"/></label></fieldset></div>
            </div>}
            {exportError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{exportError}</p>}
            {!submissions.length ? (
              <p className="py-8 text-center text-slate-500">No responses have been submitted for this survey.</p>
            ) : !filteredSubmissions.length ? (
              <p className="py-8 text-center text-slate-500">No responses match the selected filters.</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="min-w-[760px] w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                      <tr><th className="px-4 py-3">Respondent Email</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Company</th><th className="px-4 py-3">Submission Date</th><th className="px-4 py-3">Overall Score</th><th className="px-4 py-3"><span className="sr-only">Action</span></th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {visibleSubmissions.map((submission) => (
                        <tr key={submission.id} onClick={() => setSelectedResponseId(submission.id)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50">
                          <td className="px-4 py-3">{submission.first.respondentEmail || 'N/A'}</td>
                          <td className="px-4 py-3">{submission.first.department || 'N/A'}</td>
                          <td className="px-4 py-3">{submission.first.company}</td>
                          <td className="px-4 py-3">{new Date(submission.first.submissionDate).toLocaleString()}{submission.first.submissionDateInferredFrom && ' (inferred)'}</td>
                          <td className="px-4 py-3">{submission.score === null ? 'N/A' : (Math.round(submission.score * 10) / 10) + '%'}</td>
                          <td className="px-4 py-3"><button type="button" className="font-semibold text-[#2187CD] underline dark:text-blue-400" onClick={() => setSelectedResponseId(submission.id)}>View answers</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={currentPage} pageSize={pageSize} totalItems={filteredSubmissions.length}
                  onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} ariaLabel="Survey submissions pagination" showPageControls={totalPages > 1 || pageSize !== PAGE_SIZE} />
              </>
            )}
          </>
        )}
      </section>
      </>}
    </div>
  );
}
