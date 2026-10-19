import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useModalEscape } from '../../../hooks/useModalEscape';
import {
  X,
  CheckCircle2,
  Download,
  Send,
  BarChart3,
  Users,
  FileText,
  Award,
  Calendar,
  ChevronRight,
  Mail,
  Clock,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  Plus,
  ArrowLeft,
  MessageSquare,
  TrendingUp,
  ListChecks,
  Radar as RadarIcon,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CustomForm, PartnerCompany, SurveyResponse, SurveyType } from '../../../types/survey';
import { PartnerContact, QueuedReportEmail } from '../types';
import { formatCompositeScore } from '../../../data/questionWeights';
import {
  captureChartImage,
  exportCompanyReportAsPDF,
} from '../../reports/services/companyReportExport';
import {
  CompanyReportDataError,
  computeReportComposite,
  createCompanyReportData,
  filterResponsesForReport,
  getOverallFeedbackQuestionId,
  getReportTemplateConfig,
  normalizeReportResponsesForCompany,
} from '../reporting/index';
import { getCompanyTrend, getSectionPeerAverages } from '../../evaluations/domain/scoring';
import { formatNumber, getScoreAxisDomain, questionPerformance, submissionScores } from '../../analytics/domain/analytics';
import { radarPointLabel } from '../../analytics/components/radarChartLabels';
import { BulkHiddenChartCapturer, BulkReportCaptureItem } from './BulkHiddenChartCapturer';

const PRIMARY_COLOR = '#0063a9';
const PEER_COLOR = '#b91c1c';
const PEER_LABEL = 'Peer average';

interface SendToPartnerWizardProps {
  surveys: CustomForm[];
  responses: SurveyResponse[];
  partnerCompanies: PartnerCompany[];
  contacts: PartnerContact[];
  initialSurveyId?: string;
  initialCompanyId?: string;
  revisionReport?: QueuedReportEmail | null;
  defaultTimerMinutes: number;
  userEmail: string;
  onClose: () => void;
  onQueueReport: (payload: {
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
  }) => void;
  bulkMode?: boolean;
}

export function SendToPartnerWizard({
  surveys,
  responses,
  partnerCompanies,
  contacts,
  initialSurveyId,
  initialCompanyId,
  revisionReport,
  defaultTimerMinutes,
  userEmail,
  onClose,
  onQueueReport,
  bulkMode = false,
}: SendToPartnerWizardProps) {
  // Wizard steps: 1: Confirm, 2: Recipients, 3: Build Report, 4: Customize Message, 5: Queue
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Active survey
  const [currentSurvey, setCurrentSurvey] = useState<CustomForm | undefined>(() => {
    if (revisionReport) {
      return surveys.find((s) => s.id === revisionReport.surveyId);
    }
    if (initialSurveyId) {
      return surveys.find((s) => s.id === initialSurveyId);
    }
    // Fallback to first completed survey
    const completed = surveys.filter(
      (s) =>
        s.status === 'Completed' ||
        s.questions.length > 0
    );
    return completed[0] || surveys[0];
  });

  const sType: SurveyType = currentSurvey?.surveyType || 'Courier';

  // The selected partner is stored by stable ID. Names are display-only and
  // never select the record used by Preview/Print.
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(() => {
    if (revisionReport?.companyId) return revisionReport.companyId;
    if (initialCompanyId) return initialCompanyId;
    if (!currentSurvey) return '';
    return partnerCompanies.find(
      (company) => company.type === currentSurvey.surveyType && !company.isArchived,
    )?.id ?? '';
  });
  const selectedCompany = useMemo(
    () => partnerCompanies.find((company) => company.id === selectedCompanyId && !company.isArchived),
    [partnerCompanies, selectedCompanyId],
  );
  const selectedCompanyName = selectedCompany?.name ?? '';
  const reportTemplate = getReportTemplateConfig(sType);
  const [reportGenerationError, setReportGenerationError] = useState<string>('');

  useEffect(() => {
    if (!currentSurvey) {
      setSelectedCompanyId('');
      return;
    }
    const selectedStillMatches = partnerCompanies.some(
      (company) =>
        company.id === selectedCompanyId &&
        company.type === currentSurvey.surveyType &&
        !company.isArchived,
    );
    if (!selectedStillMatches) {
      setSelectedCompanyId(
        partnerCompanies.find(
          (company) => company.type === currentSurvey.surveyType && !company.isArchived,
        )?.id ?? '',
      );
    }
  }, [currentSurvey, partnerCompanies, selectedCompanyId]);

  // Recipients
  const [recipientEmail, setRecipientEmail] = useState<string>('');
  const [ccEmails, setCcEmails] = useState<string[]>(revisionReport?.ccEmails || []);
  const [ccInput, setCcInput] = useState<string>('');

  // Delay Timer
  const [timerMinutes, setTimerMinutes] = useState<number>(
    revisionReport?.timerDurationMinutes || defaultTimerMinutes
  );

  // Report Builder Options
  const [graphs, setGraphs] = useState({ bar: true, radar: true, trend: true, perQuestion: true });
  const [includeComments, setIncludeComments] = useState(true);
  const [selectedComments, setSelectedComments] = useState<Record<string, boolean>>({});
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false);
  const [tempSelectedComments, setTempSelectedComments] = useState<Record<string, boolean>>({});

  const [bulkModificationsModalOpen, setBulkModificationsModalOpen] = useState(false);
  const [bulkCommentsModalCompany, setBulkCommentsModalCompany] = useState<string | null>(null);
  const [tempBulkComments, setTempBulkComments] = useState<Record<string, boolean>>({});
  const [bulkPreviewItem, setBulkPreviewItem] = useState<BulkReportCaptureItem | null>(null);
  const [bulkPreviewWindow, setBulkPreviewWindow] = useState<Window | null>(null);
  useModalEscape(bulkModificationsModalOpen, () => setBulkModificationsModalOpen(false), 50);
  useModalEscape(Boolean(bulkCommentsModalCompany), () => setBulkCommentsModalCompany(null), 50);
  useModalEscape(isCommentsModalOpen, () => setIsCommentsModalOpen(false), 50);

  // Stable identity across re-renders (e.g. the page-level 5s sentReports poll)
  // so it's safe to depend on inside BulkHiddenChartCapturer's effect.
  const handleBulkPreviewComplete = useCallback(() => {
    setBulkPreviewItem(null);
    setBulkPreviewWindow(null);
  }, []);

  const overallFeedbackQuestionId = useMemo(() => {
    return getOverallFeedbackQuestionId(sType);
  }, [sType]);

  const reportResponses = useMemo(() => {
    if (!currentSurvey || !selectedCompany) return [];
    try {
      return filterResponsesForReport(currentSurvey, selectedCompany, partnerCompanies, responses);
    } catch (error) {
      return [];
    }
  }, [currentSurvey, selectedCompany, partnerCompanies, responses]);

  const respondentComments = useMemo(() => {
    return reportResponses.filter(
      (r) =>
        r.questionId === overallFeedbackQuestionId &&
        r.comment &&
        r.comment.trim() !== '' &&
        r.comment.trim() !== 'Submitted successfully.'
    );
  }, [reportResponses, overallFeedbackQuestionId]);

  useEffect(() => {
    if (sType && selectedCompanyId) {
      const key = `selected_comments_${sType}_${selectedCompanyId}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          setSelectedComments(JSON.parse(saved));
        } catch (e) {
          setSelectedComments({});
        }
      } else {
        const defaultSelections: Record<string, boolean> = {};
        respondentComments.forEach((c) => {
          defaultSelections[c.responseId] = true;
        });
        setSelectedComments(defaultSelections);
      }
    }
  }, [sType, selectedCompanyId, respondentComments]);

  const selectedCommentsList = useMemo(() => {
    return respondentComments.filter((c) => selectedComments[c.responseId]);
  }, [respondentComments, selectedComments]);

  // Period Covered
  const periodCovered = useMemo(() => {
    return revisionReport?.periodCovered || currentSurvey?.title || `${sType} active responses`;
  }, [revisionReport, currentSurvey, sType]);

  // Bulk Mode state: checklist of companies to send
  const bulkCompanies = useMemo(() => {
    if (!bulkMode) return [];
    // We get all active partner companies who have submissions in any of the active surveys
    return partnerCompanies
      .filter((c) => !c.isArchived)
      .map((c) => {
        const compSurvey = surveys.find((s) => s.surveyType === c.type && s.status !== 'Archived');
        let compComposite = null;
        if (compSurvey && c.type !== 'Uncategorized') {
          try {
            const scopedResponses = filterResponsesForReport(compSurvey, c, partnerCompanies, responses);
            compComposite = computeReportComposite(c.name, c.type, scopedResponses);
          } catch {
            compComposite = null;
          }
        }
        const ratingCount = compComposite ? compComposite.evaluationCount : 0;
        const avgScore = compComposite ? compComposite.compositeScore : 0;

        const matchingContact = contacts.find(
          (contact) =>
            contact.partnerType === c.type &&
            contact.companyName.trim().toLowerCase() === c.name.trim().toLowerCase(),
        );

        return {
          company: c,
          responseCount: ratingCount,
          overallScore: avgScore,
          recipientEmail: c.email || matchingContact?.email || '',
          ccEmails: matchingContact?.ccEmails || [],
          survey: compSurvey,
          selected: ratingCount > 0, // checked by default if they have responses
        };
      })
      .filter((item) => item.survey !== undefined && item.responseCount > 0);
  }, [bulkMode, partnerCompanies, responses, surveys, contacts]);

  const [bulkList, setBulkList] = useState(bulkCompanies);

  // Toggle single item in bulk list
  const handleToggleBulkItem = (companyId: string) => {
    setBulkList((current) => current.map((item) =>
      item.company.id === companyId ? { ...item, selected: !item.selected } : item,
    ));
  };

  // Select all / none bulk list
  const [allBulkSelected, setAllBulkSelected] = useState(true);
  const handleToggleAllBulk = () => {
    const target = !allBulkSelected;
    setAllBulkSelected(target);
    setBulkList(bulkList.map((item) => ({ ...item, selected: target })));
  };

  // Re-sync bulk selections if data loaded changes
  useEffect(() => {
    if (bulkMode && bulkCompanies.length > 0 && bulkList.length === 0) {
      setBulkList(bulkCompanies);
    }
  }, [bulkCompanies, bulkMode, bulkList.length]);

  // Auto-fetch contact person and pre-fill details for SINGLE mode
  const matchingContact = useMemo(() => {
    if (!selectedCompany) return undefined;
    return contacts.find(
      (c) =>
        c.partnerType === selectedCompany.type &&
        c.companyName.trim().toLowerCase() === selectedCompany.name.trim().toLowerCase(),
    );
  }, [contacts, selectedCompany]);

  // Performance calculations for PDF render and preview
  const composite = useMemo(() => {
    if (!selectedCompany) return null;
    return computeReportComposite(selectedCompany.name, sType, reportResponses);
  }, [selectedCompany, sType, reportResponses]);

  const peerResponseScope = useMemo(
    () => responses.filter(
      (response) =>
        !response.archived &&
        response.surveyType === sType &&
        (!response.surveyId || response.surveyId === currentSurvey?.id),
    ),
    [responses, sType, currentSurvey?.id],
  );

  const peerAverages = useMemo(() => {
    return getSectionPeerAverages(peerResponseScope, sType);
  }, [peerResponseScope, sType]);

  const trend = useMemo(() => {
    if (!selectedCompany) return [];
    return getCompanyTrend(
      normalizeReportResponsesForCompany(selectedCompany.name, reportResponses),
      selectedCompany.name,
      sType,
    );
  }, [reportResponses, selectedCompany, sType]);

  const qRows = useMemo(() => {
    return questionPerformance(reportResponses);
  }, [reportResponses]);

  const subScores = useMemo(() => {
    return submissionScores(reportResponses);
  }, [reportResponses]);

  const responseCount = composite ? composite.evaluationCount : 0;
  const overallScore = composite ? composite.compositeScore : 0;

  // Chart data formatting
  const sectionChartData = useMemo(() => {
    if (!composite) return [];
    return composite.sections.map((sec) => ({
      section: sec.section,
      [composite.company]: sec.percent,
      [PEER_LABEL]: peerAverages.find((p) => p.section === sec.section)?.average ?? 0,
    }));
  }, [composite, peerAverages]);

  const radarTickFormatter = (value: string) => {
    if (!composite) return value;
    const row = sectionChartData.find((r) => r.section === value);
    if (!row) return value;
    const companyVal = row[composite.company];
    const peerVal = row[PEER_LABEL];
    const companyStr = typeof companyVal === 'number' ? companyVal.toFixed(1) : '0.0';
    const peerStr = typeof peerVal === 'number' ? peerVal.toFixed(1) : '0.0';
    return `${value} (${companyStr} / ${peerStr})`;
  };

  const sectionAxisDomain = useMemo(
    () => getScoreAxisDomain(sectionChartData.flatMap((row) => [row[composite?.company ?? ''] as number, row[PEER_LABEL] as number])),
    [sectionChartData, composite]
  );

  const trendChartData = useMemo(() => {
    return trend.map((t) => ({
      month: t.month,
      label: formatMonthLabel(t.month),
      score: t.score,
    }));
  }, [trend]);

  function formatMonthLabel(month: string): string {
    const [year, m] = month.split('-');
    if (!m) return month;
    const date = new Date(Number(year), Number(m) - 1, 1);
    if (Number.isNaN(date.getTime())) return month;
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }

  // Email template defaults
  const defaultSubject = `[Microgenesis] Performance Evaluation Report - ${selectedCompanyName} (${periodCovered})`;
  const defaultBody = `Dear ${matchingContact?.contactPerson || 'Partner Management'},\n\nPlease find attached the compiled ${periodCovered} Supplier Management Performance Evaluation Report for ${selectedCompanyName}.\n\nExecutive Summary:\n- Evaluation Period: ${periodCovered}\n- Total Submissions: ${responseCount} Stakeholder Surveys\n- Overall Satisfaction Score: ${overallScore}%\n\nThis compiled report reflects structured operational feedback across timeliness, communication quality, compliance, and service value. Please review the detailed PDF attachment.\n\nThank you for your valued partnership with Microgenesis.\n\nBest regards,\nProcurement & Vendor Management Group\nMicrogenesis Software Systems`;

  const [subject, setSubject] = useState<string>(revisionReport?.subject || defaultSubject);
  const [body, setBody] = useState<string>(revisionReport?.body || defaultBody);

  // Re-sync subject/body when target selection shifts
  useEffect(() => {
    if (!revisionReport && !bulkMode) {
      setSubject(`[Microgenesis] Performance Evaluation Report - ${selectedCompanyName} (${periodCovered})`);
      setBody(`Dear ${matchingContact?.contactPerson || 'Partner Management'},\n\nPlease find attached the compiled ${periodCovered} Supplier Management Performance Evaluation Report for ${selectedCompanyName}.\n\nExecutive Summary:\n- Evaluation Period: ${periodCovered}\n- Total Submissions: ${responseCount} Stakeholder Surveys\n- Overall Satisfaction Score: ${overallScore}%\n\nThis compiled report reflects structured operational feedback across timeliness, communication quality, compliance, and service value. Please review the detailed PDF attachment.\n\nThank you for your valued partnership with Microgenesis.\n\nBest regards,\nProcurement & Vendor Management Group\nMicrogenesis Software Systems`);
    }
  }, [selectedCompanyName, periodCovered, matchingContact, responseCount, overallScore, revisionReport, bulkMode]);

  // Recipient sync
  useEffect(() => {
    if (!revisionReport && !bulkMode) {
      if (selectedCompany?.email) {
        setRecipientEmail(selectedCompany.email);
      } else {
        if (matchingContact?.email) {
          setRecipientEmail(matchingContact.email);
        } else {
          setRecipientEmail('');
        }
      }
    }
  }, [selectedCompany, matchingContact, revisionReport, bulkMode]);

  const handleAddCc = () => {
    if (ccInput.trim() && !ccEmails.includes(ccInput.trim())) {
      setCcEmails([...ccEmails, ccInput.trim()]);
      setCcInput('');
    }
  };

  const handleRemoveCc = (emailToRemove: string) => {
    setCcEmails(ccEmails.filter((e) => e !== emailToRemove));
  };

  // Recharts DOM Refs for capture!
  const barRef = useRef<HTMLDivElement>(null);
  const radarRef = useRef<HTMLDivElement>(null);
  const trendRef = useRef<HTMLDivElement>(null);

  // PDF Export trigger using CompanyReportBuilderPage's formatting & capture!
  const handleExportPdfPreview = async (previewOnly = false) => {
    setReportGenerationError('');
    if (!currentSurvey) {
      setReportGenerationError('The selected survey could not be found. Reopen the survey card and try again.');
      return;
    }
    if (!selectedCompanyId || !selectedCompany) {
      setReportGenerationError('Select a partner company before generating the report.');
      return;
    }

    // Open synchronously from the button click so the browser does not block
    // the tab after the asynchronous chart/PDF generation completes.
    const previewWindow = previewOnly ? window.open('about:blank', '_blank') : null;
    if (previewWindow) {
      previewWindow.document.write('<p style="font-family: sans-serif; text-align: center; margin-top: 50px; color: #475569;">Generating PDF preview, please wait...</p>');
    }

    try {
      // Let the current selection finish painting before capturing optional
      // supplemental charts. The required category chart is drawn directly in
      // the PDF from categoryRows, so its labels never depend on a screenshot.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      const chartImages = {
        bar: graphs.bar ? await captureChartImage(barRef.current) : null,
        radar: graphs.radar ? await captureChartImage(radarRef.current) : null,
        trend: graphs.trend ? await captureChartImage(trendRef.current) : null,
      };

      const reportData = createCompanyReportData({
        survey: currentSurvey,
        companyId: selectedCompanyId,
        partnerCompanies,
        responses,
        reportingPeriod: periodCovered,
        graphs,
        includeComments,
        chartImages,
        selectedCommentIds: new Set(selectedCommentsList.map((comment) => comment.responseId)),
      });

      const dateStr = new Date().toISOString().slice(0, 10);
      const nameClean = selectedCompanyName.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const filename = `${nameClean}_${reportData.template.id}_performance_report_${dateStr}.pdf`;

      if (previewOnly) {
        const url = await exportCompanyReportAsPDF(reportData, filename, true);
        if (url) {
          if (previewWindow) {
            previewWindow.location.href = url;
          } else {
            window.open(url, '_blank');
          }
        }
      } else {
        await exportCompanyReportAsPDF(reportData, filename);
      }
    } catch (err) {
      console.error('Error generating PDF report preview', err);
      const message = err instanceof CompanyReportDataError || err instanceof Error
        ? err.message
        : 'The report could not be generated from the current data.';
      setReportGenerationError(message);
      if (previewWindow) {
        previewWindow.document.body.innerHTML = `<p style="font-family: sans-serif; margin: 50px; color: #b91c1c;">${message.replace(/[<>&]/g, '')}</p>`;
      }
    }
  };

  const handlePreviewBulkItem = async (item: BulkReportCaptureItem) => {
    const newWindow = window.open('about:blank', '_blank');
    if (newWindow) {
      newWindow.document.write('<p style="font-family: sans-serif; text-align: center; margin-top: 50px; color: #475569;">Generating PDF preview, please wait...</p>');
    }
    setBulkPreviewWindow(newWindow);
    setBulkPreviewItem(item);
  };

  // Final Action Trigger
  const handleFinalSubmit = async () => {
    if (bulkMode) {
      // Bulk dispatcher queues everything
      const selectedItems = bulkList.filter((item) => item.selected);
      if (selectedItems.length === 0) return;

      for (const item of selectedItems) {
        const companyName = item.company.name;
        const surv = item.survey;
        if (!surv) continue;

        const scopedResponses = filterResponsesForReport(surv, item.company, partnerCompanies, responses);
        const compComposite = computeReportComposite(companyName, surv.surveyType, scopedResponses);
        const count = compComposite ? compComposite.evaluationCount : 0;
        const score = compComposite ? compComposite.compositeScore : 0;

        const matchingC = contacts.find(
          (c) =>
            c.partnerType === surv.surveyType &&
            c.companyName.trim().toLowerCase() === companyName.trim().toLowerCase(),
        );

        const emailSubj = `[Microgenesis] Performance Evaluation Report - ${companyName} (${periodCovered})`;
        const emailBody = `Dear ${matchingC?.contactPerson || 'Partner Management'},\n\nPlease find attached the compiled ${periodCovered} Supplier Management Performance Evaluation Report for ${companyName}.\n\nExecutive Summary:\n- Evaluation Period: ${periodCovered}\n- Total Submissions: ${count} Stakeholder Surveys\n- Overall Satisfaction Score: ${score}%\n\nThis compiled report reflects structured operational feedback across timeliness, communication quality, compliance, and service value. Please review the detailed PDF attachment.\n\nThank you for your valued partnership with Microgenesis.\n\nBest regards,\nProcurement & Vendor Management Group\nMicrogenesis Software Systems`;

        onQueueReport({
          surveyId: surv.id,
          surveyTitle: surv.title,
          companyId: item.company.id,
          companyName,
          surveyType: surv.surveyType,
          periodCovered: surv.title,
          recipientEmail: item.recipientEmail,
          ccEmails: item.ccEmails,
          subject: emailSubj,
          body: emailBody,
          timerDurationMinutes: timerMinutes,
          responseCount: count,
          overallScore: score,
        });
      }
    } else {
      // Single queue dispatcher
      if (!currentSurvey || !selectedCompany) {
        setReportGenerationError('Select a valid survey and partner company before queueing the report.');
        return;
      }
      onQueueReport({
        surveyId: currentSurvey.id,
        surveyTitle: currentSurvey.title,
        companyId: selectedCompany.id,
        companyName: selectedCompany.name,
        surveyType: currentSurvey.surveyType,
        periodCovered,
        recipientEmail,
        ccEmails,
        subject,
        body,
        timerDurationMinutes: timerMinutes,
        responseCount,
        overallScore,
        isRevision: !!revisionReport,
        existingId: revisionReport?.id,
      });
    }
    onClose();
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col animate-fadeIn min-h-[80vh]">
      {/* Dispatch Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 dark:border-slate-800 bg-[#0063a9] text-white">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-white/10 text-white transition mr-1"
            title="Go back"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white backdrop-blur-sm">
            <Send size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-200">
                {bulkMode
                  ? 'Bulk Report Dispatcher'
                  : revisionReport
                  ? 'Revise & Re-queue Report'
                  : 'Single Report Dispatcher'}
              </span>
            </div>
            <h3 className="text-xl font-black text-white mt-0.5">
              {bulkMode
                ? 'Bulk Feedback Dispatch Control'
                : revisionReport
                ? `Revise Report for ${selectedCompanyName}`
                : `Dispatch Control \u2014 ${selectedCompanyName}`}
            </h3>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-blue-100 hover:bg-white/10 transition"
        >
          <X size={20} />
        </button>
      </div>

      {/* Revision Alerts */}
      {revisionReport?.status === 'Returned' && (
        <div className="bg-rose-50 border-b border-rose-200 px-6 py-4 text-xs text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-200 flex items-start gap-3">
          <RotateCcw size={16} className="shrink-0 text-rose-600 mt-0.5" />
          <div>
            <p className="font-bold">Returned by {revisionReport.returnedBy || 'Admin'}:</p>
            <p className="mt-0.5 text-rose-700 dark:text-rose-300">"{revisionReport.returnReason}"</p>
          </div>
        </div>
      )}

      {/* Stepper Header (Disabled in bulkMode) */}
      {!bulkMode && (
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40 text-xs">
          <div
            onClick={() => setStep(1)}
            className={`flex items-center gap-1.5 font-semibold cursor-pointer ${
              step >= 1 ? 'text-[#0063a9] dark:text-blue-300' : 'text-slate-400'
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                step === 1 ? 'bg-[#0063a9] text-white' : 'bg-blue-100 text-[#0063a9]'
              }`}
            >
              1
            </span>
            <span>Target Company</span>
          </div>
          <ChevronRight size={14} className="text-slate-300" />

          <div
            onClick={() => setStep(2)}
            className={`flex items-center gap-1.5 font-semibold cursor-pointer ${
              step >= 2 ? 'text-[#0063a9] dark:text-blue-300' : 'text-slate-400'
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                step === 2 ? 'bg-[#0063a9] text-white' : 'bg-blue-100 text-[#0063a9]'
              }`}
            >
              2
            </span>
            <span>Recipient Details</span>
          </div>
          <ChevronRight size={14} className="text-slate-300" />

          <div
            onClick={() => setStep(3)}
            className={`flex items-center gap-1.5 font-semibold cursor-pointer ${
              step >= 3 ? 'text-[#0063a9] dark:text-blue-300' : 'text-slate-400'
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                step === 3 ? 'bg-[#0063a9] text-white' : 'bg-blue-100 text-[#0063a9]'
              }`}
            >
              3
            </span>
            <span>Build the Report</span>
          </div>
          <ChevronRight size={14} className="text-slate-300" />

          <div
            onClick={() => setStep(4)}
            className={`flex items-center gap-1.5 font-semibold cursor-pointer ${
              step >= 4 ? 'text-[#0063a9] dark:text-blue-300' : 'text-slate-400'
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                step === 4 ? 'bg-[#0063a9] text-white' : 'bg-blue-100 text-[#0063a9]'
              }`}
            >
              4
            </span>
            <span>Customize Message</span>
          </div>
          <ChevronRight size={14} className="text-slate-300" />

          <div
            onClick={() => setStep(5)}
            className={`flex items-center gap-1.5 font-semibold cursor-pointer ${
              step >= 5 ? 'text-[#0063a9] dark:text-blue-300' : 'text-slate-400'
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                step === 5 ? 'bg-[#0063a9] text-white' : 'bg-blue-100 text-[#0063a9]'
              }`}
            >
              5
            </span>
            <span>Review delay & Queue</span>
          </div>
        </div>
      )}

      {/* Main Dispatch Area */}
      <div className="flex-1 p-6 overflow-y-auto space-y-6">
        {bulkMode ? (
          /* BULK DISPATCH VIEW */
          <div className="space-y-6">
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 text-xs text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/20 flex items-start gap-3">
              <Sparkles size={18} className="text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Bulk Dispatch Center Enabled</p>
                <p className="mt-1 text-blue-800 dark:text-blue-300 leading-relaxed">
                  Select partner companies with completed surveys below to dispatch their formatted feedback reports in a single click.
                  Each partner receives an individualized email tailored with their specific response count, overall score, and attached complete performance PDF report containing full analytics and graphs.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Select Partners to Queue ({bulkList.filter((item) => item.selected).length} selected)
                </span>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setBulkModificationsModalOpen(true)}
                    className="text-xs font-bold text-[#0063a9] hover:underline"
                  >
                    General Modification
                  </button>
                  <button
                    onClick={handleToggleAllBulk}
                    className="text-xs font-bold text-[#0063a9] hover:underline"
                  >
                    {allBulkSelected ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {bulkList.map((item) => (
                  <div key={item.company.id} className="flex items-center p-4 bg-white dark:bg-slate-900 text-xs gap-6">
                    <div className="flex items-center gap-3 w-72 shrink-0">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => handleToggleBulkItem(item.company.id)}
                        className="h-4.5 w-4.5 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
                      />
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">{item.company.name}</p>
                        <p className="text-[10px] text-slate-500">
                          {item.company.type} Evaluation Survey • {item.responseCount} responses
                        </p>
                      </div>
                    </div>

                    <div className="w-24 shrink-0">
                      <p className="text-[10px] text-slate-500">Overall Score</p>
                      <p className="font-extrabold text-[#0063a9] text-sm">{formatCompositeScore(item.survey?.surveyType ?? sType, item.overallScore).text}</p>
                    </div>

                    <div className="flex items-center gap-6 ml-auto">
                      <div className="text-right max-w-xs truncate hidden sm:block">
                        <p className="text-[10px] text-slate-500">Recipient Email</p>
                        <p className="font-medium text-slate-700 dark:text-slate-300 truncate">
                          {item.recipientEmail}
                        </p>
                      </div>
                      
                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          onClick={() => {
                             // Initialize temp state from localStorage or default true
                             const surv = item.survey;
                             if (!surv) return;
                             const compComments = filterResponsesForReport(surv, item.company, partnerCompanies, responses).filter(
                               (r) => r.questionId === getOverallFeedbackQuestionId(surv.surveyType) && r.comment && r.comment.trim() !== '' && r.comment.trim() !== 'Submitted successfully.'
                             );
                             const key = `selected_comments_${surv.surveyType}_${item.company.id}`;
                             const saved = localStorage.getItem(key);
                             let initial: Record<string, boolean> = {};
                             if (saved) {
                               try {
                                 initial = JSON.parse(saved);
                               } catch (e) {
                                 // ignore
                               }
                             } else {
                               compComments.forEach(c => initial[c.responseId] = true);
                             }
                             setTempBulkComments(initial);
                             setBulkCommentsModalCompany(item.company.id);
                          }}
                          className="inline-flex items-center justify-center gap-1.5 rounded border border-[#0063a9]/20 bg-blue-50/50 px-2 py-1.5 text-[10px] font-bold text-[#0063a9] hover:bg-[#0063a9]/10 transition dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300"
                        >
                          <MessageSquare size={12} />
                          Select Feedback
                        </button>
                        <button
                          onClick={() => {
                            if (item.survey) {
                              handlePreviewBulkItem({
                                company: item.company,
                                survey: item.survey,
                                periodCovered: item.survey.title,
                              });
                            }
                          }}
                          className="inline-flex items-center justify-center gap-1.5 rounded border border-[#0063a9]/20 bg-[#0063a9]/10 px-2 py-1.5 text-[10px] font-bold text-[#0063a9] hover:bg-[#0063a9]/20 transition dark:border-blue-900/40 dark:text-blue-300"
                        >
                          <FileText size={12} />
                          Preview Document
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {bulkList.length === 0 && (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    No completed surveys or response data available for bulk sending yet.
                  </div>
                )}
              </div>
            </div>

            {/* Common delay timer */}
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold text-xs">
                  <Clock size={16} className="text-amber-600" />
                  Review Window Delay Timer for Bulk Dispatch
                </div>
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                  {timerMinutes} Minutes Countdown
                </span>
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                Reports queued in bulk will hold in the <strong>Sent Reports Log</strong> queue for safety. You can manually inspect, confirm instantly, or return any individual report during this delay window.
              </p>
              <div className="flex items-center gap-3 pt-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Adjust Common Duration:</label>
                <select
                  value={timerMinutes}
                  onChange={(e) => setTimerMinutes(Number(e.target.value))}
                  className="rounded border border-amber-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 dark:border-amber-700 dark:bg-slate-900"
                >
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes (Recommended)</option>
                  <option value={60}>1 Hour</option>
                  <option value={120}>2 Hours</option>
                </select>
              </div>
            </div>
          </div>
        ) : (
          /* SINGLE DISPATCH VIEW steps */
          <div className="space-y-6">
            <div className="space-y-6">
              {/* STEP 1: TARGET COMPANY */}
              {step === 1 && (
                <div className="space-y-4 max-w-3xl mx-auto">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileText size={16} className="text-[#0063a9]" />
                    Step 1: Confirm Target Partner Company
                  </h4>

                  <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-4 space-y-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Select Partner Company to Dispatch Report
                      </label>
                      <select
                        value={selectedCompanyId}
                        onChange={(e) => {
                          const companyId = e.target.value;
                          setSelectedCompanyId(companyId);
                          setReportGenerationError('');
                          const targetComp = partnerCompanies.find((comp) => comp.id === companyId);
                          if (targetComp) {
                            const contact = contacts.find(
                              (candidate) =>
                                candidate.partnerType === targetComp.type &&
                                candidate.companyName.trim().toLowerCase() === targetComp.name.trim().toLowerCase(),
                            );
                            setRecipientEmail(targetComp.email || contact?.email || '');
                            setCcEmails(contact?.ccEmails || []);
                          }
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0063a9]"
                      >
                        <option value="" disabled>Select a company</option>
                        {partnerCompanies
                          .filter((comp) => !comp.isArchived && comp.type === currentSurvey?.surveyType)
                          .map((comp) => (
                            <option key={comp.id} value={comp.id}>
                              {comp.name}
                            </option>
                          ))}
                      </select>
                    </div>

                    {composite ? (
                      <div className="rounded-xl border border-blue-50 bg-blue-50/20 p-4 dark:border-blue-950/20 dark:bg-blue-950/5 space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                          <CheckCircle2 className="text-[#0063a9]" size={15} />
                          Active completed survey evaluation found!
                        </div>
                        <div className="grid grid-cols-1 gap-4 text-xs min-[420px]:grid-cols-2">
                          <div>
                            <span className="text-slate-400">Total Evaluations:</span>
                            <span className="ml-1.5 font-bold text-slate-800 dark:text-slate-200">
                              {composite.evaluationCount} Responses
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Composite Score:</span>
                            <span className="ml-1.5 font-black text-[#0063a9] dark:text-blue-300">
                              {formatCompositeScore(sType, composite.compositeScore).text}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-rose-100 bg-rose-50/20 p-4 dark:border-rose-950/20 dark:bg-rose-950/5 flex items-start gap-2 text-xs text-rose-800 dark:text-rose-300">
                        <AlertTriangle className="text-rose-500 shrink-0 mt-0.5" size={15} />
                        <div>
                          <p className="font-bold">No completed evaluation found for this partner</p>
                          <p className="mt-0.5 text-rose-600 dark:text-rose-400 leading-normal">
                            You can still proceed, but the report PDF will show empty graphs or averages. Please complete evaluations in the Feedback Hub first.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 2: RECIPIENTS */}
              {step === 2 && (
                <div className="space-y-4 max-w-3xl mx-auto">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Users size={16} className="text-[#0063a9]" />
                    Step 2: Recipient Contact Details
                  </h4>

                  <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200 flex items-center gap-2">
                    <Sparkles size={16} className="shrink-0 text-blue-600" />
                    <span>
                      Primary email is loaded automatically from the <strong>Partner Contacts Directory</strong>. Add CCs for team notification.
                    </span>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-4 space-y-4">
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Primary Contact Email <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#0063a9]">
                        <Mail size={16} className="text-slate-400 shrink-0" />
                        <input
                          type="email"
                          value={recipientEmail}
                          onChange={(e) => setRecipientEmail(e.target.value)}
                          className="w-full bg-transparent text-xs text-slate-900 dark:text-white outline-none font-medium"
                          placeholder="e.g. keyaccount@lbc-express.ph"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                        CC Email Recipients (Optional)
                      </label>
                      <div className="flex gap-2 mt-1">
                        <input
                          type="email"
                          value={ccInput}
                          onChange={(e) => setCcInput(e.target.value)}
                          placeholder="Add CC email address..."
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white dark:bg-slate-900 dark:border-slate-700 outline-none flex-1 focus:ring-2 focus:ring-[#0063a9]"
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCc())}
                        />
                        <button
                          type="button"
                          onClick={handleAddCc}
                          className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition"
                        >
                          <Plus size={14} className="mr-1" /> Add
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {ccEmails.map((email) => (
                          <span
                            key={email}
                            className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          >
                            {email}
                            <button
                              type="button"
                              onClick={() => handleRemoveCc(email)}
                              className="text-slate-400 hover:text-rose-500"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                        {ccEmails.length === 0 && (
                          <span className="text-xs text-slate-400 italic">No CC recipients specified.</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: BUILD THE REPORT (Identical layout to CompanyReportBuilderPage.tsx) */}
              {step === 3 && (
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <BarChart3 size={16} className="text-[#0063a9]" />
                    Step 3: Build the Performance Report
                  </h4>

                  <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200 flex items-center gap-2">
                    <Sparkles size={16} className="shrink-0 text-blue-600" />
                    <span>
                      Select which visual sections, trends, and stakeholder comments to include in the compiled evaluation PDF report.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-6 items-start">
                    {/* Left Panel: Options */}
                    <div className="space-y-5">
                      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-4 shadow-sm">
                        <div>
                          <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Target Partner</h5>
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-1">{selectedCompanyName}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{sType} Evaluation Report</p>
                        </div>

                        <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                          <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300">Graphs to include</h5>
                          <div className="mt-2.5 space-y-2">
                            <GraphOption
                              icon={BarChart3}
                              label="Bar graph (section scores)"
                              checked={graphs.bar}
                              onChange={() => setGraphs((prev) => ({ ...prev, bar: !prev.bar }))}
                            />
                            <GraphOption
                              icon={RadarIcon}
                              label="Radar graph (section scores)"
                              checked={graphs.radar}
                              onChange={() => setGraphs((prev) => ({ ...prev, radar: !prev.radar }))}
                            />
                            <GraphOption
                              icon={TrendingUp}
                              label="Score trend"
                              checked={graphs.trend}
                              onChange={() => setGraphs((prev) => ({ ...prev, trend: !prev.trend }))}
                            />
                            <GraphOption
                              icon={ListChecks}
                              label="Per-question average rating"
                              checked={graphs.perQuestion}
                              onChange={() => setGraphs((prev) => ({ ...prev, perQuestion: !prev.perQuestion }))}
                            />
                          </div>
                        </div>

                        <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                          <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300">Comments</h5>
                          <div className="mt-2.5 space-y-2">
                            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800 bg-white dark:bg-slate-900/20">
                              <input
                                type="checkbox"
                                checked={includeComments}
                                onChange={() => setIncludeComments((prev) => !prev)}
                                className="mt-0.5"
                              />
                              <span className="flex-1">
                                <span className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-200">
                                  <MessageSquare size={13} /> Include stakeholder comments
                                </span>
                                <span className="mt-1 block text-[10px] text-slate-400 dark:text-slate-500 leading-normal">
                                  Show selected respondent remarks at the end of the performance report.
                                </span>
                              </span>
                            </label>

                            {includeComments && (
                              <button
                                type="button"
                                onClick={() => {
                                  setTempSelectedComments({ ...selectedComments });
                                  setIsCommentsModalOpen(true);
                                }}
                                className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-[#0063a9]/20 bg-[#0063a9]/5 px-3 py-2 text-[11px] font-bold text-[#0063a9] hover:bg-[#0063a9]/10 transition dark:border-blue-900/40 dark:text-blue-300"
                              >
                                <MessageSquare size={13} />
                                <span>Review Stakeholder Remarks ({selectedCommentsList.length})</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Panel: Paginated Print Preview */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40 space-y-4">
                      <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-200 dark:border-slate-800">
                        <span className="font-bold text-slate-700 dark:text-slate-300">A4 Live Print Layout Preview</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">Scroll to inspect report pages</span>
                      </div>

                      {(() => {
                        const extraPages: ('trend' | 'perQuestion' | 'comments')[] = [];
                        if (graphs.trend) extraPages.push('trend');
                        if (graphs.perQuestion) extraPages.push('perQuestion');
                        if (includeComments) extraPages.push('comments');

                        const contentPageCount = 1 + extraPages.length;

                        return (
                          <div className="max-h-[60vh] overflow-y-auto flex flex-col gap-6 items-center py-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200/60 dark:border-slate-800/60">
                            {/* Page 1 — Cover */}
                            <PagedSheet pageLabel="Page 1 · Cover">
                              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                                <img src="/microgenesis_logo.png" alt="Microgenesis" className="h-10 w-auto" />
                                <div className="mt-5 h-px w-14 bg-[#0063a9]" />
                                <h1 className="mt-5 text-xl font-black text-slate-800 dark:text-slate-100 leading-tight">{reportTemplate.reportTitle}</h1>
                                <p className="mt-1 text-base font-extrabold text-[#0063a9]">{selectedCompanyName || 'Select a company'}</p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  {periodCovered} · Generated{' '}
                                  {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                                </p>
                                <div className="mt-12 border-t border-slate-100 pt-3 text-center dark:border-slate-800">
                                  <p className="text-[10px] text-slate-400 dark:text-slate-500">Prepared for internal review by the</p>
                                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-300">PROCUREMENT</p>
                                  <p className="mt-1 text-[9px] italic text-slate-400 dark:text-slate-500">
                                    This document is confidential and intended solely for the named recipient.
                                  </p>
                                </div>
                              </div>
                            </PagedSheet>

                            {/* Page 2 — Executive summary, bar graph, radar graph */}
                            <PagedSheet pageLabel="Page 2" footerRight={`Page 1 of ${contentPageCount}`}>
                          <ReportPageHeader company={selectedCompanyName} reportTitle={reportTemplate.reportTitle} />
                          <h2 className="mt-4 text-sm font-bold text-slate-800 dark:text-slate-100">Executive Summary</h2>
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            <SummaryStat label="Composite score" value={formatCompositeScore(sType, overallScore).text} />
                            <SummaryStat label="Rating band" value={composite?.band.label || 'N/A'} />
                            <SummaryStat label="Evaluations" value={String(responseCount)} />
                          </div>

                          {graphs.bar && composite && (
                            <div className="mt-3">
                              <h4 className="mb-1 text-[10px] font-bold text-slate-700 dark:text-slate-200">Section Scores — Bar Graph</h4>
                              <div ref={barRef} className="bg-white p-3 rounded-lg block dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xs">
                                <div className="mb-2 block text-left text-[9px] pl-1">
                                  <div className="mb-1 flex items-center gap-1.5">
                                    <span className="inline-block h-2.5 w-2.5 rounded-xs" style={{ backgroundColor: PRIMARY_COLOR }} />
                                    <span className="font-bold text-slate-700 dark:text-slate-200">{selectedCompanyName}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="inline-block h-2.5 w-2.5 rounded-xs" style={{ backgroundColor: PEER_COLOR }} />
                                    <span className="font-bold text-slate-500 dark:text-slate-400">{PEER_LABEL}</span>
                                  </div>
                                </div>
                                <div className="h-[160px] w-full block">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={sectionChartData} margin={{ top: 16, right: 10, bottom: 5, left: -10 }}>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                      <XAxis dataKey="section" tick={{ fontSize: 8 }} interval={0} height={20} />
                                      <YAxis domain={sectionAxisDomain} tick={{ fontSize: 8 }} />
                                      <Tooltip />
                                      <Bar dataKey={selectedCompanyName} fill={PRIMARY_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                                        <LabelList dataKey={selectedCompanyName} position="top" formatter={(val) => typeof val === 'number' ? val.toFixed(1) : String(val ?? '')} style={{ fontSize: 9, fill: PRIMARY_COLOR, fontWeight: 'bold' }} />
                                      </Bar>
                                      <Bar dataKey={PEER_LABEL} fill={PEER_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                                        <LabelList dataKey={PEER_LABEL} position="top" formatter={(val) => typeof val === 'number' ? val.toFixed(1) : String(val ?? '')} style={{ fontSize: 9, fill: PEER_COLOR, fontWeight: 'bold' }} />
                                      </Bar>
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>
                            </div>
                          )}

                          {graphs.radar && composite && (
                            <div className="mt-3">
                              <h4 className="mb-1 text-[10px] font-bold text-slate-700 dark:text-slate-200">Section Scores — Radar Graph</h4>
                              <div ref={radarRef} className="h-[200px] w-full bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg p-2 shadow-xs">
                                <ResponsiveContainer width="100%" height="100%">
                                  <RadarChart data={sectionChartData} outerRadius="75%" margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
                                    <PolarGrid />
                                    <PolarAngleAxis dataKey="section" tick={{ fontSize: 8 }} tickFormatter={radarTickFormatter} />
                                    <PolarRadiusAxis domain={sectionAxisDomain} tick={{ fontSize: 7 }} />
                                    <Radar name={selectedCompanyName} dataKey={selectedCompanyName} stroke={PRIMARY_COLOR} fill={PRIMARY_COLOR} fillOpacity={0.3} isAnimationActive={false}>
                                      <LabelList
                                        dataKey={selectedCompanyName}
                                        content={radarPointLabel({ categoryCount: sectionChartData.length, fill: PRIMARY_COLOR, fontSize: 8, radialInset: 10, lane: -5 })}
                                      />
                                    </Radar>
                                    <Radar name={PEER_LABEL} dataKey={PEER_LABEL} stroke={PEER_COLOR} fill={PEER_COLOR} fillOpacity={0.25} isAnimationActive={false}>
                                      <LabelList
                                        dataKey={PEER_LABEL}
                                        content={radarPointLabel({ categoryCount: sectionChartData.length, fill: PEER_COLOR, fontSize: 8, radialInset: 10, lane: 5 })}
                                      />
                                    </Radar>
                                    <Tooltip />
                                  </RadarChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          )}
                        </PagedSheet>

                        {/* Dynamic Extra Pages (Score Trend, Per-Question, Comments) */}
                        {extraPages.map((pageType, idx) => {
                          const displayPageNum = 3 + idx;
                          const contentPageNum = 2 + idx;
                          const footerText = `Page ${contentPageNum} of ${contentPageCount}`;

                          if (pageType === 'trend') {
                            return (
                              <PagedSheet key="trend-page" pageLabel={`Page ${displayPageNum}`} footerRight={footerText}>
                                <ReportPageHeader company={selectedCompanyName} reportTitle={reportTemplate.reportTitle} />
                                <div className="mt-4">
                                  <h4 className="mb-1 text-[10px] font-bold text-slate-700 dark:text-slate-200">Score Trend</h4>
                                  <div ref={trendRef} className="h-32 w-full bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg p-2 shadow-xs">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <LineChart data={trendChartData} margin={{ top: 12, right: 12, bottom: 5, left: -10 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="label" tick={{ fontSize: 7.5 }} tickLine={false} />
                                        <YAxis domain={[0, 100]} tick={{ fontSize: 7.5 }} tickLine={false} width={25} />
                                        <Tooltip />
                                        <Line type="monotone" dataKey="score" name={selectedCompanyName} stroke={PRIMARY_COLOR} strokeWidth={1.5} dot={{ r: 2 }} connectNulls isAnimationActive={false}>
                                          <LabelList dataKey="score" position="top" formatter={(val) => typeof val === 'number' ? val.toFixed(1) : String(val ?? '')} style={{ fontSize: 8.5, fill: PRIMARY_COLOR, fontWeight: 'bold' }} />
                                        </Line>
                                      </LineChart>
                                    </ResponsiveContainer>
                                  </div>
                                </div>
                              </PagedSheet>
                            );
                          }

                          if (pageType === 'perQuestion') {
                            return (
                              <PagedSheet key="per-question-page" pageLabel={`Page ${displayPageNum}`} footerRight={footerText}>
                                <ReportPageHeader company={selectedCompanyName} reportTitle={reportTemplate.reportTitle} />
                                <div className="mt-4">
                                  <h4 className="mb-1 text-[10px] font-bold text-slate-700 dark:text-slate-200">Per-Question Average Rating</h4>
                                  <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 text-[9px]">
                                    <table className="w-full text-left">
                                      <thead className="bg-[#0063a9] text-white">
                                        <tr>
                                          <th className="px-2 py-1 font-semibold">Question</th>
                                          <th className="px-2 py-1 font-semibold w-20">Average</th>
                                          <th className="px-2 py-1 font-semibold w-16">Responses</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {qRows.map((row, idx) => (
                                          <tr key={row.question} className={idx % 2 === 0 ? 'bg-slate-50 dark:bg-slate-800/40' : ''}>
                                            <td className="px-2 py-1 text-slate-600 dark:text-slate-300 truncate max-w-[200px]">{row.question}</td>
                                            <td className="px-2 py-1 text-slate-600 dark:text-slate-300 font-bold">{formatNumber(row.average)}</td>
                                            <td className="px-2 py-1 text-slate-600 dark:text-slate-300">{row.responses}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </PagedSheet>
                            );
                          }

                          if (pageType === 'comments') {
                            return (
                              <PagedSheet key="comments-page" pageLabel={`Page ${displayPageNum}`} footerRight={footerText}>
                                <ReportPageHeader company={selectedCompanyName} reportTitle={reportTemplate.reportTitle} />
                                <div className="mt-4">
                                  <h4 className="mb-1 text-[10px] font-bold text-slate-700 dark:text-slate-200">Stakeholder Comments</h4>
                                  {selectedCommentsList.length === 0 ? (
                                    <p className="rounded border border-dashed border-slate-300 p-2 text-[10px] italic text-slate-400 dark:border-slate-700 dark:text-slate-500">
                                      No stakeholder comments selected for display.
                                    </p>
                                  ) : (
                                    <div className="overflow-hidden rounded border border-slate-200 dark:border-slate-800 text-[9px] max-h-40 overflow-y-auto">
                                      <table className="w-full text-left">
                                        <thead className="bg-[#0063a9] text-white">
                                          <tr>
                                            <th className="px-2 py-1 font-semibold w-8">#</th>
                                            <th className="px-2 py-1 font-semibold">Feedback / Comments</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {selectedCommentsList.map((c, idx) => (
                                            <tr key={c.responseId} className={idx % 2 === 0 ? 'bg-slate-50 dark:bg-slate-800/40' : ''}>
                                              <td className="px-2 py-1 text-slate-600 dark:text-slate-300 font-medium">{idx + 1}</td>
                                              <td className="px-2 py-1 text-slate-600 dark:text-slate-300 italic">"{c.comment}"</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              </PagedSheet>
                            );
                          }

                          return null;
                        })}
                      </div>
                    );
                  })()}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: CUSTOMIZE MESSAGE */}
              {step === 4 && (
                <div className="space-y-4 max-w-3xl mx-auto">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Mail size={16} className="text-[#0063a9]" />
                    Step 4: Edit Dispatch Email Message & Attached Performance Report
                  </h4>

                  <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-4 space-y-4">
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Subject Line</label>
                      <input
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2.5 text-xs font-semibold text-slate-800 w-full dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0063a9]"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Email Message Body (Enlarged for Easy Reading & Review)
                      </label>
                      <textarea
                        rows={12}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        className="rounded-lg border border-slate-300 px-4 py-3 text-xs font-mono leading-relaxed text-slate-800 w-full dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0063a9] min-h-[320px] shadow-sm"
                      />
                    </div>

                    {/* PDF Attachment representation */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300">
                          <FileText size={22} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">
                            {selectedCompanyName.replace(/\s+/g, '_')}_Performance_Report.pdf
                          </p>
                          <p className="text-[10px] text-slate-500">
                            Complete compiled report generated dynamically with full section charts and trends.
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleExportPdfPreview(true)}
                        className="inline-flex items-center rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-xs font-bold shadow transition"
                      >
                        <FileText size={14} className="mr-1.5" />
                        Preview/Print
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 5: DELAY REVIEW TIMER */}
              {step === 5 && (
                <div className="space-y-4 max-w-3xl mx-auto">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Clock size={16} className="text-amber-500" />
                    Step 5: Queue Delay Review Window Settings
                  </h4>

                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold text-xs">
                        <Clock size={16} className="text-amber-600" />
                        Countdown Review Window Delay Duration
                      </div>
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                        {timerMinutes} Minutes
                      </span>
                    </div>

                    <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                      Instead of dispatching instantly, the report email is sent to a safety review queue inside the <strong>Sent Reports Log</strong>. Any administrator can review, bypass instantly, or return the item for revision.
                    </p>

                    <div className="flex items-center gap-3 pt-1">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Adjust Duration:</label>
                      <select
                        value={timerMinutes}
                        onChange={(e) => setTimerMinutes(Number(e.target.value))}
                        className="rounded border border-amber-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 dark:border-amber-700 dark:bg-slate-900"
                      >
                        <option value={15}>15 Minutes</option>
                        <option value={30}>30 Minutes (Recommended)</option>
                        <option value={60}>1 Hour</option>
                        <option value={120}>2 Hours</option>
                      </select>
                    </div>
                  </div>

                  {/* Summary card confirmation */}
                  <div className="rounded-xl border border-slate-200 p-4 space-y-3 text-xs dark:border-slate-800 bg-white dark:bg-slate-900">
                    <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                      <span className="text-slate-500 font-medium">Target Company:</span>
                      <span className="font-extrabold text-slate-900 dark:text-white">{selectedCompanyName}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                      <span className="text-slate-500 font-medium">Primary Recipient:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{recipientEmail}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                      <span className="text-slate-500 font-medium">CC Recipients:</span>
                      <span className="text-slate-700 dark:text-slate-300">{ccEmails.join(', ') || 'None'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Prepared By:</span>
                      <span className="text-slate-700 dark:text-slate-300">{userEmail}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Off-screen charts sandbox for html2canvas when not on Step 3 */}
            {step !== 3 && composite && (
              <div className="absolute top-0 left-0 -z-50 opacity-0 pointer-events-none w-[800px] h-[800px] overflow-hidden">
                <div ref={barRef} className="bg-white p-3 h-[210px] w-[500px]">
                  <BarChart width={500} height={210} data={sectionChartData} margin={{ top: 24, right: 10, bottom: 5, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="section" tick={{ fontSize: 9.5 }} interval={0} height={24} />
                    <YAxis domain={sectionAxisDomain} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey={composite.company} fill={PRIMARY_COLOR} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                      <LabelList dataKey={composite.company} position="top" formatter={(val) => typeof val === 'number' ? val.toFixed(1) : String(val ?? '')} style={{ fontSize: 13, fill: PRIMARY_COLOR, fontWeight: 'bold' }} />
                    </Bar>
                    <Bar dataKey={PEER_LABEL} fill={PEER_COLOR} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                      <LabelList dataKey={PEER_LABEL} position="top" formatter={(val) => typeof val === 'number' ? val.toFixed(1) : String(val ?? '')} style={{ fontSize: 13, fill: PEER_COLOR, fontWeight: 'bold' }} />
                    </Bar>
                  </BarChart>
                </div>
                <div ref={radarRef} className="h-[265px] w-[500px] bg-white">
                  <RadarChart width={500} height={265} data={sectionChartData} outerRadius="90%" margin={{ top: 20, right: 10, bottom: 0, left: 10 }}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="section" tick={{ fontSize: 10 }} tickFormatter={radarTickFormatter} />
                    <PolarRadiusAxis domain={sectionAxisDomain} tick={{ fontSize: 9 }} />
                    <Radar name={composite.company} dataKey={composite.company} stroke={PRIMARY_COLOR} fill={PRIMARY_COLOR} fillOpacity={0.35} isAnimationActive={false}>
                      <LabelList
                        dataKey={composite.company}
                        content={radarPointLabel({ categoryCount: sectionChartData.length, fill: PRIMARY_COLOR, fontSize: 11, lane: -7 })}
                      />
                    </Radar>
                    <Radar name={PEER_LABEL} dataKey={PEER_LABEL} stroke={PEER_COLOR} fill={PEER_COLOR} fillOpacity={0.3} isAnimationActive={false}>
                      <LabelList
                        dataKey={PEER_LABEL}
                        content={radarPointLabel({ categoryCount: sectionChartData.length, fill: PEER_COLOR, fontSize: 11, lane: 7 })}
                      />
                    </Radar>
                    <Legend verticalAlign="top" align="left" layout="vertical" iconSize={10} wrapperStyle={{ fontSize: 10, paddingBottom: 12, left: 0 }} />
                    <Tooltip />
                  </RadarChart>
                </div>
                <div ref={trendRef} className="h-48 w-[500px] bg-white">
                  <LineChart width={500} height={192} data={trendChartData} margin={{ top: 20, right: 16, bottom: 5, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} tickLine={false} width={30} />
                      <Tooltip />
                      <Legend verticalAlign="top" align="left" layout="horizontal" iconSize={10} wrapperStyle={{ fontSize: 10, paddingBottom: 10, left: 0 }} />
                      <Line type="monotone" dataKey="score" name={composite.company} stroke={PRIMARY_COLOR} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false}>
                        <LabelList dataKey="score" position="top" formatter={(val) => typeof val === 'number' ? val.toFixed(1) : String(val ?? '')} style={{ fontSize: 13, fill: PRIMARY_COLOR, fontWeight: 'bold' }} />
                      </Line>
                    </LineChart>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {reportGenerationError && !bulkMode && (
        <div className="mx-6 mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {reportGenerationError}
        </div>
      )}

      {/* Dispatch Controls Footer */}
      <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => {
            if (bulkMode) {
              onClose();
            } else {
              step > 1 ? setStep((step - 1) as any) : onClose();
            }
          }}
          className="secondary-button text-xs"
        >
          {bulkMode ? 'Cancel' : step > 1 ? 'Back' : 'Cancel'}
        </button>

        {bulkMode ? (
          <button
            type="button"
            onClick={handleFinalSubmit}
            disabled={bulkList.filter((item) => item.selected).length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 px-5 py-2.5 text-xs font-bold text-white shadow transition"
          >
            <Send size={14} />
            Bulk Queue {bulkList.filter((item) => item.selected).length} Report Emails
          </button>
        ) : step < 5 ? (
          <div className="flex items-center gap-2">
            {step === 3 && (
              <button
                type="button"
                onClick={() => handleExportPdfPreview(true)}
                className="inline-flex items-center rounded-lg bg-[#0063a9]/10 hover:bg-[#0063a9]/20 text-[#0063a9] px-4 py-2 text-xs font-bold transition border border-[#0063a9]/20"
              >
                <FileText size={14} className="mr-1.5" />
                Preview/Print
              </button>
            )}
            <button
              type="button"
              onClick={() => setStep((step + 1) as any)}
              className="primary-button text-xs gap-1.5 bg-[#0063a9] hover:bg-blue-800 animate-none"
            >
              Next Step
              <ChevronRight size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleFinalSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-5 py-2.5 text-xs font-bold text-white shadow transition"
          >
            <Clock size={15} />
            {revisionReport ? 'Resubmit to Review Queue' : 'Queue Report Email'}
          </button>
        )}
      </div>

      {/* === MODALS === */}
      {/* 1. Single Mode Comments Modal */}
      {isCommentsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100">Review Stakeholder Remarks</h3>
                <p className="text-xs text-slate-500">Select which stakeholder comments to include in the report</p>
              </div>
              <button onClick={() => setIsCommentsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3 flex-1 bg-slate-50/50 dark:bg-slate-900">
              {respondentComments.map((c) => (
                <label key={c.responseId} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 cursor-pointer hover:border-[#0063a9]/50 transition">
                  <input
                    type="checkbox"
                    checked={tempSelectedComments[c.responseId] !== false}
                    onChange={(e) => setTempSelectedComments({ ...tempSelectedComments, [c.responseId]: e.target.checked })}
                    className="mt-0.5 rounded text-[#0063a9] focus:ring-[#0063a9]"
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{c.respondentType} {c.department ? `- ${c.department}` : ''}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 italic">"{c.comment}"</p>
                  </div>
                </label>
              ))}
              {respondentComments.length === 0 && (
                <p className="text-sm text-center text-slate-500">No stakeholder comments found.</p>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 bg-white dark:bg-slate-900">
              <button onClick={() => setIsCommentsModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button
                onClick={() => {
                  setSelectedComments(tempSelectedComments);
                  if (sType && selectedCompanyId) {
                    localStorage.setItem(`selected_comments_${sType}_${selectedCompanyId}`, JSON.stringify(tempSelectedComments));
                  }
                  setIsCommentsModalOpen(false);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-[#0063a9] hover:bg-blue-800 rounded-lg"
              >
                Save Selections
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Bulk Comments Modal */}
      {bulkCommentsModalCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100">Review Stakeholder Remarks</h3>
                <p className="text-xs text-slate-500">{bulkList.find((item) => item.company.id === bulkCommentsModalCompany)?.company.name} - Select comments to include</p>
              </div>
              <button onClick={() => setBulkCommentsModalCompany(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3 flex-1 bg-slate-50/50 dark:bg-slate-900">
              {(() => {
                 const modalItem = bulkList.find((item) => item.company.id === bulkCommentsModalCompany);
                 if (!modalItem?.survey) return <p className="text-sm text-center text-rose-600">The selected company record could not be found.</p>;
                 const modalSurveyType = modalItem.survey.surveyType;
                 const compComments = filterResponsesForReport(modalItem.survey, modalItem.company, partnerCompanies, responses).filter(
                   (r) => r.questionId === getOverallFeedbackQuestionId(modalSurveyType) && r.comment && r.comment.trim() !== '' && r.comment.trim() !== 'Submitted successfully.'
                 );
                 if (compComments.length === 0) return <p className="text-sm text-center text-slate-500">No stakeholder comments found.</p>;
                 return compComments.map((c) => (
                    <label key={c.responseId} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 cursor-pointer hover:border-[#0063a9]/50 transition">
                      <input
                        type="checkbox"
                        checked={tempBulkComments[c.responseId] !== false}
                        onChange={(e) => setTempBulkComments({ ...tempBulkComments, [c.responseId]: e.target.checked })}
                        className="mt-0.5 rounded text-[#0063a9] focus:ring-[#0063a9]"
                      />
                      <div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{c.respondentType} {c.department ? `- ${c.department}` : ''}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 italic">"{c.comment}"</p>
                      </div>
                    </label>
                 ));
              })()}
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 bg-white dark:bg-slate-900">
              <button onClick={() => setBulkCommentsModalCompany(null)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button
                onClick={() => {
                  const item = bulkList.find(i => i.company.id === bulkCommentsModalCompany);
                  if (item?.survey) {
                    localStorage.setItem(`selected_comments_${item.survey.surveyType}_${item.company.id}`, JSON.stringify(tempBulkComments));
                  }
                  setBulkCommentsModalCompany(null);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-[#0063a9] hover:bg-blue-800 rounded-lg"
              >
                Save Selections
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. General Modification (Bulk) Modal */}
      {bulkModificationsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100">General Modification</h3>
                <p className="text-[11px] text-slate-500">Configure sections included in all dispatched reports</p>
              </div>
              <button onClick={() => setBulkModificationsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
               <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                 <GraphOption icon={BarChart3} label="Category Bar Graph" checked={graphs.bar} onChange={() => setGraphs({ ...graphs, bar: !graphs.bar })} />
                 <GraphOption icon={BarChart3} label="Category Radar" checked={graphs.radar} onChange={() => setGraphs({ ...graphs, radar: !graphs.radar })} />
                 <GraphOption icon={BarChart3} label="Historical Trend" checked={graphs.trend} onChange={() => setGraphs({ ...graphs, trend: !graphs.trend })} />
                 <GraphOption icon={BarChart3} label="Per-Question Tables" checked={graphs.perQuestion} onChange={() => setGraphs({ ...graphs, perQuestion: !graphs.perQuestion })} />
               </div>
               
               <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                 <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-3 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700 bg-white dark:bg-slate-900">
                   <div>
                     <span className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"><MessageSquare size={16} /> Stakeholder Remarks</span>
                     <p className="text-[10px] text-slate-500 mt-0.5">Include written comments in the report</p>
                   </div>
                   <input type="checkbox" checked={includeComments} onChange={(e) => setIncludeComments(e.target.checked)} className="h-5 w-5 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]" />
                 </label>
               </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex justify-end">
              <button onClick={() => setBulkModificationsModalOpen(false)} className="px-5 py-2.5 text-xs font-bold text-white bg-[#0063a9] hover:bg-blue-800 rounded-lg shadow">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkPreviewItem && (
        <BulkHiddenChartCapturer
          item={bulkPreviewItem}
          responses={responses}
          partnerCompanies={partnerCompanies}
          graphs={graphs}
          includeComments={includeComments}
          previewWindow={bulkPreviewWindow}
          onComplete={handleBulkPreviewComplete}
        />
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-200">{value}</p>
    </div>
  );
}

/** A single A4-proportioned sheet in the print preview, styled like a Word/PDF print-layout page. */
function PagedSheet({
  children,
  pageLabel,
  footerRight,
}: {
  children: React.ReactNode;
  pageLabel: string;
  footerRight?: string;
}) {
  const PAGE_WIDTH = 640;
  const PAGE_HEIGHT = Math.round(PAGE_WIDTH * (297 / 210)); // A4 aspect ratio
  return (
    <div className="flex flex-col items-center">
      <div
        className="w-full rounded-sm bg-white shadow-xl ring-1 ring-slate-900/5 dark:bg-slate-900 dark:ring-white/10"
        style={{ width: PAGE_WIDTH, minHeight: PAGE_HEIGHT, maxWidth: '100%' }}
      >
        <div className="flex h-full flex-col px-4 py-6 sm:px-12 sm:py-9">
          <div className="flex-1">{children}</div>
          {footerRight && (
            <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-3 text-[10px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
              <span>Microgenesis | Supplier Management</span>
              <span>{footerRight}</span>
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-[11px] font-medium text-slate-400 dark:text-slate-500">{pageLabel}</p>
    </div>
  );
}

/** The small running header (logo + company name) repeated at the top of each content page, mirroring the export. */
function ReportPageHeader({ company, reportTitle }: { company: string; reportTitle: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
      <img src="/microgenesis_logo.png" alt="Microgenesis" className="h-6 w-auto animate-none" />
      <div className="text-right">
        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{company}</p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">{reportTitle}</p>
      </div>
    </div>
  );
}

function GraphOption({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: typeof BarChart3;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-800 bg-white dark:bg-slate-900">
      <input type="checkbox" checked={checked} onChange={onChange} className="rounded text-[#0063a9] focus:ring-[#0063a9]" />
      <Icon size={14} className="text-slate-400" />
      <span className="text-slate-700 dark:text-slate-200 font-medium">{label}</span>
    </label>
  );
}
