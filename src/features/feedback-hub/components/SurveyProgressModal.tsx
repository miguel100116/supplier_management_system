import React, { useEffect, useRef } from 'react';
import { X, CheckCircle2, Info } from 'lucide-react';
import { CustomForm, PartnerCompany, SurveyResponse } from '../../../types/survey';
import { submissionCount, submissionScores } from '../../analytics/domain/analytics';
import { formatCompositeScore } from '../../../data/questionWeights';
import { selectSurveyResponses } from '../../evaluations/domain/surveyResponses';
import { getSurveyCompletionSummary } from '../../evaluations/domain/surveyCompletion';
import { useModalEscape } from '../../../hooks/useModalEscape';
import { SurveyAccount } from '../../../hooks/useSurveyData';
import { formatLogDateTime, parseDDMMYYYY } from '../../../utils/time';

interface SurveyProgressModalProps {
  survey: CustomForm;
  surveys: CustomForm[];
  responses: SurveyResponse[];
  partnerCompanies: PartnerCompany[];
  accounts?: SurveyAccount[];
  onClose: () => void;
  onMarkComplete?: (surveyId: string) => void;
  isAdmin?: boolean;
}

export function SurveyProgressModal({
  survey,
  surveys,
  responses,
  partnerCompanies,
  accounts = [],
  onClose,
  onMarkComplete,
  isAdmin,
}: SurveyProgressModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useModalEscape(true, onClose);
  useEffect(() => { closeButtonRef.current?.focus(); }, []);
  // Filter responses belonging to this survey
  const surveyResponses = selectSurveyResponses(survey, surveys, responses).filter((row) => !row.archived);

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
  const completion = getSurveyCompletionSummary(survey, accounts, partnerCompanies, responses, surveys);
  const completedEmployees = completion.eligibleEmployees.filter((employee) => employee.total > 0 && employee.completed >= employee.total).length;

  // Compute partial score
  const numericRatings = surveyResponses
    .map((r) => (typeof r.rating === 'number' ? r.rating : null))
    .filter((r): r is number => r !== null);
  const partialScore = subScores.length > 0
    ? subScores.reduce((sum, s) => sum + s.score, 0) / subScores.length
    : 0;

  const deadline = parseDDMMYYYY(survey.deadlineDate);
  const today = new Date();
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const deadlineDay = deadline
    ? Date.UTC(deadline.getFullYear(), deadline.getMonth(), deadline.getDate())
    : null;
  const daysUntilDeadline = deadlineDay === null
    ? null
    : Math.round((deadlineDay - todayDay) / 86_400_000);
  const deadlineUrgency = daysUntilDeadline === null
    ? 'neutral'
    : daysUntilDeadline < 0
      ? 'overdue'
      : daysUntilDeadline === 0
        ? 'today'
        : daysUntilDeadline <= 3
          ? 'urgent'
          : daysUntilDeadline <= 14
            ? 'soon'
            : 'upcoming';
  const deadlineStatus = daysUntilDeadline === null
    ? null
    : daysUntilDeadline < 0
      ? `${Math.abs(daysUntilDeadline)} day${daysUntilDeadline === -1 ? '' : 's'} overdue`
      : daysUntilDeadline === 0
        ? 'Due today'
        : `${daysUntilDeadline} day${daysUntilDeadline === 1 ? '' : 's'} remaining`;

  return (
    <div className="feedback-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
      <section className="feedback-modal-panel feedback-progress-panel w-full rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 overflow-hidden flex flex-col" role="dialog" aria-modal="true" aria-labelledby="feedback-progress-title" aria-describedby="feedback-progress-description">
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
            ref={closeButtonRef}
            className="feedback-progress-close-icon rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2187CD] focus-visible:ring-offset-2 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="feedback-modal-body feedback-progress-body flex-1 overflow-y-auto p-4 sm:p-5" role="region" aria-label="Survey progress details" tabIndex={0}>
          <p id="feedback-progress-description" className="feedback-progress-description">
            Responses are still being collected. Partner reports become available once this survey is complete.
          </p>

          <dl className="feedback-progress-metrics" aria-label="Survey overview">
            <div>
              <dt>Submitted evaluations</dt>
              <dd>{totalCount}</dd>
              <dd className="feedback-metric-detail">{completion.companiesTotal} companies in scope</dd>
            </div>
            <div>
              <dt>Partial overall score</dt>
              <dd>{subScores.length > 0 ? formatCompositeScore(survey.surveyType, partialScore).text : 'N/A'}</dd>
              <dd className="feedback-metric-detail">Based on {numericRatings.length} rated answers</dd>
            </div>
            <div className="feedback-deadline-metric">
              <dt>Deadline</dt>
              <dd className={`feedback-deadline-date is-${deadlineUrgency}`}>{survey.deadlineDate || 'No deadline set'}</dd>
              <dd className="feedback-metric-detail feedback-deadline-detail">
                {deadlineStatus ? (
                  <>
                    <span className={`feedback-deadline-status is-${deadlineUrgency}`}>{deadlineStatus}</span>
                    <details className="feedback-deadline-info">
                      <summary aria-label="Show deadline information">
                        <Info aria-hidden="true" />
                      </summary>
                      <span>Open through the deadline day</span>
                    </details>
                  </>
                ) : survey.deadlineDate ? 'Open through the deadline day' : 'Remains open until completed'}
              </dd>
            </div>
          </dl>

          <section className="feedback-detail-section" aria-labelledby="feedback-employee-title">
            <div className="feedback-section-heading feedback-progress-section-heading">
              <h3 id="feedback-employee-title">Employee completion</h3>
              <span>{completedEmployees} of {completion.eligibleEmployees.length} employees complete</span>
            </div>
            {completion.eligibleEmployees.length === 0 ? (
              <p className="feedback-modal-empty-inline">No employees currently have access to this survey's department and role scope.</p>
            ) : (
              <table className="feedback-progress-table">
                <caption className="sr-only">Employee evaluation completion</caption>
                <thead><tr><th scope="col">Employee</th><th scope="col">Evaluations completed</th></tr></thead>
                <tbody>
                  {completion.eligibleEmployees.map((emp) => (
                    <tr key={emp.email}>
                      <td><span>{emp.email}</span><small>{emp.department}</small></td>
                      <td>
                        <div className="feedback-progress-coverage">
                          {emp.total > 0 && <progress value={emp.completed} max={emp.total} aria-label={`Evaluations completed by ${emp.email}`} />}
                          <strong>{emp.completed} / {emp.total}</strong>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="feedback-detail-section" aria-labelledby="feedback-respondents-title">
            <div className="feedback-section-heading feedback-progress-section-heading">
              <h3 id="feedback-respondents-title">Respondents recorded</h3>
              <span>{respondentsList.length} respondents</span>
            </div>
            {respondentsList.length === 0 ? (
              <p className="feedback-modal-empty-inline">No employees have submitted responses yet.</p>
            ) : (
              <div className="feedback-respondent-table-wrap">
                <table className="feedback-respondent-table">
                  <caption className="sr-only">Recorded respondents</caption>
                  <thead><tr><th scope="col">Employee</th><th scope="col">Department</th><th scope="col">Submitted</th></tr></thead>
                  <tbody>
                    {respondentsList.map((resp, index) => (
                      <tr key={index}>
                        <td>{resp.email}</td>
                        <td>{resp.department}</td>
                        <td><time dateTime={resp.date} title={resp.date}>{formatLogDateTime(resp.date)}</time></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Modal Footer */}
        <div className="feedback-modal-footer feedback-progress-footer border-t border-slate-200">
          <div className="feedback-progress-actions">
            <button type="button" onClick={onClose} className="secondary-button feedback-progress-close">
              Close
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
                Complete survey
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
