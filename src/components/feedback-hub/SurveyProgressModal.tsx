import React from 'react';
import { X, Clock, AlertTriangle, Users, BarChart3, CheckCircle2, ShieldAlert } from 'lucide-react';
import { CustomForm, PartnerCompany, SurveyResponse } from '../../types/survey';
import { submissionScores } from '../../utils/analytics';
import { formatCompositeScore } from '../../data/questionWeights';
import { getSurveyCompletionSummary } from '../../utils/surveyCompletion';
import { useModalEscape } from '../../hooks/useModalEscape';
import { SurveyAccount } from '../../hooks/useSurveyData';

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
  const totalCount = subScores.length;

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
  const partialScore = totalCount > 0
    ? subScores.reduce((sum, s) => sum + s.score, 0) / totalCount
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-amber-50/50 px-4 py-4 dark:border-slate-800 dark:bg-amber-950/20 sm:items-center sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              <Clock size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                  Evaluation Ongoing
                </span>
                <span className="text-xs font-medium text-slate-500">{survey.surveyType} Evaluation</span>
              </div>
              <h3 className="mt-0.5 break-words text-base font-bold text-slate-900 dark:text-white sm:text-lg">{survey.title}</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
          {/* Ongoing Notification Banner */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 flex items-start gap-3 text-sm">
            <AlertTriangle size={18} className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <p className="font-semibold">Evaluation is actively gathering responses</p>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                You are viewing real-time response progress. <strong>Export PDF</strong> and <strong>Send to Partner Report</strong> features will automatically unlock once the evaluation completes or reaches deadline.
              </p>
            </div>
          </div>

          {/* Progress Overview Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                {totalCount > 0 ? formatCompositeScore(survey.surveyType, partialScore).text : 'N/A'}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Based on {numericRatings.length} answer ratings</p>
            </div>

            <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Evaluation Deadline</span>
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
              <span className="text-xs font-normal text-slate-500">{completion.companiesTotal} partners in scope</span>
            </h4>
            {completion.eligibleEmployees.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
                No employees currently have access to this evaluation's department/role scope.
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
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
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
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
                    <span className="shrink-0 text-right text-slate-400">{resp.date}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex flex-col items-stretch gap-3 border-t border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between sm:px-6">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-500 max-w-xs">
              Completes automatically once every employee reaches 100% or the deadline passes.
            </span>
            {isAdmin && onMarkComplete && (
              <button
                onClick={() => {
                  onMarkComplete(survey.id);
                  onClose();
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-700 transition w-fit"
              >
                <CheckCircle2 size={15} />
                Mark Evaluation as Complete Now
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="secondary-button text-xs"
          >
            Close Progress View
          </button>
        </div>
      </div>
    </div>
  );
}
