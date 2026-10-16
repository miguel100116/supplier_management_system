import React from 'react';
import { Plus, Search, SlidersHorizontal } from 'lucide-react';
import type { SurveyType } from '../../../types/survey';

export type SurveyFormSort = 'title-asc' | 'title-desc' | 'deadline-asc' | 'deadline-desc' | 'created-desc';

interface SurveyFormsToolbarProps {
  surveyType: 'All' | SurveyType;
  onSurveyTypeChange: (value: 'All' | SurveyType) => void;
  search: string;
  onSearchChange: (value: string) => void;
  sort: SurveyFormSort;
  onSortChange: (value: SurveyFormSort) => void;
  deadlineFrom: string;
  deadlineTo: string;
  onDeadlineFromChange: (value: string) => void;
  onDeadlineToChange: (value: string) => void;
  onResetFilters: () => void;
  onCreateForm: () => void;
  isSelectMode: boolean;
  onToggleSelection: () => void;
}

const categoryOptions: Array<'All' | SurveyType> = ['All', 'Courier', 'Supplier', 'Subcontractor'];

export function countActiveFormFilters(sort: SurveyFormSort, from: string, to: string): number {
  return Number(sort !== 'title-asc') + Number(Boolean(from || to));
}

export function SurveyFormsToolbar({
  surveyType,
  onSurveyTypeChange,
  search,
  onSearchChange,
  sort,
  onSortChange,
  deadlineFrom,
  deadlineTo,
  onDeadlineFromChange,
  onDeadlineToChange,
  onResetFilters,
  onCreateForm,
  isSelectMode,
  onToggleSelection,
}: SurveyFormsToolbarProps) {
  const activeFilterCount = countActiveFormFilters(sort, deadlineFrom, deadlineTo);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Survey forms controls">
      <div className="segmented-control w-full max-w-full sm:w-auto" role="group" aria-label="Survey category">
        {categoryOptions.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={surveyType === option}
            className={surveyType === option ? 'segmented-active' : ''}
            onClick={() => onSurveyTypeChange(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <label className="relative min-w-0 flex-1 basis-24 sm:min-w-[160px]">
        <span className="sr-only">Search survey forms</span>
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search survey title or description..."
          className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#0866B1] focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-950"
        />
      </label>

      <div className="ml-auto flex shrink-0 items-center justify-end gap-1 sm:gap-2">
        <button
          type="button"
          onClick={onCreateForm}
          className="inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 text-xs font-semibold sm:gap-1.5 sm:px-3 sm:text-sm text-white hover:bg-emerald-700"
        >
          <Plus size={16} aria-hidden="true" className="hidden sm:block" />
          <span className="sm:hidden">Create</span><span className="hidden sm:inline">Create Form</span>
        </button>
        <button
          type="button"
          onClick={onToggleSelection}
          aria-pressed={isSelectMode}
          className={isSelectMode
            ? 'inline-flex h-10 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-2 text-xs font-semibold sm:px-3 sm:text-sm text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-400'
            : 'inline-flex h-10 items-center justify-center rounded-lg bg-[#0866B1] px-2 text-xs font-semibold sm:px-3 sm:text-sm text-white hover:bg-[#07528E] dark:bg-blue-600 dark:hover:bg-blue-700'}
        >
          <span className="sm:hidden">{isSelectMode ? 'Cancel' : 'Select'}</span>
          <span className="hidden sm:inline">{isSelectMode ? 'Cancel Selection' : 'Select Forms'}</span>
        </button>
      </div>

      <details className="relative shrink-0">
        <summary className="flex h-10 cursor-pointer list-none items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold sm:gap-1.5 sm:px-3 sm:text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal size={15} aria-hidden="true" className="hidden sm:block" />
          Filters
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-[#0866B1] px-1.5 py-0.5 text-[10px] leading-none text-white" aria-label={activeFilterCount + ' active filters'}>
              {activeFilterCount}
            </span>
          )}
        </summary>
        <div className="absolute right-0 top-full z-20 mt-2 w-72 max-w-[calc(100vw-3rem)] space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-950">
          <label className="block">
            <span className="sr-only">Sort forms</span>
            <select
              value={sort}
              onChange={(event) => onSortChange(event.target.value as SurveyFormSort)}
              aria-label="Sort forms"
              className="field !mt-0 w-full py-2 text-sm"
            >
              <option value="title-asc">Title: A-Z</option>
              <option value="title-desc">Title: Z-A</option>
              <option value="deadline-asc">Deadline: earliest first</option>
              <option value="deadline-desc">Deadline: latest first</option>
              <option value="created-desc">Created: newest first</option>
            </select>
          </label>
          <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <legend className="sr-only">Deadline range</legend>
            <label className="min-w-0 text-xs text-slate-500 dark:text-slate-400">
              From
              <input
                type="date"
                value={deadlineFrom}
                max={deadlineTo || undefined}
                onChange={(event) => onDeadlineFromChange(event.target.value)}
                aria-label="Deadline range from"
                className="field !mt-1 w-full py-2 text-xs"
              />
            </label>
            <label className="min-w-0 text-xs text-slate-500 dark:text-slate-400">
              To
              <input
                type="date"
                value={deadlineTo}
                min={deadlineFrom || undefined}
                onChange={(event) => onDeadlineToChange(event.target.value)}
                aria-label="Deadline range to"
                className="field !mt-1 w-full py-2 text-xs"
              />
            </label>
          </fieldset>
          <button type="button" onClick={onResetFilters} className="text-xs font-semibold text-[#0866B1] hover:underline dark:text-blue-400">
            Reset filters
          </button>
        </div>
      </details>

    </div>
  );
}
