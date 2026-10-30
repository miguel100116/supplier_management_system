import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Download, Eye, Search, SlidersHorizontal, X } from 'lucide-react';
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
  const hasActiveFilters = Boolean(emailSearch.trim() || departments.length || designations.length || dateFrom || dateTo || categoryFilters.length || formFilters.length);

  function resetFilters() {
    setEmailSearch(''); setDepartments([]); setDesignations([]); setDateFrom(''); setDateTo('');
    setCategoryFilters([]); setFormFilters([]); setPage(1);
  }

  function openSurvey(id: string) {
    setSelectedSurveyId(id);
    setSelectedResponseId(null);
    setEmailSearch('');
    setDepartments([]); setDesignations([]); setDateFrom(''); setDateTo('');
    setPage(1);
    setExportError('');
  }

  function exportExcel() {
    if (!selectedSurvey || !filteredSubmissions.length || isExporting) return;
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
    worker.postMessage(buildSurveyResponseExport(selectedSurvey, filteredSubmissions));
  }

  return (
    <div className="admin-response-explorer-page">
      <section className="panel min-w-0 space-y-4" aria-label="Response explorer">
        <header className="-mx-6 -mt-6 flex flex-col gap-1 border-b border-slate-100 px-6 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Response explorer</p><h2 className="mt-1 text-[15px] font-semibold text-slate-900 dark:text-slate-100">{selectedSurvey?.title || 'Responses'}</h2></div>
          {selectedSurvey && <p className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{submissions.length} {submissions.length === 1 ? 'submission' : 'submissions'}</p>}
        </header>
        <div className="admin-response-form-selector admin-tab-strip" role="group" aria-label="Available evaluation forms">
        {orderedSurveys.map((survey) => {
          const selected = survey.id === selectedSurvey?.id;
          return <button key={survey.id} type="button" aria-pressed={selected} title={survey.title} onClick={() => openSurvey(survey.id)} className={`min-w-0 border-b-2 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2187CD] ${selected ? 'border-b-[#2187CD] bg-sky-50/70 dark:bg-sky-950/20' : 'border-b-transparent hover:bg-slate-50/70 dark:hover:bg-slate-900/50'}`}>
            <span className={`block truncate text-[13px] font-semibold ${selected ? 'text-[#2187CD] dark:text-sky-300' : 'text-slate-800 dark:text-slate-100'}`}>{survey.title}</span>
          </button>;
        })}
        </div>
        {!selectedSurvey && <p className="py-8 text-center text-sm text-slate-500">No evaluation forms are available yet.</p>}
        {selectedSurvey && (selectedSubmission ? (
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
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[180px] flex-1 basis-56">
                <label htmlFor="response-email-search" className="sr-only">Search respondent email</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input id="response-email-search" type="search" placeholder="Search respondent email…" className="h-9 w-full min-w-0 rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#2187CD] dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-blue-600" value={emailSearch} onChange={(event) => { setEmailSearch(event.target.value); setPage(1); }} />
                </div>
              </div>
              <button type="button" aria-label="Filter responses" title="Filter responses" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)} className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2187CD] dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><SlidersHorizontal size={16}/>{hasActiveFilters && <span aria-hidden="true" className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#2187CD]"/>}</button>
              <button type="button" onClick={exportExcel} title="Export responses matching the current search and filters" disabled={!filteredSubmissions.length || isExporting} className="ml-auto inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#2187CD] px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600">
                <Download size={14} /> {isExporting ? 'Preparing Excel...' : 'Export to Excel'}
              </button>
            </div>
            {hasActiveFilters && <div className="admin-directory-active-filters" aria-label="Active response filters">
              {emailSearch.trim() && <button type="button" className="admin-directory-filter-chip" title={emailSearch.trim()} aria-label="Remove email search filter" onClick={() => { setEmailSearch(''); setPage(1); }}><span className="max-w-40 truncate">Email: {emailSearch.trim()}</span><X size={12}/></button>}
              {categoryFilters.map((value) => <button key={`category-${value}`} type="button" className="admin-directory-filter-chip" aria-label={`Remove ${value} category filter`} onClick={() => setCategoryFilters((items) => items.filter((item) => item !== value))}>Category: {value}<X size={12}/></button>)}
              {formFilters.map((id) => <button key={`form-${id}`} type="button" className="admin-directory-filter-chip" title={surveys.find((survey) => survey.id === id)?.title} aria-label={`Remove form filter`} onClick={() => setFormFilters((items) => items.filter((item) => item !== id))}><span className="max-w-40 truncate">Form: {surveys.find((survey) => survey.id === id)?.title || id}</span><X size={12}/></button>)}
              {departments.map((value) => <button key={`department-${value}`} type="button" className="admin-directory-filter-chip" aria-label={`Remove ${value} department filter`} onClick={() => { setDepartments((items) => items.filter((item) => item !== value)); setPage(1); }}>Department: {value}<X size={12}/></button>)}
              {designations.map((value) => <button key={`designation-${value}`} type="button" className="admin-directory-filter-chip" aria-label={`Remove ${value} designation filter`} onClick={() => { setDesignations((items) => items.filter((item) => item !== value)); setPage(1); }}>Designation: {value}<X size={12}/></button>)}
              {dateFrom && <button type="button" className="admin-directory-filter-chip" aria-label="Remove from date filter" onClick={() => { setDateFrom(''); setPage(1); }}>From: {dateFrom}<X size={12}/></button>}
              {dateTo && <button type="button" className="admin-directory-filter-chip" aria-label="Remove to date filter" onClick={() => { setDateTo(''); setPage(1); }}>To: {dateTo}<X size={12}/></button>}
              <button type="button" className="admin-directory-reset-button ml-auto text-xs" onClick={resetFilters}>Reset</button>
            </div>}
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
                  <table className="w-full min-w-[760px] table-fixed text-left text-xs">
                    <colgroup><col className="w-[26%]"/><col className="w-[13%]"/><col className="w-[27%]"/><col className="w-[20%]"/><col className="w-[9%]"/><col className="w-[5%]"/></colgroup>
                    <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                      <tr><th scope="col" className="px-3 py-2.5">Respondent email</th><th scope="col" className="px-3 py-2.5">Department</th><th scope="col" className="px-3 py-2.5">Company</th><th scope="col" className="px-3 py-2.5">Submission date</th><th scope="col" className="px-3 py-2.5 text-right">Score</th><th scope="col" className="sticky right-0 bg-slate-50 px-2 py-2.5 dark:bg-slate-900"><span className="sr-only">Action</span></th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {visibleSubmissions.map((submission) => (
                        <tr key={submission.id} className="group h-12 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/50">
                          <td className="px-3 py-2 align-middle"><span className="block truncate" title={submission.first.respondentEmail || 'N/A'}>{submission.first.respondentEmail || 'N/A'}</span></td>
                          <td className="px-3 py-2 align-middle"><span className="block truncate" title={submission.first.department || 'N/A'}>{submission.first.department || 'N/A'}</span></td>
                          <td className="px-3 py-2 align-middle"><span className="block truncate" title={submission.first.company}>{submission.first.company}</span></td>
                          <td className="px-3 py-2 align-middle"><span className="block truncate whitespace-nowrap tabular-nums" title={`${new Date(submission.first.submissionDate).toLocaleString()}${submission.first.submissionDateInferredFrom ? ' (inferred)' : ''}`}>{new Date(submission.first.submissionDate).toLocaleString()}{submission.first.submissionDateInferredFrom && ' (inferred)'}</span></td>
                          <td className="whitespace-nowrap px-3 py-2 text-right align-middle tabular-nums">{submission.score === null ? 'N/A' : (Math.round(submission.score * 10) / 10) + '%'}</td>
                          <td className="sticky right-0 bg-white px-2 py-2 text-center align-middle group-hover:bg-slate-50 dark:bg-slate-950 dark:group-hover:bg-slate-900/50"><button type="button" aria-label={`View answers for ${submission.first.respondentEmail || 'respondent'}`} title="View answers" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#2187CD] hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2187CD] dark:text-blue-400 dark:hover:bg-sky-950/40" onClick={() => setSelectedResponseId(submission.id)}><Eye size={16} aria-hidden="true"/></button></td>
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
        ))}
      </section>
    </div>
  );
}
