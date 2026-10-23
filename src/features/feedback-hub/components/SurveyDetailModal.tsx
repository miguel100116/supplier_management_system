import React from 'react';
import { X, CheckCircle2, Download, Send, BarChart3, Users, FileText, Award, Calendar } from 'lucide-react';
import { CustomForm, PartnerCompany, SurveyResponse } from '../../../types/survey';
import { exportTablesAsPDF, ExportTable } from '../../reports/services/exporters';
import { submissionCount, submissionScores } from '../../analytics/domain/analytics';
import { getQuestionMaxPoints, formatCompositeScore } from '../../../data/questionWeights';
import { useModalEscape } from '../../../hooks/useModalEscape';
import { formatLogDateTime } from '../../../utils/time';

interface SurveyDetailModalProps {
  survey: CustomForm;
  responses: SurveyResponse[];
  partnerCompanies: PartnerCompany[];
  onClose: () => void;
  onSendToPartner: (survey: CustomForm, partnerCompany?: PartnerCompany) => void;
  reportSentStatus?: { isSent: boolean; isQueued: boolean; statusText?: string };
}

export function SurveyDetailModal({
  survey,
  responses,
  onClose,
  onSendToPartner,
  reportSentStatus,
}: SurveyDetailModalProps) {
  useModalEscape(true, onClose);
  // Filter survey responses
  const surveyResponses = responses.filter(
    (r) => r.surveyType === survey.surveyType && !r.archived
  );

  // Ratings calculation
  const subScores = submissionScores(surveyResponses);
  const totalResponsesCount = submissionCount(surveyResponses);
  const satisfactionScore = subScores.length > 0
    ? Number((subScores.reduce((sum, s) => sum + s.score, 0) / subScores.length).toFixed(1))
    : 0;
  const avgRatingFormatted = formatCompositeScore(survey.surveyType, satisfactionScore).text;

  // Category breakdown
  const categoryEarnedMap = new Map<string, { earned: number; possible: number; count: number }>();
  
  surveyResponses.forEach((r) => {
    const val = typeof r.rating === 'number' ? r.rating : null;
    if (val !== null) {
      const cat = r.questionCategory || 'General Performance';
      const maxPoints = getQuestionMaxPoints(survey.surveyType, r.questionId) || 100;
      
      const current = categoryEarnedMap.get(cat) ?? { earned: 0, possible: 0, count: 0 };
      current.earned += val;
      current.possible += maxPoints;
      current.count += 1;
      categoryEarnedMap.set(cat, current);
    }
  });

  const categoryScores = Array.from(categoryEarnedMap.entries()).map(([cat, v]) => {
    const scorePct = v.possible > 0 ? (v.earned / v.possible) * 100 : 0;
    return {
      category: cat,
      scoreText: formatCompositeScore(survey.surveyType, scorePct).text,
      scorePct,
      count: v.count,
    };
  });

  // Respondent list
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

  // PDF Export trigger
  const handleExportPdf = () => {
    const tables: ExportTable[] = [
      {
        title: 'KPI Executive Summary',
        columns: ['Metric', 'Value'],
        rows: [
          ['Survey Title', survey.title],
          ['Survey Category', survey.surveyType],
          ['Total Submissions', String(totalResponsesCount)],
          ['Overall Satisfaction Score', `${satisfactionScore.toFixed(1)}%`],
          ['Average Rating', avgRatingFormatted],
        ],
      },
      {
        title: 'Category Score Breakdown',
        columns: ['Category', 'Average Rating', 'Score %'],
        rows: categoryScores.map((c) => [c.category, c.scoreText, `${c.scorePct.toFixed(1)}%`]),
      },
    ];

    exportTablesAsPDF(
      `${survey.title} - Performance Report`,
      tables,
      `${survey.surveyType}_Survey_Report`
    );
  };

  return (
    <div className="feedback-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
      <section className="feedback-modal-panel feedback-detail-panel w-full rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 overflow-hidden flex flex-col" role="dialog" aria-modal="true" aria-labelledby="feedback-detail-title">
        {/* Header */}
        <div className="feedback-modal-header flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:items-center sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="feedback-modal-status inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold">
                  Completed
                </span>
                <span className={`feedback-category-badge ${survey.surveyType.toLowerCase()}`}>{survey.surveyType}</span>
                {reportSentStatus?.isSent && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
                    Report Sent ✓
                  </span>
                )}
                {reportSentStatus?.isQueued && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 animate-pulse">
                    Queued ⏳
                  </span>
                )}
              </div>
              <h2 id="feedback-detail-title" className="mt-0.5 break-words text-base font-bold text-slate-900 dark:text-white">{survey.title}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            aria-label="Close survey analytics"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="feedback-modal-body feedback-detail-body flex-1 overflow-y-auto p-4 sm:p-5">
          {/* KPI Stats Grid */}
          <div className="feedback-detail-metrics">
            <div><span>Overall score</span><strong>{satisfactionScore.toFixed(1)}%</strong><small>{avgRatingFormatted} average rating</small></div>
            <div><span>Total responses</span><strong>{totalResponsesCount}</strong><small>Completed submissions</small></div>
          </div>
          <p className="feedback-analytics-scope">Analytics and response totals use all unarchived submissions for {survey.surveyType}; they are grouped by partner type.</p>

          {/* Category Performance Breakdown */}
          <section className="feedback-detail-section" aria-labelledby="feedback-category-title">
            <h3 id="feedback-category-title">Category performance</h3>
            <div className="feedback-category-list">
              {categoryScores.length === 0 ? <p className="feedback-modal-empty-inline">No scored category responses are available yet.</p> : categoryScores.map((c, i) => (
                <div className="feedback-category-row" key={i}>
                  <span className="feedback-category-name">{c.category}</span>
                  <div className="feedback-category-track" aria-label={`${c.category}: ${c.scorePct.toFixed(0)} percent`}><span style={{ width: `${c.scorePct}%` }} /></div>
                  <strong>{c.scoreText}</strong>
                  <small>{c.count} ratings</small>
                </div>
              ))}
            </div>
          </section>

          {/* Respondents share the single modal scroll region. */}
          <section className="feedback-detail-section" aria-labelledby="feedback-respondents-title">
            <div className="feedback-section-heading">
              <h3 id="feedback-respondents-title">Respondent records</h3>
              <span>{respondentsList.length} respondents</span>
            </div>
            {respondentsList.length === 0 ? <p className="feedback-modal-empty-inline">No respondent records are available yet.</p> : (
              <div className="feedback-respondent-table-wrap">
                <table className="feedback-respondent-table">
                  <thead><tr><th>Respondent</th><th>Department</th><th>Date submitted</th></tr></thead>
                  <tbody>{respondentsList.map((resp, idx) => (
                    <tr key={idx}><td>{resp.email}</td><td>{resp.department}</td><td><time dateTime={resp.date} title={resp.date}>{formatLogDateTime(resp.date)}</time></td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Footer Actions */}
        <div className="feedback-modal-footer flex items-center justify-end border-t border-slate-200 px-4 py-3 sm:px-5">
          <div className="flex w-full flex-col gap-2 min-[420px]:w-auto min-[420px]:flex-row min-[420px]:items-center">
            <button
              onClick={() => {
                // Preserve the selected survey/card. Company selection happens
                // in the wizard and is stored by PartnerCompany.id.
                onSendToPartner(survey);
                onClose();
              }}
              className="primary-button text-xs gap-1.5 bg-[#0063a9] hover:bg-blue-800 text-white"
            >
              <Send size={14} />
              Send Report to Partner
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
