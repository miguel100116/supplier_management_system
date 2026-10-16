import React, { useState, useEffect, useMemo } from 'react';
import { QueuedReportEmail, EmailStatus } from '../../types/feedbackHub';
import { Clock, CheckCircle2, RotateCcw, Send, AlertTriangle, FileText, Search, History, Sparkles, X, Settings, Eye, Mail } from 'lucide-react';
import { ReturnReasonModal } from './ReturnReasonModal';
import { TableFilterBar } from '../TableFilterBar';
import { compareDate, compareText, isWithinDateRange } from '../../utils/tableFilters';
import { useModalEscape } from '../../hooks/useModalEscape';

interface SentReportsTabProps {
  sentReports: QueuedReportEmail[];
  onConfirmNow: (reportId: string) => void;
  onReturnReport: (reportId: string, reason: string, returnedBy: string) => void;
  onReviseReport: (report: QueuedReportEmail) => void;
  onResendReport: (report: QueuedReportEmail) => void;
  onPreviewDocument: (report: QueuedReportEmail) => void;
  onUpdateTimerSettings: (minutes: number) => void;
  currentTimerMinutes: number;
  userEmail: string;
}

export function SentReportsTab({
  sentReports,
  onConfirmNow,
  onReturnReport,
  onReviseReport,
  onResendReport,
  onPreviewDocument,
  onUpdateTimerSettings,
  currentTimerMinutes,
  userEmail,
}: SentReportsTabProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<EmailStatus | 'All'>('All');
  const [tableSort, setTableSort] = useState<'date-desc' | 'date-asc' | 'company-asc' | 'company-desc'>('date-desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Countdown timer force re-render ticker every 1 sec
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Modal State for Return Reason
  const [reportToReturn, setReportToReturn] = useState<QueuedReportEmail | null>(null);

  // Modal State for reviewing the exact email text/format + attached document
  const [reportToPreview, setReportToPreview] = useState<QueuedReportEmail | null>(null);

  // Modal State for Audit History
  const [historyReport, setHistoryReport] = useState<QueuedReportEmail | null>(null);

  // Settings Modal State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  useModalEscape(Boolean(reportToReturn), () => setReportToReturn(null), 15);
  useModalEscape(Boolean(reportToPreview), () => setReportToPreview(null), 10);
  useModalEscape(Boolean(historyReport), () => setHistoryReport(null), 10);
  useModalEscape(showSettingsModal, () => setShowSettingsModal(false));

  // Filtered list
  const filteredReports = useMemo(() => sentReports.filter((r) => {
    const matchesSearch =
      r.companyName.toLowerCase().includes(search.toLowerCase()) ||
      r.surveyTitle.toLowerCase().includes(search.toLowerCase()) ||
      r.recipientEmail.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
    return matchesSearch && matchesStatus && isWithinDateRange(r.sentAt ?? r.queuedAt, dateFrom, dateTo);
  }).sort((a, b) => {
    if (tableSort === 'date-asc') return compareDate(a.sentAt ?? a.queuedAt, b.sentAt ?? b.queuedAt);
    if (tableSort === 'company-asc') return compareText(a.companyName, b.companyName);
    if (tableSort === 'company-desc') return compareText(b.companyName, a.companyName);
    return compareDate(b.sentAt ?? b.queuedAt, a.sentAt ?? a.queuedAt);
  }), [sentReports, search, statusFilter, tableSort, dateFrom, dateTo]);

  // Calculate live time remaining string
  const getRemainingTimeStr = (expiresAtIso: string) => {
    const diff = new Date(expiresAtIso).getTime() - new Date().getTime();
    if (diff <= 0) return 'Review window ended';

    const totalSecs = Math.floor(diff / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;

    const pad = (n: number) => String(n).padStart(2, '0');
    if (hrs > 0) return `${pad(hrs)}:${pad(remMins)}:${pad(secs)}`;
    return `${pad(remMins)}:${pad(secs)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row-reverse sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 dark:border-slate-800 dark:bg-slate-950">
        <div className="relative flex-1 max-w-md w-full">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email log by company, survey title, or recipient..."
            className="field text-xs !mt-0"
            style={{ paddingLeft: '2.75rem' }}
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="segmented-control shrink-0">
            {(['All', 'Queued', 'Returned', 'Sent'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={statusFilter === st ? 'segmented-active' : ''}
              >
                {st}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="secondary-button text-xs gap-1 py-2 px-3"
            title="Configure Default Queue Timer Duration"
          >
            <Settings size={14} />
            Queue Config ({currentTimerMinutes}m)
          </button>
        </div>
      </div>

      <TableFilterBar
        sortOptions={[
          { value: 'date-desc', label: 'Activity: newest first' },
          { value: 'date-asc', label: 'Activity: oldest first' },
          { value: 'company-asc', label: 'Company: A–Z' },
          { value: 'company-desc', label: 'Company: Z–A' },
        ]}
        sortValue={tableSort}
        onSortChange={setTableSort}
        resultCount={filteredReports.length}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        dateLabel="Queued / sent date"
        onReset={() => {
          setSearch('');
          setStatusFilter('All');
          setTableSort('date-desc');
          setDateFrom('');
          setDateTo('');
        }}
      />

      {/* Email Log Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900/80 dark:text-slate-300 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3.5">Date Queued / Sent</th>
                <th className="px-4 py-3.5">Partner Company</th>
                <th className="px-4 py-3.5">Recipient & CC</th>
                <th className="px-4 py-3.5">Survey Report Title</th>
                <th className="px-4 py-3.5">Status & Countdown</th>
                <th className="px-4 py-3.5 text-right">Review Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    No partner feedback emails found in log.
                  </td>
                </tr>
              ) : (
                filteredReports.map((report) => {
                  const isQueued = report.status === 'Queued';
                  const isReturned = report.status === 'Returned';
                  const isSent = report.status === 'Sent';

                  return (
                    <tr
                      key={report.id}
                      className={`transition ${
                        isQueued
                          ? 'bg-amber-50/30 dark:bg-amber-950/10'
                          : isReturned
                          ? 'bg-rose-50/30 dark:bg-rose-950/10'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-900/50'
                      }`}
                    >
                      {/* Date Queued / Sent */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {new Date(report.queuedAt).toLocaleDateString()}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {new Date(report.queuedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </td>

                      {/* Partner Company */}
                      <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-white">
                        <p>{report.companyName}</p>
                        <span className="badge mt-0.5 text-[10px] bg-slate-100 dark:bg-slate-800">
                          {report.surveyType}
                        </span>
                      </td>

                      {/* Recipient & CC */}
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{report.recipientEmail}</p>
                        {report.ccEmails.length > 0 && (
                          <p className="text-[11px] text-slate-400 truncate max-w-[180px]">
                            CC: {report.ccEmails.join(', ')}
                          </p>
                        )}
                      </td>

                      {/* Survey Title */}
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-slate-800 dark:text-slate-200 max-w-[220px] truncate">
                          {report.surveyTitle}
                        </p>
                        <p className="text-[11px] text-slate-400">Score: {report.overallScore}% ({report.responseCount} responses)</p>
                      </td>

                      {/* Status & Live Countdown Ticker */}
                      <td className="px-4 py-3.5">
                        {isQueued && (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2.5 py-1 text-[11px] font-extrabold text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 animate-pulse border border-amber-300 dark:border-amber-700">
                              <Clock size={12} />
                              Queued ⏳ {getRemainingTimeStr(report.expiresAt)}
                            </span>
                            <p className="text-[10px] text-amber-700 dark:text-amber-400">
                              Manual confirmation required to send
                            </p>
                          </div>
                        )}

                        {isSent && (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                              <CheckCircle2 size={12} />
                              Sent ✓
                            </span>
                            <p className="text-[10px] text-slate-400">
                              {report.sentAt ? new Date(report.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Delivered'}
                            </p>
                          </div>
                        )}

                        {isReturned && (
                          <div className="space-y-1 max-w-[200px]">
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-800 dark:bg-rose-900/60 dark:text-rose-200 border border-rose-300 dark:border-rose-700">
                              <AlertTriangle size={12} />
                              Returned (Needs Revision)
                            </span>
                            <p className="text-[10px] text-rose-700 dark:text-rose-400 line-clamp-2">
                              Reason: "{report.returnReason}"
                            </p>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap space-x-1.5">
                        {isQueued && (
                          <>
                            <button
                              onClick={() => setReportToPreview(report)}
                              className="inline-flex items-center gap-1 rounded-lg bg-blue-50 text-[#0866B1] hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 px-2.5 py-1 text-[11px] font-bold transition"
                              title="Review the exact email text, formatting, and attached report document before it sends"
                            >
                              <Eye size={12} />
                              Preview
                            </button>

                            <button
                              onClick={() => onConfirmNow(report.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-[11px] font-bold transition shadow-sm"
                              title="Send immediately, skipping rest of timer"
                            >
                              <CheckCircle2 size={12} />
                              Confirm Now
                            </button>

                            <button
                              onClick={() => setReportToReturn(report)}
                              className="inline-flex items-center gap-1 rounded-lg bg-rose-100 text-rose-800 hover:bg-rose-200 dark:bg-rose-900/60 dark:text-rose-200 px-2.5 py-1 text-[11px] font-bold transition"
                              title="Pause timer and return to sender with revision reason"
                            >
                              <RotateCcw size={12} />
                              Return
                            </button>
                          </>
                        )}

                        {isReturned && (
                          <button
                            onClick={() => onReviseReport(report)}
                            className="inline-flex items-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 text-[11px] font-bold transition shadow-sm"
                          >
                            <RotateCcw size={12} />
                            Revise & Re-queue
                          </button>
                        )}

                        {isSent && (
                          <>
                            <button
                              onClick={() => onResendReport(report)}
                              className="secondary-button py-1 px-2.5 text-[11px] gap-1"
                              title="Re-open Send modal pre-filled"
                            >
                              <Send size={12} />
                              Resend
                            </button>

                            <button
                              onClick={() => setHistoryReport(report)}
                              className="ghost-button py-1 px-2 text-[11px] gap-1 text-slate-500"
                              title="View audit history"
                            >
                              <History size={12} />
                              Log
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Return Reason Modal */}
      {reportToReturn && (
        <ReturnReasonModal
          reportTitle={reportToReturn.surveyTitle}
          companyName={reportToReturn.companyName}
          recipientEmail={reportToReturn.recipientEmail}
          onClose={() => setReportToReturn(null)}
          onConfirmReturn={(reason) => {
            onReturnReport(reportToReturn.id, reason, userEmail);
            setReportToReturn(null);
          }}
        />
      )}

      {/* Email Preview Modal — exact text/format that will be sent, plus a
          link to generate the same PDF document the recipient will get. */}
      {reportToPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
                <Mail size={18} className="text-[#0866B1]" />
                Email Preview — {reportToPreview.companyName}
              </div>
              <button
                onClick={() => setReportToPreview(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4 text-xs sm:p-6">
              <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex gap-2">
                  <span className="w-14 shrink-0 font-bold text-slate-500">To:</span>
                  <span className="text-slate-800 dark:text-slate-200">{reportToPreview.recipientEmail}</span>
                </div>
                {reportToPreview.ccEmails.length > 0 && (
                  <div className="flex gap-2">
                    <span className="w-14 shrink-0 font-bold text-slate-500">CC:</span>
                    <span className="text-slate-800 dark:text-slate-200">{reportToPreview.ccEmails.join(', ')}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <span className="w-14 shrink-0 font-bold text-slate-500">Subject:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{reportToPreview.subject}</span>
                </div>
                <div className="flex gap-2">
                  <span className="w-14 shrink-0 font-bold text-slate-500">Attach:</span>
                  <span className="text-slate-800 dark:text-slate-200">{reportToPreview.companyName.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}_Feedback_Report.pdf</span>
                </div>
              </div>

              <div>
                <p className="mb-1.5 font-bold text-slate-500 uppercase tracking-wider text-[10px]">Message body (exactly as it will render in the recipient's inbox)</p>
                <div
                  className="rounded-lg border border-slate-200 bg-white p-4 text-slate-800 leading-relaxed dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                  // Same plain-text -> HTML conversion applied at real send
                  // time (PartnersFeedbackHubPage), so this is byte-for-byte
                  // what the recipient's email client will show.
                  dangerouslySetInnerHTML={{ __html: reportToPreview.body.replace(/\n/g, '<br/>') }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-6 py-3 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
              <button
                onClick={() => onPreviewDocument(reportToPreview)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0866B1] hover:bg-[#07528E] text-white px-3 py-1.5 text-[11px] font-bold transition shadow-sm"
                title="Generate and open the exact PDF report that will be attached"
              >
                <FileText size={13} />
                View Attached PDF Document
              </button>
              <button
                onClick={() => setReportToPreview(null)}
                className="secondary-button text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit History Log Modal */}
      {historyReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
                <History size={18} className="text-[#0866B1]" />
                Audit Trail Log - {historyReport.companyName}
              </div>
              <button
                onClick={() => setHistoryReport(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="text-xs text-slate-500 border-b border-slate-100 pb-3 dark:border-slate-800">
                <p className="font-bold text-slate-800 dark:text-slate-200">{historyReport.surveyTitle}</p>
                <p>Recipient: {historyReport.recipientEmail}</p>
              </div>

              <div className="space-y-3 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                {historyReport.history.map((entry, idx) => (
                  <div key={idx} className="relative pl-7 text-xs">
                    <div className="absolute left-1.5 top-1 h-3 w-3 rounded-full border-2 border-white bg-[#0866B1] dark:border-slate-950" />
                    <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
                      <span>{entry.action}</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-slate-500 text-[11px] mt-0.5">By: {entry.actor}</p>
                    {entry.details && (
                      <p className="mt-1 rounded bg-slate-50 p-2 text-[11px] text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                        "{entry.details}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-200 px-6 py-3 bg-slate-50 dark:border-slate-800 dark:bg-slate-900 text-right">
              <button
                onClick={() => setHistoryReport(null)}
                className="secondary-button text-xs"
              >
                Close Audit Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Queue Timer Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Settings size={16} className="text-[#0866B1]" />
                Default Queue Timer Duration Settings
              </h3>
              <button onClick={() => setShowSettingsModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <p className="text-slate-600 dark:text-slate-300">
                Configure the default review countdown duration applied whenever a new report email is queued.
              </p>

              <div>
                <label className="field-label text-xs font-bold">Default Countdown Duration</label>
                <select
                  value={currentTimerMinutes}
                  onChange={(e) => onUpdateTimerSettings(Number(e.target.value))}
                  className="field mt-1 text-xs font-semibold"
                >
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes (Standard Default)</option>
                  <option value={60}>60 Minutes (1 Hour)</option>
                  <option value={120}>120 Minutes (2 Hours)</option>
                </select>
              </div>
            </div>

            <div className="border-t border-slate-200 px-6 py-3 bg-slate-50 dark:border-slate-800 dark:bg-slate-900 text-right">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="primary-button text-xs bg-[#0866B1]"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
