import React, { useState, useEffect } from 'react';
import { CustomForm, PartnerCompany, SurveyResponse, SurveyType } from '../types/survey';
import {
  PartnerContact,
  QueuedReportEmail,
  FeedbackHubSettings,
} from '../types/feedbackHub';
import {
  getPartnerContacts,
  savePartnerContacts,
  getSentReports,
  saveSentReports,
  getFeedbackHubSettings,
  saveFeedbackHubSettings,
} from '../utils/feedbackHubStore';

import { CurrentFormsTab } from '../components/feedback-hub/CurrentFormsTab';
import { PageDescription } from '../components/PageDescription';
import { PastResultsTab } from '../components/feedback-hub/PastResultsTab';
import { SentReportsTab } from '../components/feedback-hub/SentReportsTab';
import { SendToPartnerWizard } from '../components/feedback-hub/SendToPartnerWizard';
import { BulkHiddenChartCapturer, BulkReportCaptureItem } from '../components/feedback-hub/BulkHiddenChartCapturer';
import { isMsalConfigured } from '../services/msalAuth';
import { getSurveyCompletionSummary } from '../utils/surveyCompletion';
import { SurveyAccount } from '../hooks/useSurveyData';

import { FileText, Archive, Send, Clock, ShieldAlert, Sparkles, SendToBack } from 'lucide-react';

interface PartnersFeedbackHubPageProps {
  surveys: CustomForm[];
  responses: SurveyResponse[];
  partnerCompanies: PartnerCompany[];
  accounts?: SurveyAccount[];
  currentUser: { email: string; role: string } | null;
  onNavigatePage?: (page: string) => void;
  onMarkSurveyComplete?: (surveyId: string) => void;
}

export type FeedbackHubTab = 'current-forms' | 'past-results' | 'sent-reports';

export function PartnersFeedbackHubPage({
  surveys,
  responses,
  partnerCompanies,
  accounts = [],
  currentUser,
  onNavigatePage,
  onMarkSurveyComplete,
}: PartnersFeedbackHubPageProps) {
  const [activeTab, setActiveTab] = useState<FeedbackHubTab>('current-forms');

  // Persistent State
  const [contacts, setContacts] = useState<PartnerContact[]>(() => getPartnerContacts());
  const [sentReports, setSentReports] = useState<QueuedReportEmail[]>(() => getSentReports());
  const [settings, setSettings] = useState<FeedbackHubSettings>(() => getFeedbackHubSettings());
  // Set while a real Microsoft Graph send (triggered by handleConfirmNow) is
  // in flight - mounts the hidden chart capturer below just long enough to
  // regenerate the PDF and email it, then clears once handleRealSendResult runs.
  const [realSendReport, setRealSendReport] = useState<QueuedReportEmail | null>(null);
  // Set while a queued report's attached PDF is being regenerated for the
  // admin to review before it sends (see SentReportsTab's "Preview" button).
  // Uses the exact same capture pipeline/graph selection as the real send
  // above, so what's previewed here is what actually goes out.
  const [previewDocReport, setPreviewDocReport] = useState<QueuedReportEmail | null>(null);
  const [previewDocWindow, setPreviewDocWindow] = useState<Window | null>(null);

  // Dispatch Flow Inline State
  const [isDispatchWizardOpen, setIsDispatchWizardOpen] = useState(false);
  const [dispatchWizardBulkMode, setDispatchWizardBulkMode] = useState(false);
  const [sendInitialSurveyId, setSendInitialSurveyId] = useState<string | undefined>();
  const [sendInitialCompanyId, setSendInitialCompanyId] = useState<string | undefined>();
  const [revisionReport, setRevisionReport] = useState<QueuedReportEmail | null>(null);

  // Sync auto-send check periodically
  useEffect(() => {
    const refresh = () => {
      setContacts(getPartnerContacts());
      setSentReports(getSentReports());
      setSettings(getFeedbackHubSettings());
    };
    window.addEventListener('feedback-hub-data-updated', refresh);
    const interval = setInterval(() => {
      setSentReports(getSentReports());
    }, 5000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('feedback-hub-data-updated', refresh);
    };
  }, []);

  // Save wrappers
  const handleUpdateContacts = (newContacts: PartnerContact[]) => {
    setContacts(newContacts);
    savePartnerContacts(newContacts);
  };

  const handleUpdateSentReports = (newReports: QueuedReportEmail[]) => {
    setSentReports(newReports);
    saveSentReports(newReports);
  };

  const handleUpdateSettings = (newSettings: FeedbackHubSettings) => {
    setSettings(newSettings);
    saveFeedbackHubSettings(newSettings);
  };

  const resolveQueuedReportCaptureItem = (report: QueuedReportEmail): BulkReportCaptureItem | null => {
    if (!report.companyId) return null;
    const company = partnerCompanies.find(
      (candidate) => candidate.id === report.companyId && !candidate.isArchived,
    );
    const survey = surveys.find(
      (candidate) => candidate.id === report.surveyId && candidate.surveyType === report.surveyType,
    );
    if (!company || !survey || company.type !== survey.surveyType) return null;
    return { company, survey, periodCovered: report.periodCovered };
  };

  // Open Send Wizard for survey (single mode)
  const handleOpenSendToPartner = (survey?: CustomForm, company?: PartnerCompany) => {
    setSendInitialSurveyId(survey?.id);
    setSendInitialCompanyId(company?.id);
    setRevisionReport(null);
    setDispatchWizardBulkMode(false);
    setIsDispatchWizardOpen(true);
  };

  // Open Send Wizard for Revision or Resend (single mode)
  const handleOpenRevisionOrResend = (report: QueuedReportEmail) => {
    setRevisionReport(report);
    setSendInitialSurveyId(report.surveyId);
    setSendInitialCompanyId(report.companyId);
    setDispatchWizardBulkMode(false);
    setIsDispatchWizardOpen(true);
  };

  // Queue report action
  const handleQueueReport = (payload: {
    surveyId: string;
    surveyTitle: string;
    companyId: string;
    companyName: string;
    surveyType: SurveyType;
    periodCovered: string;
    recipientEmail: string;
    ccEmails: string[];
    subject: string;
    body: string;
    timerDurationMinutes: number;
    responseCount: number;
    overallScore: number;
    isRevision?: boolean;
    existingId?: string;
  }) => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + payload.timerDurationMinutes * 60 * 1000).toISOString();
    const actor = currentUser?.email || 'admin@mgenesis.com';

    if (payload.isRevision && payload.existingId) {
      // Re-queue existing item
      const updated = sentReports.map((item) => {
        if (item.id === payload.existingId) {
          return {
            ...item,
            surveyId: payload.surveyId,
            surveyTitle: payload.surveyTitle,
            companyId: payload.companyId,
            companyName: payload.companyName,
            surveyType: payload.surveyType,
            periodCovered: payload.periodCovered,
            recipientEmail: payload.recipientEmail,
            ccEmails: payload.ccEmails,
            subject: payload.subject,
            body: payload.body,
            status: 'Queued' as const,
            queuedAt: now.toISOString(),
            timerDurationMinutes: payload.timerDurationMinutes,
            expiresAt,
            responseCount: payload.responseCount,
            overallScore: payload.overallScore,
            history: [
              ...item.history,
              {
                action: 'Revised & Re-queued' as const,
                timestamp: now.toISOString(),
                actor,
                details: `Revised email subject/body/recipients and restarted review countdown timer (${payload.timerDurationMinutes} mins).`,
              },
            ],
          };
        }
        return item;
      });
      handleUpdateSentReports(updated);
    } else {
      // Create new queued report entry
      const newEntry: QueuedReportEmail = {
        id: `rpt-q-${Date.now()}`,
        surveyId: payload.surveyId,
        surveyTitle: payload.surveyTitle,
        companyId: payload.companyId,
        companyName: payload.companyName,
        surveyType: payload.surveyType,
        periodCovered: payload.periodCovered,
        recipientEmail: payload.recipientEmail,
        ccEmails: payload.ccEmails,
        subject: payload.subject,
        body: payload.body,
        status: 'Queued',
        queuedAt: now.toISOString(),
        timerDurationMinutes: payload.timerDurationMinutes,
        expiresAt,
        queuedBy: actor,
        responseCount: payload.responseCount,
        overallScore: payload.overallScore,
        history: [
          {
            action: 'Queued',
            timestamp: now.toISOString(),
            actor,
            details: `Initial report queued for review (${payload.timerDurationMinutes} min countdown timer started).`,
          },
        ],
      };
      handleUpdateSentReports([newEntry, ...sentReports]);
    }

    // Switch to Sent Reports tab so user sees queue ticker!
    setActiveTab('sent-reports');
  };

  // Confirm Now sends through Microsoft Graph. A missing mail integration is
  // reported as a failure and never presented as a successful delivery.
  const handleConfirmNow = (reportId: string) => {
    if (isMsalConfigured()) {
      const report = sentReports.find((r) => r.id === reportId);
      if (report && resolveQueuedReportCaptureItem(report)) {
        setRealSendReport(report);
      } else if (report) {
        handleRealSendResult(report.id, {
          success: false,
          error: 'The queued report has no valid company ID or survey record. Revise and re-queue it before sending.',
        });
      }
      return;
    }

    handleRealSendResult(reportId, {
      success: false,
      error: 'Microsoft Graph email is not configured. The report was not sent.',
    });
  };

  // Applies the outcome of a real Graph send (see the BulkHiddenChartCapturer
  // mount below) to the report's status/history, then clears the mount.
  const handleRealSendResult = (reportId: string, result: { success: boolean; error?: string }) => {
    const nowIso = new Date().toISOString();
    const actor = currentUser?.email || 'System Administrator';

    const updated = sentReports.map((rpt) => {
      if (rpt.id !== reportId) return rpt;
      if (result.success) {
        return {
          ...rpt,
          status: 'Sent' as const,
          sentAt: nowIso,
          history: [
            ...rpt.history,
            {
              action: 'Confirmed Immediately' as const,
              timestamp: nowIso,
              actor,
              details: 'Admin manually confirmed dispatch. Email sent via Microsoft Graph to the partner.',
            },
          ],
        };
      }
      return {
        ...rpt,
        status: 'Failed' as const,
        history: [
          ...rpt.history,
          {
            action: 'Confirmed Immediately' as const,
            timestamp: nowIso,
            actor,
            details: `Send failed: ${result.error || 'Unknown error'}`,
          },
        ],
      };
    });
    handleUpdateSentReports(updated);
    setRealSendReport(null);
  };

  // Preview Document action - opens a blank tab immediately (so it isn't
  // blocked as a popup once the async PDF generation resolves), then mounts
  // BulkHiddenChartCapturer in its no-sendVia "preview" mode to render the
  // report and redirect that tab to the generated PDF once ready.
  const handlePreviewDocument = (report: QueuedReportEmail) => {
    const newWindow = window.open('about:blank', '_blank');
    if (!resolveQueuedReportCaptureItem(report)) {
      if (newWindow) {
        newWindow.document.write('<p style="font-family: sans-serif; margin: 50px; color: #b91c1c;">The queued report has no valid company ID or survey record. Revise and re-queue it before previewing.</p>');
      }
      return;
    }
    if (newWindow) {
      newWindow.document.write('<p style="font-family: sans-serif; text-align: center; margin-top: 50px; color: #475569;">Generating PDF preview, please wait...</p>');
    }
    setPreviewDocWindow(newWindow);
    setPreviewDocReport(report);
  };

  const handlePreviewDocComplete = () => {
    setPreviewDocReport(null);
    setPreviewDocWindow(null);
  };

  // Return Report action
  const handleReturnReport = (reportId: string, reason: string, returnedBy: string) => {
    const nowIso = new Date().toISOString();

    const updated = sentReports.map((rpt) => {
      if (rpt.id === reportId) {
        return {
          ...rpt,
          status: 'Returned' as const,
          returnedBy,
          returnReason: reason,
          history: [
            ...rpt.history,
            {
              action: 'Returned' as const,
              timestamp: nowIso,
              actor: returnedBy,
              details: `Returned with reason: "${reason}"`,
            },
          ],
        };
      }
      return rpt;
    });
    handleUpdateSentReports(updated);
  };

  // Directory Contact Handlers
  const handleAddContact = (c: Omit<PartnerContact, 'id' | 'updatedAt'>) => {
    const newC: PartnerContact = {
      ...c,
      id: `contact-${Date.now()}`,
      updatedAt: new Date().toISOString(),
    };
    handleUpdateContacts([...contacts, newC]);
  };

  const handleUpdateContact = (c: PartnerContact) => {
    const updated = contacts.map((item) => (item.id === c.id ? c : item));
    handleUpdateContacts(updated);
  };

  const handleDeleteContact = (id: string) => {
    const updated = contacts.filter((item) => item.id !== id);
    handleUpdateContacts(updated);
  };

  const queuedCount = sentReports.filter((r) => r.status === 'Queued').length;
  const realSendCaptureItem = realSendReport ? resolveQueuedReportCaptureItem(realSendReport) : null;
  const previewCaptureItem = previewDocReport ? resolveQueuedReportCaptureItem(previewDocReport) : null;

  // Check if all active surveys are completed to enable Bulk Sending.
  // "Completed" here means: an admin manually marked it complete, its
  // deadline has passed, or every eligible employee has evaluated 100% of
  // the companies this survey is currently scoped to (its "Modify Companies
  // to Evaluate" selection).
  const activeSurveys = surveys.filter((s) => s.status !== 'Archived');
  const hasOngoingSurveys = activeSurveys.some(
    (s) => !getSurveyCompletionSummary(s, accounts, partnerCompanies, responses).isComplete
  );
  const areAllSurveysCompleted = !hasOngoingSurveys;

  // If Dispatch Wizard is open, render it inline (whole page experience!)
  if (isDispatchWizardOpen) {
    return (
      <div className="animate-fadeIn pb-12">
        <SendToPartnerWizard
          surveys={surveys}
          responses={responses}
          partnerCompanies={partnerCompanies}
          contacts={contacts}
          initialSurveyId={sendInitialSurveyId}
          initialCompanyId={sendInitialCompanyId}
          revisionReport={revisionReport}
          defaultTimerMinutes={settings.defaultTimerMinutes}
          userEmail={currentUser?.email || 'admin@mgenesis.com'}
          onClose={() => setIsDispatchWizardOpen(false)}
          onQueueReport={handleQueueReport}
          bulkMode={dispatchWizardBulkMode}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      <PageDescription>Review feedback collected from partners and employees in one place.</PageDescription>
      {/* Tabs Navigation & Bulk Sending Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1 sm:pb-0 gap-4">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          <button
            onClick={() => setActiveTab('current-forms')}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'current-forms'
                ? 'border-[#0866B1] text-[#0866B1] dark:border-blue-400 dark:text-blue-300'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <FileText size={16} />
            Current Forms
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {surveys.filter((s) => s.status !== 'Archived').length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('past-results')}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'past-results'
                ? 'border-[#0866B1] text-[#0866B1] dark:border-blue-400 dark:text-blue-300'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Archive size={16} />
            Past Results
          </button>

          <button
            onClick={() => setActiveTab('sent-reports')}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'sent-reports'
                ? 'border-[#0866B1] text-[#0866B1] dark:border-blue-400 dark:text-blue-300'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Send size={16} />
            Sent Reports Log
            {queuedCount > 0 ? (
              <span className="rounded-full bg-amber-500 text-white px-2 py-0.5 text-[10px] font-extrabold animate-pulse">
                {queuedCount} queued
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {sentReports.length}
              </span>
            )}
          </button>
        </nav>

        {/* Relocated Bulk Sending Button - Rightmost position */}
        <div className="flex items-center gap-2.5 pb-2 sm:pb-0 shrink-0 self-end sm:self-auto">
          {queuedCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2.5 py-1 text-[10px] font-extrabold text-amber-800 dark:bg-amber-950 dark:text-amber-200 border border-amber-200 dark:border-amber-800 animate-pulse">
              <Clock size={11} />
              {queuedCount} Queued
            </span>
          )}
          <button
            onClick={() => {
              setDispatchWizardBulkMode(true);
              setIsDispatchWizardOpen(true);
            }}
            disabled={!areAllSurveysCompleted}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-all shrink-0 ${
              areAllSurveysCompleted
                ? 'bg-[#0866B1] hover:bg-blue-800 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed border border-slate-200 dark:border-slate-700'
            }`}
            title={
              areAllSurveysCompleted
                ? 'Queue reports for all completed companies in bulk'
                : 'Bulk Sending is locked until all active surveys are Completed'
            }
          >
            <Send size={13} />
            Bulk Sending
          </button>
          {!areAllSurveysCompleted && (
            <span className="text-[10px] text-slate-400 font-semibold max-w-[150px] leading-tight">
              Needs all active surveys <strong>Completed</strong>
            </span>
          )}
        </div>
      </div>

      {/* Tab Contents */}
      {activeTab === 'current-forms' && (
        <CurrentFormsTab
          surveys={surveys}
          responses={responses}
          partnerCompanies={partnerCompanies}
          accounts={accounts}
          sentReports={sentReports}
          onSendToPartner={handleOpenSendToPartner}
          onMarkSurveyComplete={onMarkSurveyComplete}
          isAdmin={currentUser?.role === 'Admin'}
        />
      )}

      {activeTab === 'past-results' && (
        <PastResultsTab
          surveys={surveys}
          responses={responses}
          partnerCompanies={partnerCompanies}
          sentReports={sentReports}
          onOpenSendToPartner={handleOpenSendToPartner}
        />
      )}

      {activeTab === 'sent-reports' && (
        <SentReportsTab
          sentReports={sentReports}
          onConfirmNow={handleConfirmNow}
          onReturnReport={handleReturnReport}
          onReviseReport={handleOpenRevisionOrResend}
          onResendReport={handleOpenRevisionOrResend}
          onPreviewDocument={handlePreviewDocument}
          onUpdateTimerSettings={(min) => handleUpdateSettings({ ...settings, defaultTimerMinutes: min })}
          currentTimerMinutes={settings.defaultTimerMinutes}
          userEmail={currentUser?.email || 'admin@mgenesis.com'}
        />
      )}

      {/* Real Microsoft Graph send in flight (see handleConfirmNow). Reuses the
          same off-screen chart-capture pipeline as bulk preview, but in "send"
          mode: it emails the PDF instead of opening a preview window. Report-
          level graph selections aren't persisted on QueuedReportEmail, so this
          always attaches the full report (all graphs + comments). */}
      {realSendReport && realSendCaptureItem && (
        <BulkHiddenChartCapturer
          item={realSendCaptureItem}
          responses={responses}
          partnerCompanies={partnerCompanies}
          graphs={{ bar: true, radar: true, trend: true, perQuestion: true }}
          includeComments
          previewWindow={null}
          onComplete={() => {}}
          sendVia={{
            to: realSendReport.recipientEmail,
            cc: realSendReport.ccEmails,
            subject: realSendReport.subject,
            htmlBody: realSendReport.body.replace(/\n/g, '<br/>'),
          }}
          onSendResult={(result) => handleRealSendResult(realSendReport.id, result)}
        />
      )}

      {/* Document preview in flight (see handlePreviewDocument). Same
          all-graphs-and-comments config as the real send above, so the PDF
          the admin reviews here matches what actually gets attached. */}
      {previewDocReport && previewCaptureItem && (
        <BulkHiddenChartCapturer
          item={previewCaptureItem}
          responses={responses}
          partnerCompanies={partnerCompanies}
          graphs={{ bar: true, radar: true, trend: true, perQuestion: true }}
          includeComments
          previewWindow={previewDocWindow}
          onComplete={handlePreviewDocComplete}
        />
      )}
    </div>
  );
}
