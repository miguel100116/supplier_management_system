import React, { useMemo, useState } from 'react';
import { CustomForm, PartnerCompany, SurveyResponse, SurveyType } from '../../../types/survey';
import { QueuedReportEmail } from '../types';
import { Download, Send, BarChart3, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { exportTablesAsPDF, ExportTable } from '../../reports/services/exporters';
import { SurveyDetailModal } from './SurveyDetailModal';
import { FeedbackHubFilterBar } from './FeedbackHubFilterBar';
import { submissionCount, submissionScores } from '../../analytics/domain/analytics';
import { formatCompositeScore } from '../../../data/questionWeights';
import { compareDate, compareText, isWithinDateRange } from '../../../utils/tableFilters';

interface PastResultsTabProps {
  surveys: CustomForm[];
  responses: SurveyResponse[];
  partnerCompanies: PartnerCompany[];
  sentReports: QueuedReportEmail[];
  onOpenSendToPartner: (survey: CustomForm, company?: PartnerCompany) => void;
}

export function PastResultsTab({
  surveys,
  responses,
  partnerCompanies,
  sentReports,
  onOpenSendToPartner,
}: PastResultsTabProps) {
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<SurveyType | 'All'>('All');
  const [tableSort, setTableSort] = useState<'date-desc' | 'date-asc' | 'title-asc' | 'title-desc'>('date-desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedSurveyForDetail, setSelectedSurveyForDetail] = useState<CustomForm | null>(null);

  // Filter completed surveys or all surveys
  const completedSurveys = surveys.filter((s) => s.status !== 'Archived');

  const filteredSurveys = useMemo(() => completedSurveys
    .filter((s) => {
      const matchesSearch = s.title.toLowerCase().includes(search.toLowerCase()) || s.surveyType.toLowerCase().includes(search.toLowerCase());
      const matchesType = selectedType === 'All' || s.surveyType === selectedType;
      return matchesSearch && matchesType && isWithinDateRange(s.createdAt, dateFrom, dateTo);
    })
    .sort((a, b) => {
      if (tableSort === 'date-asc') return compareDate(a.createdAt, b.createdAt);
      if (tableSort === 'title-asc') return compareText(a.title, b.title);
      if (tableSort === 'title-desc') return compareText(b.title, a.title);
      return compareDate(b.createdAt, a.createdAt);
    }), [completedSurveys, search, selectedType, tableSort, dateFrom, dateTo]);

  const handleExportPdfRow = (survey: CustomForm) => {
    const surveyResponses = responses.filter(
      (r) => r.surveyType === survey.surveyType && !r.archived
    );
    const subScores = submissionScores(surveyResponses);
    const count = submissionCount(surveyResponses);
    const satisfactionScore = subScores.length > 0
      ? Number((subScores.reduce((sum, s) => sum + s.score, 0) / subScores.length).toFixed(1))
      : 0;

    const tables: ExportTable[] = [
      {
        title: `Completed Survey Archive - ${survey.title}`,
        columns: ['Property', 'Value'],
        rows: [
          ['Survey Title', survey.title],
          ['Survey Type', survey.surveyType],
          ['Survey Created', new Date(survey.createdAt).toLocaleDateString()],
          ['Total Submissions', String(count)],
          ['Overall Score', formatCompositeScore(survey.surveyType, satisfactionScore).text],
        ],
      },
    ];

    exportTablesAsPDF(
      `${survey.title} - Past Results Report`,
      tables,
      `${survey.surveyType}_Past_Report`
    );
  };

  return (
    <div className="feedback-hub-tab feedback-results-tab space-y-4">
      <FeedbackHubFilterBar
        searchValue={search}
        searchPlaceholder="Search survey results"
        searchLabel="Search results by title or partner type"
        onSearchChange={setSearch}
        resultCount={filteredSurveys.length}
        resultLabel={filteredSurveys.length === 1 ? 'result' : 'results'}
        sortOptions={[
          { value: 'date-desc', label: 'Created: newest first' },
          { value: 'date-asc', label: 'Created: oldest first' },
          { value: 'title-asc', label: 'Survey: A–Z' },
          { value: 'title-desc', label: 'Survey: Z–A' },
        ]}
        sortValue={tableSort}
        defaultSortValue="date-desc"
        onSortChange={(value) => setTableSort(value as typeof tableSort)}
        categoryValue={selectedType}
        categoryLabel="Partner type"
        categoryOptions={[
          { value: 'All', label: 'All partner types' },
          { value: 'Courier', label: 'Courier' },
          { value: 'Supplier', label: 'Supplier' },
          { value: 'Subcontractor', label: 'Subcontractor' },
        ]}
        onCategoryChange={(value) => setSelectedType(value as SurveyType | 'All')}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        dateLabel="Survey created date"
        onReset={() => {
          setSearch('');
          setSelectedType('All');
          setTableSort('date-desc');
          setDateFrom('');
          setDateTo('');
        }}
      />
      <p className="feedback-results-measure-note">Response totals are grouped across unarchived submissions for the partner type. The indicator reaches 100% at its 10-response display threshold.</p>

      {/* Table View */}
      <div className="feedback-table-surface rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="feedback-data-table feedback-results-table w-full text-left text-xs">
            <colgroup>
              <col className="feedback-results-col-survey" />
              <col className="feedback-results-col-type" />
              <col className="feedback-results-col-scope" />
              <col className="feedback-results-col-created" />
              <col className="feedback-results-col-responses" />
              <col className="feedback-results-col-status" />
              <col className="feedback-results-col-actions" />
            </colgroup>
            <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900/80 dark:text-slate-300 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3.5">Survey Name</th>
                <th className="px-4 py-3.5">Partner type</th>
                <th className="px-4 py-3.5">Scope</th>
                <th className="px-4 py-3.5">Survey created</th>
                <th className="px-4 py-3.5">Type response indicator</th>
                <th className="px-4 py-3.5">Report Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
              {filteredSurveys.map((survey) => {
                const surveyResponses = responses.filter(
                  (r) => r.surveyType === survey.surveyType && !r.archived
                );
                const count = submissionCount(surveyResponses);
                const targetQuota = 10;
                const completionPct = Math.min(100, Math.round((count / targetQuota) * 100));

                const matchingCompany = partnerCompanies.find((c) => c.type === survey.surveyType);
                const hasCustomCompanyScope = Boolean(survey.evaluationCompanyIds?.length);
                const reportLog = sentReports.find(
                  (r) => r.surveyId === survey.id
                );

                return (
                  <tr key={survey.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/50 transition">
                    <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-white">
                      <button type="button" className="feedback-record-link" onClick={() => setSelectedSurveyForDetail(survey)}>{survey.title}</button>
                    </td>
                    <td className="feedback-type-cell px-4 py-3.5 align-middle">
                      <span className={`feedback-category-badge ${survey.surveyType.toLowerCase()} badge`}>
                        {survey.surveyType}
                      </span>
                    </td>
                    <td className="feedback-scope-cell px-4 py-3.5 align-middle font-medium text-slate-600 dark:text-slate-300">
                      <span>
                        {hasCustomCompanyScope ? 'Custom partner scope' : 'All partners in type'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">
                      {new Date(survey.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-4 py-3.5" title={`${count} unarchived ${survey.surveyType} responses across the partner type; the display threshold is ${targetQuota} responses and the indicator caps at 100%.`}>
                      <div role="group" className="feedback-result-completion" aria-label={`${completionPct}% of the display threshold; ${count} unarchived responses for ${survey.surveyType}, threshold ${targetQuota}`}>
                        <div><strong>{completionPct}%</strong><span>{count} type responses / {targetQuota} threshold</span></div>
                        <div className="feedback-result-track" aria-hidden="true"><span style={{ width: `${completionPct}%` }} /></div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      {reportLog?.status === 'Sent' && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2.5 py-1 text-[11px] font-bold text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
                          <CheckCircle2 size={12} />
                          Report Sent ✓
                        </span>
                      )}
                      {reportLog?.status === 'Queued' && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 animate-pulse">
                          <Clock size={12} />
                          Queued ⏳
                        </span>
                      )}
                      {reportLog?.status === 'Returned' && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-800 dark:bg-rose-900/60 dark:text-rose-200">
                          <AlertTriangle size={12} />
                          Returned (Revise)
                        </span>
                      )}
                      {reportLog?.status === 'Failed' && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                          <AlertTriangle size={12} aria-hidden="true" /> Delivery failed
                        </span>
                      )}
                      {!reportLog && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          Not Sent
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="feedback-result-actions">
                        <button type="button" onClick={() => setSelectedSurveyForDetail(survey)} className="secondary-button !h-8 !w-8 !min-h-8 !gap-0 !p-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50" title="View analytics" aria-label={`View analytics for ${survey.title}`}>
                          <BarChart3 size={15} aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => handleExportPdfRow(survey)} className="secondary-button !h-8 !w-8 !min-h-8 !gap-0 !p-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50" title="Export PDF" aria-label={`Export PDF for ${survey.title}`}>
                          <Download size={15} aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => onOpenSendToPartner(survey, matchingCompany)} className="secondary-button !h-8 !w-8 !min-h-8 !gap-0 !p-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50" title={reportLog?.status === 'Sent' ? 'Resend report to partner' : 'Send report to partner'} aria-label={`${reportLog?.status === 'Sent' ? 'Resend report to partner' : 'Send report to partner'} for ${survey.title}`}>
                          <Send size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSurveyForDetail && (
        <SurveyDetailModal
          survey={selectedSurveyForDetail}
          responses={responses}
          partnerCompanies={partnerCompanies}
          onClose={() => setSelectedSurveyForDetail(null)}
          onSendToPartner={(s, comp) => onOpenSendToPartner(s, comp)}
        />
      )}
    </div>
  );
}
