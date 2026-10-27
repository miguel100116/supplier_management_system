import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownUp, CalendarDays, Check, Plus, Search, Settings2 } from 'lucide-react';
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
  onManageAccess: () => void;
}

const categoryOptions: Array<'All' | SurveyType> = ['All', 'Courier', 'Supplier', 'Subcontractor'];
type OpenFilterPopover = 'sort' | 'date' | null;

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
  onManageAccess,
}: SurveyFormsToolbarProps) {
  const [openPopover, setOpenPopover] = useState<OpenFilterPopover>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const sortTriggerRef = useRef<HTMLButtonElement>(null);
  const dateTriggerRef = useRef<HTMLButtonElement>(null);
  const hasActiveSort = sort !== 'title-asc';
  const hasActiveDateRange = Boolean(deadlineFrom || deadlineTo);

  useEffect(() => {
    if (!openPopover) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !filtersRef.current?.contains(event.target)) setOpenPopover(null);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      const trigger = openPopover === 'sort' ? sortTriggerRef.current : dateTriggerRef.current;
      setOpenPopover(null);
      trigger?.focus();
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [openPopover]);

  const filterTriggerClass = (active: boolean, expanded: boolean) =>
    `icon-button relative shrink-0 ${active || expanded ? '!border-[#a9d4ef] !bg-[#edf7fd] !text-[#145f91] dark:!border-[#285d7e] dark:!bg-[rgb(33_135_205_/_16%)] dark:!text-[#b8e0fa]' : ''}`;
  const sortOptions: Array<{ value: SurveyFormSort; label: string }> = [
    { value: 'title-asc', label: 'Title: A-Z' },
    { value: 'title-desc', label: 'Title: Z-A' },
    { value: 'deadline-asc', label: 'Deadline: earliest first' },
    { value: 'deadline-desc', label: 'Deadline: latest first' },
    { value: 'created-desc', label: 'Created: newest first' },
  ];
  const selectSort = (value: SurveyFormSort) => {
    onSortChange(value);
    setOpenPopover(null);
    sortTriggerRef.current?.focus();
  };

  return (
    <div className="survey-forms-toolbar mb-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Survey forms controls">
      <div className="survey-forms-category segmented-control w-full max-w-full sm:w-auto" role="group" aria-label="Survey category">
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

      <label className="survey-forms-search relative min-w-0 flex-1 basis-24 sm:min-w-[160px]">
        <span className="sr-only">Search survey forms</span>
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search survey title or description..."
          className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#0063a9] focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-950"
        />
      </label>

      <div className="survey-forms-primary-actions ml-auto flex shrink-0 items-center justify-end gap-1 sm:gap-2">
        <button
          type="button"
          onClick={onCreateForm}
          className="inline-flex h-9 items-center justify-center gap-1 whitespace-nowrap rounded-md bg-emerald-600 px-2.5 text-xs font-semibold text-white hover:bg-emerald-700 sm:px-3"
        >
          <Plus size={16} aria-hidden="true" className="hidden sm:block" />
          <span>Create Form</span>
        </button>
        <button
          type="button"
          onClick={onManageAccess}
          className="inline-flex h-9 items-center justify-center gap-1 whitespace-nowrap rounded-md bg-[#0063a9] px-2.5 text-xs font-semibold text-white hover:bg-[#00528c] sm:px-3 dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          <Settings2 size={15} aria-hidden="true" />
          <span>Manage Access</span>
        </button>
      </div>

      <div ref={filtersRef} className="survey-forms-filters flex shrink-0 items-center gap-1" aria-label="Form filters">
        <div className="admin-directory-popover-anchor">
          <button
            ref={sortTriggerRef}
            type="button"
            className={filterTriggerClass(hasActiveSort, openPopover === 'sort')}
            aria-label="Sort forms"
            title="Sort forms"
            aria-expanded={openPopover === 'sort'}
            aria-haspopup="dialog"
            onClick={() => setOpenPopover((current) => current === 'sort' ? null : 'sort')}
          >
            <ArrowDownUp size={16} aria-hidden="true" />
            {hasActiveSort && <span className="admin-directory-active-dot" aria-hidden="true" />}
          </button>
          {openPopover === 'sort' && (
            <div className="admin-directory-compact-popover" role="dialog" aria-label="Sort forms" style={{ width: 'min(270px, calc(100vw - 28px))' }}>
              <div role="group" aria-label="Sort options" className="grid gap-1">
                {sortOptions.map((option) => {
                  const selected = sort === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      className={`flex min-h-9 w-full items-center justify-between gap-3 rounded-md px-2.5 text-left text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2187cd] ${selected ? 'bg-[#edf7fd] text-[#145f91] dark:bg-[#172f43] dark:text-[#b8e0fa]' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                      onClick={() => selectSort(option.value)}
                    >
                      <span>{option.label}</span>
                      {selected && <Check size={15} aria-hidden="true" className="shrink-0" />}
                    </button>
                  );
                })}
              </div>
              <button type="button" className="admin-directory-popover-reset border-t border-slate-100 pt-2 dark:border-slate-800" onClick={() => selectSort('title-asc')}>
                Reset sorting
              </button>
            </div>
          )}
        </div>

        <div className="admin-directory-popover-anchor">
          <button
            ref={dateTriggerRef}
            type="button"
            className={filterTriggerClass(hasActiveDateRange, openPopover === 'date')}
            aria-label="Filter forms by deadline date"
            title="Filter by deadline date"
            aria-expanded={openPopover === 'date'}
            aria-haspopup="dialog"
            onClick={() => setOpenPopover((current) => current === 'date' ? null : 'date')}
          >
            <CalendarDays size={16} aria-hidden="true" />
            {hasActiveDateRange && <span className="admin-directory-active-dot" aria-hidden="true" />}
          </button>
          {openPopover === 'date' && (
            <div className="admin-directory-compact-popover" role="dialog" aria-label="Filter forms by deadline date" style={{ width: 'min(320px, calc(100vw - 28px))' }}>
              <fieldset className="admin-directory-date-popover grid grid-cols-2 gap-2">
                <legend>Deadline range</legend>
                <label className="admin-directory-popover-field">
                  <span>From</span>
                  <input
                    type="date"
                    value={deadlineFrom}
                    max={deadlineTo || undefined}
                    onChange={(event) => onDeadlineFromChange(event.target.value)}
                    aria-label="Deadline range from"
                    className="field !mt-0 w-full"
                  />
                </label>
                <label className="admin-directory-popover-field">
                  <span>To</span>
                  <input
                    type="date"
                    value={deadlineTo}
                    min={deadlineFrom || undefined}
                    onChange={(event) => onDeadlineToChange(event.target.value)}
                    aria-label="Deadline range to"
                    className="field !mt-0 w-full"
                  />
                </label>
              </fieldset>
              <div className="flex items-center justify-between gap-2">
                <button type="button" className="admin-directory-popover-reset !justify-self-start" onClick={() => { onDeadlineFromChange(''); onDeadlineToChange(''); }}>
                  Reset date range
                </button>
                <button type="button" className="admin-directory-popover-reset" onClick={onResetFilters}>
                  Reset filters
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
