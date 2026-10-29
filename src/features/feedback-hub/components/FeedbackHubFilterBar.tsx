import React, { ReactNode } from 'react';
import { ArrowUpDown, CalendarRange, Filter, RotateCcw, Search, X } from 'lucide-react';

interface FilterOption {
  value: string;
  label: string;
}

interface FeedbackHubFilterBarProps {
  searchValue: string;
  searchPlaceholder: string;
  searchLabel: string;
  onSearchChange: (value: string) => void;
  resultCount: number;
  resultLabel: string;
  sortOptions?: FilterOption[];
  sortValue?: string;
  defaultSortValue?: string;
  onSortChange?: (value: string) => void;
  categoryValue?: string;
  categoryLabel?: string;
  categoryOptions?: FilterOption[];
  defaultCategoryValue?: string;
  onCategoryChange?: (value: string) => void;
  statusValue?: string;
  statusLabel?: string;
  statusOptions?: FilterOption[];
  defaultStatusValue?: string;
  onStatusChange?: (value: string) => void;
  dateFrom?: string;
  dateTo?: string;
  dateLabel?: string;
  onDateFromChange?: (value: string) => void;
  onDateToChange?: (value: string) => void;
  onReset: () => void;
  extraActions?: ReactNode;
}

export function FeedbackHubFilterBar({
  searchValue,
  searchPlaceholder,
  searchLabel,
  onSearchChange,
  resultCount,
  resultLabel,
  sortOptions,
  sortValue,
  defaultSortValue,
  onSortChange,
  categoryValue,
  categoryLabel = 'Category',
  categoryOptions,
  defaultCategoryValue = 'All',
  onCategoryChange,
  statusValue,
  statusLabel = 'Status',
  statusOptions,
  defaultStatusValue = 'All',
  onStatusChange,
  dateFrom,
  dateTo,
  dateLabel = 'Date range',
  onDateFromChange,
  onDateToChange,
  onReset,
  extraActions,
}: FeedbackHubFilterBarProps) {
  const hasDateFilter = Boolean(onDateFromChange && onDateToChange);
  const activeSort = sortOptions?.find((option) => option.value === sortValue);
  const activeCategory = categoryOptions?.find((option) => option.value === categoryValue);
  const activeStatus = statusOptions?.find((option) => option.value === statusValue);
  const dateActive = Boolean(dateFrom || dateTo);
  const hasActiveFilters = Boolean(
    searchValue.length > 0 ||
    (categoryValue && categoryValue !== defaultCategoryValue) ||
    (statusValue && statusValue !== defaultStatusValue) ||
    (sortValue && sortValue !== defaultSortValue) ||
    dateActive,
  );

  return (
    <section className="feedback-filter-surface" aria-label="Filter feedback records">
      <div className="feedback-filter-main">
        <label className="feedback-search-control">
          <span className="sr-only">{searchLabel}</span>
          <span className="feedback-search-field">
            <Search size={16} aria-hidden="true" />
            <input type="search" value={searchValue} onChange={(event) => onSearchChange(event.target.value)} placeholder={searchPlaceholder} aria-label={searchLabel} />
            {searchValue && <button type="button" aria-label="Clear search" onClick={() => onSearchChange('')}><X size={14} aria-hidden="true" /></button>}
          </span>
        </label>

        <div className="feedback-filter-actions">
          {categoryOptions && onCategoryChange && (
            <details className="feedback-filter-popover">
              <summary className="feedback-filter-icon" title={`Filter by ${categoryLabel.toLowerCase()}`} aria-label={`Filter by ${categoryLabel.toLowerCase()}`}>
                <Filter size={16} aria-hidden="true" />
                {categoryValue !== defaultCategoryValue && <span className="feedback-filter-dot" aria-hidden="true" />}
              </summary>
              <div className="feedback-filter-popover-panel">
                <label className="feedback-popover-label" htmlFor="feedback-category-filter">{categoryLabel}</label>
                <select id="feedback-category-filter" value={categoryValue} onChange={(event) => onCategoryChange(event.target.value)}>
                  {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </details>
          )}

          {statusOptions && onStatusChange && (
            <details className="feedback-filter-popover">
              <summary className="feedback-filter-icon" title={`Filter by ${statusLabel.toLowerCase()}`} aria-label={`Filter by ${statusLabel.toLowerCase()}`}>
                <Filter size={16} aria-hidden="true" />
                {statusValue !== defaultStatusValue && <span className="feedback-filter-dot" aria-hidden="true" />}
              </summary>
              <div className="feedback-filter-popover-panel">
                <span className="feedback-popover-label">{statusLabel}</span>
                <div className="feedback-popover-options" role="group" aria-label={statusLabel}>
                  {statusOptions.map((option) => (
                    <button key={option.value} type="button" aria-pressed={statusValue === option.value} onClick={() => onStatusChange(option.value)}>{option.label}</button>
                  ))}
                </div>
              </div>
            </details>
          )}

          {hasDateFilter && (
            <details className="feedback-filter-popover">
              <summary className="feedback-filter-icon" title={dateLabel} aria-label={dateLabel}>
                <CalendarRange size={16} aria-hidden="true" />
                {dateActive && <span className="feedback-filter-dot" aria-hidden="true" />}
              </summary>
              <div className="feedback-filter-popover-panel feedback-date-panel">
                <span className="feedback-popover-label">{dateLabel}</span>
                <label><span>From</span><input type="date" value={dateFrom ?? ''} max={dateTo || undefined} onChange={(event) => onDateFromChange?.(event.target.value)} aria-label={`${dateLabel} from`} /></label>
                <label><span>To</span><input type="date" value={dateTo ?? ''} min={dateFrom || undefined} onChange={(event) => onDateToChange?.(event.target.value)} aria-label={`${dateLabel} to`} /></label>
              </div>
            </details>
          )}

          {sortOptions && onSortChange && (
            <details className="feedback-filter-popover">
              <summary className="feedback-filter-icon" title={activeSort ? `Sort: ${activeSort.label}` : 'Sort records'} aria-label={activeSort ? `Sort: ${activeSort.label}` : 'Sort records'}>
                <ArrowUpDown size={16} aria-hidden="true" />
                {sortValue !== defaultSortValue && <span className="feedback-filter-dot" aria-hidden="true" />}
              </summary>
              <div className="feedback-filter-popover-panel">
                <label className="feedback-popover-label" htmlFor="feedback-sort-filter">Sort by</label>
                <select id="feedback-sort-filter" value={sortValue} onChange={(event) => onSortChange(event.target.value)}>
                  {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </details>
          )}

          {extraActions}
        </div>

        <div className="feedback-filter-count">
          <span>{resultCount.toLocaleString()} {resultLabel}</span>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="feedback-active-filters" aria-label="Active filters">
          {searchValue.length > 0 && <button type="button" onClick={() => onSearchChange('')} aria-label={`Remove search filter ${searchValue.trim() || 'blank search'}`}>Search: {searchValue.trim() || '(blank)'} <X size={12} aria-hidden="true" /></button>}
          {activeCategory && activeCategory.value !== defaultCategoryValue && <button type="button" onClick={() => onCategoryChange?.(defaultCategoryValue)} aria-label={`Remove ${categoryLabel.toLowerCase()} filter`}>{categoryLabel}: {activeCategory.label} <X size={12} aria-hidden="true" /></button>}
          {activeStatus && activeStatus.value !== defaultStatusValue && <button type="button" onClick={() => onStatusChange?.(defaultStatusValue)} aria-label={`Remove ${statusLabel.toLowerCase()} filter`}>{statusLabel}: {activeStatus.label} <X size={12} aria-hidden="true" /></button>}
          {dateActive && <button type="button" onClick={() => { onDateFromChange?.(''); onDateToChange?.(''); }} aria-label={`Remove ${dateLabel.toLowerCase()} filter`}>{dateLabel}: {dateFrom || 'Any'} – {dateTo || 'Any'} <X size={12} aria-hidden="true" /></button>}
          {activeSort && sortValue !== defaultSortValue && <button type="button" onClick={() => onSortChange?.(defaultSortValue ?? '')} aria-label="Reset sorting">Sort: {activeSort.label} <X size={12} aria-hidden="true" /></button>}
          <button type="button" className="feedback-reset-filters ml-auto" onClick={onReset}><RotateCcw size={13} aria-hidden="true" /> Reset</button>
        </div>
      )}
    </section>
  );
}
