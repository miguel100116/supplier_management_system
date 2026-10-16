import { ReactNode } from 'react';
import { ArrowUpDown, CalendarRange, RotateCcw } from 'lucide-react';

export interface TableSortOption<T extends string> {
  value: T;
  label: string;
}

interface TableFilterBarProps<T extends string> {
  sortOptions: TableSortOption<T>[];
  sortValue: T;
  onSortChange: (value: T) => void;
  resultCount: number;
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (value: string) => void;
  onDateToChange?: (value: string) => void;
  dateLabel?: string;
  onReset: () => void;
  children?: ReactNode;
}

export function TableFilterBar<T extends string>({
  sortOptions,
  sortValue,
  onSortChange,
  resultCount,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  dateLabel = 'Date range',
  onReset,
  children,
}: TableFilterBarProps<T>) {
  const hasDateRange = Boolean(onDateFromChange && onDateToChange);

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
      <label className="min-w-[190px] flex-1 sm:flex-none">
        <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-text-secondary dark:text-slate-400">
          <ArrowUpDown size={12} aria-hidden="true" />
          Sort
        </span>
        <select
          value={sortValue}
          onChange={(event) => onSortChange(event.target.value as T)}
          className="field !mt-0 w-full py-2 text-xs sm:w-auto sm:min-w-[190px]"
          aria-label="Sort table"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      {hasDateRange && (
        <fieldset className="flex min-w-0 flex-1 flex-wrap items-end gap-2 sm:flex-none">
          <legend className="mb-1 flex w-full items-center gap-1.5 text-xs font-semibold text-text-secondary dark:text-slate-400">
            <CalendarRange size={12} aria-hidden="true" />
            {dateLabel}
          </legend>
          <label className="min-w-[135px] flex-1 sm:flex-none">
            <span className="sr-only">From date</span>
            <input
              type="date"
              value={dateFrom ?? ''}
              max={dateTo || undefined}
              onChange={(event) => onDateFromChange?.(event.target.value)}
              className="field !mt-0 w-full py-2 text-xs"
              aria-label={`${dateLabel} from`}
            />
          </label>
          <span className="self-center pb-2 text-xs text-slate-400">to</span>
          <label className="min-w-[135px] flex-1 sm:flex-none">
            <span className="sr-only">To date</span>
            <input
              type="date"
              value={dateTo ?? ''}
              min={dateFrom || undefined}
              onChange={(event) => onDateToChange?.(event.target.value)}
              className="field !mt-0 w-full py-2 text-xs"
              aria-label={`${dateLabel} to`}
            />
          </label>
        </fieldset>
      )}

      {children}

      <div className="ml-auto flex items-center gap-2">
        <span className="whitespace-nowrap text-xs font-semibold text-slate-500 dark:text-slate-400">
          {resultCount} result{resultCount === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={onReset}
          className="secondary-button px-2.5 py-2 text-xs"
          title="Reset table filters"
        >
          <RotateCcw size={13} aria-hidden="true" />
          Reset
        </button>
      </div>
    </div>
  );
}
