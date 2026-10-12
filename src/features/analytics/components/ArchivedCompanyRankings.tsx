import { useMemo, useState } from 'react';
import { Archive, CalendarDays, ChevronRight, X } from 'lucide-react';
import { ArchiveSeries, SurveyResponse, SurveyType } from '../../../types/survey';
import { formatCompositeScore } from '../../../data/questionWeights';
import { useModalEscape } from '../../../hooks/useModalEscape';
import { getAnalyticsCompanyRankings } from '../domain/rankings';
import { hasAnsweredItem } from '../../../utils/analytics';

interface ArchivedCompanyRankingsProps {
  responses: SurveyResponse[];
  archiveSeries: ArchiveSeries[];
}

interface ArchivedRankingPeriod {
  id: string;
  label: string;
  surveyType: SurveyType;
  sortDate: string;
  responses: SurveyResponse[];
}

function buildArchivedPeriods(responses: SurveyResponse[], archiveSeries: ArchiveSeries[]): ArchivedRankingPeriod[] {
  const seriesById = new Map(archiveSeries.map((series) => [series.id, series]));
  const periods = new Map<string, ArchivedRankingPeriod>();

  responses.filter((response) => response.archived).forEach((response) => {
    const archiveDate = response.archivedAt || response.submissionDate;
    const periodId = response.seriesId && seriesById.has(response.seriesId)
      ? `series:${response.seriesId}:${response.surveyType}`
      : `event:${response.surveyType}:${response.archivedBySurveyId || 'legacy'}:${archiveDate}`;
    const series = response.seriesId ? seriesById.get(response.seriesId) : undefined;
    const label = series?.label || response.archivedBySurveyTitle || `${response.surveyType} evaluation`;
    const period = periods.get(periodId) ?? {
      id: periodId,
      label,
      surveyType: response.surveyType,
      sortDate: archiveDate,
      responses: [],
    };
    if (archiveDate > period.sortDate) period.sortDate = archiveDate;
    period.responses.push(response);
    periods.set(periodId, period);
  });

  return [...periods.values()].sort((left, right) => right.sortDate.localeCompare(left.sortDate));
}

export function ArchivedCompanyRankings({ responses, archiveSeries }: ArchivedCompanyRankingsProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<ArchivedRankingPeriod | null>(null);
  useModalEscape(Boolean(selectedPeriod), () => setSelectedPeriod(null));

  const periods = useMemo(() => buildArchivedPeriods(responses, archiveSeries), [responses, archiveSeries]);
  const rankedCompanies = useMemo(
    () => selectedPeriod
      ? getAnalyticsCompanyRankings(selectedPeriod.responses, [selectedPeriod.surveyType])
      : [],
    [selectedPeriod],
  );

  return (
    <>
      {periods.length === 0 ? (
        <div className="py-10 text-center">
          <Archive size={22} className="mx-auto text-slate-400" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">No archived company rankings yet</p>
          <p className="mt-1 text-xs text-slate-500">Mark a survey as Ended to archive its category results here.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {periods.map((period) => {
            const companyCount = new Set(period.responses.filter(hasAnsweredItem).map((response) => response.companyId || response.company)).size;
            return (
              <button
                key={period.id}
                type="button"
                onClick={() => setSelectedPeriod(period)}
                className="group flex min-h-28 items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-[#0078a8] hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-sky-700 dark:hover:bg-slate-900"
                aria-label={`Open ${period.surveyType} archived ranking for ${period.label}`}
              >
                <span className="min-w-0">
                  <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">{period.surveyType}</span>
                  <span className="mt-2 block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{period.label}</span>
                  <span className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                    <CalendarDays size={12} aria-hidden="true" />
                    {new Date(period.sortDate).toLocaleDateString()} · {companyCount} compan{companyCount === 1 ? 'y' : 'ies'}
                  </span>
                </span>
                <ChevronRight size={16} className="mt-1 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[#0078a8]" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}

      {selectedPeriod && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setSelectedPeriod(null)} aria-label="Close archived ranking" />
          <section role="dialog" aria-modal="true" aria-labelledby="archived-ranking-title" className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 dark:border-slate-800">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#0078a8]">{selectedPeriod.surveyType} · Archived ranking</p>
                <h3 id="archived-ranking-title" className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{selectedPeriod.label}</h3>
              </div>
              <button type="button" onClick={() => setSelectedPeriod(null)} className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Close archived ranking">
                <X size={18} />
              </button>
            </header>
            <div className="overflow-y-auto p-4 sm:p-5">
              {rankedCompanies.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">No scored company evaluations were found in this archived category.</p>
              ) : (
                <ol className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rankedCompanies.map((company, index) => (
                    <li key={`${company.type}:${company.name}`} className="grid grid-cols-[2.5rem_minmax(0,1fr)_6rem_4rem] items-center gap-3 py-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{index + 1}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{company.name}</span>
                        <span className="text-[10px] text-slate-500">{company.type}</span>
                      </span>
                      <span className="text-right text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">{formatCompositeScore(company.type, company.rankScore).valueText}</span>
                      <span className="text-right text-xs tabular-nums text-slate-500">{company.count} forms</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
