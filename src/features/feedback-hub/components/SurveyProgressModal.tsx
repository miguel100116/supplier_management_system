import React from 'react';
import { X, Clock, AlertTriangle, Users, BarChart3, CheckCircle2, ShieldAlert } from 'lucide-react';
import { CustomForm, PartnerCompany, SurveyResponse } from '../../../types/survey';
import { submissionCount, submissionScores } from '../../analytics/domain/analytics';
import { formatCompositeScore } from '../../../data/questionWeights';
import { getSurveyCompletionSummary } from '../../evaluations/domain/surveyCompletion';
import { useModalEscape } from '../../../hooks/useModalEscape';
import { SurveyAccount } from '../../../hooks/useSurveyData';
import { formatLogDateTime } from '../../../utils/time';

interface SurveyProgressModalProps {
  survey: CustomForm;
  responses: SurveyResponse[];
  partnerCompanies: PartnerCompany[];
  accounts?: SurveyAccount[];
  onClose: () => void;
  onMarkComplete?: (surveyId: string) => void;
  isAdmin?: boolean;
}

export function SurveyProgressModal({
  survey,
  responses,
  partnerCompanies,
  accounts = [],
  onClose,
  onMarkComplete,
  isAdmin,
}: SurveyProgressModalProps) {
  useModalEscape(true, onClose);
  // Filter responses belonging to this survey
  const surveyResponses = responses.filter(
    (r) => r.surveyType === survey.surveyType && (!r.archived)
  );

  // Group unique respondents by email/department
  const uniqueRespondentsMap = new Map<string, { email: string; department?: string; date: string }>();
  surveyResponses.forEach((r) => {
    const key = r.respondentEmail || `${r.department || 'General'}-${r.submissionDate}`;
    if (!uniqueRespondentsMap.has(key)) {
      uniqueRespondentsMap.set(key, {
        email: r.respondentEmail || 'Anonymous Respondent',
        department: r.department || 'General',
        date: r.submissionDate,
      });
    }
  });

  const respondentsList = Array.from(uniqueRespondentsMap.values());
  const subScores = submissionScores(surveyResponses);
  const totalCount = submissionCount(surveyResponses);

  // Real target: the companies this survey is currently scoped to evaluate
  // (its "Modify Companies to Evaluate" selection, live against the Partner
  // Registry), plus each eligible employee's own progress against that list.
  const completion = getSurveyCompletionSummary(survey, accounts, partnerCompanies, responses);
  const targetResponses = Math.max(completion.companiesTotal, 1);
  const progressPercent = Math.min(100, Math.round((totalCount / targetResponses) * 100));

  // Compute partial score
  const numericRatings = surveyResponses
    .map((r) => (typeof r.rating === 'number' ? r.rating : null))
    .filter((r): r is number => r !== null);
  const partialScore = subScores.length > 0
    ? subScores.reduce((sum, s) => sum + s.score, 0) / subScores.length
    : 0;

  return (
    <div className="feedback-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
      <section className="feedback-modal-panel feedback-progress-panel w-full rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 overflow-hidden flex flex-col" role="dialog" aria-modal="true" aria-labelledby="feedback-progress-title">
        {/* Modal Header */}
        <div className="feedback-modal-header feedback-progress-header border-b border-slate-200 dark:border-slate-800">
          <div className="feedback-progress-header-main">
            <h2 id="feedback-progress-title" className="break-words text-base font-bold text-slate-900 dark:text-white">{survey.title}</h2>
            <div className="feedback-progress-header-meta" aria-label="Survey status and category">
              <span className="feedback-modal-status is-ongoing inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold">Ongoing</span>
              <span className={`feedback-category-badge ${survey.surveyType.toLowerCase()}`}>{survey.surveyType}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            aria-label="Close survey progress"
            className="feedback-progress-close-icon rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2187CD] focus-visible:ring-offset-2 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="feedback-modal-body feedback-progress-body flex-1 overflow-y-auto p-4 sm:p-5">
          {/* Ongoing Notification Banner */}
          <div className="feedback-progress-notice flex items-start gap-2 text-sm">
            <AlertTriangle size={17} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Survey is actively gathering responses</p>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                You are viewing real-time response progress. <strong>Export PDF</strong> and <strong>Send to Partner Report</strong> features will automatically unlock once the survey completes or reaches deadline.
              </p>
            </div>
          </div>

          {/* Progress Overview Grid */}
          <div className="feedback-progress-metrics grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Response Progress</span>
                <Users size={14} className="text-slate-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{totalCount}</span>
                <span className="text-xs text-slate-500">/ {targetResponses} target</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Partial Overall Score</span>
                <BarChart3 size={14} className="text-slate-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
                {subScores.length > 0 ? formatCompositeScore(survey.surveyType, partialScore).text : 'N/A'}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Based on {numericRatings.length} answer ratings</p>
            </div>

            <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Survey Deadline</span>
                <Clock size={14} className="text-slate-400" />
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                {survey.deadlineDate || 'Active (No strict deadline)'}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Auto-completes at deadline</p>
            </div>
          </div>

          {/* Per-Employee Completion (drives the "all employees at 100%" auto-completion rule) */}
          <div>
            <h4 className="mb-3 flex flex-col gap-1 text-sm font-bold text-slate-900 dark:text-white min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
              <span>
                Employee Completion ({completion.eligibleEmployees.filter((e) => e.completed >= e.total && e.total > 0).length} / {completion.eligibleEmployees.length} at 100%)
              </span>
              <span className="text-xs font-normal text-slate-500">{completion.companiesTotal} companies in scope</span>
            </h4>
            {completion.eligibleEmployees.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
                No employees currently have access to this survey's department/role scope.
              </div>
            ) : (
              <div className="feedback-modal-record-list divide-y divide-slate-100 dark:divide-slate-800">
                {completion.eligibleEmployees.map((emp) => (
                  <div key={emp.email} className="flex items-center justify-between p-3 text-xs gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{emp.email}</p>
                      <p className="text-[11px] text-slate-500">{emp.department}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 min-[380px]:block">
                        <div
                          className={`h-full transition-all duration-300 ${emp.pct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                          style={{ width: `${emp.pct}%` }}
                        />
                      </div>
                      <span className={`font-bold w-10 text-right ${emp.pct >= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
                        {emp.completed}/{emp.total}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* List of Respondents */}
          <div>
            <h4 className="mb-3 flex flex-col gap-1 text-sm font-bold text-slate-900 dark:text-white min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
              <span>Respondents Recorded ({respondentsList.length})</span>
              <span className="text-xs font-normal text-slate-500">Real-time submissions</span>
            </h4>
            {respondentsList.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
                No employees have submitted responses yet.
              </div>
            ) : (
              <div className="feedback-modal-record-list divide-y divide-slate-100 dark:divide-slate-800">
                {respondentsList.map((resp, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-2 p-3 text-xs min-[420px]:items-center">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px] dark:bg-blue-900/50 dark:text-blue-300">
                        {resp.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="break-all font-medium text-slate-800 dark:text-slate-200">{resp.email}</p>
                        <p className="text-[11px] text-slate-500">{resp.department}</p>
                      </div>
                    </div>
                    <time className="feedback-submission-time shrink-0 text-right text-slate-500" dateTime={resp.date} title={resp.date}>{formatLogDateTime(resp.date)}</time>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="feedback-modal-footer feedback-progress-footer border-t border-slate-200">
          <div className="feedback-progress-actions">
            <button type="button" onClick={onClose} className="secondary-button feedback-progress-close">
              Close Progress View
            </button>
            {isAdmin && onMarkComplete && (
              <button
                type="button"
                onClick={() => {
                  onMarkComplete(survey.id);
                  onClose();
                }}
                className="primary-button feedback-progress-complete"
              >
                <CheckCircle2 size={15} aria-hidden="true" />
                Mark Survey as Complete Now
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
