import React from 'react';
import { X, CheckCircle2, Download, Send, BarChart3, Users, FileText, Award, Calendar } from 'lucide-react';
import { CustomForm, PartnerCompany, SurveyResponse } from '../../types/survey';
import { exportTablesAsPDF, ExportTable } from '../../utils/exporters';
import { submissionScores } from '../../utils/analytics';
import { getQuestionMaxPoints, formatCompositeScore } from '../../data/questionWeights';
import { useModalEscape } from '../../hooks/useModalEscape';

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
  const totalResponsesCount = subScores.length;
  const satisfactionScore = totalResponsesCount > 0
    ? Number((subScores.reduce((sum, s) => sum + s.score, 0) / totalResponsesCount).toFixed(1))
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
          ['Evaluation Title', survey.title],
          ['Evaluation Category', survey.surveyType],
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
      `${survey.surveyType}_Evaluation_Report`
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-emerald-50/50 px-4 py-4 dark:border-slate-800 dark:bg-emerald-950/20 sm:items-center sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
              <CheckCircle2 size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                  Completed Evaluation
                </span>
                <span className="text-xs font-medium text-slate-500">{survey.surveyType} Evaluation</span>
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

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
          {/* KPI Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Overall Score</span>
                <Award size={16} className="text-emerald-500" />
              </div>
              <div className="mt-2 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {satisfactionScore.toFixed(1)}%
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Average: {avgRatingFormatted}</p>
            </div>

            <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Total Responses</span>
                <Users size={16} className="text-blue-500" />
              </div>
              <div className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">
                {totalResponsesCount}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Completed Submissions</p>
            </div>
          </div>

          {/* Category Performance Breakdown */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center justify-between">
              <span>Category Performance Breakdown</span>
              <BarChart3 size={16} className="text-slate-400" />
            </h4>
            <div className="space-y-2.5 rounded-lg border border-slate-200 p-4 dark:border-slate-800 bg-white dark:bg-slate-900">
              {categoryScores.map((c, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-medium">
                    <span className="min-w-0 break-words text-slate-700 dark:text-slate-300">{c.category}</span>
                    <span className="shrink-0 font-bold tabular-nums text-slate-900 dark:text-white">
                      {c.scoreText} ({c.scorePct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full bg-azure rounded-full transition-all duration-300"
                      style={{ width: `${c.scorePct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Respondents Summary */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
              Respondent Records ({respondentsList.length})
            </h4>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {respondentsList.map((resp, idx) => (
                <div key={idx} className="flex items-start justify-between gap-2 p-2.5 min-[420px]:items-center">
                  <div className="min-w-0">
                    <span className="break-all font-medium text-slate-800 dark:text-slate-200">{resp.email}</span>
                    <span className="ml-2 text-slate-500">({resp.department})</span>
                  </div>
                  <span className="shrink-0 text-right text-slate-400">{resp.date}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end border-t border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
          <div className="flex w-full flex-col gap-2 min-[420px]:w-auto min-[420px]:flex-row min-[420px]:items-center">
            <button
              onClick={() => {
                // Preserve the selected survey/card. Company selection happens
                // in the wizard and is stored by PartnerCompany.id.
                onSendToPartner(survey);
                onClose();
              }}
              className="primary-button text-xs gap-1.5 bg-[#0866B1] hover:bg-blue-800 text-white"
            >
              <Send size={14} />
              Send Report to Partner
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
