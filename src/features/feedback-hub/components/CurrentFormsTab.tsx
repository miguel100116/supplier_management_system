import React, { useState } from 'react';
import { CustomForm, PartnerCompany, SurveyResponse, SurveyType } from '../../../types/survey';
import { QueuedReportEmail } from '../types';
import { Clock, CheckCircle2, Send, Users, ChevronRight, AlertCircle, Sparkles, Filter, Search } from 'lucide-react';
import { SurveyProgressModal } from './SurveyProgressModal';
import { SurveyDetailModal } from './SurveyDetailModal';
import { getSurveyCompletionSummary } from '../../evaluations/domain/surveyCompletion';
import { SurveyAccount } from '../../../hooks/useSurveyData';

interface CurrentFormsTabProps {
  surveys: CustomForm[];
  responses: SurveyResponse[];
  partnerCompanies: PartnerCompany[];
  accounts?: SurveyAccount[];
  sentReports: QueuedReportEmail[];
  onSendToPartner: (survey: CustomForm, partnerCompany?: PartnerCompany) => void;
  onMarkSurveyComplete?: (surveyId: string) => void;
  isAdmin?: boolean;
}

export function CurrentFormsTab({
  surveys,
  responses,
  partnerCompanies,
  accounts = [],
  sentReports,
  onSendToPartner,
  onMarkSurveyComplete,
  isAdmin,
}: CurrentFormsTabProps) {
  const [selectedSurveyForProgress, setSelectedSurveyForProgress] = useState<CustomForm | null>(null);
  const [selectedSurveyForDetail, setSelectedSurveyForDetail] = useState<CustomForm | null>(null);

  const [typeFilter, setTypeFilter] = useState<SurveyType | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Default initial forms if surveys array is empty
  const activeSurveys = surveys.length
    ? surveys.filter((s) => s.status !== 'Archived')
    : [];

  const filteredSurveys = activeSurveys.filter((s) => {
    const matchesType = typeFilter === 'All' || s.surveyType === typeFilter;
    const matchesSearch = s.title.toLowerCase().includes(searchQuery.toLowerCase()) || s.surveyType.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Search & Category Filter Bar */}
      <div className="flex flex-col sm:flex-row-reverse sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 dark:border-slate-800 dark:bg-slate-950">
        <div className="relative flex-1 max-w-md w-full">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search active survey forms..."
            className="field text-xs !mt-0"
            style={{ paddingLeft: '2.75rem' }}
          />
        </div>

        <div className="segmented-control shrink-0">
          {(['All', 'Courier', 'Supplier', 'Subcontractor'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(type)}
              className={typeFilter === type ? 'segmented-active' : ''}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Forms Grid */}
      {filteredSurveys.length === 0 ? (
        <div className="panel space-y-2 p-6 text-center text-slate-500 sm:p-12">
          <AlertCircle size={32} className="mx-auto text-slate-400" />
          <p className="font-semibold text-slate-700 dark:text-slate-300">No matching survey forms found</p>
          <p className="text-xs">Adjust search filters or create new survey forms under Survey Forms tab.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSurveys.map((survey) => {
            // Companies this survey actually evaluates right now (respects
            // the admin's "Modify Companies to Evaluate" selection) and each
            // eligible employee's progress against that same list.
            const completion = getSurveyCompletionSummary(survey, accounts, partnerCompanies, responses);
            const targetResponses = Math.max(completion.companiesTotal, 1);
            const employeesAt100 = completion.eligibleEmployees.filter((e) => e.completed >= e.total && e.total > 0).length;
            const responseCount = completion.eligibleEmployees.length
              ? Math.round(
                  (completion.eligibleEmployees.reduce((sum, e) => sum + e.completed, 0) /
                    completion.eligibleEmployees.length)
                )
              : 0;
            const progressPct = Math.min(100, Math.round((responseCount / targetResponses) * 100));

            // Check report status in sentReports log for this specific survey
            const reportLog = sentReports.find((r) => r.surveyId === survey.id);

            // Status Logic - Completed only when an admin manually marked it,
            // its deadline has passed, or every eligible employee reached
            // 100% of their needed evaluations. See getSurveyCompletionSummary.
            const isCompleted = completion.isComplete;

            const isOngoing = !isCompleted;

            return (
              <div
                key={survey.id}
                onClick={() => {
                  if (isOngoing) {
                    setSelectedSurveyForProgress(survey);
                  } else {
                    setSelectedSurveyForDetail(survey);
                  }
                }}
                className={`group relative rounded-xl border p-5 transition duration-200 cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between ${
                  isOngoing
                    ? 'border-amber-300 bg-amber-50/20 hover:border-amber-400 dark:border-amber-900/60 dark:bg-amber-950/10'
                    : 'border-emerald-200 bg-white hover:border-emerald-400 dark:border-emerald-900/50 dark:bg-slate-950'
                }`}
              >
                <div>
                  {/* Top Header Row */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {survey.surveyType}
                    </span>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {/* Sent / Queued Badge overlay if exists */}
                      {reportLog && reportLog.status === 'Sent' && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-extrabold text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
                          Sent ✓
                        </span>
                      )}
                      {reportLog && reportLog.status === 'Queued' && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 animate-pulse">
                          Queued ⏳
                        </span>
                      )}

                      {/* Primary Ongoing vs Completed Status Badge */}
                      {isOngoing ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                          <Clock size={12} />
                          Ongoing
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                          <CheckCircle2 size={12} />
                          Completed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Survey Title */}
                  <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-[#0063a9] transition line-clamp-2">
                    {survey.title}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 line-clamp-2">{survey.description || 'Stakeholder evaluation survey.'}</p>
                </div>

                {/* Progress Footer */}
                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-slate-500 flex items-center gap-1">
                      <Users size={13} />
                      Avg. Companies Evaluated
                    </span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {responseCount} / {targetResponses}
                    </span>
                  </div>

                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isOngoing ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  {completion.eligibleEmployees.length > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Employees at 100%</span>
                      <span className="font-semibold text-slate-600 dark:text-slate-300">
                        {employeesAt100} / {completion.eligibleEmployees.length}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                    <span>{survey.deadlineDate ? `Deadline: ${survey.deadlineDate}` : 'Active Survey'}</span>
                    <span className="font-semibold text-[#0063a9] dark:text-blue-300 flex items-center gap-0.5 group-hover:translate-x-0.5 transition">
                      View Details
                      <ChevronRight size={12} />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Ongoing Survey Read-only Progress Modal */}
      {selectedSurveyForProgress && (
        <SurveyProgressModal
          survey={selectedSurveyForProgress}
          responses={responses}
          partnerCompanies={partnerCompanies}
          accounts={accounts}
          onClose={() => setSelectedSurveyForProgress(null)}
          onMarkComplete={onMarkSurveyComplete}
          isAdmin={isAdmin}
        />
      )}

      {/* Completed Survey Detail & Action Modal */}
      {selectedSurveyForDetail && (
        <SurveyDetailModal
          survey={selectedSurveyForDetail}
          responses={responses}
          partnerCompanies={partnerCompanies}
          onClose={() => setSelectedSurveyForDetail(null)}
          onSendToPartner={onSendToPartner}
          reportSentStatus={{
            isSent: sentReports.some((r) => r.surveyId === selectedSurveyForDetail.id && r.status === 'Sent'),
            isQueued: sentReports.some((r) => r.surveyId === selectedSurveyForDetail.id && r.status === 'Queued'),
          }}
        />
      )}
    </div>
  );
}
