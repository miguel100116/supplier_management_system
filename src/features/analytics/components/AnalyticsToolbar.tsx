import { SlidersHorizontal } from 'lucide-react';
import { ArchiveSeries } from '../../../types/survey';

type DataScope = 'current' | 'all-time' | 'custom';

interface AnalyticsToolbarProps {
  dataScope: DataScope;
  onChangeDataScope?: (scope: DataScope) => void;
  archiveSeries: ArchiveSeries[];
  selectedSeriesIds: string[];
  onToggleSeries: (id: string) => void;
}

const dataScopeOptions = [
  { value: 'current', label: 'Current Period', description: 'Shows analytics from active, unarchived evaluation responses only.' },
  { value: 'all-time', label: 'All-Time', description: 'Shows analytics from the current period and every archived period combined.' },
  { value: 'custom', label: 'Custom', description: 'Shows analytics only from the archived periods you select below.' },
] as const;

export function AnalyticsToolbar({
  dataScope,
  onChangeDataScope,
  archiveSeries,
  selectedSeriesIds,
  onToggleSeries,
}: AnalyticsToolbarProps) {
  return (
    <section aria-labelledby="analytics-view-controls" className="panel p-3 sm:p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#0063a9] dark:bg-blue-950/60 dark:text-blue-300">
            <SlidersHorizontal size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="analytics-view-controls" className="text-sm font-semibold text-slate-800 dark:text-slate-100">View controls</h2>
            <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Choose the reporting period and how partner standings are ranked.
            </p>
          </div>
        </div>

        <div className="grid min-w-0 gap-3 lg:grid-cols-2 xl:flex xl:items-end">
          {onChangeDataScope && (
            <fieldset className="min-w-0">
              <legend className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Reporting period</legend>
              <div className="segmented-control w-full xl:w-auto">
                {dataScopeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onChangeDataScope(option.value)}
                    title={option.description}
                    aria-label={`${option.label}. ${option.description}`}
                    aria-pressed={dataScope === option.value}
                    className={dataScope === option.value ? 'segmented-active' : ''}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <div className="min-w-0">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Company ranking</p>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200" title="Bayesian weighting adjusts company averages toward the peer mean based on evaluation count.">Volume-Weighted Based</p>
          </div>
        </div>
      </div>

      {dataScope === 'custom' && (
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Periods included</p>
          {archiveSeries.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              No named archive periods exist yet. Archive a survey with a period label first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {archiveSeries.map((series) => (
                <label
                  key={series.id}
                  className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    selectedSeriesIds.includes(series.id)
                      ? 'border-[#0063a9] bg-[#0063a9] text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={selectedSeriesIds.includes(series.id)}
                    onChange={() => onToggleSeries(series.id)}
                  />
                  {series.label}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
