import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { ArrowUpDown, CalendarRange, Check, Filter, RotateCcw, Search, X } from 'lucide-react';

interface FilterOption {
  value: string;
  label: string;
}

type OpenPopover = 'category' | 'status' | 'date' | 'sort' | null;

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
  const [openPopover, setOpenPopover] = useState<OpenPopover>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const datePopoverRef = useRef<HTMLDivElement>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);

  const clearHoverClose = () => {
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  };

  const openPopoverOnHover = (kind: OpenPopover) => {
    clearHoverClose();
    setOpenPopover(kind);
  };

  const schedulePopoverClose = (kind: OpenPopover) => {
    clearHoverClose();
    hoverCloseTimerRef.current = window.setTimeout(() => {
      if (
        kind === 'date' &&
        datePopoverRef.current &&
        datePopoverRef.current.contains(document.activeElement)
      ) {
        return;
      }
      setOpenPopover((current) => (current === kind ? null : current));
      hoverCloseTimerRef.current = null;
    }, 180);
  };

  useEffect(() => () => clearHoverClose(), []);

  useEffect(() => {
    if (!openPopover) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !filtersRef.current?.contains(event.target)) {
        clearHoverClose();
        setOpenPopover(null);
      }
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      clearHoverClose();
      setOpenPopover(null);
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [openPopover]);

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

        <div ref={filtersRef} className="feedback-filter-actions">
          {categoryOptions && onCategoryChange && (
            <details
              className="feedback-filter-popover"
              open={openPopover === 'category'}
              onPointerEnter={(event) => {
                if (event.pointerType !== 'touch') openPopoverOnHover('category');
              }}
              onPointerLeave={(event) => {
                if (event.pointerType !== 'touch') schedulePopoverClose('category');
              }}
            >
              <summary
                className="feedback-filter-icon"
                title={`Filter by ${categoryLabel.toLowerCase()}`}
                aria-label={`Filter by ${categoryLabel.toLowerCase()}`}
                aria-expanded={openPopover === 'category'}
                aria-haspopup="dialog"
                onClick={(event) => {
                  event.preventDefault();
                  clearHoverClose();
                  setOpenPopover((current) => current === 'category' ? null : 'category');
                }}
              >
                <Filter size={16} aria-hidden="true" />
                {categoryValue !== defaultCategoryValue && <span className="feedback-filter-dot" aria-hidden="true" />}
              </summary>
              <div
                className="feedback-filter-popover-panel"
                onPointerEnter={(event) => {
                  if (event.pointerType !== 'touch') clearHoverClose();
                }}
              >
                <span className="feedback-popover-label">{categoryLabel}</span>
                <div className="feedback-popover-options" role="group" aria-label={categoryLabel}>
                  {categoryOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={categoryValue === option.value}
                      className="flex w-full items-center justify-between"
                      onClick={() => {
                        clearHoverClose();
                        onCategoryChange(option.value);
                        setOpenPopover(null);
                      }}
                    >
                      <span>{option.label}</span>
                      {categoryValue === option.value && <Check size={14} aria-hidden="true" className="shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            </details>
          )}

          {statusOptions && onStatusChange && (
            <details
              className="feedback-filter-popover"
              open={openPopover === 'status'}
              onPointerEnter={(event) => {
                if (event.pointerType !== 'touch') openPopoverOnHover('status');
              }}
              onPointerLeave={(event) => {
                if (event.pointerType !== 'touch') schedulePopoverClose('status');
              }}
            >
              <summary
                className="feedback-filter-icon"
                title={`Filter by ${statusLabel.toLowerCase()}`}
                aria-label={`Filter by ${statusLabel.toLowerCase()}`}
                aria-expanded={openPopover === 'status'}
                aria-haspopup="dialog"
                onClick={(event) => {
                  event.preventDefault();
                  clearHoverClose();
                  setOpenPopover((current) => current === 'status' ? null : 'status');
                }}
              >
                <Filter size={16} aria-hidden="true" />
                {statusValue !== defaultStatusValue && <span className="feedback-filter-dot" aria-hidden="true" />}
              </summary>
              <div
                className="feedback-filter-popover-panel"
                onPointerEnter={(event) => {
                  if (event.pointerType !== 'touch') clearHoverClose();
                }}
              >
                <span className="feedback-popover-label">{statusLabel}</span>
                <div className="feedback-popover-options" role="group" aria-label={statusLabel}>
                  {statusOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={statusValue === option.value}
                      className="flex w-full items-center justify-between"
                      onClick={() => {
                        clearHoverClose();
                        onStatusChange(option.value);
                        setOpenPopover(null);
                      }}
                    >
                      <span>{option.label}</span>
                      {statusValue === option.value && <Check size={14} aria-hidden="true" className="shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            </details>
          )}

          {hasDateFilter && (
            <details
              className="feedback-filter-popover"
              open={openPopover === 'date'}
              onPointerEnter={(event) => {
                if (event.pointerType !== 'touch') openPopoverOnHover('date');
              }}
              onPointerLeave={(event) => {
                if (event.pointerType !== 'touch') schedulePopoverClose('date');
              }}
            >
              <summary
                className="feedback-filter-icon"
                title={dateLabel}
                aria-label={dateLabel}
                aria-expanded={openPopover === 'date'}
                aria-haspopup="dialog"
                onClick={(event) => {
                  event.preventDefault();
                  clearHoverClose();
                  setOpenPopover((current) => current === 'date' ? null : 'date');
                }}
              >
                <CalendarRange size={16} aria-hidden="true" />
                {dateActive && <span className="feedback-filter-dot" aria-hidden="true" />}
              </summary>
              <div
                ref={datePopoverRef}
                className="feedback-filter-popover-panel feedback-date-panel"
                onPointerEnter={(event) => {
                  if (event.pointerType !== 'touch') clearHoverClose();
                }}
              >
                <span className="feedback-popover-label">{dateLabel}</span>
                <label><span>From</span><input type="date" value={dateFrom ?? ''} max={dateTo || undefined} onChange={(event) => onDateFromChange?.(event.target.value)} aria-label={`${dateLabel} from`} /></label>
                <label><span>To</span><input type="date" value={dateTo ?? ''} min={dateFrom || undefined} onChange={(event) => onDateToChange?.(event.target.value)} aria-label={`${dateLabel} to`} /></label>
              </div>
            </details>
          )}

          {sortOptions && onSortChange && (
            <details
              className="feedback-filter-popover"
              open={openPopover === 'sort'}
              onPointerEnter={(event) => {
                if (event.pointerType !== 'touch') openPopoverOnHover('sort');
              }}
              onPointerLeave={(event) => {
                if (event.pointerType !== 'touch') schedulePopoverClose('sort');
              }}
            >
              <summary
                className="feedback-filter-icon"
                title={activeSort ? `Sort: ${activeSort.label}` : 'Sort records'}
                aria-label={activeSort ? `Sort: ${activeSort.label}` : 'Sort records'}
                aria-expanded={openPopover === 'sort'}
                aria-haspopup="dialog"
                onClick={(event) => {
                  event.preventDefault();
                  clearHoverClose();
                  setOpenPopover((current) => current === 'sort' ? null : 'sort');
                }}
              >
                <ArrowUpDown size={16} aria-hidden="true" />
                {sortValue !== defaultSortValue && <span className="feedback-filter-dot" aria-hidden="true" />}
              </summary>
              <div
                className="feedback-filter-popover-panel"
                onPointerEnter={(event) => {
                  if (event.pointerType !== 'touch') clearHoverClose();
                }}
              >
                <span className="feedback-popover-label">Sort by</span>
                <div className="feedback-popover-options" role="group" aria-label="Sort by">
                  {sortOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={sortValue === option.value}
                      className="flex w-full items-center justify-between"
                      onClick={() => {
                        clearHoverClose();
                        onSortChange(option.value);
                        setOpenPopover(null);
                      }}
                    >
                      <span>{option.label}</span>
                      {sortValue === option.value && <Check size={14} aria-hidden="true" className="shrink-0" />}
                    </button>
                  ))}
                </div>
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
