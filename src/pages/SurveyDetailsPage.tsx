import { useState, useMemo, useEffect } from 'react';
import { useModalEscape } from '../hooks/useModalEscape';
import { ArrowLeft, Trash, Calendar, CalendarClock, Users, ClipboardCheck, AlertTriangle, Eye, Pencil, Building2, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { CustomForm, SurveyResponse, PartnerCompany } from '../types/survey';
import { CompletionStatusBar } from '../components/CompletionStatusBar';
import { SurveyPreviewModal } from '../components/SurveyPreviewModal';
import { formatNumber, getSurveyEvaluationCompanies, hasAnsweredItem, scoredResponses, submissionCount, submissionScores } from '../utils/analytics';
import { isScoredQuestion, getQuestionMaxPoints, formatCompositeScore } from '../data/questionWeights';
import { TableFilterBar } from '../components/TableFilterBar';
import { compareDate, compareText, isWithinDateRange } from '../utils/tableFilters';

interface SurveyDetailsPageProps {
  survey: CustomForm;
  responses: SurveyResponse[];
  partnerCompanies?: PartnerCompany[];
  userEmail?: string;
  onBack: () => void;
  onDelete: (surveyId: string) => void;
  onEdit?: (surveyId: string) => void;
  isAdmin?: boolean;
}

const SUBMISSIONS_PAGE_SIZE = 10;

export function SurveyDetailsPage({ survey, responses, partnerCompanies = [], userEmail = '', onBack, onDelete, onEdit, isAdmin }: SurveyDetailsPageProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  useModalEscape(showDeleteConfirm, () => setShowDeleteConfirm(false), 50);
  useModalEscape(Boolean(selectedSubmissionId), () => setSelectedSubmissionId(null), 50);
  useModalEscape(showPreview, () => setShowPreview(false), 50);
  const [submissionSearch, setSubmissionSearch] = useState('');
  const [submissionSort, setSubmissionSort] = useState<'date-desc' | 'date-asc' | 'company-asc' | 'company-desc'>('date-desc');
  const [submissionFrom, setSubmissionFrom] = useState('');
  const [submissionTo, setSubmissionTo] = useState('');
  const [submissionPage, setSubmissionPage] = useState(1);

  useEffect(() => {
    setSubmissionPage(1);
  }, [survey.id, submissionSearch, submissionSort, submissionFrom, submissionTo]);

  const { pendingCompanies, completedCount, totalCompanies } = useMemo(() => {
    const normalizedUserEmail = userEmail.trim().toLowerCase();
    const evaluatedNames = new Set<string>();
    responses.forEach((resp: any) => {
      if (hasAnsweredItem(resp) && resp.surveyType === survey.surveyType && resp.respondentEmail && resp.respondentEmail.trim().toLowerCase() === normalizedUserEmail) {
        evaluatedNames.add(resp.company.trim().toLowerCase());
      }
    });

    const companiesForType = getSurveyEvaluationCompanies(survey, partnerCompanies);
    const pending = companiesForType.filter((c) => !evaluatedNames.has(c.name.trim().toLowerCase()));

    return {
      pendingCompanies: pending,
      completedCount: companiesForType.length - pending.length,
      totalCompanies: companiesForType.length,
    };
  }, [partnerCompanies, responses, userEmail, survey]);

  const surveyResponses = useMemo(() => {
    const surveyQuestionIds = new Set(survey.questions.map((q) => q.questionId));
    return responses.filter((r) => {
      if (r.surveyType !== survey.surveyType) return false;
      if (surveyQuestionIds.has(r.questionId)) return true;
      return [...surveyQuestionIds].some((questionId) => r.questionId.startsWith(`${questionId}-`));
    });
  }, [responses, survey]);

  // Group responses by submission (responseId)
  const submissions = useMemo(() => {
    const grouped: Record<string, {
      responseId: string;
      company: string;
      department?: string;
      respondentType: string;
      submissionDate: string;
      answers: SurveyResponse[];
    }> = {};

    surveyResponses.forEach((r) => {
      if (!grouped[r.responseId]) {
        grouped[r.responseId] = {
          responseId: r.responseId,
          company: r.company,
          department: r.department,
          respondentType: r.respondentType,
          submissionDate: r.submissionDate,
          answers: [],
        };
      }
      grouped[r.responseId].answers.push(r);
    });

    return Object.values(grouped).sort((a, b) => b.submissionDate.localeCompare(a.submissionDate));
  }, [surveyResponses]);

  const filteredSubmissions = useMemo(() => {
    const needle = submissionSearch.trim().toLowerCase();
    return submissions
      .filter((submission) => {
        if (!isWithinDateRange(submission.submissionDate, submissionFrom, submissionTo)) return false;
        if (!needle) return true;
        return `${submission.company} ${submission.department ?? ''} ${submission.respondentType}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        if (submissionSort === 'date-asc') return compareDate(a.submissionDate, b.submissionDate);
        if (submissionSort === 'company-asc') return compareText(a.company, b.company);
        if (submissionSort === 'company-desc') return compareText(b.company, a.company);
        return compareDate(b.submissionDate, a.submissionDate);
      });
  }, [submissions, submissionSearch, submissionSort, submissionFrom, submissionTo]);

  const totalSubmissionPages = Math.max(1, Math.ceil(filteredSubmissions.length / SUBMISSIONS_PAGE_SIZE));
  const currentSubmissionPage = Math.min(submissionPage, totalSubmissionPages);
  const firstSubmissionIndex = (currentSubmissionPage - 1) * SUBMISSIONS_PAGE_SIZE;
  const visibleSubmissions = filteredSubmissions.slice(firstSubmissionIndex, firstSubmissionIndex + SUBMISSIONS_PAGE_SIZE);

  useEffect(() => {
    setSubmissionPage((page) => Math.min(page, totalSubmissionPages));
  }, [totalSubmissionPages]);

  // Calculate stats
  const stats = useMemo(() => {
    const scores = submissionScores(surveyResponses);
    const avg = scores.length ? scores.reduce((sum, item) => sum + item.score, 0) / scores.length : 0;

    return {
      total: submissionCount(surveyResponses),
      avg: Number(avg.toFixed(2)),
      percentage: Math.round(avg),
    };
  }, [surveyResponses, submissions]);

  const activeSubmissionDetail = useMemo(() => {
    if (!selectedSubmissionId) return null;
    return submissions.find((s) => s.responseId === selectedSubmissionId) || null;
  }, [selectedSubmissionId, submissions]);

  const isCustom = !survey.id.startsWith('default-');

  return (
    <div className="space-y-6" id="survey-details-page">
      {/* Header controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
        <button
          onClick={onBack}
          className="secondary-button self-start px-6 py-3 text-base h-12 flex items-center justify-center gap-2"
          type="button"
          id="btn-back"
        >
          <ArrowLeft size={20} />
          <span>Back to Surveys</span>
        </button>
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && onEdit && (
            <button
              onClick={() => onEdit(survey.id)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 px-6 py-3 text-base font-medium h-12 hover:bg-amber-100 transition cursor-pointer dark:bg-amber-950/20 dark:border-amber-900"
              type="button"
              id="btn-edit-survey"
            >
              <Pencil size={20} />
              <span>Edit Survey Form</span>
            </button>
          )}
          
          <button
            onClick={() => setShowPreview(true)}
            className="primary-button bg-[#0063a9] hover:bg-[#00528c] px-6 py-3 text-base h-12 flex items-center justify-center gap-2"
            type="button"
            id="btn-preview-survey"
          >
            <Eye size={20} />
            <span>Preview</span>
          </button>
          
          {isCustom && isAdmin && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-50 border border-rose-200 text-rose px-6 py-3 text-base font-medium h-12 hover:bg-rose-100 transition cursor-pointer dark:bg-rose-950/20 dark:border-rose-900"
              type="button"
              id="btn-delete-survey"
            >
              <Trash size={20} />
              <span>Delete Survey</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column - Info card & Questions */}
        <div className="lg:col-span-2 space-y-6">
          <div className="panel space-y-4">
            <div>
              <span className="badge mb-2">{survey.surveyType} Audience</span>
              <h3 className="text-xl font-bold text-slate-800 dark:text-white">{survey.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">{survey.description}</p>
            </div>

            <div className="grid gap-4 border-t border-slate-100 pt-4 dark:border-slate-800 sm:grid-cols-4 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-slate-400" />
                <span>Created: {new Date(survey.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <CalendarClock size={14} className="text-slate-400" />
                <span>Deadline: {survey.deadlineDate || 'No deadline set'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users size={14} className="text-slate-400" />
                <span>Target: {survey.surveyType}s</span>
              </div>
              <div className="flex items-center gap-2">
                <ClipboardCheck size={14} className="text-slate-400" />
                <span>Questions: {survey.questions.length}</span>
              </div>
            </div>
          </div>

          {/* Questions list (admin only) / Company completion tracker (everyone else) */}
          {isAdmin ? (
            <div className="panel space-y-4">
              <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400">Form Questions List</h4>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {survey.questions.map((q) => (
                  <div key={q.questionId} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {q.questionNumber}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{q.question}</p>
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-[#0063a9] dark:bg-blue-950/40 dark:text-blue-300">
                        {q.questionCategory}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="panel space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Building2 size={14} className="text-slate-400" />
                  <span>Companies You Still Need to Evaluate</span>
                </h4>
                <CompletionStatusBar completed={completedCount} total={totalCompanies} className="w-40" />
              </div>

              {totalCompanies === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">No {survey.surveyType.toLowerCase()} companies are registered yet.</p>
              ) : pendingCompanies.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50/50 border border-emerald-100/50 dark:text-emerald-400 dark:bg-emerald-950/10 dark:border-emerald-900/20 rounded-lg p-4">
                  <Check size={16} className="shrink-0" />
                  <span>You've evaluated every {survey.surveyType.toLowerCase()} company. Great job!</span>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {pendingCompanies.map((company) => (
                    <div
                      key={company.id}
                      className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-100 bg-slate-50/30 dark:border-slate-900 dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-600 shrink-0" />
                      <span className="truncate" title={company.name}>{company.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column - Performance / Stats */}
        <div className="space-y-6">
          <div className="panel space-y-4">
            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400">Supplier Management System Overview</h4>
            
            <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-4 text-center dark:bg-slate-900/50">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Counted Submissions</p>
                <p className="mt-1 break-words text-2xl font-bold tabular-nums text-slate-800 dark:text-white min-[420px]:text-3xl">{stats.total}</p>
              </div>

              <div className="rounded-lg bg-slate-50 p-4 text-center dark:bg-slate-900/50">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Average Rating</p>
                <p className="mt-1 break-words text-2xl font-bold tabular-nums text-[#0063a9] dark:text-blue-300 min-[420px]:text-3xl">{formatCompositeScore(survey.surveyType, stats.avg).text}</p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                <span>Overall Performance Rating</span>
                <span className="font-bold text-slate-800 dark:text-white">
                  {survey.surveyType === 'Subcontractor' ? formatCompositeScore(survey.surveyType, stats.avg).text : `${stats.percentage}%`}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${stats.percentage}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Submissions Section */}
      <div className="panel space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <h3 className="text-base font-bold text-slate-800 dark:text-white">Recent Form Submissions ({stats.total} counted; {submissions.length} submitted)</h3>
          <span className="text-xs text-slate-400">Source: Interactive Submissions</span>
        </div>

        <TableFilterBar
          sortOptions={[
            { value: 'date-desc', label: 'Submission: newest first' },
            { value: 'date-asc', label: 'Submission: oldest first' },
            { value: 'company-asc', label: 'Company: A–Z' },
            { value: 'company-desc', label: 'Company: Z–A' },
          ]}
          sortValue={submissionSort}
          onSortChange={setSubmissionSort}
          resultCount={filteredSubmissions.length}
          dateFrom={submissionFrom}
          dateTo={submissionTo}
          onDateFromChange={setSubmissionFrom}
          onDateToChange={setSubmissionTo}
          dateLabel="Submission date"
          onReset={() => {
            setSubmissionSearch('');
            setSubmissionSort('date-desc');
            setSubmissionFrom('');
            setSubmissionTo('');
          }}
        >
          <label className="min-w-[190px] flex-1 sm:flex-none">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Search</span>
            <input
              value={submissionSearch}
              onChange={(event) => setSubmissionSearch(event.target.value)}
              placeholder="Company, department, role…"
              className="field !mt-0 w-full py-2 text-xs sm:w-[220px]"
            />
          </label>
        </TableFilterBar>

        {submissions.length === 0 ? (
          <div className="py-8 text-center text-slate-400 dark:text-slate-600">
            <ClipboardCheck size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">No responses have been submitted to this form yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm text-slate-500 dark:text-slate-400">
              <thead className="text-xs uppercase tracking-wider text-slate-400 bg-slate-50 dark:bg-slate-900/50">
                <tr>
                  <th className="px-4 py-3">Respondent Entity</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Job Role</th>
                  <th className="px-4 py-3">Submission Date</th>
                  <th className="px-4 py-3 text-center">Score</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleSubmissions.map((sub) => {
                  const validAnswers = sub.answers.filter((a) => a.rating !== 'N/A');
                  const scoredAnswerCount = scoredResponses(sub.answers).length;
                  const submissionScore = submissionScores(sub.answers)[0]?.score;
                  const score = scoredAnswerCount > 0 && submissionScore !== undefined
                    ? formatCompositeScore(survey.surveyType, submissionScore).text
                    : 'N/A';

                  return (
                    <tr key={sub.responseId} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition">
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{sub.company}</td>
                      <td className="px-4 py-3">{sub.department || 'N/A'}</td>
                      <td className="px-4 py-3">{sub.respondentType}</td>
                      <td className="px-4 py-3">{new Date(sub.submissionDate).toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-[#0063a9] dark:bg-blue-950/40 dark:text-blue-300">
                          {score}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelectedSubmissionId(sub.responseId)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#0063a9] hover:underline dark:text-blue-300 cursor-pointer"
                        >
                          <Eye size={13} />
                          <span>View Detail</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredSubmissions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-400">No submissions match the selected filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {filteredSubmissions.length > 0 && (
          <nav
            className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800"
            aria-label="Recent form submissions pagination"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
              Showing {firstSubmissionIndex + 1}–{firstSubmissionIndex + visibleSubmissions.length} of {filteredSubmissions.length}
            </p>
            {totalSubmissionPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSubmissionPage(currentSubmissionPage - 1)}
                  disabled={currentSubmissionPage === 1}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  <ChevronLeft size={15} aria-hidden="true" />
                  Previous
                </button>
                <span className="min-w-20 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Page {currentSubmissionPage} of {totalSubmissionPages}
                </span>
                <button
                  type="button"
                  onClick={() => setSubmissionPage(currentSubmissionPage + 1)}
                  disabled={currentSubmissionPage === totalSubmissionPages}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  Next
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              </div>
            )}
          </nav>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center gap-3 text-rose-500">
              <AlertTriangle size={24} className="shrink-0" />
              <h3 className="text-lg font-bold">Delete Survey Form?</h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Are you sure you want to delete <strong className="text-slate-700 dark:text-slate-300">"{survey.title}"</strong>? This will remove this form and all of its submission entries from your dashboards. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="secondary-button"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  onDelete(survey.id);
                }}
                className="inline-flex items-center justify-center rounded-lg bg-rose-600 hover:bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition cursor-pointer"
                type="button"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submission Detail Slide-over / Modal */}
      {activeSubmissionDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Form Submission Response</p>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mt-0.5">{activeSubmissionDetail.company}</h3>
              </div>
              <button
                onClick={() => setSelectedSubmissionId(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition text-sm font-semibold"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 text-xs py-4 text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
              <div>
                <span className="font-semibold block text-slate-400">Department:</span>
                <span className="text-slate-700 dark:text-slate-300 font-medium text-sm mt-0.5 block">
                  {activeSubmissionDetail.department || 'N/A'}
                </span>
              </div>
              <div>
                <span className="font-semibold block text-slate-400">Job Role/Respondent Type:</span>
                <span className="text-slate-700 dark:text-slate-300 font-medium text-sm mt-0.5 block">
                  {activeSubmissionDetail.respondentType}
                </span>
              </div>
              <div>
                <span className="font-semibold block text-slate-400">Address:</span>
                <span className="text-slate-700 dark:text-slate-300 font-medium text-sm mt-0.5 block">
                  {activeSubmissionDetail.answers[0]?.address || 'N/A'}
                </span>
              </div>
              <div>
                <span className="font-semibold block text-slate-400">Submission Date & Time:</span>
                <span className="text-slate-700 dark:text-slate-300 font-medium text-sm mt-0.5 block">
                  {new Date(activeSubmissionDetail.submissionDate).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="font-semibold block text-slate-400">Unique Identifier:</span>
                <span className="text-slate-700 dark:text-slate-300 font-mono text-xs mt-0.5 block">
                  {activeSubmissionDetail.responseId}
                </span>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-2">Detailed Questions Feedback</h4>
              
              {activeSubmissionDetail.answers.map((ans, idx) => {
                const isScored = isScoredQuestion(ans.surveyType, ans.questionId);
                const maxPoints = getQuestionMaxPoints(ans.surveyType, ans.questionId);
                return (
                <div key={ans.questionId} className="p-3.5 rounded-lg border border-slate-100 bg-slate-50/50 dark:border-slate-800/80 dark:bg-slate-900/20 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      <span className="text-slate-400 font-bold mr-1">{idx + 1}.</span>
                      {ans.question}
                    </p>
                      {isScored ? (
                    <span className={`inline-flex shrink-0 items-center justify-center h-7 px-2 rounded-md font-bold text-xs ${
                      ans.rating === 'N/A'
                        ? 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                        : ans.rating === maxPoints
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400'
                        : ans.rating === maxPoints - 1
                        ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400'
                        : 'bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-400'
                    }`}>
                      {`ANSWER: ${ans.rating}`}
                    </span>
                    ) : (
                    <span className="inline-flex shrink-0 items-center justify-center h-7 px-2 rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 font-bold text-xs">
                      ANSWER: {ans.comment || 'N/A'}
                    </span>
                    )}
                  </div>
                </div>
              );
              })}
            </div>

            <div className="flex items-center justify-end border-t border-slate-100 pt-4 mt-6 dark:border-slate-800">
              <button
                onClick={() => setSelectedSubmissionId(null)}
                className="secondary-button"
                type="button"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {showPreview && (
        <SurveyPreviewModal survey={survey} partnerCompanies={partnerCompanies} onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
}
