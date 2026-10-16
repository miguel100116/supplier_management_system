import React, { useMemo, useState } from 'react';
import { CustomForm, PartnerCompany, SurveyResponse, SurveyType } from '../../types/survey';
import { QueuedReportEmail } from '../../types/feedbackHub';
import { Search, Filter, Download, Send, BarChart3, CheckCircle2, Clock, AlertTriangle, FileText } from 'lucide-react';
import { exportTablesAsPDF, ExportTable } from '../../utils/exporters';
import { SurveyDetailModal } from './SurveyDetailModal';
import { submissionScores } from '../../utils/analytics';
import { formatCompositeScore } from '../../data/questionWeights';
import { TableFilterBar } from '../TableFilterBar';
import { compareDate, compareText, isWithinDateRange } from '../../utils/tableFilters';

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
    const count = subScores.length;
    const satisfactionScore = count > 0
      ? Number((subScores.reduce((sum, s) => sum + s.score, 0) / count).toFixed(1))
      : 0;

    const tables: ExportTable[] = [
      {
        title: `Completed Survey Archive - ${survey.title}`,
        columns: ['Property', 'Value'],
        rows: [
          ['Survey Title', survey.title],
          ['Survey Type', survey.surveyType],
          ['Completion Date', new Date(survey.createdAt).toLocaleDateString()],
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
    <div className="space-y-6">
      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row-reverse sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 dark:border-slate-800 dark:bg-slate-950">
        <div className="relative flex-1 max-w-md w-full">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter past survey results by title or company..."
            className="field text-xs !mt-0"
            style={{ paddingLeft: '2.75rem' }}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Filter Category:</span>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as any)}
            className="field text-xs py-2 px-3 w-auto"
          >
            <option value="All">All Partner Types</option>
            <option value="Courier">Courier</option>
            <option value="Supplier">Supplier</option>
            <option value="Subcontractor">Subcontractor</option>
          </select>
        </div>
      </div>

      <TableFilterBar
        sortOptions={[
          { value: 'date-desc', label: 'Completion: newest first' },
          { value: 'date-asc', label: 'Completion: oldest first' },
          { value: 'title-asc', label: 'Survey: A–Z' },
          { value: 'title-desc', label: 'Survey: Z–A' },
        ]}
        sortValue={tableSort}
        onSortChange={setTableSort}
        resultCount={filteredSurveys.length}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        dateLabel="Completion date"
        onReset={() => {
          setSearch('');
          setSelectedType('All');
          setTableSort('date-desc');
          setDateFrom('');
          setDateTo('');
        }}
      />

      {/* Table View */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900/80 dark:text-slate-300 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3.5">Survey Name</th>
                <th className="px-4 py-3.5">Company / Type</th>
                <th className="px-4 py-3.5">Period / Date</th>
                <th className="px-4 py-3.5">Completion Rate</th>
                <th className="px-4 py-3.5">Report Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
              {filteredSurveys.map((survey) => {
                const surveyResponses = responses.filter(
                  (r) => r.surveyType === survey.surveyType && !r.archived
                );
                const count = submissionScores(surveyResponses).length;
                const targetQuota = 10;
                const completionPct = Math.min(100, Math.round((count / targetQuota) * 100));

                const matchingCompany = partnerCompanies.find((c) => c.type === survey.surveyType);
                const reportLog = sentReports.find(
                  (r) => r.surveyId === survey.id
                );

                return (
                  <tr key={survey.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/50 transition">
                    <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-white">
                      {survey.title}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {survey.surveyType}
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[160px]">
                          {matchingCompany ? matchingCompany.name : `${survey.surveyType} Partners`}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">
                      {new Date(survey.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">{completionPct}%</span>
                        <span className="text-[11px] text-slate-400">({count}/{targetQuota})</span>
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
                      {(!reportLog || reportLog.status === 'Failed') && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          Not Sent
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap space-x-1.5">
                      <button
                        onClick={() => setSelectedSurveyForDetail(survey)}
                        className="secondary-button py-1 px-2.5 text-[11px] gap-1"
                        title="View Analytics"
                      >
                        <BarChart3 size={13} />
                        Analytics
                      </button>

                      <button
                        onClick={() => handleExportPdfRow(survey)}
                        className="secondary-button py-1 px-2.5 text-[11px] gap-1"
                        title="Export PDF"
                      >
                        <Download size={13} />
                        PDF
                      </button>

                      <button
                        onClick={() => onOpenSendToPartner(survey, matchingCompany)}
                        className="primary-button py-1 px-2.5 text-[11px] gap-1 bg-[#0866B1] hover:bg-blue-800"
                        title="Send / Resend to Partner"
                      >
                        <Send size={13} />
                        {reportLog?.status === 'Sent' ? 'Resend' : 'Send to Partner'}
                      </button>
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
