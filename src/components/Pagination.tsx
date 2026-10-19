import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  ariaLabel: string;
  pageSizeOptions?: number[];
  showPageControls?: boolean;
  verticalPadding?: 'compact' | 'comfortable';
  className?: string;
}

const DEFAULT_PAGE_SIZES = [5, 10, 20, 25, 50, 100];

export function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  ariaLabel,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  showPageControls = true,
  verticalPadding = 'compact',
  className = '',
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);
  const visiblePageCount = Math.min(5, totalPages);
  const firstVisiblePage = Math.max(1, Math.min(currentPage - 2, totalPages - visiblePageCount + 1));
  const visiblePages = Array.from({ length: visiblePageCount }, (_, index) => firstVisiblePage + index);
  const options = [...new Set([...pageSizeOptions, pageSize])].sort((a, b) => a - b);
  const buttonClass = 'inline-flex h-8 min-w-8 items-center justify-center rounded-md text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35 dark:text-slate-300 dark:hover:bg-slate-800';
  const verticalPaddingClass = verticalPadding === 'comfortable' ? '!py-5' : '!py-2';

  const changePage = (nextPage: number) => onPageChange(Math.min(Math.max(1, nextPage), totalPages));

  return (
    <nav
      className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-t border-slate-100 ${verticalPaddingClass} dark:border-slate-800 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] ${className}`}
      aria-label={ariaLabel}
    >
      <p className="text-center text-xs tabular-nums text-slate-500 dark:text-slate-400 sm:text-left" aria-live="polite">
        Showing {startItem}–{endItem} of {totalItems} items
      </p>

      {showPageControls ? (
        <div className="flex min-w-0 items-center justify-center gap-0.5" role="group" aria-label={`${ariaLabel} controls`}>
          <button type="button" className={buttonClass} onClick={() => changePage(1)} disabled={currentPage === 1} aria-label="First page" title="First page">
            <ChevronsLeft size={16} aria-hidden="true" /><span className="sr-only">First</span>
          </button>
          <button type="button" className={buttonClass} onClick={() => changePage(currentPage - 1)} disabled={currentPage === 1} aria-label="Previous page" title="Previous page">
            <ChevronLeft size={16} aria-hidden="true" /><span className="sr-only">Previous</span>
          </button>
          {visiblePages.map((pageNumber) => (
            <button
              type="button"
              key={pageNumber}
              className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums transition ${currentPage === pageNumber ? 'bg-[#0063a9]/[0.08] text-[#0063a9] dark:bg-blue-400/10 dark:text-blue-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              onClick={() => changePage(pageNumber)}
              aria-current={currentPage === pageNumber ? 'page' : undefined}
              aria-label={`Page ${pageNumber}`}
            >
              {pageNumber}
            </button>
          ))}
          <span className="sr-only">Page {currentPage} of {totalPages}</span>
          <button type="button" className={buttonClass} onClick={() => changePage(currentPage + 1)} disabled={currentPage === totalPages} aria-label="Next page" title="Next page">
            <ChevronRight size={16} aria-hidden="true" /><span className="sr-only">Next</span>
          </button>
          <button type="button" className={buttonClass} onClick={() => changePage(totalPages)} disabled={currentPage === totalPages} aria-label="Last page" title="Last page">
            <ChevronsRight size={16} aria-hidden="true" /><span className="sr-only">Last</span>
          </button>
        </div>
      ) : <div />}

      <label className="flex items-center justify-center gap-1.5 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 sm:justify-self-end">
        <select
          className="h-8 w-14 min-w-14 shrink-0 rounded-md border border-slate-200 bg-white px-1 text-xs font-medium text-[#0063a9] outline-none transition focus:border-[#0063a9] focus:ring-2 focus:ring-[#0063a9]/15 dark:border-slate-700 dark:bg-slate-950 dark:text-blue-300"
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          aria-label="Items per page"
        >
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <span>Items per page</span>
      </label>
    </nav>
  );
}
