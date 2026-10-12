import { useMemo, useState } from 'react';
import { Building2, Trophy, Truck, UsersRound } from 'lucide-react';
import { SurveyResponse, SurveyType } from '../types/survey';
import { surveyTypeDisplayLabel, formatCompositeScore, getRemarkText } from '../data/questionWeights';
import { getLeaderboard } from '../utils/scoring';

interface CompanyLeaderboardPanelProps {
  responses: SurveyResponse[];
}

const surveyTypes: SurveyType[] = ['Courier', 'Supplier', 'Subcontractor'];

const surveyTypeIcons = {
  Courier: Truck,
  Supplier: Building2,
  Subcontractor: UsersRound,
} satisfies Record<SurveyType, typeof Truck>;

function rankIndicatorClass(rank: number): string {
  if (rank === 1) {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300';
  }
  if (rank === 2) {
    return 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200';
  }
  if (rank === 3) {
    return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/70 dark:bg-orange-950/30 dark:text-orange-300';
  }
  return 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400';
}

export function CompanyLeaderboardPanel({ responses }: CompanyLeaderboardPanelProps) {
  const [surveyType, setSurveyType] = useState<SurveyType>('Courier');

  const leaderboard = useMemo(
    () => getLeaderboard(responses, surveyType),
    [responses, surveyType]
  );

  // Split the ranked list into two even columns, preserving rank order
  // (column 1 gets ranks 1..N/2, column 2 continues from there).
  const [columnOne, columnTwo] = useMemo(() => {
    const midpoint = Math.ceil(leaderboard.length / 2);
    return [leaderboard.slice(0, midpoint), leaderboard.slice(midpoint)];
  }, [leaderboard]);

  const metricLabel = 'Weighted score';
  const leaderboardDescription = 'Top performing companies based on volume-weighted scores.';

  const renderColumn = (items: typeof leaderboard, startIndex: number) => (
    <div className={items.length === 0 ? 'hidden xl:block' : 'min-w-0'}>
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-3 border-b border-slate-200 px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:border-slate-800 dark:text-slate-500 sm:grid-cols-[2.25rem_minmax(0,1fr)_7.75rem]">
        <span>Rank</span>
        <span>Company</span>
        <span className="hidden text-right sm:block">{metricLabel}</span>
      </div>
      <ol className="divide-y divide-slate-100 dark:divide-slate-800" aria-label={`${surveyType} company rankings by ${metricLabel.toLowerCase()}`}>
        {items.map((composite, i) => {
          const rank = startIndex + i + 1;
          const score = composite.hasScore
            ? formatCompositeScore(composite.surveyType, composite.rankScore)
            : null;
          const progressValue = Math.min(100, Math.max(0, composite.rankScore));

          return (
            <li key={composite.companyId ?? composite.company} className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-3 px-2 py-3.5">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold tabular-nums ${rankIndicatorClass(rank)}`}
                aria-label={`Rank ${rank}`}
              >
                {rank}
              </span>

              <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_7.75rem]">
                <p className="break-words text-sm font-semibold leading-5 text-slate-800 dark:text-slate-100">
                  {composite.company}
                </p>

                <div className="min-w-0 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:self-center">
                  <p
                    className="text-left text-sm font-bold tabular-nums text-slate-900 dark:text-white sm:text-right"
                  >
                    {score?.text ?? '—'}
                  </p>
                  {score && (
                    <div
                      className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                      role="progressbar"
                      aria-label={`${composite.company} ${metricLabel.toLowerCase()}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progressValue}
                      aria-valuetext={score.text}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${progressValue}%`, backgroundColor: composite.band.hex }}
                      />
                    </div>
                  )}
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:col-start-1">
                  <span
                    className="inline-flex max-w-full items-center rounded-md border px-2 py-0.5 text-left text-[11px] font-semibold leading-4 text-slate-800 dark:text-slate-100"
                    style={{
                      backgroundColor: `${composite.band.hex}12`,
                      borderColor: `${composite.band.hex}33`,
                    }}
                  >
                    {getRemarkText(composite.band)}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {composite.evaluationCount} evaluation{composite.evaluationCount === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );

  return (
    <section className="panel overflow-hidden !p-0">
      <div className="flex flex-col gap-5 px-4 py-5 sm:px-5 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
        <div className="min-w-0 max-w-2xl">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[#0063a9] dark:bg-slate-800 dark:text-blue-400">
              <Trophy size={17} strokeWidth={2} aria-hidden="true" />
            </span>
            <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">Company Leaderboards</h3>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Composite scores respect each form's actual point values, rank within each partner peer group, and adjust for evaluation volume so a handful of reviews cannot outrank dozens.
          </p>
        </div>

        <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-end lg:w-auto lg:shrink-0">
          <fieldset className="min-w-0 flex-1 sm:flex-none">
            <legend className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Partner type</legend>
            <div className="grid min-h-11 w-full grid-cols-3 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-900 sm:w-auto">
              {surveyTypes.map((type) => {
                const Icon = surveyTypeIcons[type];
                const isSelected = surveyType === type;

                return (
                  <button
                    key={type}
                    type="button"
                    className={`inline-flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-[11px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0063a9] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-100 sm:px-3 sm:text-xs ${
                      isSelected
                        ? 'bg-[#0063a9] text-white shadow-sm'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                    }`}
                    onClick={() => setSurveyType(type)}
                    aria-pressed={isSelected}
                    aria-label={`Show ${surveyTypeDisplayLabel[type]} leaderboard`}
                  >
                    <Icon size={14} strokeWidth={2} className="hidden shrink-0 min-[400px]:block" aria-hidden="true" />
                    <span className="whitespace-nowrap">{surveyTypeDisplayLabel[type]}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

        </div>
      </div>

      <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Leaderboard</h4>
            <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{leaderboardDescription}</p>
          </div>
          <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            {leaderboard.length} companies
          </span>
        </div>

        {leaderboard.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No evaluations available for this survey type yet.
          </p>
        ) : (
          <div className="mt-4 grid min-w-0 xl:grid-cols-2 xl:divide-x xl:divide-slate-200 dark:xl:divide-slate-800">
            <div className="min-w-0 xl:pr-5">{renderColumn(columnOne, 0)}</div>
            <div className="min-w-0 pt-4 xl:pl-5 xl:pt-0">{renderColumn(columnTwo, columnOne.length)}</div>
          </div>
        )}
      </div>

    </section>
  );
}
