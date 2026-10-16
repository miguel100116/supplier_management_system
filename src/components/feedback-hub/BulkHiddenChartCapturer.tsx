import React, { useEffect, useMemo, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, LineChart, Line, Legend } from 'recharts';
import { captureChartImage, exportCompanyReportAsPDF } from '../../utils/companyReportExport';
import { getCompanyTrend, getSectionPeerAverages } from '../../utils/scoring';
import { getScoreAxisDomain } from '../../utils/analytics';
import { radarPointLabel } from '../../utils/radarChartLabels';
import { CustomForm, PartnerCompany, SurveyResponse } from '../../types/survey';
import { getGraphAccessToken } from '../../services/msalAuth';
import { sendGraphMail, dataUrlToBase64 } from '../../services/graphMailService';
import {
  CompanyReportDataError,
  computeReportComposite,
  createCompanyReportData,
  filterResponsesForReport,
  getOverallFeedbackQuestionId,
  normalizeReportResponsesForCompany,
} from '../../features/feedback-hub/reporting';

const PRIMARY_COLOR = '#0866B1';
const PEER_COLOR = '#b91c1c';
const PEER_LABEL = 'Peer average';

const formatMonthLabel = (mStr: string) => {
  const parts = mStr.split('-');
  if (parts.length !== 2) return mStr;
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short' }) + ' ' + parts[0].slice(2);
};
/** Present when this capture should actually email the report via Microsoft
 *  Graph (real "Confirm Now"/bulk send) instead of just opening a preview. */
export interface SendViaGraphConfig {
  to: string;
  cc?: string[];
  subject: string;
  htmlBody: string;
}

export interface BulkReportCaptureItem {
  company: Pick<PartnerCompany, 'id' | 'name' | 'type'>;
  survey: Pick<CustomForm, 'id' | 'title' | 'surveyType'>;
  periodCovered?: string;
}

interface BulkHiddenChartCapturerProps {
  item: BulkReportCaptureItem;
  responses: SurveyResponse[];
  partnerCompanies: PartnerCompany[];
  graphs: { bar: boolean; radar: boolean; trend: boolean; perQuestion: boolean };
  includeComments: boolean;
  previewWindow: Window | null;
  onComplete: () => void;
  sendVia?: SendViaGraphConfig | null;
  onSendResult?: (result: { success: boolean; error?: string }) => void;
}

export function BulkHiddenChartCapturer({
  item,
  responses,
  partnerCompanies,
  graphs,
  includeComments,
  previewWindow,
  onComplete,
  sendVia,
  onSendResult,
}: BulkHiddenChartCapturerProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const radarRef = useRef<HTMLDivElement>(null);
  const trendRef = useRef<HTMLDivElement>(null);

  const companyName = item.company.name;
  const companyId = item.company.id;
  const sType = item.survey.surveyType;
  const overallFeedbackQuestionId = getOverallFeedbackQuestionId(sType);

  const reportResponseResult = useMemo(() => {
    try {
      return {
        data: filterResponsesForReport(item.survey, item.company, partnerCompanies, responses),
        error: null as Error | null,
      };
    } catch (error) {
      return {
        data: [] as SurveyResponse[],
        error: error instanceof Error ? error : new Error('Unable to select report responses.'),
      };
    }
  }, [item, partnerCompanies, responses]);
  const companyResponses = reportResponseResult.data;
  const peerResponses = useMemo(
    () => responses.filter(
      (response) =>
        !response.archived &&
        response.surveyType === sType &&
        (!response.surveyId || response.surveyId === item.survey.id),
    ),
    [responses, sType, item.survey.id],
  );
  const normalizedCompanyResponses = useMemo(
    () => normalizeReportResponsesForCompany(companyName, companyResponses),
    [companyName, companyResponses],
  );
  const composite = useMemo(
    () => computeReportComposite(companyName, sType, companyResponses),
    [companyName, sType, companyResponses],
  );
  const peerAverages = useMemo(() => getSectionPeerAverages(peerResponses, sType), [peerResponses, sType]);
  const trend = useMemo(
    () => getCompanyTrend(normalizedCompanyResponses, companyName, sType),
    [normalizedCompanyResponses, companyName, sType],
  );

  const sectionChartData = useMemo(() => {
    if (!composite) return [];
    return composite.sections.map((sec) => {
      const peerMatch = peerAverages.find((p) => p.section === sec.section);
      return {
        section: sec.section,
        [companyName]: sec.percent,
        [PEER_LABEL]: peerMatch ? peerMatch.average : 0,
      };
    });
  }, [composite, peerAverages, companyName]);

  const sectionAxisDomain = useMemo(() => {
    const scores = sectionChartData
      .flatMap((d) => [d[companyName], d[PEER_LABEL]])
      .filter((value): value is number => typeof value === 'number');
    return getScoreAxisDomain(scores);
  }, [sectionChartData, companyName]);

  // Matches CompanyReportBuilderPage's radar formatter exactly: full section
  // name plus both scores inline, instead of an abbreviated 3-letter label.
  const radarTickFormatter = (value: string) => {
    const row = sectionChartData.find((r) => r.section === value);
    if (!row) return value;
    const companyVal = row[companyName];
    const peerVal = row[PEER_LABEL];
    const companyStr = typeof companyVal === 'number' ? companyVal.toFixed(1) : '0.0';
    const peerStr = typeof peerVal === 'number' ? peerVal.toFixed(1) : '0.0';
    return `${value} (${companyStr} / ${peerStr})`;
  };

  const trendChartData = useMemo(() => trend.map((t) => ({
    month: t.month,
    label: formatMonthLabel(t.month),
    score: t.score,
  })), [trend]);

  const trendAxisDomain = useMemo(() => {
    return getScoreAxisDomain(trendChartData.map((d) => d.score));
  }, [trendChartData]);

  useEffect(() => {
    let isMounted = true;
    const run = async () => {
      try {
        if (reportResponseResult.error) throw reportResponseResult.error;
        await new Promise((resolve) => setTimeout(resolve, 800)); // wait for recharts to render

        const chartImages = {
          bar: graphs.bar ? await captureChartImage(barRef.current) : null,
          radar: graphs.radar ? await captureChartImage(radarRef.current) : null,
          trend: graphs.trend ? await captureChartImage(trendRef.current) : null,
        };

        const compComments = companyResponses.filter(
          (r) =>
            r.questionId === overallFeedbackQuestionId &&
            r.comment &&
            r.comment.trim() !== '' &&
            r.comment.trim() !== 'Submitted successfully.'
        );

        const compSelectedComments = compComments.filter((c) => {
          const key = `selected_comments_${sType}_${companyId}`;
          const saved = localStorage.getItem(key);
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              if (parsed[c.responseId] !== undefined) return parsed[c.responseId];
            } catch (e) {
              // ignore
            }
          }
          return true; // default true
        });

        const reportData = createCompanyReportData({
          survey: item.survey,
          companyId,
          partnerCompanies,
          responses,
          reportingPeriod: item.periodCovered || item.survey.title,
          graphs,
          includeComments,
          chartImages,
          selectedCommentIds: new Set(compSelectedComments.map((comment) => comment.responseId)),
        });

        const dateStr = new Date().toISOString().slice(0, 10);
        const nameClean = companyName.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        const filename = `${nameClean}_${reportData.template.id}_performance_report_${dateStr}.pdf`;

        if (sendVia) {
          // Real send: build the PDF as base64 and email it via Microsoft
          // Graph as the signed-in user, instead of just opening a preview.
          const pdfDataUri = await exportCompanyReportAsPDF(reportData, filename, false, true);
          if (!pdfDataUri) throw new Error('PDF generation produced no output.');
          const accessToken = await getGraphAccessToken();
          await sendGraphMail({
            accessToken,
            to: sendVia.to,
            cc: sendVia.cc,
            subject: sendVia.subject,
            htmlBody: sendVia.htmlBody,
            attachment: {
              name: filename,
              base64Content: dataUrlToBase64(pdfDataUri),
              contentType: 'application/pdf',
            },
          });
          if (isMounted) onSendResult?.({ success: true });
        } else {
          const url = await exportCompanyReportAsPDF(reportData, filename, true);
          if (url && isMounted) {
            if (previewWindow) {
              previewWindow.location.href = url;
            } else {
              window.open(url, '_blank');
            }
          }
        }
      } catch (err) {
        console.error('Error generating/sending report', err);
        if (previewWindow) {
          const message = err instanceof CompanyReportDataError || err instanceof Error
            ? err.message
            : 'The report could not be generated from the current data.';
          previewWindow.document.body.innerHTML = `<p style="font-family: sans-serif; margin: 50px; color: #b91c1c;">${message.replace(/[<>&]/g, '')}</p>`;
        }
        if (sendVia && isMounted) {
          onSendResult?.({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
        }
      } finally {
        if (isMounted) onComplete();
      }
    };
    // A completed survey may legitimately have no responses yet. The PDF
    // exporter renders that state as a valid no-data report instead of
    // leaving the preview popup stuck on its loading message.
    run();
    return () => { isMounted = false; };
    // Intentionally run once on mount only. This component is mounted fresh for
    // each preview request and unmounted when done (see SendToPartnerWizard),
    // so `item`/`graphs`/`composite` are stable for its whole lifetime.
    // Including `onComplete` (a new function identity on every parent re-render,
    // e.g. from the 5s sentReports polling interval in PartnersFeedbackHubPage)
    // here previously caused the effect to tear down and restart PDF generation
    // from scratch every few seconds - which is why the preview tab could hang
    // "Generating PDF preview..." indefinitely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute top-0 left-0 -z-50 opacity-0 pointer-events-none w-[900px] h-[900px] overflow-hidden">
      {/* Container width (544px) matches CompanyReportBuilderPage's PagedSheet
          content width (640px page - 2x48px padding) so long section labels
          (e.g. Supplier's "Price/Cost Effectiveness") get the same room and
          don't clip/overlap the way a narrower fixed-width capture would. */}
      <div ref={barRef} className="bg-white p-5 rounded-lg w-[544px]">
        {/* HTML legend placed vertically on the left, above the chart - matches
            CompanyReportBuilderPage exactly (the bar chart has no recharts Legend). */}
        <div className="mb-4 block text-left text-[11px] pl-2">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: PRIMARY_COLOR }} />
            <span className="font-semibold text-slate-700">{companyName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: PEER_COLOR }} />
            <span className="font-semibold text-slate-500">{PEER_LABEL}</span>
          </div>
        </div>
        <BarChart width={544} height={210} data={sectionChartData} margin={{ top: 24, right: 10, bottom: 5, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="section" tick={{ fontSize: 9.5 }} interval={0} height={24} />
          <YAxis domain={sectionAxisDomain} tick={{ fontSize: 10 }} />
          <Tooltip />
          <Bar dataKey={companyName} fill={PRIMARY_COLOR} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey={companyName} position="top" formatter={(val) => typeof val === 'number' ? val.toFixed(1) : String(val ?? '')} style={{ fontSize: 13, fill: PRIMARY_COLOR, fontWeight: 'bold' }} />
          </Bar>
          <Bar dataKey={PEER_LABEL} fill={PEER_COLOR} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey={PEER_LABEL} position="top" formatter={(val) => typeof val === 'number' ? val.toFixed(1) : String(val ?? '')} style={{ fontSize: 13, fill: PEER_COLOR, fontWeight: 'bold' }} />
          </Bar>
        </BarChart>
      </div>
      <div ref={radarRef} className="h-[265px] w-[544px] bg-white">
        <RadarChart width={544} height={265} data={sectionChartData} outerRadius="90%" margin={{ top: 20, right: 10, bottom: 0, left: 10 }}>
          <PolarGrid />
          <PolarAngleAxis dataKey="section" tick={{ fontSize: 10 }} tickFormatter={radarTickFormatter} />
          <PolarRadiusAxis domain={sectionAxisDomain} tick={{ fontSize: 9 }} />
          <Radar name={companyName} dataKey={companyName} stroke={PRIMARY_COLOR} fill={PRIMARY_COLOR} fillOpacity={0.35} isAnimationActive={false}>
            <LabelList
              dataKey={companyName}
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
      <div ref={trendRef} className="h-48 w-[544px] bg-white">
        <LineChart width={544} height={192} data={trendChartData} margin={{ top: 20, right: 16, bottom: 5, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} tickLine={false} width={30} />
          <Tooltip />
          <Legend verticalAlign="top" align="left" layout="horizontal" iconSize={10} wrapperStyle={{ fontSize: 10, paddingBottom: 10, left: 0 }} />
          <Line type="monotone" dataKey="score" name={companyName} stroke={PRIMARY_COLOR} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false}>
            <LabelList dataKey="score" position="top" formatter={(val) => typeof val === 'number' ? val.toFixed(1) : String(val ?? '')} style={{ fontSize: 13, fill: PRIMARY_COLOR, fontWeight: 'bold' }} />
          </Line>
        </LineChart>
      </div>
    </div>
  );
}
